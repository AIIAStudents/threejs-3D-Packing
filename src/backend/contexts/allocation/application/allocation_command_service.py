from src.backend.contexts.allocation.infrastructure.allocation_repository import (
    AllocationRepository,
)
from src.backend.shared.db.sqlite import db_session


class AllocationCommandService:
    @staticmethod
    def save_assignments(assignments):
        if not isinstance(assignments, list):
            raise ValueError("Request body must be a list of assignment objects")

        for assignment in assignments:
            if not all(key in assignment for key in ("zone_id", "group_id")):
                raise ValueError(
                    "Each assignment object must contain 'zone_id' and 'group_id'"
                )

        with db_session() as conn:
            AllocationRepository.replace_assignments(conn, assignments)
            conn.commit()

        return {"message": f"Successfully saved {len(assignments)} assignments."}

    @staticmethod
    def save_legacy_zone_assignments(data):
        if not data or "assignments" not in data:
            raise ValueError("Missing assignments field")

        assignments = data["assignments"]
        if not isinstance(assignments, dict):
            raise ValueError("Assignments field must be an object")

        with db_session() as conn:
            AllocationRepository.replace_legacy_assignment_map(conn, assignments)
            conn.commit()

        return {"message": "Assignments saved successfully"}
