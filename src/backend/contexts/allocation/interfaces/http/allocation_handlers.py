from flask import jsonify

from src.backend.contexts.allocation.application.allocation_command_service import (
    AllocationCommandService,
)
from src.backend.contexts.allocation.application.allocation_query_service import (
    AllocationQueryService,
)


def get_assignment_data_handler():
    try:
        payload = AllocationQueryService.get_assignment_data()
        return jsonify(payload), 200
    except Exception as error:
        print(f"Error fetching assignment data: {error}")
        return (
            jsonify(
                {"error": "Failed to fetch assignment data", "details": str(error)}
            ),
            500,
        )


def save_assignments_handler(assignments):
    try:
        payload = AllocationCommandService.save_assignments(assignments)
        return jsonify(payload), 201
    except ValueError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except TypeError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except Exception as error:
        print(f"Database assignment error: {error}")
        return (
            jsonify({"error": "Database operation failed", "details": str(error)}),
            500,
        )


def get_assigned_spaces_handler():
    try:
        payload = AllocationQueryService.get_assigned_spaces()
        return jsonify(payload), 200
    except Exception as error:
        print(f"Error fetching assigned spaces: {error}")
        return (
            jsonify({"error": "Failed to fetch assigned spaces", "details": str(error)}),
            500,
        )
