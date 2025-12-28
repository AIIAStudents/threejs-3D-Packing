import sqlite3
import os
from flask import Blueprint, jsonify, request

# --- 基本設定 ---
# 建立一個名為 'items' 的 Blueprint
items_api_blueprint = Blueprint('items', __name__)
# 定義資料庫檔案的路徑
DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'db_v2', 'items.db')

# --- 資料庫輔助函數 ---
def get_db_connection():
    """建立並返回一個資料庫連線。"""
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化資料庫，建立 items 資料表。"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
    if cursor.fetchone() is None:
        print("Creating 'items' table...")
        cursor.execute('''
            CREATE TABLE items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                length REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                note TEXT,
                group_id INTEGER NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups (id)
            )
        ''')
        conn.commit()
        print("Table 'items' created.")
    else:
        print("Table 'items' already exists.")
    conn.close()

# --- API 路由定義 ---

@items_api_blueprint.route('/', methods=['GET'])
def get_items():
    """獲取物品列表，可選擇性地通過 group_id 進行篩選。"""
    group_id = request.args.get('group_id', type=int)
    conn = get_db_connection()
    cursor = conn.cursor()
    if group_id:
        cursor.execute('SELECT * FROM items WHERE group_id = ? ORDER BY id', (group_id,))
    else:
        cursor.execute('SELECT * FROM items ORDER BY id')
    items = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in items])

@items_api_blueprint.route('/', methods=['POST'])
def create_item():
    """建立一個新物品。"""
    data = request.get_json()
    # 'quantity' is sent from the frontend but no longer stored in the DB per item.
    # 'name' is no longer used.
    required_fields = ['length', 'width', 'height', 'group_id']
    if not data or not all(field in data for field in required_fields):
        return jsonify({"error": f"Missing one of the required fields: {required_fields}"}), 400

    try:
        note = data.get('note', '') # 備註是選填
        length = float(data['length'])
        width = float(data['width'])
        height = float(data['height'])
        group_id = int(data['group_id'])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid data type for one of the fields."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO items (length, width, height, note, group_id) VALUES (?, ?, ?, ?, ?)',
        (length, width, height, note, group_id)
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    new_item = {
        'id': new_id,
        'length': length,
        'width': width,
        'height': height,
        'note': note,
        'group_id': group_id
    }
    return jsonify(new_item), 201

@items_api_blueprint.route('/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    """更新一個現有物品。"""
    data = request.get_json()
    required_fields = ['length', 'width', 'height', 'note', 'group_id']
    if not data or not all(field in data for field in required_fields):
        return jsonify({"error": f"Missing one of the required fields: {required_fields}"}), 400

    try:
        note = data.get('note', '')
        length = float(data['length'])
        width = float(data['width'])
        height = float(data['height'])
        group_id = int(data['group_id'])
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid data type for one of the fields."}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'UPDATE items SET length = ?, width = ?, height = ?, note = ?, group_id = ? WHERE id = ?',
        (length, width, height, note, group_id, item_id)
    )
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Item not found"}), 404

    conn.commit()
    conn.close()
    
    updated_item = {
        'id': item_id,
        'length': length,
        'width': width,
        'height': height,
        'note': note,
        'group_id': group_id
    }
    return jsonify(updated_item)

@items_api_blueprint.route('/<int:item_id>', methods=['PATCH'])
def patch_item_note(item_id):
    """部分更新一個物品，主要用於更新備註。"""
    data = request.get_json()
    if not data or 'note' not in data:
        return jsonify({"error": "Missing 'note' field in request body"}), 400

    note = data['note']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE items SET note = ? WHERE id = ?', (note, item_id))
    
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Item not found"}), 404

    conn.commit()
    
    # 查詢更新後的項目以返回最新資料
    cursor.execute('SELECT * FROM items WHERE id = ?', (item_id,))
    updated_item = cursor.fetchone()
    conn.close()

    if updated_item is None:
        return jsonify({"error": "Failed to retrieve updated item"}), 500
        
    return jsonify(dict(updated_item))

@items_api_blueprint.route('/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    """刪除一個物品。"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM items WHERE id = ?', (item_id,))

    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Item not found"}), 404

    conn.commit()
    conn.close()
    
    return jsonify({"message": f"Item with id {item_id} was deleted successfully."}), 200

# --- 手動初始化資料庫的進入點 ---
if __name__ == '__main__':
    print("Initializing items database...")
    init_db()
