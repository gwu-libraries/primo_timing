from datetime import datetime
import asyncio
from asyncio import TimeoutError
import aiohttp
from csv import DictWriter, DictReader
import yaml
from itertools import groupby
from logging.handlers import TimedRotatingFileHandler
import logging
import sys
import os
from random import choice
from throttler import Throttler
import requests
from datetime import datetime
from statistics import stdev

MAX_CSV_SIZE = 1000000
TIMEOUT = 30
RATE_LIMIT = 10 # Max 10 requests per second

# Config file holds URL parameters, number of trials, and path to log files
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
fieldnames = ['timestamp', 'max_latency', 'mean_latency', 'n_tries', 'inst', 'scope', 'search_str', 'stdev_latency']

base_url = 'https://{domain}.primo.exlibrisgroup.com/primaws/rest/pub/pnxs'

# Stores the results from the current trials
# TO DO --> re-write without global variable
results = []

def load_search_strings(limit=-1):
    '''Function to read search strings from a CSV file. Can be used with a report from Primo Analytics of popular searches. Returns a list of strings, up to an optional limit.'''
    with open(config['search_strs']['file'], 'r', errors='ignore') as f:
        reader = DictReader(f)   
        # Extract the search string value from the specified column for each row in the CSV
        return [row[config['search_strs']['column']] for row in reader][:limit]

async def on_request_start(session, trace_config_ctx, params):
    '''Helper function to record the time the request is sent'''
    trace_config_ctx.start = session.loop.time()

async def on_request_end(session, trace_config_ctx, params):
    '''Helper function to record when the response is received, along with info about the URL being tested.'''
    # Check response status
    if params.response.status != 200:
        response_log.error('Bad Request: ' + str(params.response.url))
    else:
        elapsed = session.loop.time() - trace_config_ctx.start
        result = {"elapsed": elapsed}
        result.update(trace_config_ctx.trace_request_ctx)
        results.append(result)

async def throttle_trace(throttler, *args, **kwargs):
    '''Throttles the request. This allows us to re-use the clientsession on each call. '''
    async with throttler:
        return await do_trace(*args, **kwargs)

async def do_trace(client, i, inst_domain, search_params, keep=False):
    '''Uses the aiohttp library to make an asynchronous request from Primo. Parameters should be an aiohttp client, the number of the current trial, and a subdomain string and parameters definining this particular institution, query string, view, tab, and scope.'''
    # Update the parameters with the generic params from the config file
    search_params.update(config['parameters'])
    search_params = {k: str(v) for k,v in search_params.items()}
    # Use a timeout corresponding to Primo's search timeout
    timeout = aiohttp.ClientTimeout(total=TIMEOUT)
    try:
        async with client.get(base_url.format(domain=inst_domain),
                        timeout=timeout, 
                        params=search_params, 
                        trace_request_ctx={'id':i, # These key-value pairs will be passed to the trace output
                                            'search_str': search_params['q'],
                                            'inst': search_params['inst'],
                                            'scope': search_params['scope']}) as session:
        # If this is the last of N trials, log the response text
            if (i == n_tries-1) and keep:
                try: 
                    response = await session.json()
                    # Just keep the first document returned (to keep the log file size manageable)
                    response_log.info(response['docs'][0])
                except Exception as e:
                    response_log.error(e)
                    response_log.error('Request: ' + str(session.url))
    except TimeoutError:
        # If it times out, capture this result
        result = {"elapsed": TIMEOUT,
                'id':i,
                'search_str': search_params['q'],
                'inst': search_params['inst'],
                'scope': search_params['scope']}
        results.append(result)

async def run_trials(loop, search_strs, keep=False):
    '''This function runs the main async loop. First argument should be an event loop, second a list of search strings.'''

    # Timestamp for this trial
    timestamp = datetime.today().strftime('%m-%d-%Y %H:%M')
    # Configure the tracing module in aiohttp
    trace_config = aiohttp.TraceConfig()
    trace_config.on_request_start.append(on_request_start)
    trace_config.on_request_end.append(on_request_end)
    # Reusing the same client for all loops
    async with aiohttp.ClientSession(trace_configs=[trace_config]) as client:
    # Create a list of co-routines, one for each trial/scope/institution 
        throttler = Throttler(rate_limit=RATE_LIMIT)
        awaitables = []
        for institution in config['institutions']:
            for scope in institution['scopes']:
                # Select a random keyword for this set of trials
                search_str = choice(search_strs)
                # Assemble the search parameters for this particular inst/scope
                search_params = {'inst': institution['inst'],
                                'vid': '{}:{}'.format(institution['inst'], 
                                                        institution['vid']),
                                'scope': scope['scope'],
                                'tab': scope['tab'],
                                'q': 'any,contains,{}'.format(search_str)}
                for i in range(n_tries):
                    awaitables.append(loop.create_task
                                        (throttle_trace(
                                            throttler,
                                            client, 
                                            i, 
                                            inst_domain=institution['domain'], 
                                            search_params=search_params)
                                        )
                                    )
    # The async method of iterating through a collection
        tasks = await asyncio.gather(*awaitables)
    # Executed when all async tasks have finished
    return output_results(timestamp) 

def main_noasync(keep=False):
    '''Non-async version of the code, for testing purposes.'''
    search_strs = load_search_strings()
    timestamp = datetime.today().strftime('%m-%d-%Y %H:%M')
    for institution in config['institutions']:
        for scope in institution['scopes']:
            # Select a random keyword for this set of trials
            search_str = choice(search_strs)
            # Assemble the search parameters for this particular inst/scope
            search_params = {'inst': institution['inst'],
                                'vid': '{}:{}'.format(institution['inst'], 
                                                        institution['vid']),
                                'scope': scope['scope'],
                                'tab': scope['tab'],
                                'q': 'any,contains,{}'.format(search_str)}
            for i in range(n_tries):
                response = requests.get(base_url.format(domain=institution['domain']),
                                params=search_params)
                if response.status_code != 200:
                    response_log.error('Bad Request: ' + str(params.response.url))
                else:
                    elapsed = response.elapsed.total_seconds()
                    result = {"elapsed": elapsed,
                            'id':i,
                            'search_str': search_params['q'],
                            'inst': search_params['inst'],
                            'scope': search_params['scope']}
                    results.append(result)
    return output_results(timestamp) 

def main(keep=False):
    '''This function just calls the main async function, passing in the event loop.'''
    search_strs = load_search_strings()
    loop = asyncio.get_event_loop()
    loop.run_until_complete(run_trials(loop, search_strs, keep))

def extract_summary(group):
    '''Helper function for use with the itertools groupby function.'''
    group = [g['elapsed'] for g in group]
    print(group)
    # Total number of successful trials (=status 200)
    n_tries = len(group)
    return {'n_tries': n_tries,
            'max_latency': max(group),
            'mean_latency': sum(group) / n_tries,
            'stdev_latency': stdev(group)}

def output_results(timestamp):
    '''Regular, synchronous function to collate the results and update a CSV file.'''
    keyfunc = lambda x: (x['inst'], x['scope'], x['search_str'])
    # Sort results before grouping
    results_sorted = sorted(results, key=keyfunc)
    # Group results by scope and institution code
    # Append to CSV
    maintain_log()
    with open(config['timing_log'], 'a', newline='') as f:
        writer = DictWriter(f, fieldnames=fieldnames)
        for k, g in groupby(results_sorted, key=keyfunc):
            row = extract_summary(g)
            # Add the group keys to the row
            row.update(dict(zip(['inst', 'scope', 'search_str'], k)))
            row['timestamp'] = timestamp
            row['search_str'] = row['search_str'].split(',')[-1] # Extract the search term from the query string
            print(row)
            writer.writerow(row)
    return
# Check the size of the CSV and start a new one when it gets over a limit
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
    '''Command line usage: pass the "--init" argument on first run to create the CSV.'''
    '''Pass --keep flag to store the search result, one from each trial.'''
    if '--init' in sys.argv:
        init_timing_log()
    keep = '--keep' in sys.argv
    if '--no-async' in sys.argv:
        main_noasync(keep)
    else:
        main(keep)