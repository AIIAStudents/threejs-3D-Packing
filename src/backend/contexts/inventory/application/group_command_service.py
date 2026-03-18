from src.backend.contexts.inventory.infrastructure.group_repository import (
    GroupRepository,
)
from src.backend.shared.db.sqlite import db_session


class GroupCommandService:
    @staticmethod
    def create_group(data):
        if not data or "name" not in data:
            raise ValueError("Missing 'name' in request body")

        name = data.get("name")
        description = data.get("description") or data.get("note", "")

        with db_session() as conn:
            group_id = GroupRepository.insert_group(conn, name, description)
            conn.commit()

        return {"id": group_id, "name": name, "description": description}

    @staticmethod
    def update_group(group_id, data):
        if not data or "name" not in data:
            raise ValueError("Missing 'name' in request body")

        name = data.get("name")
        description = data.get("description") or data.get("note", "")

        with db_session() as conn:
            rowcount = GroupRepository.update_group(conn, group_id, name, description)
            if rowcount == 0:
                return None
            conn.commit()

        return {"id": group_id, "name": name, "description": description}

    @staticmethod
    def delete_group(group_id):
        with db_session() as conn:
            rowcount = GroupRepository.delete_group(conn, group_id)
            if rowcount == 0:
                return False
            conn.commit()

        return True
