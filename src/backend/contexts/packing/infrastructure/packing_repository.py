import json

from src.api_server_v2.repositories.inventory_repository import InventoryRepository


class PackingRepository:
    @staticmethod
    def update_item_sequence(conn, sequence):
        cursor = conn.cursor()
        cursor.execute("BEGIN TRANSACTION;")

        for item in sequence:
            cursor.execute(
                "UPDATE inventory_items SET item_order = ? WHERE id = ?",
                (item["order"], item["item_id"]),
            )

    @staticmethod
    def fetch_latest_job(conn):
        return conn.execute("SELECT id FROM cutting_jobs ORDER BY id DESC LIMIT 1").fetchone()

    @staticmethod
    def fetch_zones_for_job(conn, job_id):
        return conn.execute("SELECT * FROM zones WHERE job_id = ?", (job_id,)).fetchall()

    @staticmethod
    def fetch_zone_group_ids(conn, zone_id):
        rows = conn.execute(
            "SELECT group_id FROM zone_assignments WHERE zone_id = ?", (zone_id,)
        ).fetchall()
        return [row["group_id"] for row in rows]

    @staticmethod
    def fetch_inventory_for_group(conn, group_id):
        return InventoryRepository.get_all_enriched_inventory(conn, group_id=group_id)

    @staticmethod
    def insert_packing_result(conn, payload):
        conn.execute(
            """
            INSERT INTO packing_results
            (job_id, zone_id, zone_label, result_json, success, packed_count, unpacked_count, volume_utilization, execution_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(payload["job_id"]),
                payload["zone_id"],
                payload["zone_label"],
                json.dumps(payload["result_data"]),
                payload["success"],
                payload["packed_count"],
                payload["unpacked_count"],
                payload["volume_utilization"],
                payload["execution_time_ms"],
            ),
        )

    @staticmethod
    def fetch_latest_result_job_id(conn):
        row = conn.execute(
            "SELECT job_id FROM packing_results ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return row["job_id"] if row else None

    @staticmethod
    def fetch_cutting_job(conn, job_id):
        return conn.execute("SELECT * FROM cutting_jobs WHERE id = ?", (job_id,)).fetchone()

    @staticmethod
    def fetch_latest_results_for_job(conn, job_id):
        return conn.execute(
            """
            SELECT * FROM packing_results
            WHERE job_id = ?
            AND id IN (
                SELECT MAX(id)
                FROM packing_results
                WHERE job_id = ?
                GROUP BY zone_id
            )
            """,
            (str(job_id), str(job_id)),
        ).fetchall()

    @staticmethod
    def fetch_latest_result_for_zone(conn, zone_id):
        return conn.execute(
            "SELECT * FROM packing_results WHERE zone_id = ? ORDER BY id DESC LIMIT 1",
            (zone_id,),
        ).fetchone()
