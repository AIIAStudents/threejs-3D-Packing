from flask import Blueprint, request

from src.backend.contexts.space_design.infrastructure.cutting_schema_migration import (
    CuttingSchemaMigration,
)
from src.backend.contexts.space_design.interfaces.http.cutting_job_handlers import (
    save_cutting_job_handler,
)
from src.backend.shared.db.sqlite import db_session


cut_space_api_blueprint = Blueprint("cut_space_api", __name__)


def init_cutting_tables():
    """Initializes the database and creates the cutting_jobs and zones tables."""
    print("Initializing cutting tables...")
    with db_session() as conn:
        CuttingSchemaMigration.initialize_cutting_tables(conn)
        conn.commit()
    print("Cutting database tables initialized successfully.")


@cut_space_api_blueprint.route("/jobs", methods=["POST"])
def save_cutting_job():
    return save_cutting_job_handler(request.get_json())


if __name__ == "__main__":
    init_cutting_tables()
