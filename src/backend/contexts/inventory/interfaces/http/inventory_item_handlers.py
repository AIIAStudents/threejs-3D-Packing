from flask import jsonify

from src.backend.contexts.inventory.application.inventory_item_command_service import (
    InventoryItemCommandService,
)
from src.backend.contexts.inventory.application.inventory_item_query_service import (
    InventoryItemQueryService,
)


def get_items_handler(group_id=None):
    items = InventoryItemQueryService.list_items(group_id)
    return jsonify(items)


def create_item_handler(data):
    try:
        new_item = InventoryItemCommandService.create_item(data)
        if not new_item:
            return jsonify({"error": "Item not found"}), 404
        return jsonify(dict(new_item)), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except TypeError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def create_items_bulk_handler(data):
    try:
        payload = InventoryItemCommandService.create_items_bulk(data)
        return jsonify(payload), 201
    except ValueError as error:
        message = str(error)
        if message.startswith("Item missing required fields"):
            return jsonify({"error": "Validation failed", "details": message}), 400
        return jsonify({"error": message}), 400
    except TypeError as error:
        return jsonify({"error": "Validation failed", "details": str(error)}), 400
    except Exception as error:
        return jsonify({"error": "Bulk insert failed", "details": str(error)}), 500


def update_item_handler(item_id, data):
    try:
        updated_item = InventoryItemCommandService.update_item(item_id, data)
        if not updated_item:
            return jsonify({"error": "Item not found"}), 404
        return jsonify(dict(updated_item))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except TypeError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def patch_item_note_handler(item_id, data):
    try:
        updated_item = InventoryItemCommandService.patch_item_note(item_id, data)
        if updated_item is None:
            return jsonify({"error": "Item not found"}), 404
        return jsonify(dict(updated_item))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


def delete_item_handler(item_id):
    try:
        deleted = InventoryItemCommandService.delete_item(item_id)
        if not deleted:
            return jsonify({"error": "Item not found"}), 404
        return (
            jsonify(
                {"message": f"Item with id {item_id} was deleted successfully."}
            ),
            200,
        )
    except Exception as error:
        return jsonify({"error": str(error)}), 500
