import json


class CuttingJobRepository:
    @staticmethod
    def create_cutting_job(conn, container_data):
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO cutting_jobs (container_shape, container_parameters) VALUES (?, ?)",
            (container_data["shape"], json.dumps(container_data)),
        )
        return cursor.lastrowid

    @staticmethod
    def insert_zone(conn, job_id, zone):
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO zones (job_id, label, length, width, height, x, y, rotation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                zone["label"],
                zone["length"],
                zone["width"],
                zone["height"],
                zone.get("x", 0),
                zone.get("y", 0),
                zone.get("rotation", 0),
            ),
        )
