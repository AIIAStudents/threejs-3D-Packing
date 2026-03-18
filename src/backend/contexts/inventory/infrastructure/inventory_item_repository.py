from src.api_server_v2.repositories.inventory_repository import InventoryRepository


class InventoryItemRepository:
    @staticmethod
    def list_items(conn, group_id=None):
        return InventoryRepository.get_all_enriched_inventory(conn, group_id)

    @staticmethod
    def get_item_by_id(conn, item_id):
        return InventoryRepository.get_enriched_inventory_by_id(conn, item_id)

    @staticmethod
    def find_or_create_catalog_item(conn, length, width, height):
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR IGNORE INTO catalog_items (length, width, height)
            VALUES (?, ?, ?)
            """,
            (length, width, height),
        )
        cursor.execute(
            """
            SELECT id FROM catalog_items
            WHERE length = ? AND width = ? AND height = ?
            """,
            (length, width, height),
        )
        row = cursor.fetchone()
        if not row:
            raise Exception("Failed to retrieve catalog_item_id")
        return row["id"]

    @staticmethod
    def get_next_item_order(conn, group_id):
        row = conn.execute(
            "SELECT MAX(item_order) as max_order FROM inventory_items WHERE group_id = ?",
            (group_id,),
        ).fetchone()
        return (row["max_order"] + 1) if row and row["max_order"] is not None else 0

    @staticmethod
    def insert_inventory_item(
        conn, catalog_item_id, group_id, item_label, note, item_order
    ):
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO inventory_items (catalog_item_id, group_id, item_label, note, item_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            (catalog_item_id, group_id, item_label, note, item_order),
        )
        return cursor.lastrowid

    @staticmethod
    def item_exists(conn, item_id):
        row = conn.execute(
            "SELECT id FROM inventory_items WHERE id = ?", (item_id,)
        ).fetchone()
        return row is not None

    @staticmethod
    def update_inventory_item(
        conn, item_id, catalog_item_id, group_id, note, item_order=None
    ):
        cursor = conn.cursor()
        if item_order is not None:
            cursor.execute(
                """
                UPDATE inventory_items
                SET catalog_item_id = ?, group_id = ?, note = ?, item_order = ?
                WHERE id = ?
                """,
                (catalog_item_id, group_id, note, int(item_order), item_id),
            )
        else:
            cursor.execute(
                """
                UPDATE inventory_items
                SET catalog_item_id = ?, group_id = ?, note = ?
                WHERE id = ?
                """,
                (catalog_item_id, group_id, note, item_id),
            )
        return cursor.rowcount

    @staticmethod
    def update_item_note(conn, item_id, note):
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE inventory_items SET note = ? WHERE id = ?", (note, item_id)
        )
        return cursor.rowcount

    @staticmethod
    def delete_item(conn, item_id):
        cursor = conn.cursor()
        cursor.execute("DELETE FROM inventory_items WHERE id = ?", (item_id,))
        return cursor.rowcount
