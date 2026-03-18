from src.backend.contexts.space_design.application.zone_query_service import (
    ZoneQueryService,
)
from flask import jsonify

from src.backend.contexts.space_design.application.zone_command_service import (
    ZoneCommandService,
)


def save_zones_handler(data):
    if not data or "zones" not in data:
        return jsonify({"error": "Missing zones array"}), 400

    try:
        zones_count = ZoneCommandService.replace_zones(data["zones"])
        return jsonify({"message": f"Saved {zones_count} zones successfully"}), 201
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def get_zones_handler():
    try:
        return jsonify(ZoneQueryService.get_zones())
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def delete_zone_handler(zone_id):
    try:
        deleted = ZoneCommandService.delete_zone(zone_id)
        if not deleted:
            return jsonify({"error": "Zone not found"}), 404
        return jsonify({"message": "Zone deleted successfully"}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 500


def save_cutting_job_handler(data):
    if not data or "zones" not in data:
        return jsonify({"error": "Missing zones data"}), 400

    try:
        zones_count = ZoneCommandService.replace_zones(data["zones"])
        return (
            jsonify(
                {
                    "success": True,
                    "message": f"Saved cutting job with {zones_count} zones successfully",
                    "zones_count": zones_count,
                }
            ),
            201,
        )
    except Exception as error:
        return jsonify({"success": False, "details": str(error)}), 500
