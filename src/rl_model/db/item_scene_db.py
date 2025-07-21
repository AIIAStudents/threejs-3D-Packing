import sqlite3
import json

def load_scene_and_items(db_path="item_scene_data.sqlite"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 載入場景（假設只有一筆）
    cursor.execute("SELECT width, height, depth FROM scenes LIMIT 1")
    row = cursor.fetchone()
    scene = {"width": row[0], "height": row[1], "depth": row[2]}

    # 載入物品
    cursor.execute("SELECT name, properties FROM items")
    items = []
    for name, props_json in cursor.fetchall():
        properties = json.loads(props_json)
        items.append({"name": name, "properties": properties})

    conn.close()
    return scene, items
  
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
