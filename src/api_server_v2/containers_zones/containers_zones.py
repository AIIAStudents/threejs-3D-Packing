"""
Containers and Zones API Blueprint
Handles container configuration and zone management
"""
from flask import Blueprint, jsonify, request
from src.api_server_v2.db_config import get_db_connection
import json

# Create Blueprint
containers_zones_api_blueprint = Blueprint('containers_zones_api', __name__)

# ========== CONTAINERS ENDPOINTS ==========

@containers_zones_api_blueprint.route('/containers', methods=['POST'])
def save_container():
    """Save container configuration"""
    data = request.get_json()
    
    if not data or 'parameters' not in data:
        return jsonify({'error': 'Missing parameters field'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO containers (parameters) VALUES (?)',
            (data['parameters'],)
        )
        conn.commit()
        
        container_id = cursor.lastrowid
        return jsonify({'id': container_id, 'message': 'Container saved successfully'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@containers_zones_api_blueprint.route('/containers/latest', methods=['GET'])
def get_latest_container():
    """Get latest container configuration"""
    conn = get_db_connection()
    try:
        container = conn.execute(
            'SELECT * FROM containers ORDER BY created_at DESC LIMIT 1'
        ).fetchone()
        
        if not container:
            return jsonify({'error': 'No container found'}), 404
        
        result = dict(container)
        # Parse parameters JSON string
        if result.get('parameters'):
            result['parameters'] = json.loads(result['parameters'])
        
        return jsonify(result), 200
    finally:
        conn.close()

# ========== ZONES ENDPOINTS ==========

@containers_zones_api_blueprint.route('/zones', methods=['POST'])
def save_zones():
    """Batch save/update zones"""
    data = request.get_json()
    
    if not data or 'zones' not in data:
        return jsonify({'error': 'Missing zones array'}), 400
    
    zones_data = data['zones']
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Clear existing zones
        cursor.execute('DELETE FROM zones')
        
        # Insert new zones
        for zone in zones_data:
            cursor.execute('''
                INSERT INTO zones (label, length, width, height, x, y, rotation)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                zone.get('label', ''),
                zone.get('length', 0),
                zone.get('width', 0),
                zone.get('height', 0),
                zone.get('x', 0),
                zone.get('y', 0),
                zone.get('rotation', 0)
            ))
        
        conn.commit()
        return jsonify({'message': f'Saved {len(zones_data)} zones successfully'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@containers_zones_api_blueprint.route('/zones', methods=['GET'])
def get_zones():
    """Get all zones"""
    conn = get_db_connection()
    try:
        zones = conn.execute('SELECT * FROM zones ORDER BY label').fetchall()
        return jsonify([dict(row) for row in zones])
    finally:
        conn.close()

@containers_zones_api_blueprint.route('/zones/<int:zone_id>', methods=['DELETE'])
def delete_zone(zone_id):
    """Delete a zone"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM zones WHERE id = ?', (zone_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Zone not found'}), 404
        
        return jsonify({'message': 'Zone deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ========== ZONE ASSIGNMENTS ENDPOINTS ==========

@containers_zones_api_blueprint.route('/zone-assignments', methods=['POST'])
def save_zone_assignments():
    """Save zone-group assignments"""
    data = request.get_json()
    
    if not data or 'assignments' not in data:
        return jsonify({'error': 'Missing assignments field'}), 400
    
    assignments = data['assignments']  # Format: { zoneId: [groupId1, groupId2], ... }
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Clear existing assignments
        cursor.execute('DELETE FROM zone_assignments')
        
        # Insert new assignments
        for zone_id, group_ids in assignments.items():
            for group_id in group_ids:
                cursor.execute('''
                    INSERT INTO zone_assignments (zone_id, group_id)
                    VALUES (?, ?)
                ''', (int(zone_id), int(group_id)))
        
        conn.commit()
        return jsonify({'message': 'Assignments saved successfully'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@containers_zones_api_blueprint.route('/zone-assignments', methods=['GET'])
def get_zone_assignments():
    """Get all zone assignments"""
    conn = get_db_connection()
    try:
        assignments = conn.execute(
            'SELECT * FROM zone_assignments'
        ).fetchall()
        return jsonify([dict(row) for row in assignments])
    finally:
        conn.close()

# ========== ITEM REORDERING ENDPOINT ==========

@containers_zones_api_blueprint.route('/items/reorder', methods=['POST'])
def reorder_items():
    """Update item_order for multiple items"""
    data = request.get_json()
    
    if not data or 'items' not in data:
        return jsonify({'error': 'Missing items array'}), 400
    
    items = data['items']  # Format: [{ id: 1, item_order: 0 }, ...]
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        for item in items:
            cursor.execute(
                'UPDATE items SET item_order = ? WHERE id = ?',
                (item['item_order'], item['id'])
            )
        
        conn.commit()
        return jsonify({'message': f'Reordered {len(items)} items successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ========== CUTTING JOBS ENDPOINT ==========

@containers_zones_api_blueprint.route('/v2/cutting/jobs', methods=['POST'])
def save_cutting_job():
    """Save cutting job with zones"""
    data = request.get_json()
    
    if not data or 'zones' not in data:
        return jsonify({'error': 'Missing zones data'}), 400
    
    zones_data = data['zones']
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Clear existing zones
        cursor.execute('DELETE FROM zones')
        
        # Insert new zones from cutting job
        for zone in zones_data:
            cursor.execute('''
                INSERT INTO zones (label, length, width, height, x, y, rotation)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                zone.get('label', ''),
                zone.get('length', 0),
                zone.get('width', 0),
                zone.get('height', 0),
                zone.get('x', 0),
                zone.get('y', 0),
                zone.get('rotation', 0)
            ))
        
        conn.commit()
        return jsonify({
            'success': True,
            'message': f'Saved cutting job with {len(zones_data)} zones successfully',
            'zones_count': len(zones_data)
        }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'details': str(e)}), 500
    finally:
        conn.close()
