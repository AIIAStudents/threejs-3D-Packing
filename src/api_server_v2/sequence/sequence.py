from flask import Blueprint, jsonify, request
import json
from datetime import datetime

# --- Blueprint Setup ---
sequence_api_blueprint = Blueprint('sequence_api', __name__)

# --- Use the shared database configuration ---
from src.api_server_v2.db_config import get_db_connection

# --- Database Initialization ---

def init_packing_results_table():
    """Creates the 'packing_results' table if it doesn't exist."""
    print("Initializing packing_results table...")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS packing_results")
    cursor.execute("""
        CREATE TABLE packing_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            job_id TEXT NOT NULL,
            zone_id INTEGER,
            zone_label TEXT,
            result_json TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            message TEXT,
            packed_count INTEGER,
            unpacked_count INTEGER,
            volume_utilization REAL,
            execution_time_ms REAL
        )
    """)
    conn.commit()
    conn.close()
    print("Table 'packing_results' created.")

# --- API Route Definitions ---

@sequence_api_blueprint.route('/save', methods=['POST'])
def save_sequence():
    """
    Saves the specified order for a list of items.
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


@sequence_api_blueprint.route('/execute', methods=['POST'])
def execute_packing():
    """
    Executes the packing algorithm for ALL assigned zones and stores results in the database.
    Each zone with assigned groups will be packed separately.
    """
    import time
    
    conn = None
    try:
        conn = get_db_connection()
        
        # 1. Fetch all groups and items
        groups_data = [dict(row) for row in conn.execute('SELECT * FROM groups').fetchall()]
        all_items = [dict(row) for row in conn.execute('SELECT * FROM items ORDER BY item_order').fetchall()]
        
        # 2. Find all zones that have assigned groups
        assigned_zones = conn.execute('''
            SELECT DISTINCT z.id, z.label, z.length, z.width, z.height
            FROM zones z
            INNER JOIN zone_assignments za ON z.id = za.zone_id
        ''').fetchall()
        
        if not assigned_zones:
            return jsonify({
                "success": False,
                "error": "No zones with assigned groups found"
            }), 400
        
        # 3. Generate a shared job_id for this batch
        job_id = f"job_{int(time.time())}"
        
        # 4. Execute packing for each zone
        from src.py_packer_v2.main import execute_packing as run_packing
        
        all_results = []
        total_packed = 0
        total_unpacked = 0
        total_execution_time = 0
        
        cursor = conn.cursor()
        
        for zone_row in assigned_zones:
            zone = dict(zone_row)
            zone_id = zone['id']
            zone_label = zone['label']
            
            # Get groups assigned to this zone
            assigned_group_ids = conn.execute(
                'SELECT group_id FROM zone_assignments WHERE zone_id = ?',
                (zone_id,)
            ).fetchall()
            assigned_group_ids = [row['group_id'] for row in assigned_group_ids]
            
            # Filter items belonging to these groups
            zone_items = [item for item in all_items if item['group_id'] in assigned_group_ids]
            
            if not zone_items:
                continue  # Skip zones with no items
            
            # Create container data using zone dimensions
            zone_container = {
                'parameters': {
                    'widthX': zone['length'],
                    'heightY': zone['height'],
                    'depthZ': zone['width']
                }
            }
            
            print(f"📦 Packing zone {zone_label}: {len(zone_items)} items, bounds={zone_container['parameters']}")
            
            # Execute packing for this zone
            result = run_packing(zone_items, groups_data, zone_container)
            
            # Add zone info to result
            result['zone_id'] = zone_id
            result['zone_label'] = zone_label
            result['job_id'] = job_id  # Use shared job_id
            
            # Store result in database
            cursor.execute("""
                INSERT INTO packing_results 
                (job_id, zone_id, zone_label, result_json, success, message, packed_count, unpacked_count, volume_utilization, execution_time_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                job_id,
                zone_id,
                zone_label,
                json.dumps(result),
                result['success'],
                result['message'],
                result['packed_count'],
                result['unpacked_count'],
                result['volume_utilization'],
                result['execution_time_ms']
            ))
            
            all_results.append(result)
            total_packed += result['packed_count']
            total_unpacked += result['unpacked_count']
            total_execution_time += result['execution_time_ms']
        
        conn.commit()
        
        # 5. Return summary response
        return jsonify({
            "success": True,
            "job_id": job_id,
            "zones_packed": len(all_results),
            "packed_count": total_packed,
            "unpacked_count": total_unpacked,
            "execution_time_ms": total_execution_time,
            "message": f"Successfully packed {len(all_results)} zones"
        }), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Packing execution error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": "Packing execution failed", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()


@sequence_api_blueprint.route('/latest-result', methods=['GET'])
def get_latest_result():
    """
    Retrieves the latest packing results for ALL zones from the database.
    Returns a list of space results that can be switched in the frontend.
    """
    conn = None
    try:
        conn = get_db_connection()
        
        # 1. Find the latest job_id
        latest_job = conn.execute('''
            SELECT job_id FROM packing_results 
            ORDER BY id DESC LIMIT 1
        ''').fetchone()
        
        if not latest_job:
            # 返回空的 mock 數據
            return jsonify({
                "job_id": None,
                "success": False,
                "message": "尚未執行過打包任務",
                "spaces": [],
                "total_packed": 0,
                "total_unpacked": 0
            }), 200
        
        job_id = latest_job['job_id']
        
        # 2. Fetch all results for this job
        results_rows = conn.execute('''
            SELECT zone_id, zone_label, result_json, packed_count, unpacked_count, volume_utilization, execution_time_ms
            FROM packing_results 
            WHERE job_id = ?
            ORDER BY zone_id
        ''', (job_id,)).fetchall()
        
        # 3. Build spaces array with parsed results
        spaces = []
        total_packed = 0
        total_unpacked = 0
        total_execution_time = 0
        
        for row in results_rows:
            result = json.loads(row['result_json'])
            
            # Fetch zone dimensions for 3D rendering
            zone_row = conn.execute(
                'SELECT length, width, height FROM zones WHERE id = ?',
                (row['zone_id'],)
            ).fetchone()
            
            if zone_row:
                result['container'] = {
                    'widthX': zone_row['length'],
                    'heightY': zone_row['height'],
                    'depthZ': zone_row['width']
                }
            
            spaces.append({
                'zone_id': row['zone_id'],
                'zone_label': row['zone_label'],
                'packed_count': row['packed_count'],
                'unpacked_count': row['unpacked_count'],
                'volume_utilization': row['volume_utilization'],
                'execution_time_ms': row['execution_time_ms'],
                'result': result
            })
            
            total_packed += row['packed_count']
            total_unpacked += row['unpacked_count']
            total_execution_time += row['execution_time_ms']
        
        # Fetch container configuration
        container_row = conn.execute('SELECT * FROM containers ORDER BY id DESC LIMIT 1').fetchone()
        container_data = None
        if container_row:
            params = json.loads(container_row['parameters'])
            container_data = params
            # DEBUG: Log container configuration
            print(f"[sequence.py] Container ID: {container_row['id']}")
            print(f"[sequence.py] Raw parameters: {container_row['parameters'][:200]}...")
            print(f"[sequence.py] Parsed shape: {params.get('shape', 'NOT FOUND')}")
            print(f"[sequence.py] Container keys: {list(params.keys())}")
        
        # Fetch all zones for visualization
        zones_rows = conn.execute('SELECT * FROM zones').fetchall()
        zones_data = []
        for zone in zones_rows:
            zones_data.append({
                'zone_id': zone['id'],
                'label': zone['label'],
                'length': zone['length'],
                'width': zone['width'],
                'height': zone['height'],
                'x': zone['x'],
                'y': zone['y'],
                'rotation': zone['rotation']
            })
        
        # 4. Return combined response
        return jsonify({
            "job_id": job_id,
            "success": True,
            "message": f"載入 {len(spaces)} 個空間的打包結果",
            "container": container_data,
            "zones": zones_data,
            "spaces": spaces,
            "total_packed": total_packed,
            "total_unpacked": total_unpacked,
            "total_execution_time": total_execution_time
        }), 200
        
    except Exception as e:
        print(f"Error fetching latest result: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch result", "details": str(e)}), 500
    finally:
        if conn:
            conn.close()

