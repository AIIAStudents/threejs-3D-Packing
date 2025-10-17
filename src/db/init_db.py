import sqlite3
import os

def initialize_database():
    """
    確保資料庫檔案存在並擁有正確的 schema。
    """
    base_dir = os.path.dirname(__file__)
    schema_path = os.path.join(base_dir, 'schema.sql')
    
    # 資料庫檔案路徑現在指向專案根目錄
    db_path = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'database.db'))
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Drop the table to ensure schema is updated
    cursor.execute("DROP TABLE IF EXISTS item_properties;")
    print("  - 已刪除舊的 'item_properties' 表格 (若存在)。")

    with open(schema_path, 'r', encoding='utf-8') as f:
        sql = f.read()
        cursor.executescript(sql)
    conn.commit()
    conn.close()
    print("資料庫結構初始化/驗證完成。")

def reset_database():
    """
    清空所有交易型資料表，並建立一個預設群組。
    """
    base_dir = os.path.dirname(__file__)
    db_path = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'database.db'))
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    tables_to_reset = ['item_groups', 'inventory_items', 'scene_items']
    
    print("正在重置資料庫...")
    for table in tables_to_reset:
        try:
            c.execute(f"DELETE FROM {table};")
            # sqlite_sequence 是儲存自動增長值的內部表格
            c.execute(f"DELETE FROM sqlite_sequence WHERE name='{table}';")
            print(f"  - 已清空資料表: {table}")
        except sqlite3.OperationalError:
            # 如果表格不存在或沒有自動增長主鍵，可能會出現此錯誤，可以安全地忽略
            print(f"  - 資料表 {table} 無需重設序列或不存在。")

    # 建立一個預設群組
    try:
        c.execute("INSERT INTO item_groups (name) VALUES ('Group 1');")
        print("  - 已建立預設 'Group 1'")
    except Exception as e:
        print(f"  - 建立預設群組時發生錯誤: {e}")

    conn.commit()
    conn.close()
    print("資料庫重置完成。")

if __name__ == "__main__":
    initialize_database()
    reset_database()
