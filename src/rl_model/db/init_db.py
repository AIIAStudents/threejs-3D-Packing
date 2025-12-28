import os
import sqlite3
  
def init_database():
    # 絕對路徑設定（根據實際放置位置修改）
    base_dir = r"C:\Users\GIGABYTE\3js\three.js\src\rl_model\db"
    db_path = os.path.join(base_dir, "item_scene_data.sqlite")
    sql_file_path = os.path.join(base_dir, "item_scene_data.sql")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    with open(sql_file_path, "r", encoding="utf-8") as f:
        sql_script = f.read()

    cursor.executescript(sql_script)
    conn.commit()
    conn.close()
    print("✅ 資料庫初始化完成")

if __name__ == "__main__":
    init_database()
