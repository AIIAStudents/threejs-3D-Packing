from flask import jsonify

from src.backend.contexts.packing.application.packing_execution_service import (
    PackingExecutionService,
)
from src.backend.contexts.packing.application.packing_results_query_service import (
    PackingResultsQueryService,
)
from src.backend.contexts.packing.application.sequence_service import SequenceService


def save_sequence_handler(data):
    try:
        payload = SequenceService.save_sequence(data)
        return jsonify(payload), 200
    except ValueError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except TypeError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except Exception as error:
        print(f"Database sequence update error: {error}")
        return (
            jsonify({"error": "Database operation failed", "details": str(error)}),
            500,
        )


def execute_packing_handler():
    try:
        payload = PackingExecutionService.execute()
        return jsonify(payload), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        print(f"Packing execution error: {error}")
        return jsonify({"status": "error", "error": str(error)}), 500


def get_latest_result_handler():
    try:
        payload = PackingResultsQueryService.get_latest_result()
        return jsonify(payload), 200
    except Exception as error:
        print(f"Error fetching latest result: {error}")
        return jsonify({"error": str(error)}), 500


def get_space_result_handler(space_id):
    try:
        payload = PackingResultsQueryService.get_space_result(space_id)
        if payload is None:
            return jsonify({"error": "No packing results found for this zone"}), 404
        return jsonify(payload), 200
    except Exception as error:
        print(f"Error fetching space result: {error}")
        return jsonify({"error": str(error)}), 500
