const puppeteer = require('puppeteer'),
      config = require('./config.json'),
      fsPromises = require('fs').promises,
      { harFromMessages } = require('chrome-har');

// event types to observe
const observe = [
  'Network.requestWillBeSent',
  'Network.requestServedFromCache',
  'Network.dataReceived',
  'Network.responseReceived',
  'Network.resourceChangedPriority',
  'Network.loadingFinished',
  'Network.loadingFailed',
];

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

async function doSearch(page) {
  // Performs a Primo search in the browser, using options specified in config.json 
  try {
    await page.goto(config.baseUrl);
    // Wait for the search bar to become visible
    await page.waitForSelector('#searchBar', {visible: true})
    // Enter some search text, randomly selected from a list
    let searchTerm = config.searchTerms[Math.floor(Math.random()*config.searchTerms.length)];
    await page.type('#searchBar', searchTerm);
    // Wait for the submit button to load
    await page.waitForSelector('.button-confirm')
    // Trigger mouse click on the submit button
    // This construction avoids a race condition between two promises.
    let [response] = await Promise.all([
    // The button click will cause a navigation event
      page.waitForNavigation(),
      page.click('.button-confirm')
    ]);

    await viewItems(page);
  }
  catch (error) {
    console.log(error);
  }

}

async function viewItems(page) {
  // Tests the first page of results
  // TO DO --> Simulate opening full record display and item availability check
  try {
    //Wait for at least one result
    await page.waitForSelector('.item-title');
    // Get all the title elements
    resultsElements = await page.$$('.item-title');
    // wait for at least one availability elemnent
    await page.waitForSelector('.availability-status');
    availElements = await page.$$('.availability-status');
  }
  catch (error) {
    console.log(error);
  }
}

	(async function main() {
  		try {
  			// Doesn't seem to work in headless mode. The waitForSelector timesout before getting a response.
  			const browser = await puppeteer.launch({headless: false});
  			const page = await browser.newPage();
  			
  			let performanceMetrics = await pageTrace(page);
        // Save network trace as HAR file
        await browser.close();

        await fsPromises.writeFile(config.logFile, 
                                  JSON.stringify(
                                    harFromMessages(
                                      performanceMetrics)));
        /* Retrieve the links to the full results under each title
  			results = await Promise.all(results.map(element => 
  										element.$eval('a', node => node.href)));
  			console.log(results);
  			await page.screenshot({path: 'test_shot.png'});*/
  			// Close the browser

		}
		catch (err) {
  			console.log(err);
  		}
	})();

