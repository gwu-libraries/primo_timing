/*
>> Run as daemon
>> Main function called recursively via setTimeout, with randomized intervals
>>> Use axios.js with interceptors to time request-to-response
>>> Use the primaws/pubs/pnxs endpoint
>>> One request per institution/scope in the database
>>> Store timing in db table
>> Web-based config interface:
>>> Accept a Primo VE UI URL 
>>> Extract the institution and scope parameters
>>> Store in db table
>> Database
>>> postgres
>>> Primo instance table: scope, institution, view, tab
>>> Primo keyword queries 
>>> Date/time of search, leyword and time-to-response (ms) per scope/inst
>> Web-based result display
>>> handsontable.js table from data table
>>> Visualization of rolling average from data table per inst/scope (up to five)

*/

const axios = require('axios'), 
	config = require('./db/config.js'),
	{ Pool } = require('pg'),
	pool = new Pool(config.credentials),
	{ createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: 'info',
  format: format.combine(
      format.timestamp(),
      format.json()
    ),
  defaultMeta: {service: 'user-service'},
  transports: [
    new transports.File({ filename: 'tracker-error.log', 
    	level: 'error',
    	timestamp: true })  ]
});


function errorHandler(error) {
	console.error(error);
}

axios.interceptors.request.use(config => {
	config.metadata = {startTime: process.hrtime()};
	return config;
}, error => {
	return Promise.reject(error);
});

axios.interceptors.response.use(response => {
	let startTime = response.config.metadata.startTime,
		duration = process.hrtime(startTime);
		// Convert the hrtime array to seconds (the second value is in nanoseconds)
 	response.duration = duration[0] + duration[1] / 1000000000;
	return response;
}, error => {
	return Promise.reject(error);
});

async function runTimingTest(url, params) {
	try {
		let response = await axios.get(url, {params: params});
		console.log(response.data.timelog)
		console.log(`GET duration: ${response.duration}`);
	} catch (error) {
		errorHandler(error);
		
	}
}

async function getUrls() {
	/*Retrieves stored URL's from pg database for testing. Returns empty array on error.*/
	try {
		let rowsObj = await pool.query(config.queries.getUrls);
		return rowsObj.rows;
	} catch (error) {
		errorHandler(`Error fetching URL data from db: ${error}`);
		return [];
	}
}

async function getKeyword() {
	/*Randomly selects a row from the table of Primo search strings.*/
	try {
		let rowsObj = await pool.query(config.queries.getKeywords);
		return rowsObj.rows[Math.floor(Math.random()*rowsObj.rows.length)];
	} catch (error) {
		errorHandler(`Error fetching keyword from db: ${error}`);
		return null;
	}
}
 
async function testUrl(urlData, query, keywordObj) {
	/* Makes a get request with a parametrized URL created from the passed data plus config constants.*/
	try { 
		let url = `https://${urlData.domain_prefix}.${config.urlDomain}`,
			params = {};
		// construct the parameters object, combining the constant values from config with those passed as an argument to the function
		for (let key of Object.keys(config.urlParams)) {
			// If the config object has a null value for this key, use the supplied value
			if (!config.urlParams[key]) {
				params[key] = urlData[key];	
			} 
			else params[key] = config.urlParams[key]
		}
		// Add the query string
		// Include a timeout because Primo doesn't return a timeout error in certain cases when no results are found
		params['q'] = `any,contains,${keywordObj.search_string}`;
		let response = await axios.get(url, {params: params,
											timeout: config.timeout});
		// Return the duration value calculated by the interceptors, plus the timelog object of the response object (provided by Primo).
		console.log(`${urlData.domain_prefix}: ${response.duration}`);
		console.log(response.request.res.responseUrl);
		return {primoId: urlData.id, 
				duration: response.duration, 
				timelog: response.data.timelog,
				timed_out: false,
				test_date: new Date()};
	} catch (error) {
		// If this is a timeout error, return some data but don't log the error
		if (error.code == 'ECONNABORTED') {
			return {primoId: urlData.id,
					duration: 0,
					timelog: {},
					timed_out: true,
					test_date: new Date()};
		}
		else errorHandler(error);
	}

}

async function storeData(timingData, keywordObj) {
	/*Save the timing data to the pg database, looping over the resulst for each url tested.*/
	for (let row of timingData) {
		// This query should return an id for use in logging the more granular response data
		try {
			let rowObj = await pool.query(config.queries.recordResponseTime, 
									[row.primoId,
									keywordObj.id,
									row.test_date,
									row.duration,
									row.timed_out]);
			// extract the new id created by the insert query
			let responseId = rowObj.rows[0].id;
			await pool.query(config.queries.recordResponseData, [responseId, row.timelog]);

		} catch (error) {
			errorHandler(`SQL error on recording test for URL ${row.primoId}: ${error}`);
			continue
		}
	}
}

async function testUrls() {
	/*Loop through a set of stored URL parameters, testing each and storing the results.*/
	let urlData = await getUrls();
	// Get a kewyord to use for this test
	let keywordObj = await getKeyword();
	// Iterate over the list of urls to test with a for loop -- sequential operation
	let timingData = [];
	for (let i=0; i<urlData.length; i++) {
		let result = await testUrl(urlData[i], config.primoQuery, keywordObj);
		timingData.push(result);
	}
	// Write the resulst to the database
	await storeData(timingData, keywordObj);
	return;
}

function promiseTimeout(milliseconds) {
	// Wrapping setTimeout in a Promise for use with async/await: https://stackoverflow.com/questions/38975138/is-using-async-in-settimeout-valid
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runTests() {
	/*Recursive function, using async and a timeout to avoid bloating the call stack.*/
	// Calculate the delay in milliseconds as a random value between upper and lower bounds
	let delay = Math.floor(Math.random() * (config.testDelayUB - config.testDelayLB) + config.testDelayLB) * 1000;
	await testUrls();
	// Pause execution 
	await promiseTimeout(delay);
	console.log(`Running tests again after ${delay} ms delay.`)
	// Recur
	return await runTests();

}

runTests();


