import sqlite3
import os
import json
from flask import Blueprint, jsonify, request

# --- Blueprint Setup ---
assignment_api_blueprint = Blueprint('assignment_api', __name__)

# --- Use the shared database configuration ---
from src.api_server_v2.db_config import SHARED_DATABASE_PATH

# --- Database Helpers ---
def get_db_connection():
    """Establishes a connection to the shared database file."""
    conn = sqlite3.connect(SHARED_DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_assignments_table():
    """Creates the 'zone_assignments' table if it doesn't exist."""
    print("Initializing assignments table...")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS zone_assignments")
    cursor.execute("""
        CREATE TABLE zone_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            FOREIGN KEY (zone_id) REFERENCES zones (id),
            FOREIGN KEY (group_id) REFERENCES groups (id),
            UNIQUE(zone_id, group_id)
        )
    """)
    conn.commit()
    conn.close()
    print("Table 'zone_assignments' created.")


# --- API Route Definitions ---
@assignment_api_blueprint.route('/assignment-data', methods=['GET'])
def get_assignment_data():
    """
    Fetches all necessary data for the assignment page from the single shared database.
    """
    try:
        conn = get_db_connection()
        
        # Fetch container data
        container = conn.execute('SELECT * FROM containers WHERE id = 1').fetchone()
        container_data = dict(container) if container else None
        if container_data and 'parameters' in container_data:
            container_data['parameters'] = json.loads(container_data['parameters'])

        # Fetch cutting job and zones
        latest_job = conn.execute('SELECT * FROM cutting_jobs ORDER BY id DESC LIMIT 1').fetchone()
        zones_data = []
        job_data = None
        if latest_job:
            job_data = dict(latest_job)
            job_id = latest_job['id']
            # Join with assignments to see which zones are already assigned
            zones = conn.execute("""
                SELECT z.*, GROUP_CONCAT(za.group_id) as assigned_group_ids
                FROM zones z
                LEFT JOIN zone_assignments za ON z.id = za.zone_id
                WHERE z.job_id = ?
                GROUP BY z.id
                ORDER BY CAST(z.label AS INTEGER) ASC
            """, (job_id,)).fetchall()
            zones_data = [dict(z) for z in zones]
        
        # Fetch all items & groups
        items_data = [dict(i) for i in conn.execute('SELECT * FROM items ORDER BY group_id, id').fetchall()]
        groups_data = [dict(g) for g in conn.execute('SELECT * FROM groups ORDER BY id').fetchall()]

        conn.close()

        response_payload = {
            "container": container_data,
            "job": job_data,
            "zones": zones_data,
            "items": items_data,
            "groups": groups_data
        }
        
        return jsonify(response_payload), 200

    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error fetching assignment data: {e}")
        return jsonify({"error": "Failed to fetch assignment data", "details": str(e)}), 500

@assignment_api_blueprint.route('/assignments', methods=['POST'])
def save_assignments():
    """
    Saves a list of zone-to-group assignments.
    Expects a list of objects: [{ "zone_id": Z, "group_id": G }, ...]
    """
    assignments = request.get_json()
    if not isinstance(assignments, list):
        return jsonify({"error": "Request body must be a list of assignment objects"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("BEGIN TRANSACTION;")
        # Clear all previous assignments for simplicity.
        # A more complex implementation could handle deltas.
        cursor.execute("DELETE FROM zone_assignments;")
        
        for assignment in assignments:
            if not all(k in assignment for k in ('zone_id', 'group_id')):
                raise ValueError("Each assignment object must contain 'zone_id' and 'group_id'")
            
            cursor.execute(
                "INSERT INTO zone_assignments (zone_id, group_id) VALUES (?, ?)",
                (assignment['zone_id'], assignment['group_id'])
            )
        
        conn.commit()
        return jsonify({"message": f"Successfully saved {len(assignments)} assignments."}), 201

    except (ValueError, TypeError) as e:
        conn.rollback()
        return jsonify({"error": "Invalid data format", "details": str(e)}), 400
    except Exception as e:
        conn.rollback()
        print(f"Database assignment error: {e}")
        return jsonify({"error": "Database operation failed", "details": str(e)}), 500
    finally:
        conn.close()

@assignment_api_blueprint.route('/assigned-spaces', methods=['GET'])
def get_assigned_spaces():
    """
    Fetches only the zones (spaces) that have at least one group assigned to them.
    """
    try:
        conn = get_db_connection()
        # Find the latest job
        latest_job = conn.execute('SELECT id FROM cutting_jobs ORDER BY id DESC LIMIT 1').fetchone()
        if not latest_job:
            return jsonify([]) # Return empty list if no jobs exist

        job_id = latest_job['id']
        
        # Select distinct zones that have an entry in the assignments table
        spaces = conn.execute("""
            SELECT DISTINCT z.*
            FROM zones z
            INNER JOIN zone_assignments za ON z.id = za.zone_id
            WHERE z.job_id = ?
            ORDER BY CAST(z.label AS INTEGER) ASC
        """, (job_id,)).fetchall()
        
        conn.close()
        return jsonify([dict(s) for s in spaces]), 200

    except Exception as e:
        if 'conn' in locals() and conn:
            conn.close()
        print(f"Error fetching assigned spaces: {e}")
        return jsonify({"error": "Failed to fetch assigned spaces", "details": str(e)}), 500

@assignment_api_blueprint.route('/sequence/save', methods=['POST'])
def save_sequence():
    """
    Saves the specified order for a list of items.
    (This is consolidated here to avoid import issues with a separate sequence.py)
    """
    data = request.get_json()
    if not data or 'sequence' not in data or not isinstance(data['sequence'], list):
        return jsonify({"error": "Request body must be a JSON object with a 'sequence' list."}), 400

    sequence = data['sequence']
    conn = None  # Initialize conn to None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("BEGIN TRANSACTION;")
        
        for item in sequence:
            if not all(k in item for k in ('item_id', 'order')):
                raise ValueError("Each object in 'sequence' must contain 'item_id' and 'order'")
            
            cursor.execute(
                "UPDATE items SET item_order = ? WHERE id = ?",
                (item['order'], item['item_id'])
            )
        
        conn.commit()
        return jsonify({"success": True, "message": f"Successfully updated order for {len(sequence)} items."}), 200

    except (ValueError, TypeError) as e:
        if conn:
            conn.rollback()
        return jsonify({"error": "Invalid data format", "details": str(e)}), 400
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Database sequence update error: {e}")
        return jsonify({"error": "Database operation failed", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()
    