import sqlite3
import os
import json
import time

# 計算相對於此檔案位置的資料庫路徑
base_dir = os.path.dirname(__file__)
DB_PATH = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'database.db'))

def get_connection():
    """建立並返回資料庫連線"""
    return sqlite3.connect(DB_PATH)

def update_group_order(group_ids):
    """更新群組的出場順序 (exitPriority)"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # LIFO: 列表中的第一個ID應該有最高的優先級
        max_priority = len(group_ids)
        for i, group_id in enumerate(group_ids):
            priority = max_priority - i
            cursor.execute("UPDATE item_groups SET exitPriority = ? WHERE id = ?", (priority, group_id))
        conn.commit()
        return {"status": "success", "updated_count": len(group_ids)}
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Database error in update_group_order: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

# --- 現有函式 (保持不變) ---
def get_scene_by_id(scene_id):
    # ... (程式碼不變)
    pass

# --- 更新與新增的函式 ---

def get_group(group_id):
    """取得單一群組的詳細資訊"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM item_groups WHERE id = ?", (group_id,))
    result = cursor.fetchone()
    conn.close()
    return dict(result) if result else None

def create_group(name, packing_time=None, reserve_for_delayed=0.1, allow_repack=1, exit_priority=0):
    """建立一個新的物品群組"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO item_groups (name, packingTime, reserveForDelayed, allowRepack, exitPriority)
        VALUES (?, ?, ?, ?, ?)
    ''', (name, packing_time, reserve_for_delayed, allow_repack, exit_priority))
    conn.commit()
    group_id = cursor.lastrowid
    conn.close()
    return group_id

def delete_group(group_id):
    """刪除一個群組"""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM item_groups WHERE id = ?", (group_id,))
        conn.commit()
        success = cursor.rowcount > 0
    except sqlite3.Error as e:
        print(f"Database error in delete_group: {e}")
        success = False
    finally:
        conn.close()
    return success

def get_all_groups():
    """取得所有群組的列表"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM item_groups ORDER BY exitPriority DESC, created_at ASC')
    results = cursor.fetchall()
    conn.close()
    return [dict(row) for row in results]


def add_item_to_inventory(item_type_id, group_id, deadline=None):
    """
    將一個新物品添加到庫存中。
    如果物品類型不存在，會自動創建一個。
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # 步驟 1: 確保 `items` 表中有對應的 item_type_id
        # `OR IGNORE` 確保如果 ID 已存在，此命令不會引發錯誤
        cursor.execute('''
            INSERT OR IGNORE INTO items (id, name) 
            VALUES (?, ?)
        ''', (item_type_id, f'Cube-{item_type_id}'))

        # 步驟 2: 插入新物品到 inventory_items
        cursor.execute('''
            INSERT INTO inventory_items (item_type_id, group_id, deadline, status)
            VALUES (?, ?, ?, 'pending')
        ''', (item_type_id, group_id, deadline))
        
        new_item_id = cursor.lastrowid
        
        # 步驟 3: 為新物品類型插入預設尺寸 (如果尚不存在)
        # 這裡我們為 width, height, depth 插入預設值 15
        default_dims = {'width': 15, 'height': 15, 'depth': 15}
        for key, value in default_dims.items():
            cursor.execute('''
                INSERT INTO item_properties (item_id, property_key, property_val)
                VALUES (?, ?, ?)
                ON CONFLICT(item_id, property_key) DO UPDATE SET property_val=excluded.property_val
            ''', (item_type_id, key, str(value)))

        conn.commit()
        
    except sqlite3.Error as e:
        conn.rollback()
        print(f"Database error in add_item_to_inventory: {e}")
        # 根據您的錯誤處理策略，您可能希望重新引發異常或返回一個錯誤指示
        raise e
    finally:
        conn.close()
    
    return new_item_id
    
def update_inventory_item(item_id, data):
    conn = get_connection()
    cursor = conn.cursor()

    # 先更新 inventory_items 中的欄位
    inv_fields = []
    inv_values = []
    for key in ['status', 'deadline', 'orderIndex', 'group_id']:
        if key in data:
            inv_fields.append(f"{key} = ?")
            inv_values.append(data[key])

    if inv_fields:
        query = f"UPDATE inventory_items SET {', '.join(inv_fields)} WHERE id = ?"
        inv_values.append(item_id)
        cursor.execute(query, tuple(inv_values))

    # 再更新 item_properties 的尺寸資料
    for dim_key in ['width', 'height', 'depth', 'radius', 'radiusTop', 'radiusBottom']:
        if dim_key in data:
            cursor.execute('''
                INSERT INTO item_properties (item_id, property_key, property_val)
                VALUES (?, ?, ?)
                ON CONFLICT(item_id, property_key) DO UPDATE SET property_val=excluded.property_val
            ''', (item_id, dim_key, data[dim_key]))

    conn.commit()

    # 更新後查詢最新資料
    updated_item = get_inventory_item(item_id)
    conn.close()
    return updated_item


def update_inventory_item_status(inventory_item_id, status):
    """更新庫存物品的狀態"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE inventory_items SET status = ? WHERE id = ?', (status, inventory_item_id))
    conn.commit()
    updated_rows = cursor.rowcount
    conn.close()
    return updated_rows > 0

def get_inventory_items_by_group(group_id, status_filter=None):
    """根據群組ID取得庫存物品，並直接包含維度資訊"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 使用 JSON 功能將屬性聚合成一個 JSON 物件
    query = '''
        SELECT 
            ii.*, 
            i.name,
            (SELECT json_group_object(property_key, property_val) 
             FROM item_properties 
             WHERE item_id = ii.item_type_id) as dimensions
        FROM inventory_items ii
        JOIN items i ON ii.item_type_id = i.id
        WHERE ii.group_id = ?
    '''
    params = (group_id,)

    if status_filter:
        query += ' AND ii.status = ?'
        params += (status_filter,)

    query += ' ORDER BY ii.orderIndex DESC' # LIFO 排序
    
    cursor.execute(query, params)
    results = cursor.fetchall()
    conn.close()

    # 將 JSON 字串解析為字典
    processed_results = []
    for row in results:
        row_dict = dict(row)
        if row_dict['dimensions']:
            row_dict['dimensions'] = json.loads(row_dict['dimensions'])
        else:
            row_dict['dimensions'] = {}
        processed_results.append(row_dict)

    return processed_results

def get_inventory_item(inventory_item_id):
    """根據庫存物品ID取得單一物品的詳細資訊，包含維度"""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    query = '''
        SELECT 
            ii.*, 
            i.name,
            (SELECT json_group_object(property_key, property_val) 
             FROM item_properties 
             WHERE item_id = ii.item_type_id) as dimensions
        FROM inventory_items ii
        JOIN items i ON ii.item_type_id = i.id
        WHERE ii.id = ?
    '''
    
    cursor.execute(query, (inventory_item_id,))
    result = cursor.fetchone()
    conn.close()

    if not result:
        return None

    # 將 JSON 字串解析為字典
    row_dict = dict(result)
    if row_dict['dimensions']:
        row_dict['dimensions'] = json.loads(row_dict['dimensions'])
    else:
        row_dict['dimensions'] = {}
        
    return row_dict

def check_for_delayed_items(validation_period_seconds):
    """檢查超時未確認的物品並將其標記為 delayed"""
    conn = get_connection()
    cursor = conn.cursor()
    query = f"""
        UPDATE inventory_items
        SET status = 'delayed'
        WHERE status = 'pending' AND datetime(deadline) <= datetime('now', '-{validation_period_seconds} seconds')
    """
    cursor.execute(query)
    conn.commit()
    updated_rows = cursor.rowcount
    conn.close()
    return updated_rows

def delete_inventory_item(item_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inventory_items WHERE id = ?", (item_id,))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success