import requests
import sys

post_url = 'http://localhost:3001/url'

def load_urls_from_file(filename):
	'''Accepts the name of a text file from which to load a list of URL's into the Primo time-tracking database.'''
	with open(filename, 'r') as f:
		urls = f.readlines()
	for url in urls:
		resp = requests.post(post_url, data={'url': url})
		print(url, resp.text)

if __name__ == '__main__':
	load_urls_from_file(sys.argv[1])
