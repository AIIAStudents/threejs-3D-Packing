"""
[DEPRECATED] Containers and Zones API Blueprint
WARNING: This module is deprecated. Certain endpoints like /items/reorder
are no longer functional and will return 410 Gone due to schema changes.
Please defer to the v2 API modules (container_parameters.py, etc.).
"""
import warnings

from flask import Blueprint, jsonify, request

from src.backend.contexts.allocation.interfaces.http.legacy_assignment_handlers import (
    get_zone_assignments_handler,
    save_zone_assignments_handler,
)
from src.backend.contexts.space_design.interfaces.http.container_handlers import (
    get_latest_container_handler,
    save_legacy_container_handler,
)
from src.backend.contexts.space_design.interfaces.http.zone_handlers import (
    delete_zone_handler,
    get_zones_handler,
    save_cutting_job_handler,
    save_zones_handler,
)


warnings.warn(
    "containers_zones.py is deprecated and will be removed in the future.",
    DeprecationWarning,
    stacklevel=2,
)

containers_zones_api_blueprint = Blueprint("containers_zones_api", __name__)


@containers_zones_api_blueprint.route("/containers", methods=["POST"])
def save_container():
    return save_legacy_container_handler(request.get_json())


@containers_zones_api_blueprint.route("/containers/latest", methods=["GET"])
def get_latest_container():
    return get_latest_container_handler()


@containers_zones_api_blueprint.route("/zones", methods=["POST"])
def save_zones():
    return save_zones_handler(request.get_json())


@containers_zones_api_blueprint.route("/zones", methods=["GET"])
def get_zones():
    return get_zones_handler()


@containers_zones_api_blueprint.route("/zones/<int:zone_id>", methods=["DELETE"])
def delete_zone(zone_id):
    return delete_zone_handler(zone_id)


@containers_zones_api_blueprint.route("/zone-assignments", methods=["POST"])
def save_zone_assignments():
    return save_zone_assignments_handler(request.get_json())


@containers_zones_api_blueprint.route("/zone-assignments", methods=["GET"])
def get_zone_assignments():
    return get_zone_assignments_handler()


@containers_zones_api_blueprint.route("/items/reorder", methods=["POST"])
def reorder_items():
    return (
        jsonify(
            {
                "error": "Legacy reorder endpoint is deprecated. Use /api/sequence/save instead."
            }
        ),
        410,
    )


@containers_zones_api_blueprint.route("/v2/cutting/jobs", methods=["POST"])
def save_cutting_job():
    return save_cutting_job_handler(request.get_json())
