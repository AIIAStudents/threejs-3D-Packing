import json

from src.backend.contexts.space_design.infrastructure.container_repository import (
    ContainerRepository,
)
from src.backend.shared.db.sqlite import db_session


class ContainerQueryService:
    @staticmethod
    def get_latest_container():
        with db_session() as conn:
            container = ContainerRepository.fetch_latest_container(conn)
            if not container:
                return None

            result = dict(container)
            if result.get("parameters"):
                result["parameters"] = json.loads(result["parameters"])
            return result
