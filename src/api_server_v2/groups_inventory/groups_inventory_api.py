from flask import Blueprint, request

from src.backend.contexts.inventory.infrastructure.inventory_schema_migration import (
    InventorySchemaMigration,
)
from src.backend.contexts.inventory.interfaces.http.inventory_item_handlers import (
    create_item_handler,
    create_items_bulk_handler,
    delete_item_handler,
    get_items_handler,
    patch_item_note_handler,
    update_item_handler,
)


items_api_blueprint = Blueprint("items", __name__)


def init_items_table():
    """Initialize the v2 inventory schema and compatibility view."""
    InventorySchemaMigration.initialize_items_schema()


@items_api_blueprint.route("/", methods=["GET"])
def get_items():
    group_id = request.args.get("group_id", type=int)
    return get_items_handler(group_id)


@items_api_blueprint.route("/", methods=["POST"])
def create_item():
    return create_item_handler(request.get_json())


@items_api_blueprint.route("/bulk", methods=["POST"])
def create_items_bulk():
    return create_items_bulk_handler(request.get_json())


@items_api_blueprint.route("/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    return update_item_handler(item_id, request.get_json())


@items_api_blueprint.route("/<int:item_id>", methods=["PATCH"])
def patch_item_note(item_id):
    return patch_item_note_handler(item_id, request.get_json())


@items_api_blueprint.route("/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    return delete_item_handler(item_id)


if __name__ == "__main__":
    print("Initializing items database...")
    init_items_table()
