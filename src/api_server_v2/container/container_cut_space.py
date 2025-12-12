import sqlite3
import os
import json
from flask import Blueprint, jsonify, request

# --- Blueprint Setup ---
cut_space_api_blueprint = Blueprint('cut_space_api', __name__)

from ..db_config import SHARED_DATABASE_PATH

def get_db_connection():
    """Establishes and returns a database connection."""
    os.makedirs(os.path.dirname(SHARED_DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(SHARED_DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_cutting_tables():
    """Initializes the database and creates the cutting_jobs and zones tables."""
    print(f"Initializing cutting tables in: {SHARED_DATABASE_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Drop tables if they exist to ensure a clean slate
    cursor.execute("DROP TABLE IF EXISTS zones")
    cursor.execute("DROP TABLE IF EXISTS cutting_jobs")
    print("Dropped existing 'zones' and 'cutting_jobs' tables (if any).")
    
    # Create the cutting_jobs table to store container info
    cursor.execute("""
        CREATE TABLE cutting_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_shape TEXT NOT NULL,
            container_parameters TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("Created new 'cutting_jobs' table.")
    
    # Create the zones table to store individual cut spaces
    cursor.execute("""
        CREATE TABLE zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            label TEXT NOT NULL,
            length REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            FOREIGN KEY (job_id) REFERENCES cutting_jobs (id)
        )
    """)
    print("Created new 'zones' table.")
    
    conn.commit()
    conn.close()
    print("Cutting database tables initialized successfully.")

# --- API Route Definitions ---
@cut_space_api_blueprint.route('/jobs', methods=['POST'])
def save_cutting_job():
    """
    Receives a full cutting job (container + zones) and saves it to the database.
    """
    data = request.get_json()
    if not data or 'container' not in data or 'zones' not in data:
        return jsonify({"error": "Request body must contain 'container' and 'zones' keys"}), 400

    container_data = data['container']
    zones_data = data['zones']

    if 'shape' not in container_data:
        return jsonify({"error": "Container data must include 'shape'"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Start a transaction
        cursor.execute("BEGIN TRANSACTION;")
        
        # 1. Insert the cutting job and get its ID
        container_shape = container_data['shape']
        container_params_json = json.dumps(container_data)
        
        cursor.execute(
            "INSERT INTO cutting_jobs (container_shape, container_parameters) VALUES (?, ?)",
            (container_shape, container_params_json)
        )
        job_id = cursor.lastrowid
        
        # 2. Insert the associated zones
        for zone in zones_data:
            if not all(k in zone for k in ('label', 'length', 'width', 'height')):
                raise ValueError("Each zone must contain 'label', 'length', 'width', and 'height'")
            
            cursor.execute(
                "INSERT INTO zones (job_id, label, length, width, height) VALUES (?, ?, ?, ?, ?)",
                (job_id, zone['label'], zone['length'], zone['width'], zone['height'])
            )
        
        # Commit the transaction
        conn.commit()
        
        return jsonify({
            "message": "Cutting job saved successfully.",
            "job_id": job_id,
            "zones_saved": len(zones_data)
        }), 201

    except (ValueError, TypeError) as e:
        conn.rollback()
        return jsonify({"error": "Invalid data format", "details": str(e)}), 400
    except Exception as e:
        conn.rollback()
        print(f"Database error: {e}") # Log to server console
        return jsonify({"error": "Database operation failed", "details": str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    init_cutting_tables()