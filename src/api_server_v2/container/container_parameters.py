import sqlite3
import os
import json
from flask import Blueprint, jsonify, request

# --- Blueprint Setup ---
container_api_blueprint = Blueprint('container_api', __name__)

from ..db_config import SHARED_DATABASE_PATH

def get_db_connection():
    """Establishes and returns a database connection."""
    # Ensure the directory for the database exists
    os.makedirs(os.path.dirname(SHARED_DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(SHARED_DATABASE_PATH)
    # This allows accessing columns by name
    conn.row_factory = sqlite3.Row
    return conn

def init_containers_table():
    """Initializes the database and creates the 'containers' table if it doesn't exist."""
    print(f"Initializing containers table in: {SHARED_DATABASE_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS containers (
            id INTEGER PRIMARY KEY,
            shape TEXT NOT NULL,
            parameters TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Check if the default config row exists
    cursor.execute("SELECT id FROM containers WHERE id = 1")
    if cursor.fetchone() is None:
        print("Inserting default container configuration record.")
        # Insert a placeholder row
        default_params = json.dumps({"note": "This is the default placeholder."})
        cursor.execute("INSERT INTO containers (id, shape, parameters) VALUES (1, 'default', ?)", (default_params,))
    
    conn.commit()
    conn.close()
    print("Containers table initialized successfully.")

# --- API Route Definitions ---
@container_api_blueprint.route('/', methods=['POST'])
def save_container_config():
    """
    Saves or updates the container configuration.
    It uses a fixed ID (1) to always refer to the 'current' container configuration.
    This is an "UPSERT" operation.
    """
    data = request.get_json()
    if not data or 'shape' not in data:
        return jsonify({"error": "Missing 'shape' in request body"}), 400

    shape = data.get('shape')
    # Store the entire configuration object as a JSON string for flexibility
    parameters = json.dumps(data)

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Use UPSERT (INSERT ON CONFLICT) to update the record with id=1 or create it if it doesn't exist.
        # This is efficient and atomic.
        cursor.execute("""
            INSERT INTO containers (id, shape, parameters, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                shape = excluded.shape,
                parameters = excluded.parameters,
                updated_at = excluded.updated_at;
        """, (shape, parameters))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Database error: {e}") # Log the actual error to the server console
        return jsonify({"error": "Database operation failed", "details": str(e)}), 500
    finally:
        conn.close()
    
    return jsonify({"message": "Container configuration saved successfully.", "id": 1}), 200

# This allows running `python -m src.api_server_v2.container_parameters` from the project root
# to manually initialize the database.
if __name__ == '__main__':
    init_containers_table()
