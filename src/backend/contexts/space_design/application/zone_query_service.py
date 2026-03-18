from src.backend.contexts.space_design.infrastructure.zone_repository import (
    ZoneRepository,
)
from src.backend.shared.db.sqlite import db_session


class ZoneQueryService:
    @staticmethod
    def get_zones():
        with db_session() as conn:
            return [dict(row) for row in ZoneRepository.list_zones(conn)]
