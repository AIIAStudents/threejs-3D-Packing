from src.backend.contexts.inventory.infrastructure.group_repository import (
    GroupRepository,
)
from src.backend.shared.db.sqlite import db_session


class GroupQueryService:
    @staticmethod
    def get_all_groups():
        with db_session() as conn:
            return GroupRepository.list_groups(conn)
