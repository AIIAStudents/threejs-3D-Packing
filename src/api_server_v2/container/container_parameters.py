from flask import Blueprint, request

from src.backend.contexts.space_design.infrastructure.container_repository import (
    ContainerRepository,
)
from src.backend.contexts.space_design.infrastructure.container_schema_migration import (
    ContainerSchemaMigration,
)
from src.backend.contexts.space_design.interfaces.http.container_handlers import (
    save_container_config_handler,
)
from src.backend.shared.db.sqlite import db_session


container_api_blueprint = Blueprint("container_api", __name__)


def init_containers_table():
    """Initializes the database and prepares the current container record."""
    print("Initializing containers table...")
    with db_session() as conn:
        ContainerSchemaMigration.initialize_containers_schema(conn)
        ContainerRepository.ensure_default_container_record(
            conn, {"note": "This is the default placeholder."}
        )
        conn.commit()
    print("Containers table initialized successfully.")


@container_api_blueprint.route("/", methods=["POST"])
def save_container_config():
    return save_container_config_handler(request.get_json())


if __name__ == "__main__":
    init_containers_table()
