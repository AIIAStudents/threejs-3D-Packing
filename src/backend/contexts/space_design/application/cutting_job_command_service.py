from src.backend.contexts.space_design.infrastructure.cutting_job_repository import (
    CuttingJobRepository,
)
from src.backend.shared.db.sqlite import db_session


class CuttingJobCommandService:
    @staticmethod
    def save_cutting_job(data):
        if not data or "container" not in data or "zones" not in data:
            raise ValueError("Request body must contain 'container' and 'zones' keys")

        container_data = data["container"]
        zones_data = data["zones"]

        if "shape" not in container_data:
            raise ValueError("Container data must include 'shape'")

        with db_session() as conn:
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION;")

            job_id = CuttingJobRepository.create_cutting_job(conn, container_data)

            for zone in zones_data:
                if not all(
                    key in zone for key in ("label", "length", "width", "height")
                ):
                    raise ValueError(
                        "Each zone must contain 'label', 'length', 'width', and 'height'"
                    )
                CuttingJobRepository.insert_zone(conn, job_id, zone)

            conn.commit()

        return {
            "message": "Cutting job saved successfully.",
            "job_id": job_id,
            "zones_saved": len(zones_data),
        }
