const puppeteer = require('puppeteer'),
      config = require('./config.json'),
      PuppeteerHar = require('puppeteer-har'),
      { Pool } = require('pg'),
      pool = new Pool(config.pg_credentials),
      { createLogger, format, transports } = require('winston'),
      waitTime = 3000;

const logger = createLogger({
  level: 'info',
  format: format.combine(
      format.timestamp(),
      format.json()
    ),
  defaultMeta: {service: 'user-service'},
  transports: [
    //
    // - Write all logs error (and below) to `error.log`.
    //
    new transports.File({ filename: 'error.log', 
      level: 'error',
      timestamp: true })  ]
});

async function pageTrace(page) {
  // Implements the puppeteer tracing code from https://michaljanaszek.com/blog/test-website-performance-with-puppeteer as well as here: https://github.com/GoogleChrome/puppeteer/issues/1916
  try {
    let events = [];
    const client = await page.target().createCDPSession();
    // enable the performance tracking
    await client.send('Network.enable');
    // Add observers for network events
    observe.forEach(method => {
      client.on(method, params => {
        events.push({ method, params });
      });
    });
    await doSearch(page);
    // Make sure all resources have stopped loading
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    // return the event log
    return events;
  }
  catch (error) {
    console.log(error);
  }

}

async function doSearch(browser, target) {
  // Performs a Primo search in the browser, using options specified in config.json 
  // First argument should be the puppeteer object for the browser. Second argument should be a particular target from the config file
  try {
      
    const page = await browser.newPage(),
          har = new PuppeteerHar(page);
    await har.start();

    await page.goto(target.baseUrl);
    // Wait for the search bar to become visible
    await page.waitForSelector('#searchBar', {visible: true})
    // Enter some search text, randomly selected from a list
    let searchTerm = config.searchTerms[Math.floor(Math.random()*config.searchTerms.length)];
    await page.type('#searchBar', searchTerm);
    // Wait for the submit button to load
    await page.waitForSelector('.button-confirm')
    // Trigger mouse click on the submit button
    // This construction avoids a race condition between two promises.
    let startTime = new Date(Date.now());
    let [response] = await Promise.all([
    // The button click will cause a navigation event
      page.waitForNavigation(),
      page.click('.button-confirm')
    ]);

    let [firstResultTime, firstAvailTime] = await viewItems(page);

    let harData = await har.stop();

    await page.close() 

    // Filter out the URL's of interest to us
    harData = harData.log.entries.filter((entry) => {
          return (entry.request.url.includes('pnxs') || 
                  entry.request.url.includes('delivery'));
        });
    
    return {viewId: target.viewId,
            searchTerm: searchTerm,
            startTime: startTime,
            firstResultTime: firstResultTime,
            firstAvailTime: firstAvailTime,
            harData: JSON.stringify(harData)};
  }
  catch (error) {
    logger.error(`Failue on doSearch: ${error}`);
  }

}

async function viewItems(page) {
  // Tests the first page of results
  // TO DO --> Simulate opening full record display and item availability check
  try {
    //Wait for at least one result
    await page.waitForSelector('.item-title');
    let firstResultTime = new Date(Date.now());

    // Get all the title elements
    resultsElements = await page.$$('.item-title');
    // wait for at least one availability elemnent
    await page.waitForSelector('.availability-status');
    let firstAvailTime = new Date(Date.now());

    availElements = await page.$$('.availability-status');
    return [firstResultTime, firstAvailTime];
  }
  catch (error) {
    logger.error(`Failue on viewItems: ${error}`);
  }
}

async function saveToDB(testData) {
  /* Saves test results and HAR data to a postgres database.*/
 try {
    let testQuery = 'INSERT INTO events (view_id, search_term, start_time, first_result, first_availability) VALUES ($1, $2, $3, $4, $5) RETURNING test_id',
    {viewId, searchTerm, startTime, firstResultTime, firstAvailTime, harData} = testData,
    testQValues = [viewId, searchTerm, startTime, firstResultTime, firstAvailTime],
    harQuery = 'INSERT INTO har (test_id, har) VALUES ($1, $2)';
  
    // First insert query should return the key to use as a foreign key on the HAR table
    let result = await pool.query(testQuery, testQValues);
    await pool.query(harQuery, [result.rows[0].test_id, harData]);
  }
  catch (error) {
    logger.error(`Failue on saveToDB: ${error}`);
  }

}

function delay() {
   return new Promise(function(resolve) {
       setTimeout(function() {
           resolve();
       }, waitTime);
   });
}

	(async function main() {
  		try {
  			// Doesn't seem to work in headless mode. The waitForSelector timesout before getting a response.
  			
        for (let target of config.targets) {
          const browser = await puppeteer.launch({headless: false});
          let testData = await doSearch(browser, target);
          await saveToDB(testData);
          await browser.close();
          await delay();
        }

     
        /* Retrieve the links to the full results under each title
  			results = await Promise.all(results.map(element => 
  										element.$eval('a', node => node.href)));
  			console.log(results);
  			await page.screenshot({path: 'test_shot.png'});*/

		}
		catch (error) {
  			logger.error(`Failue on main: ${error}`);
  		}
	})();

