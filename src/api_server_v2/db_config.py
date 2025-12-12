import os

# Define the shared database file path for the entire v2 API.
# This makes it easy to manage and allows for ephemeral (in-memory like) behavior
# by deleting and recreating this single file on server start.
SHARED_DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'db_v2', 'session_data.db')
