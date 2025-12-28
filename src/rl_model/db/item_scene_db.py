import sqlite3
import json
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from env.utils import geometry_to_box  # ⬅ 確保已建立此函式並可引用

def load_scene_and_items(db_path="item_scene_data.sqlite"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 載入場景（假設只有一筆）
    cursor.execute("SELECT width, height, depth FROM scenes LIMIT 1")
    row = cursor.fetchone()
    scene = {"width": row[0], "height": row[1], "depth": row[2]}

    # 載入物品與其屬性
    cursor.execute("SELECT id, name FROM items")
    items = []
    for item_id, name in cursor.fetchall():
        cursor.execute("""
            SELECT property_key, property_val
            FROM item_properties
            WHERE item_id = ?
        """, (item_id,))
        
        # 建立 properties dict，防止解析錯誤
        properties = {}
        for key, val in cursor.fetchall():
            try:
                parsed = json.loads(val) if isinstance(val, str) else val
            except Exception:
                parsed = None
            properties[key] = parsed

        # 推測 geometry type（可用 name 或加欄位）
        item_type = properties.get("geometryType") or infer_geometry_type(name)
        size = geometry_to_box(item_type, properties)
        properties["size"] = size  # 確保加入尺寸屬性

        items.append({"name": name, "properties": properties})

    conn.close()
    return scene, items

# 如果資料庫沒有 geometryType，可以用名稱推測（例如 "Sphere" → "SphereGeometry"）
def infer_geometry_type(name):
    name = name.lower()
    if "sphere" in name:
        return "SphereGeometry"
    elif "cylinder" in name:
        return "CylinderGeometry"
    elif "cube" in name or "box" in name:
        return "BoxGeometry"
    elif "icosahedron" in name:
        return "IcosahedronGeometry"
    else:
        return "Unknown"
# 絕對路徑（根據實際位置調整）
db_path = r"C:\Users\GIGABYTE\3js\three.js\src\rl_model\db\item_scene_data.sqlite"

def test_database():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("🧪 [Scene Info]")
    cursor.execute("SELECT id, width, height, depth FROM scenes")
    for row in cursor.fetchall():
        print(f"  ID: {row[0]}, Width: {row[1]}, Height: {row[2]}, Depth: {row[3]}")

    print("\n📦 [Items]")
    cursor.execute("SELECT id, name FROM items")
    items = cursor.fetchall()
    for item_id, name in items:
        print(f"  Item ID: {item_id}, Name: {name}")

        cursor.execute("""
            SELECT property_key, property_val
            FROM item_properties
            WHERE item_id = ?
        """, (item_id,))
        properties = cursor.fetchall()
        for key, val in properties:
            print(f"    └─ {key}: {val}")

    conn.close()

if __name__ == "__main__":
    test_database()
