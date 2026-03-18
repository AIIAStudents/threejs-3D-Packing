from flask import jsonify

from src.backend.contexts.allocation.application.allocation_command_service import (
    AllocationCommandService,
)
from src.backend.contexts.allocation.application.allocation_query_service import (
    AllocationQueryService,
)


def save_zone_assignments_handler(data):
    try:
        payload = AllocationCommandService.save_legacy_zone_assignments(data)
        return jsonify(payload), 201
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def get_zone_assignments_handler():
    try:
        return jsonify(AllocationQueryService.get_legacy_zone_assignments())
    except Exception as error:
        return jsonify({"error": str(error)}), 500
