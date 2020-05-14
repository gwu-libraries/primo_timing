# A little NodeJs utility for logging response times for Primo. 

## Purpose 

Records round-trip response times for PNX queries to Primo VE. These metrics do not include rendering time in the UI, so the data gathered represent a baseline measure of how quickly Primo returns results in response to keyword queries. 

The application can handle multiple Primo PNX URL's, which may include different views of the same Primo VE instance or difference instances altogether. Requests are made asynchronously in an endless loop, with a randomized delay between each batch of URL's (as set in the configuration file). Results are logged in a postgres database for analysis and extraction.

At the moment, the application includes a simple web interface for adding new URL's, but visualization and downloading of results await a future enhancement. 

## Installation and use

1. Clone this repository, using the `master` branch.
2. In the `./db` directory, edit `config.js` with the following values:
  - `credentials` should include credentials for a postgres database that will be used to store the metrics. Before running the init script, you'll need to create the database and provide credentials for a user that has read/write permissions.
  - `primoQueryFile` should point to a CSV file with keywords for loading into the database. These will be used to generate random keyword searches against the PNX endpoint. The CSV file should include a column labelled `Search String`. (For our implementation, I used the "Most Popular Searches" dimension in Primo Analytics.)
3. Install the necessary Node packages by running `npm install` in the project directory.
4. Initialize the database by running `node primo_timing_server.js --init --keywords`. This will initialize the postgres database with the supplied credentials, load the keywords from the supplied file, and start the server.
5. If you want to upload multiple URL's, place them in a text file and run `python load_urls.py` from the command line, supplying the name of the text file as the argument. 
6. Launch the tracker: `node primo_timing_tracker.js`. 
7. For a long-running process, it is recommended to run both of these with a process manager like [PM2](https://pm2.keymetrics.io/).

