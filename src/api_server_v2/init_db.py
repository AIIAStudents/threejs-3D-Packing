"""
Database initialization and table creation
Tables are created only if they don't exist - data persists across restarts
Use RESET_DB=1 environment variable to force database reset
"""
from src.api_server_v2.db_config import get_db_connection
import os

def init_all_tables(reset_db=False):
    """
    Initialize all database tables
    Args:
        reset_db: If True, drop all tables before recreating (清空資料庫)
                  If False, only create tables if they don't exist (保留資料)
    """
    print("=" * 50)
    print("Initializing Database Tables...")
    
    # Check environment variable
    if os.getenv('RESET_DB') == '1':
        reset_db = True
        print("⚠️  RESET_DB=1 detected - will clear all data")
    
    print("=" * 50)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if reset_db:
        print("🗑️  Dropping all existing tables...")
        # Drop all tables
        cursor.execute("DROP TABLE IF EXISTS items")
        cursor.execute("DROP TABLE IF EXISTS groups")
        cursor.execute("DROP TABLE IF EXISTS packing_results")
        cursor.execute("DROP TABLE IF EXISTS zone_assignments")
        cursor.execute("DROP TABLE IF EXISTS zones")
        cursor.execute("DROP TABLE IF EXISTS containers")
        print("✓ All tables dropped")
    
    # Create groups table (only if not exists)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ Table ready: groups")
    
    # Create items table (belongs to a group)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL UNIQUE,
            group_id INTEGER NOT NULL,
            length REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            weight REAL DEFAULT 0,
            item_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    """)
    print("✓ Table ready: items")
    
    # Create containers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS containers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parameters TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ Table ready: containers")
    
    # Create zones table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            length REAL NOT NULL,
            width REAL NOT NULL,
            height REAL NOT NULL,
            x REAL DEFAULT 0,
            y REAL DEFAULT 0,
            rotation REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ Table ready: zones")
    
    # Create zone_assignments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS zone_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            zone_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE,
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    """)
    print("✓ Table ready: zone_assignments")
    
    # Create packing_results table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS packing_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            job_id TEXT NOT NULL,
            zone_id INTEGER,
            zone_label TEXT,
            result_json TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            message TEXT,
            packed_count INTEGER,
            unpacked_count INTEGER,
            volume_utilization REAL,
            execution_time_ms REAL
        )
    """)
    print("✓ Table ready: packing_results")
    
    # Show current data counts
    groups_count = cursor.execute("SELECT COUNT(*) FROM groups").fetchone()[0]
    items_count = cursor.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    zones_count = cursor.execute("SELECT COUNT(*) FROM zones").fetchone()[0]
    
    print()
    print(f"📊 Current Data:")
    print(f"   Groups: {groups_count}")
    print(f"   Items: {items_count}")
    print(f"   Zones: {zones_count}")
    
    conn.commit()
    conn.close()
    
    print("=" * 50)
    print("Database initialization complete!")
    if reset_db:
        print("✓ Database was reset (all data cleared)")
    else:
        print("✓ Data preserved from previous session")
    print("=" * 50)
