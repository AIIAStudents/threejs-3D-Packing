"""
Compatibility-only legacy repository.

This module is intentionally retained for unreviewed legacy callers under
`api_server_v2`, but new boundary-aligned code should prefer inventory-owned
query repositories inside `src/backend/contexts/inventory/...`.
"""

class InventoryRepository:
    @staticmethod
    def get_all_enriched_inventory(conn, group_id=None):
        """
        Read-side inventory projection used by legacy query paths.
        Returns id, item_id, length, width, height, note, group_id, and item_order.
        """
        try:
            inv_total = conn.execute("SELECT COUNT(*) FROM inventory_items").fetchone()[0]
            cat_total = conn.execute("SELECT COUNT(*) FROM catalog_items").fetchone()[0]
            print(f"\n[DIAG] inventory_items: {inv_total} rows, catalog_items: {cat_total} rows")
        except Exception as error:
            print(f"\n[DIAG] Error checking tables: {error}")

        if group_id is not None:
            query = """
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
                WHERE i.group_id = ?
                ORDER BY i.item_order, i.id
            """
            return [dict(row) for row in conn.execute(query, (group_id,)).fetchall()]

        query = """
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
            ORDER BY i.group_id, i.item_order, i.id
        """
        return [dict(row) for row in conn.execute(query).fetchall()]

    @staticmethod
    def get_enriched_inventory_by_id(conn, item_id):
        query = """
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
            WHERE i.id = ?
        """
        row = conn.execute(query, (item_id,)).fetchone()
        return dict(row) if row else None

    @staticmethod
    def get_all_groups(conn):
        return [dict(row) for row in conn.execute('SELECT * FROM groups ORDER BY id').fetchall()]
