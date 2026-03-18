from src.backend.contexts.inventory.infrastructure.inventory_item_repository import (
    InventoryItemRepository,
)
from src.backend.shared.db.sqlite import db_session


class InventoryItemCommandService:
    @staticmethod
    def create_item(data):
        required_fields = ["length", "width", "height", "group_id"]
        if not data or not all(field in data for field in required_fields):
            raise ValueError(
                f"Missing one of the required fields: {required_fields}"
            )

        try:
            item_label = data.get("item_id", "")
            note = data.get("note", "")
            length = float(data["length"])
            width = float(data["width"])
            height = float(data["height"])
            group_id = int(data["group_id"])
            item_order_param = data.get("item_order")
        except (ValueError, TypeError) as error:
            raise TypeError("Invalid data type for one of the fields.") from error

        with db_session() as conn:
            conn.execute("BEGIN")
            catalog_item_id = InventoryItemRepository.find_or_create_catalog_item(
                conn, length, width, height
            )
            item_order = (
                int(item_order_param)
                if item_order_param is not None
                else InventoryItemRepository.get_next_item_order(conn, group_id)
            )
            new_id = InventoryItemRepository.insert_inventory_item(
                conn, catalog_item_id, group_id, item_label, note, item_order
            )
            conn.commit()

            new_item = InventoryItemRepository.get_item_by_id(conn, new_id)

        return new_item

    @staticmethod
    def create_items_bulk(data):
        if not data or "items" not in data or not isinstance(data["items"], list):
            raise ValueError("Request must contain 'items' array")

        items = data["items"]
        if len(items) == 0:
            raise ValueError("Items array cannot be empty")

        with db_session() as conn:
            conn.execute("BEGIN")

            for item in items:
                required = ["length", "width", "height", "group_id"]
                if not all(key in item for key in required):
                    raise ValueError(f"Item missing required fields: {required}")

                length = float(item["length"])
                width = float(item["width"])
                height = float(item["height"])
                group_id = int(item["group_id"])
                item_label = item.get("item_id", "")
                note = item.get("note", "")

                catalog_item_id = InventoryItemRepository.find_or_create_catalog_item(
                    conn, length, width, height
                )
                item_order = InventoryItemRepository.get_next_item_order(conn, group_id)
                InventoryItemRepository.insert_inventory_item(
                    conn, catalog_item_id, group_id, item_label, note, item_order
                )

            conn.commit()

        return {"success": True, "count": len(items), "skipped": 0}

    @staticmethod
    def update_item(item_id, data):
        required_fields = ["length", "width", "height", "note", "group_id"]
        if not data or not all(field in data for field in required_fields):
            raise ValueError(
                f"Missing one of the required fields: {required_fields}"
            )

        try:
            note = data.get("note", "")
            length = float(data["length"])
            width = float(data["width"])
            height = float(data["height"])
            group_id = int(data["group_id"])
            item_order_param = data.get("item_order")
        except (ValueError, TypeError) as error:
            raise TypeError("Invalid data type for one of the fields.") from error

        with db_session() as conn:
            conn.execute("BEGIN")
            if not InventoryItemRepository.item_exists(conn, item_id):
                return None

            catalog_item_id = InventoryItemRepository.find_or_create_catalog_item(
                conn, length, width, height
            )
            rowcount = InventoryItemRepository.update_inventory_item(
                conn,
                item_id,
                catalog_item_id,
                group_id,
                note,
                item_order_param,
            )
            if rowcount == 0:
                return None

            conn.commit()
            updated_item = InventoryItemRepository.get_item_by_id(conn, item_id)

        return updated_item

    @staticmethod
    def patch_item_note(item_id, data):
        if not data or "note" not in data:
            raise ValueError("Missing 'note' field in request body")

        with db_session() as conn:
            rowcount = InventoryItemRepository.update_item_note(
                conn, item_id, data["note"]
            )
            if rowcount == 0:
                return None
            conn.commit()
            return InventoryItemRepository.get_item_by_id(conn, item_id)

    @staticmethod
    def delete_item(item_id):
        with db_session() as conn:
            rowcount = InventoryItemRepository.delete_item(conn, item_id)
            if rowcount == 0:
                return False
            conn.commit()
        return True
