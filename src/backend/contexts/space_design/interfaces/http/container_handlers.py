from flask import jsonify

from src.backend.contexts.space_design.application.container_command_service import (
    ContainerCommandService,
)
from src.backend.contexts.space_design.application.container_query_service import (
    ContainerQueryService,
)
from src.backend.contexts.space_design.infrastructure.container_repository import (
    ContainerRepository,
)
from src.backend.shared.db.sqlite import db_session


def save_container_config_handler(data):
    try:
        payload = ContainerCommandService.save_container_config(data)
        return jsonify(payload), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Database error: {error}")
        return (
            jsonify({"error": "Database operation failed", "details": str(error)}),
            500,
        )


def save_legacy_container_handler(data):
    if not data or "parameters" not in data:
        return jsonify({"error": "Missing parameters field"}), 400

    try:
        with db_session() as conn:
            container_id = ContainerRepository.insert_legacy_container(
                conn, data["parameters"]
            )
            conn.commit()

        return (
            jsonify({"id": container_id, "message": "Container saved successfully"}),
            201,
        )
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def get_latest_container_handler():
    try:
        result = ContainerQueryService.get_latest_container()
        if not result:
            return jsonify({"error": "No container found"}), 404
        return jsonify(result), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 500
