from flask import jsonify

from src.backend.contexts.inventory.application.group_command_service import (
    GroupCommandService,
)
from src.backend.contexts.inventory.application.group_query_service import (
    GroupQueryService,
)


def get_all_groups_handler():
    return jsonify(GroupQueryService.get_all_groups())


def create_group_handler(data):
    try:
        return jsonify(GroupCommandService.create_group(data)), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


def update_group_handler(group_id, data):
    try:
        group = GroupCommandService.update_group(group_id, data)
        if group is None:
            return jsonify({"error": "Group not found"}), 404
        return jsonify(group)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


def delete_group_handler(group_id):
    deleted = GroupCommandService.delete_group(group_id)
    if not deleted:
        return jsonify({"error": "Group not found"}), 404
    return (
        jsonify({"message": f"Group with id {group_id} was deleted successfully."}),
        200,
    )
