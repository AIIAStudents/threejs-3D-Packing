from src.backend.shared.db.sqlite import db_session


class InventorySchemaMigration:
    @staticmethod
    def initialize_items_schema():
        with db_session() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT type FROM sqlite_master WHERE name='items'")
            items_record = cursor.fetchone()

            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='items_legacy'"
            )
            legacy_exists = cursor.fetchone()

            if items_record:
                if items_record["type"] == "table":
                    if not legacy_exists:
                        print("Renaming existing 'items' table to 'items_legacy'...")
                        cursor.execute("ALTER TABLE items RENAME TO items_legacy")
                    else:
                        error_msg = (
                            "Unsafe schema state: both 'items' table and 'items_legacy' table "
                            "exist. Manual intervention required to resolve data conflict."
                        )
                        print(f"ERROR: {error_msg}")
                        raise RuntimeError(error_msg)
                elif items_record["type"] == "view":
                    print("Dropping existing 'items' view for recreation...")
                    cursor.execute("DROP VIEW IF EXISTS items")

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    length REAL NOT NULL,
                    width REAL NOT NULL,
                    height REAL NOT NULL,
                    UNIQUE(length, width, height)
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    catalog_item_id INTEGER NOT NULL,
                    group_id INTEGER NOT NULL,
                    item_order INTEGER DEFAULT 0,
                    item_label TEXT,
                    note TEXT,
                    FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id),
                    FOREIGN KEY (group_id) REFERENCES groups (id)
                )
                """
            )

            cursor.execute(
                """
                CREATE VIEW items AS
                SELECT
                    i.id,
                    i.item_label AS item_id,
                    c.length,
                    c.width,
                    c.height,
                    i.note,
                    i.group_id,
                    i.item_order
                FROM inventory_items i
                JOIN catalog_items c ON i.catalog_item_id = c.id
                """
            )

            conn.commit()
