# A little NodeJs utility for logging response times for Primo. 

## Purpose 

Records round-trip response times for PNX queries to Primo VE. These metrics do not include rendering time in the UI, so the data gathered represent a baseline measure of how quickly Primo returns results in response to keyword queries. 

The application can handle multiple Primo PNX URL's, which may include different views of the same Primo VE instance or difference instances altogether. Requests are made asynchronously in an endless loop, with a randomized delay between each batch of URL's (as set in the configuration file). Results are logged in a postgres database. 

At the moment, the UI does not 

