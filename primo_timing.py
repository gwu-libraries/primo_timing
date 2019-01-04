from datetime import datetime
import asyncio
import aiohttp
from csv import DictWriter
import yaml
from itertools import groupby
from logging.handlers import TimedRotatingFileHandler
import logging
import sys
import os

MAX_CSV_SIZE = 1000

# Config file holds URL parameters, number of trials per URL, and path to log files
with open('./primo_timing.yml', 'r') as f:
    config = yaml.load(f)

# Set up logging to create a new file week on Sunday
# JSON response from the last trial per URL will be stored here
response_log = logging.getLogger('charges')
response_log.setLevel(logging.INFO)
file_handler = TimedRotatingFileHandler(config['data_log'], 
                                        when='W6',
                                       backupCount=7,
                                       encoding='utf-8')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(logging.Formatter('%(asctime)s: %(message)s'))
response_log.addHandler(file_handler)

# Number of trials per URL; latency will be averaged across N tries
n_tries = config['n_tries']
# Header row for the CSV file
fieldnames = ['timestamp', 'latency', 'n_tries', 'inst_code', 'scope']

# URL for Python string formatting, allowing dynamic insertion of different scopes
# To DO: Logic for other schools
base_url = 'https://wrlc-gwu.primo.exlibrisgroup.com/primaws/rest/pub/pnxs?blendFacetsSeparately=false&disableCache=false&getMore=0&inst={inst_code}&lang=en&limit=20&newspapersActive=false&newspapersSearch=false&offset=0&pcAvailability=false&q=any,contains,{search_str}&qExclude=&qInclude=&rtaLinks=true&scope={scope}&skipDelivery=N&sort=rank&tab=Everything&vid={vid}' 

# Stores the results from the current trials
# TO DO --> re-write without global variable
results = []

# Helper function to record the time the request is sent
async def on_request_start(session, trace_config_ctx, params):
    trace_config_ctx.start = session.loop.time()

# Helper function to record when the response is received, along with info about the URL being tested
async def on_request_end(session, trace_config_ctx, params):
    elapsed = session.loop.time() - trace_config_ctx.start
    result = {"elapsed": elapsed}
    result.update(trace_config_ctx.trace_request_ctx)
    results.append(result)
# Main async loop
# Using the aiohttp trace functionality to measure latency
async def do_trace(on_request_start, on_request_end, i, inst_code, scope):
    trace_config = aiohttp.TraceConfig()
    trace_config.on_request_start.append(on_request_start)
    trace_config.on_request_end.append(on_request_end)
    url_params = {'search_str': config['search_str'],
                         'vid': inst_code + ':' + config['vid'],
                         'inst_code': inst_code,
                         'scope': scope}
    async with aiohttp.ClientSession(trace_configs=[trace_config]) as client:
        async with client.get(base_url.format(**url_params), trace_request_ctx={'id':i,
                                                                          'inst_code': inst_code,
                                                                          'scope': scope}) as session:
            # If this is the last of N trials, log the response text
            if i == n_tries-1:
                response = await session.json()
                # Just keep the first 5 documents returned (to keep the log file size manageable)
                try: 
                    response_log.info(response['docs'][:5])
                except Exception as e:
                    response_log.error(e)
 # Function to initialize and run the event loop               
def run_trials():
    # Timestamp for this trial
    timestamp = datetime.today().strftime('%m-%d-%Y %H:%M')
    # TO DO: update for Python 3.7
    loop = asyncio.get_event_loop()
    # Create a list of co-routines, one for each trial/scope/institution code
    awaitables = [do_trace(on_request_start, on_request_end, i, inst_code, scope) for i in range(n_tries) for scope in config['scopes'] for inst_code in config['inst_codes']]
    # The async method of iterating through a collection
    tasks = asyncio.gather(*awaitables)
    loop.run_until_complete(tasks)
    return output_results(timestamp) 

# Function to collate the results and update a CSV file
def output_results(timestamp):
    keyfunc = lambda x: (x['inst_code'], x['scope'])
    # Sort results before grouping
    results_sorted = sorted(results, key=keyfunc)
    # Group results by scope and institution code and calculate the average latency across the triels
    summary = [(k, sum([group['elapsed'] for group in g])/n_tries) for k, g in groupby(results_sorted, keyfunc)]
    # Append to CSV
    maintain_log()
    with open(config['timing_log'], 'a', newline='') as f:
        writer = DictWriter(f, fieldnames=fieldnames)
        for row in summary:
            writer.writerow({'timestamp': timestamp,
                        'latency': row[1],
                        'inst_code': row[0][0],
                        'scope': row[0][1],
                        'n_tries': n_tries})
    return
# Check the size of the CSV and start a new one when it gets over a limit
# TO DO --> put the limit in the config file
def maintain_log():
    if os.path.getsize(config['timing_log']) > MAX_CSV_SIZE:
        # Rename the current CSV with the timestamp appended
        os.rename(config['timing_log'], config['timing_log'] + '_{}'.format(datetime.today().strftime('%Y-%m-%d')))
        init_timing_log()        
    return


# Initialize the CSV
def init_timing_log():
    with open(config['timing_log'], 'w', newline='') as f:
        writer = DictWriter(f, fieldnames=fieldnames)   
        writer.writeheader()
    return

if __name__ == '__main__':
    # Command line usage: pass the "--init" argument on first run to create the CSV
    if (len(sys.argv) > 1) and (sys.argv[1] == '--init'):
        init_timing_log()
    run_trials()