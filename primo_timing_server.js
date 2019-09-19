var express = require('express'),
	app = express(),
	bodyParser = require('body-parser'),
	urlStore = require('./primo_url_store.js'),
	config = require('./db/config.js'),
	{ Pool } = require('pg'),
	pool = new Pool(config.credentials),
	{ createLogger, format, transports } = require('winston'),
	csv = require('async-csv'),
	fs = require('fs').promises;

const PORT = 3001;

const logger = createLogger({
  level: 'info',
  format: format.combine(
      format.timestamp(),
      format.json()
    ),
  defaultMeta: {service: 'user-service'},
  transports: [
    new transports.File({ filename: 'server-error.log', 
    	level: 'error',
    	timestamp: true })  ]
});

app.use(express.static('./'));
app.use(bodyParser.text());
app.use(bodyParser.urlencoded({
    extended: true
}));

// Directory for index.html, etc.
app.use('/', express.static(__dirname + '/public'));
// Express middleware for static files, redirecting the <script> and <link> tags from index.html
app.use('/handsontable', express.static(__dirname + '/node_modules/handsontable/dist'));
app.use('/jquery', express.static(__dirname + '/node_modules/jquery/dist'));
app.use('/d3', express.static(__dirname + '/node_modules/d3/dist'));
app.use('/bootstrap-css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use('/js', express.static(__dirname + '/public/js'));

function errorHandler(error) {
	console.error(error);
}


app.get('/', (req, res) => {
	
	res.sendFile('index.html');	
});

async function storeURL(domainPrefix, queryParams, urlHashId) {
	/* Stores a user-supplied URL in a postgres db, with columns corresponding to the parts of the parametrized query.
	domainPrefix should be a string, queryParams an object with keys matching those listed in config.queries.register_url_cols
	*/
	// Get the values from the URL parameters in the specified order of the INSERT statement
	let paramValues = config.queries.registerUrlCols.map(col => queryParams[col]);
	// Unroll the parameters array on passing it to postgres. Add a timestamp. 
	try {
		await pool.query(config.queries.registerUrl, [urlHashId, domainPrefix, ...paramValues, new Date()]);
	}
	catch (error) {
		throw `postgres DB error: ${error}`;
	}
}

app.post('/url', async (req, res) => {
	try {
		let url = req.body.url,
			urlData = urlStore.parseUrl(url, errorHandler);
		if (!urlData) {
			res.send({message: 'Invalid URL. Please try again.'})
			throw `Invalid URL: ${url}`;
		}
		else {
			await storeURL(...urlData);
			res.send({message: 'Success!'})
		}
	}
	catch (error) {
		errorHandler(error);
	}
});

async function initDb() {
	/* Initialize the tables in the postgres database.*/
	const client = await pool.connect();

	try {
		// Use transactions so as to abort table initialization on an error with any table
		await client.query('BEGIN');

		for (let query of config.queries.initialQueries) {
			try {		
				// run each query
				await client.query(config.queries[query]);
			} catch (error) {
				throw `Error creating table on query ${query}: ${error}. No tables created.`;
			}
		}
		// if no errors, commit all queries
		await client.query('COMMIT');
	} catch (error) {
		// on error, rollback transactions
		await client.query('ROLLBACK');
		//bubble up error to calling function
		throw error;
	} finally {
		// release the client in either condition
		client.release();
	}

}

async function loadKeywords() {
	/*Function for loading search strings from a file. TO DO: accept via web interface.*/
	let rows;
	try {
		let csvString = await fs.readFile(config.primoQueryFile, 'utf-8');
		rows = await csv.parse(csvString, {columns: true});
	} catch(error) {
		throw `Error loading keyword file: ${error}`;
		return;
	}
	for (let row of rows) {
		try {
			pool.query(config.queries.loadKeywords, [row['Search String'], new Date()]);
		} catch (error) {
			throw `Error loading keywords: ${error}`;
			return;
		}

	}
}

async function main() {
	/*Startup function for the server. Checks for a command-line argument to initialize the database.*/
	// Get the CLI arguments
	let args = process.argv.slice(2);
	if (args.includes('--init')) {
		try {
			await initDb();
			console.log('Tables successfully created.')
		} catch (error) {
			errorHandler(error);
		}
	}
	if (args.includes('--keywords')) {
		try {
			await loadKeywords();
			console.log('Keywords successfully loaded.')
		} catch (error) {
			errorHandler(error);
		}

	}
	console.log(`Listening on port ${PORT}`);
	server = app.listen(PORT);

}
main();



