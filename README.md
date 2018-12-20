### A little Python utility for logging response times for Primo. ###

Using asynchronous code for better performance, this script pings the supplied URL a given number of times and records the average latency. It also logs the response text from the last ping. As of now, the script can be configured to iterate through multiple Primo scopes. Support for multiple views and institutions will be added in a future release.

**Requirements & Dependencies**
 - Python 3.6
 - pyaml
 - aiohttp

**Installation and Use**
1. Make sure that `config.yml` is in the same directory as `primo_timing.py`. 
2. Update `config.yml` with the desired testing parameters. 
3. Change the value of the `base_url` global variable inside `primo_timing.py` so that it points to your instance of Primo.
4. Run `python primo_timing.py --init` from the command line to initialize the CSV file that stores the latency. This will also run your first test.
5. Run `python primo_timing.py` to run subsequent tests. The response text from the last iteration will be logged to the `data_log` as defined in `config.yml`. This log is scheduled to be rolled over every Sunday; by default, no more than 7 data_log files will be stored. The CSV file, however, will accumulate indefinitely.
6. If desired, run `primo_timing.py` from a cron job.