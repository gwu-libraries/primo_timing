#!/usr/bin/env python
# coding: utf-8

import json
import sqlalchemy

def init_db():
    with open('config.json', 'r') as f:
        config = json.load(f)
    # create the Postgres engine from the credentials in the config file
    engine = sqlalchemy.create_engine('postgresql://{user}:{password}@{host}:{port}/{database}'.format(**config['pg_credentials']))

    sql_create = ['''
    CREATE TABLE events 
        (test_id SERIAL PRIMARY KEY,
        view_id TEXT, 
        search_term TEXT, 
        start_time TIMESTAMP, 
        first_result TIMESTAMP, 
        first_availability TIMESTAMP)
    ''',
    '''
    CREATE TABLE har
        (test_id INTEGER REFERENCES events,
        har JSONB)
    '''
    ]

    for query in sql_create:
        engine.execute(query)
    print("Tables successfully created.")
    return

if __name__ == '__main__':
    init_db()
