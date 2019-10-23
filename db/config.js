module.exports = {
	timeout: 30000, // Primo max wait time before timeout
	testDelayUB: 720, // Upper bound of number of seconds between tests. With random selection from a uniform distribution, this will average out to about one test every 6 minutes.  
	testDelayLB: 60, // Lower bound of seconds between tests.
	urlDomain: 'primo.exlibrisgroup.com/primaws/rest/pub/pnxs',
	urlParams: {
		skipDelivery: 'Y',
		blendFacetsSeparately: false,
		inst: null,
		vid: null,
		scope: null,
		tab: null
	},
	primoQueryFile: './data/primo_top_searches.csv',
	credentials: {
		user: "primo_timing",
  		host: "localhost",
  		database: "primo_timing",
  		password: "primo",
  		port: 5432
	},
	queries: {
		createUrlTable: `create table primo_urls( 
								domain_prefix	text,
								inst 			text,
								vid 			text,
								scope 			text,
								tab 			text,
								date_added		timestamp,
								id				text primary key			
							)`,
		createResponseTable: `create table response_times(
								id 				serial primary key,
								primo_id		text references primo_urls (id),
								search_key		integer references keywords (id),
								duration	   	numeric,
								timed_out		boolean,
								test_date		timestamp
							)`,
		createRespDataTable: `create table response_time_data(
								response_id 		integer references response_times (id),
								response_timelog	jsonb
								)`,
		createKeywordTable: `create table keywords(
								id 				serial primary key,
								search_string	text,
								date_added		timestamp
							)`,
		initialQueries: ['createKeywordTable', 'createUrlTable', 'createResponseTable', 'createRespDataTable'],
		registerUrlCols: ['inst', 'vid', 'scope', 'tab'],
		registerUrl: `insert into primo_urls (id, domain_prefix, inst, vid, scope, tab, date_added) 
						values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
		recordResponseTime: `insert into response_times(primo_id, search_key, test_date, duration, timed_out) values ($1, $2, $3, $4, $5) returning id`,
		recordResponseData: `insert into response_time_data(response_id, response_timelog) values ($1, $2)`,
		getUrls: 'select domain_prefix, inst, vid, scope, tab, id from primo_urls',
		loadKeywords: `insert into keywords(search_string, date_added) values ($1, $2)`,
		getKeywords: 'select id, search_string from keywords'
	}
};