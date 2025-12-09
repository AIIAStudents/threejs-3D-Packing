import sqlite3
import os
from flask import Blueprint, jsonify, request

# --- 基本設定 ---
# 建立一個名為 'groups' 的 Blueprint
groups_api_blueprint = Blueprint('groups', __name__)
# 定義資料庫檔案的路徑，相對於目前檔案的位置
# os.path.dirname(__file__) 取得目前檔案所在的目錄
# os.path.join() 將路徑組合起來，例如 'api_server_v2' + '../db_v2' -> 'db_v2'
DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'db_v2', 'groups.db')

# --- 資料庫輔助函數 ---
def get_db_connection():
    """建立並返回一個資料庫連線。"""
    # 確保資料庫所在的目錄存在
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    # 設定 row_factory 讓查詢結果以字典形式（欄位名 -> 值）返回，方便轉換為 JSON
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化資料庫，建立 groups 資料表。"""
    conn = get_db_connection()
    cursor = conn.cursor()
    # 檢查 'groups' 資料表是否已存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'")
    if cursor.fetchone() is None:
        print("Creating 'groups' table...")
        cursor.execute('''
            CREATE TABLE groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                note TEXT
            )
        ''')
        # 可以選擇在此處插入一些初始資料
        cursor.execute("INSERT INTO groups (name, note) VALUES (?, ?)", ('範例群組 A', '這是一個初始的範例群組'))
        cursor.execute("INSERT INTO groups (name, note) VALUES (?, ?)", ('範例群組 B', ''))
        conn.commit()
        print("Table 'groups' created and initial data inserted.")
    else:
        print("Table 'groups' already exists.")
    conn.close()

# --- API 路由定義 ---

@groups_api_blueprint.route('/', methods=['GET'])
def get_all_groups():
    """獲取所有群組的列表。"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM groups ORDER BY id')
    groups = cursor.fetchall()
    conn.close()
    # 將查詢結果（Row 物件列表）轉換為標準的字典列表
    return jsonify([dict(row) for row in groups])

@groups_api_blueprint.route('/', methods=['POST'])
def create_group():
    """建立一個新群組。"""
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({"error": "Missing 'name' in request body"}), 400

    name = data.get('name')
    note = data.get('note', '') # 如果 note 未提供，預設為空字串

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO groups (name, note) VALUES (?, ?)', (name, note))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    # 返回新建立的群組物件，包含從資料庫獲得的 ID
    new_group = {
        'id': new_id,
        'name': name,
        'note': note
    }
    return jsonify(new_group), 201 # 201 Created 狀態碼

@groups_api_blueprint.route('/<int:group_id>', methods=['PUT'])
def update_group(group_id):
    """更新一個現有群組。"""
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({"error": "Missing 'name' in request body"}), 400

    name = data.get('name')
    note = data.get('note', '')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE groups SET name = ?, note = ? WHERE id = ?', (name, note, group_id))
    
    # 檢查是否有任何資料列被更新
    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    conn.commit()
    conn.close()
    
    updated_group = {
        'id': group_id,
        'name': name,
        'note': note
    }
    return jsonify(updated_group)

@groups_api_blueprint.route('/<int:group_id>', methods=['DELETE'])
def delete_group(group_id):
    """刪除一個群組。"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM groups WHERE id = ?', (group_id,))

    if cursor.rowcount == 0:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    conn.commit()
    conn.close()
    
    return jsonify({"message": f"Group with id {group_id} was deleted successfully."}), 200

# --- 手動初始化資料庫的進入點 ---
# 若要初始化資料庫，請在終端機中導覽至此檔案所在的目錄，並執行:
# python groups_api.py
if __name__ == '__main__':
    print("Initializing database...")
    init_db()
