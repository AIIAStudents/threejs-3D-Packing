from src.backend.contexts.packing.infrastructure.packing_repository import (
    PackingRepository,
)
from src.backend.shared.db.sqlite import db_session


class SequenceService:
    @staticmethod
    def save_sequence(data):
        if not data or "sequence" not in data or not isinstance(data["sequence"], list):
            raise ValueError(
                "Request body must be a JSON object with a 'sequence' list."
            )

        sequence = data["sequence"]
        for item in sequence:
            if not all(key in item for key in ("item_id", "order")):
                raise ValueError(
                    "Each object in 'sequence' must contain 'item_id' and 'order'"
                )

        with db_session() as conn:
            PackingRepository.update_item_sequence(conn, sequence)
            conn.commit()

        return {
            "success": True,
            "message": f"Successfully updated order for {len(sequence)} items.",
        }
