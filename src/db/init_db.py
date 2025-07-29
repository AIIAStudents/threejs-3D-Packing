import sqlite3
import os

def initialize_database():
    base_dir = os.path.dirname(__file__)
    schema_path = os.path.join(base_dir, 'schema.sql')
    
    conn = sqlite3.connect('database.db')
    with open(schema_path, 'r', encoding='utf-8') as f:
        sql = f.read()
        conn.executescript(sql)
    conn.commit()
    conn.close()
    print("✅ 資料庫初始化完成")

if __name__ == "__main__":
    initialize_database()