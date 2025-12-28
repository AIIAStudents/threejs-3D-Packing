import sqlite3
import os

# Path relative to the project root (where start_servers.py is run)
DB_PATH = 'src/db_v2/session_data.db'

def get_db_connection():
    # Helper to ensure DB directory exists
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir)
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
