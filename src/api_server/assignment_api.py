import sqlite3
import os
from flask import Blueprint, jsonify, request

# --- Database Setup ---
# Correctly locate the db_v2 directory relative to this file's location
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db_v2'))
ASSIGNMENTS_DB_PATH = os.path.join(DB_DIR, 'space_group_assignments.db')
GROUPS_DB_PATH = os.path.join(DB_DIR, 'groups.db')
CUTTING_JOBS_DB_PATH = os.path.join(DB_DIR, 'cutting_jobs.db')

def init_assignments_db():
    """Ensures the assignments database and table exist."""
    conn = sqlite3.connect(ASSIGNMENTS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS space_group_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL UNIQUE, -- Assuming a group can only be in one zone
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()

# --- Blueprint ---
assignment_api = Blueprint('assignment_api', __name__)

# --- Helper Functions ---
def get_db_connection(db_path):
    """Creates a database connection."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# --- API Endpoints ---

@assignment_api.route('/api/assignment-data', methods=['GET'])
def get_assignment_data():
    """
    Fetches all data needed for the assignment UI:
    - All unique zones from cutting_jobs.db
    - All groups from groups.db
    - Current assignments from space_group_assignments.db
    """
    try:
        # 1. Fetch Zones
        conn_jobs = get_db_connection(CUTTING_JOBS_DB_PATH)
        # We need distinct zone names and one representative ID.
        zones_cursor = conn_jobs.execute("""
            SELECT MIN(id) as id, job_id, zone_name 
            FROM cutting_jobs 
            WHERE zone_name IS NOT NULL 
            GROUP BY zone_name
            ORDER BY zone_name
        """)
        zones = [dict(row) for row in zones_cursor.fetchall()]
        conn_jobs.close()

        # 2. Fetch Groups
        conn_groups = get_db_connection(GROUPS_DB_PATH)
        groups_cursor = conn_groups.execute("SELECT id, name FROM groups ORDER BY name")
        groups = [dict(row) for row in groups_cursor.fetchall()]
        conn_groups.close()
        
        # 3. Fetch current assignments
        conn_assign = get_db_connection(ASSIGNMENTS_DB_PATH)
        assignments_cursor = conn_assign.execute("SELECT zone_id, group_id FROM space_group_assignments")
        assignments = {row['group_id']: row['zone_id'] for row in assignments_cursor.fetchall()} # {group_id: zone_id}
        conn_assign.close()

        # 4. Combine data
        # Add assignment status to groups
        for group in groups:
            group['assigned_to_zone_id'] = assignments.get(group['id'], None)

        return jsonify({
            'zones': zones,
            'groups': groups
        })

    except Exception as e:
        # If a DB or table doesn't exist, it will raise an error.
        # This is a good place to log the error.
        print(f"Error fetching assignment data: {e}")
        # Return empty data so the frontend doesn't crash
        return jsonify({'zones': [], 'groups': [], 'error': str(e)}), 500

@assignment_api.route('/api/assignments', methods=['POST'])
def handle_assignment():
    """
    Creates or updates a group's assignment to a zone.
    A group can only be assigned to one zone at a time.
    """
    data = request.get_json()
    if not data or 'zone_id' not in data or 'group_id' not in data:
        return jsonify({'error': 'Missing zone_id or group_id'}), 400

    zone_id = data['zone_id']
    group_id = data['group_id']

    try:
        conn = get_db_connection(ASSIGNMENTS_DB_PATH)
        cursor = conn.cursor()

        # Using INSERT OR REPLACE (UPSERT) based on the UNIQUE constraint on group_id
        # This will delete the old assignment for the group and insert the new one.
        cursor.execute("""
            INSERT OR REPLACE INTO space_group_assignments (group_id, zone_id)
            VALUES (?, ?);
        """, (group_id, zone_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'group_id': group_id, 'assigned_to_zone_id': zone_id}), 201

    except Exception as e:
        print(f"Error handling assignment: {e}")
        return jsonify({'error': str(e)}), 500

@assignment_api.route('/api/assignments/unassign', methods=['POST'])
def unassign_group():
    """
    Removes a group's assignment.
    """
    data = request.get_json()
    if not data or 'group_id' not in data:
        return jsonify({'error': 'Missing group_id'}), 400

    group_id = data['group_id']

    try:
        conn = get_db_connection(ASSIGNMENTS_DB_PATH)
        cursor = conn.cursor()

        cursor.execute("DELETE FROM space_group_assignments WHERE group_id = ?", (group_id,))
        
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'unassigned_group_id': group_id}), 200

    except Exception as e:
        print(f"Error unassigning group: {e}")
        return jsonify({'error': str(e)}), 500

# Initialize the database when the module is loaded
init_assignments_db()
