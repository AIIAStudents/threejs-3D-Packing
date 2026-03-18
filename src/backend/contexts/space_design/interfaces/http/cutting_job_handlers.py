from flask import jsonify

from src.backend.contexts.space_design.application.cutting_job_command_service import (
    CuttingJobCommandService,
)


def save_cutting_job_handler(data):
    try:
        payload = CuttingJobCommandService.save_cutting_job(data)
        return jsonify(payload), 201
    except ValueError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except TypeError as error:
        return jsonify({"error": "Invalid data format", "details": str(error)}), 400
    except Exception as error:
        print(f"Database error: {error}")
        return (
            jsonify({"error": "Database operation failed", "details": str(error)}),
            500,
        )
