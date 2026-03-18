from flask import Blueprint, request

from src.backend.contexts.inventory.infrastructure.group_schema_migration import (
    GroupSchemaMigration,
)
from src.backend.contexts.inventory.interfaces.http.group_handlers import (
    create_group_handler,
    delete_group_handler,
    get_all_groups_handler,
    update_group_handler,
)


groups_api_blueprint = Blueprint("groups", __name__)


def init_groups_table():
    """Initialize the groups schema."""
    GroupSchemaMigration.initialize_groups_schema()


@groups_api_blueprint.route("/", methods=["GET"])
def get_all_groups():
    return get_all_groups_handler()


@groups_api_blueprint.route("/", methods=["POST"])
def create_group():
    return create_group_handler(request.get_json())


@groups_api_blueprint.route("/<int:group_id>", methods=["PUT"])
def update_group(group_id):
    return update_group_handler(group_id, request.get_json())


@groups_api_blueprint.route("/<int:group_id>", methods=["DELETE"])
def delete_group(group_id):
    return delete_group_handler(group_id)


if __name__ == "__main__":
    print("Initializing database...")
    init_groups_table()
