import sqlite3

DB_PATH = 'database.db'

def get_connection():
    return sqlite3.connect(DB_PATH)

# 取得場景資訊
def get_scene_by_id(scene_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT width, height, depth FROM scenes WHERE id = ?', (scene_id,))
    result = cursor.fetchone()
    conn.close()
    return {
        'width': result[0],
        'height': result[1],
        'depth': result[2]
    } if result else None

# 取得某場景中的物件
def get_items_in_scene(scene_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT items.id, items.name, scene_items.x, scene_items.y, scene_items.z, scene_items.rotation
        FROM scene_items
        JOIN items ON scene_items.item_id = items.id
        WHERE scene_items.scene_id = ?
    ''', (scene_id,))
    results = cursor.fetchall()
    conn.close()
    return [
        {
            'id': row[0],
            'name': row[1],
            'x': row[2],
            'y': row[3],
            'z': row[4],
            'rotation': row[5]
        } for row in results
    ]

# 取得指定物件的屬性
def get_item_properties(item_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT property_key, property_val FROM item_properties WHERE item_id = ?', (item_id,))
    results = cursor.fetchall()
    conn.close()
    return {key: val for key, val in results}

# 新增物件進入場景
def add_item_to_scene(scene_id, item_id, x, y, z, rotation):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO scene_items (scene_id, item_id, x, y, z, rotation)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (scene_id, item_id, x, y, z, rotation))
    conn.commit()
    conn.close()
    return True

# 新增新的屬性到物件
def add_item_property(item_id, property_key, property_val):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO item_properties (item_id, property_key, property_val)
        VALUES (?, ?, ?)
    ''', (item_id, property_key, property_val))
    conn.commit()
    conn.close()
    return True