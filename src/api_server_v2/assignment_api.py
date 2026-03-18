from flask import Blueprint, jsonify, request

# --- Blueprint Setup ---
assignment_api_blueprint = Blueprint('assignment_api', __name__)

from src.backend.contexts.allocation.infrastructure.allocation_repository import (
    AllocationRepository,
)
from src.backend.contexts.allocation.interfaces.http.allocation_handlers import (
    get_assigned_spaces_handler,
    get_assignment_data_handler,
    save_assignments_handler,
)
from src.backend.contexts.packing.interfaces.http.packing_handlers import (
    execute_packing_handler,
    get_latest_result_handler,
    get_space_result_handler,
    save_sequence_handler,
)
from src.backend.shared.db.sqlite import db_session

def init_assignments_table():
    """Creates the 'zone_assignments' table if it doesn't exist."""
    print("Initializing assignments table...")
    with db_session() as conn:
        AllocationRepository.initialize_assignments_table(conn)
        conn.commit()
    print("Table 'zone_assignments' created.")


# --- API Route Definitions ---
@assignment_api_blueprint.route('/assignment-data', methods=['GET'])
def get_assignment_data():
    """
    Fetches all necessary data for the assignment page from the single shared database.
    """
    return get_assignment_data_handler()

@assignment_api_blueprint.route('/assignments', methods=['POST'])
def save_assignments():
    """
    Saves a list of zone-to-group assignments.
    Expects a list of objects: [{ "zone_id": Z, "group_id": G }, ...]
    """
    assignments = request.get_json()
    return save_assignments_handler(assignments)

@assignment_api_blueprint.route('/assigned-spaces', methods=['GET'])
def get_assigned_spaces():
    """
    Fetches only the zones (spaces) that have at least one group assigned to them.
    """
    return get_assigned_spaces_handler()

@assignment_api_blueprint.route('/sequence/save', methods=['POST'])
def save_sequence():
    """
    Saves the specified order for a list of items.
    (This is consolidated here to avoid import issues with a separate sequence.py)
    """
    return save_sequence_handler(request.get_json())
@assignment_api_blueprint.route('/sequence/execute', methods=['POST'])
def execute_packing():
    """
    Executes the 3D packing algorithm for all zones in the latest job.
    Uses src/py_packer_v2/packer.py for core logic.
    """
    return execute_packing_handler()

@assignment_api_blueprint.route('/sequence/latest-result', methods=['GET'])
def get_latest_result():
    """
    Fetches the consolidated results for the most recent packing execution.
    """
    return get_latest_result_handler()

@assignment_api_blueprint.route('/sequence/space-result/<int:space_id>', methods=['GET'])
def get_space_result(space_id):
    """
    Fetches the packing result for a specific zone.
    """
    return get_space_result_handler(space_id)

if __name__ == "__main__":
    init_assignments_table()
