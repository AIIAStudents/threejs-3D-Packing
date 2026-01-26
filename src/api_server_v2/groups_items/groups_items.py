"""
Groups and Items API Blueprint
Handles CRUD operations for groups and items
"""
from flask import Blueprint, jsonify, request
from src.api_server_v2.db_config import get_db_connection

# Create Blueprint
groups_items_api_blueprint = Blueprint('groups_items_api', __name__)

# ========== GROUPS ENDPOINTS ==========

@groups_items_api_blueprint.route('/groups', methods=['GET'])
def get_groups():
    """Get all groups"""
    conn = get_db_connection()
    try:
        groups = conn.execute('SELECT * FROM groups ORDER BY created_at DESC').fetchall()
        return jsonify([dict(row) for row in groups])
    finally:
        conn.close()

@groups_items_api_blueprint.route('/groups', methods=['POST'])
def create_group():
    """Create a new group"""
    data = request.get_json()
    
    if not data or 'name' not in data:
        return jsonify({'error': 'Missing required field: name'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO groups (name, description) VALUES (?, ?)',
            (data['name'], data.get('description', ''))
        )
        conn.commit()
        
        group_id = cursor.lastrowid
        return jsonify({'id': group_id, 'message': 'Group created successfully'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@groups_items_api_blueprint.route('/groups/<int:group_id>', methods=['DELETE'])
def delete_group(group_id):
    """Delete a group (cascade deletes items)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM groups WHERE id = ?', (group_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Group not found'}), 404
        
        return jsonify({'message': 'Group deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@groups_items_api_blueprint.route('/groups/<int:group_id>', methods=['PUT'])
def update_group(group_id):
    """Update a group's name and/or description"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Check if group exists
        group = conn.execute('SELECT * FROM groups WHERE id = ?', (group_id,)).fetchone()
        if not group:
            return jsonify({'error': 'Group not found'}), 404
        
        # Update fields (use existing values if not provided)
        name = data.get('name', group['name'])
        description = data.get('note', data.get('description', group['description']))
        
        cursor.execute(
            'UPDATE groups SET name = ?, description = ? WHERE id = ?',
            (name, description, group_id)
        )
        conn.commit()
        
        return jsonify({
            'id': group_id,
            'name': name,
            'description': description,
            'message': 'Group updated successfully'
        }), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ========== ITEMS ENDPOINTS ==========

@groups_items_api_blueprint.route('/items', methods=['GET'])
def get_items():
    """Get all items"""
    conn = get_db_connection()
    try:
        items = conn.execute('SELECT * FROM items ORDER BY created_at DESC').fetchall()
        return jsonify([dict(row) for row in items])
    finally:
        conn.close()

@groups_items_api_blueprint.route('/items', methods=['POST'])
def create_item():
    """Create a new item"""
    data = request.get_json()
    
    required_fields = ['item_id', 'group_id', 'length', 'width', 'height']
    if not data or not all(field in data for field in required_fields):
        return jsonify({'error': f'Missing required fields: {required_fields}'}), 400
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Check if group exists
        group = conn.execute('SELECT id FROM groups WHERE id = ?', (data['group_id'],)).fetchone()
        if not group:
            return jsonify({'error': 'Group not found'}), 404
        
        # Check for duplicate item_id
        existing = conn.execute('SELECT id FROM items WHERE item_id = ?', (data['item_id'],)).fetchone()
        if existing:
            return jsonify({'error': 'Item ID already exists'}), 409
        
        cursor.execute('''
            INSERT INTO items (item_id, group_id, length, width, height, weight)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data['item_id'],
            data['group_id'],
            data['length'],
            data['width'],
            data['height'],
            data.get('weight', 0)
        ))
        conn.commit()
        
        item_id = cursor.lastrowid
        return jsonify({'id': item_id, 'message': 'Item created successfully'}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@groups_items_api_blueprint.route('/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """Delete an item"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM items WHERE id = ?', (item_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Item not found'}), 404
        
        return jsonify({'message': 'Item deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@groups_items_api_blueprint.route('/items/bulk', methods=['POST'])
def create_items_bulk():
    """
    Create multiple items at once (批量新增物件) - MUCH FASTER!
    Request body: {
        "items": [
            {"item_id": "item1", "group_id": 1, "length": 100, "width": 50, "height": 30},
            {"item_id": "item2", "group_id": 1, "length": 100, "width": 50, "height": 30},
            ...
        ]
    }
    """
    data = request.get_json()
    
    if not data or 'items' not in data or not isinstance(data['items'], list):
        return jsonify({"error": "Request must contain 'items' array"}), 400
    
    items = data['items']
    if len(items) == 0:
        return jsonify({"error": "Items array cannot be empty"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Prepare bulk insert data
        insert_data = []
        skipped = 0
        
        for item in items:
            # Validate required fields
            if 'item_id' not in item or 'group_id' not in item:
                skipped += 1
                continue
            
            # Check for duplicate (optional - remove if you want speed over safety)
            existing = conn.execute('SELECT id FROM items WHERE item_id = ?', (item['item_id'],)).fetchone()
            if existing:
                skipped += 1
                continue
            
            insert_data.append((
                item['item_id'],
                item['group_id'],
                item.get('length', 0),
                item.get('width', 0),
                item.get('height', 0),
                item.get('weight', 0),
                item.get('item_order', 0)
            ))
        
        if not insert_data:
            return jsonify({"error": f"No valid items to insert (skipped: {skipped})"}), 400
        
        # 🚀 Bulk insert using executemany (10-100x faster than individual inserts!)
        cursor.executemany("""
            INSERT INTO items (item_id, group_id, length, width, height, weight, item_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, insert_data)
        
        conn.commit()
        
        return jsonify({
            "success": True,
            "message": f"Successfully created {len(insert_data)} items",
            "count": len(insert_data),
            "skipped": skipped
        }), 201
        
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
