from src.backend.contexts.space_design.infrastructure.zone_repository import (
    ZoneRepository,
)
from src.backend.shared.db.sqlite import db_session


class ZoneCommandService:
    @staticmethod
    def replace_zones(zones_data):
        with db_session() as conn:
            ZoneRepository.replace_zones(conn, zones_data)
            conn.commit()

        return len(zones_data)

    @staticmethod
    def delete_zone(zone_id):
        with db_session() as conn:
            rowcount = ZoneRepository.delete_zone(conn, zone_id)
            if rowcount == 0:
                return False
            conn.commit()

        return True
