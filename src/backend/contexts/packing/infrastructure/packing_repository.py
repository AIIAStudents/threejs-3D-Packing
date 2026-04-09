import json

from src.backend.contexts.inventory.application.inventory_access_facade import (
    InventoryAccessFacade,
)
from src.backend.contexts.inventory.infrastructure.inventory_projection_repository import (
    InventoryProjectionRepository,
)


class PackingRepository:
    """
    Repository for packing-owned persistence and result queries.

    Packing-owned methods:
    - insert_packing_result
    - fetch_latest_result_job_id
    - fetch_latest_results_for_job
    - fetch_latest_result_for_zone

    Temporary boundary exceptions retained for execution flow stability:
    - fetch_latest_job
    - fetch_cutting_job
    - fetch_zones_for_job
    - fetch_zone_group_ids
    - fetch_inventory_for_group
    - update_item_sequence (compatibility shim delegating to inventory)

    The helpers below are intentionally split into two sections so future
    maintainers can distinguish owner responsibilities from legacy cross-context
    reads without tracing the whole packing call chain first.

    Prefer `PackingInputQueryService` for new packing input reads; do not add
    more cross-context helper methods here unless there is a concrete
    compatibility reason.
    """
    # ------------------------------------------------------------------
    # Temporary cross-context helpers kept for packing flow stability.
    # These should not grow further; new cross-context reads should prefer
    # facades/read gateways owned by the source context.
    #
    # Current status:
    # - retained mostly for compatibility and rollback safety
    # - not the preferred extension point for new packing use cases
    # - candidates for future retirement once no external/legacy callers remain
    # ------------------------------------------------------------------
    @staticmethod
    def update_item_sequence(conn, sequence):
        # Compatibility-only shim: sequence writes belong to the inventory context.
        InventoryAccessFacade.update_item_sequence(sequence)

    @staticmethod
    def fetch_latest_job(conn):
        # Compatibility-only read helper. New code should use PackingInputQueryService.
        return conn.execute("SELECT id FROM cutting_jobs ORDER BY id DESC LIMIT 1").fetchone()

    @staticmethod
    def fetch_zones_for_job(conn, job_id):
        # Compatibility-only read helper. New code should use SpaceDesignReadFacade.
        return conn.execute("SELECT * FROM zones WHERE job_id = ?", (job_id,)).fetchall()

    @staticmethod
    def fetch_zone_group_ids(conn, zone_id):
        # Compatibility-only read helper. New code should use AllocationReadFacade.
        rows = conn.execute(
            "SELECT group_id FROM zone_assignments WHERE zone_id = ?", (zone_id,)
        ).fetchall()
        return [row["group_id"] for row in rows]

    @staticmethod
    def fetch_inventory_for_group(conn, group_id):
        # Compatibility-only read helper. New code should use InventoryAccessFacade.
        return InventoryProjectionRepository.list_enriched_inventory(
            conn, group_id=group_id
        )

    # ------------------------------------------------------------------
    # Packing-owned persistence and owner-side result queries.
    # ------------------------------------------------------------------
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
        # Compatibility-only read helper. New code should use SpaceDesignReadFacade.
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
