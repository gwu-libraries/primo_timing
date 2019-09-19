const url = require('url'),
	querystring = require('querystring'),
	crypto = require('crypto');

var exports = module.exports = {};


exports.parseUrl = function (rawURL, errorHandler) { 
	/*Accepts a user-provided URL string and parses its components. Validates that this constitutes a Primo URL.*/
	const paramsToStore = ['vid', 'tab', 'search_scope'];
	
	try {
		let parsedURL = url.parse(rawURL),
			host = parsedURL.host,
			params = querystring.decode(parsedURL.query);
		// A necessary hack, because the querystring.parse function does not return a prototypical Object. See https://github.com/tj/node-querystring/issues/61
		params = JSON.parse(JSON.stringify(params));
		// Check for the presence of a Primo hostname
		if (!host.includes('primo.exlibrisgroup.com')) throw `Not a valid Primo URL. Wrong hostname ${host}`;
		// Check for the presence of the required parameters
		testParams = paramsToStore.reduce( (paramObj, param) => {
			if (!params.hasOwnProperty(param)) throw `Parameter missing: ${param}`;
			let paramValue = params[param];
			// The UI Primo URL uses a different parameter from the PNX URL.
			if (param == 'search_scope') paramObj['scope'] = paramValue;
			else paramObj[param] = paramValue;
			return paramObj;
		}, {});
		// Add the institution code
		testParams['inst'] = testParams.vid.split(':')[0];
		// Get the institution domain from the host
		let domainPrefix = host.split('.')[0];
		// Create a hash from this URL as a unique ID
		let hash = crypto.createHash('sha256'),
			hashId = hash.update(domainPrefix + testParams['inst'] + testParams['vid'] + testParams['tab'] + testParams['scope']);

		return [domainPrefix, testParams, hashId.digest('hex')];
	}
	catch (error) {
		errorHandler(error);
		return null;
	}

}