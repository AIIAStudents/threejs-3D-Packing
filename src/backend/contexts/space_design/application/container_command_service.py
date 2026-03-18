from src.backend.contexts.space_design.infrastructure.container_repository import (
    ContainerRepository,
)
from src.backend.shared.db.sqlite import db_session


class ContainerCommandService:
    @staticmethod
    def save_container_config(data):
        if not data or "shape" not in data:
            raise ValueError("Missing 'shape' in request body")

        with db_session() as conn:
            ContainerRepository.upsert_current_container(conn, data)
            conn.commit()

        return {"message": "Container configuration saved successfully.", "id": 1}
