import json

from src.api_server_v2.repositories.inventory_repository import InventoryRepository
from src.backend.contexts.allocation.infrastructure.allocation_repository import (
    AllocationRepository,
)
from src.backend.shared.db.sqlite import db_session


class AllocationQueryService:
    @staticmethod
    def get_assignment_data():
        with db_session() as conn:
            container = AllocationRepository.fetch_container(conn)
            container_data = dict(container) if container else None
            if container_data and "parameters" in container_data:
                container_data["parameters"] = json.loads(container_data["parameters"])

            latest_job = AllocationRepository.fetch_latest_cutting_job(conn)
            zones_data = []
            job_data = None

            if latest_job:
                job_data = dict(latest_job)
                zones = AllocationRepository.fetch_assignment_zones_for_job(
                    conn, latest_job["id"]
                )
                zones_data = [dict(zone) for zone in zones]

            items_data = InventoryRepository.get_all_enriched_inventory(conn)
            groups_data = InventoryRepository.get_all_groups(conn)

            return {
                "container": container_data,
                "job": job_data,
                "zones": zones_data,
                "items": items_data,
                "groups": groups_data,
            }

    @staticmethod
    def get_assigned_spaces():
        with db_session() as conn:
            latest_job = AllocationRepository.fetch_latest_cutting_job(conn)
            if not latest_job:
                return []

            spaces = AllocationRepository.fetch_assigned_spaces_for_job(
                conn, latest_job["id"]
            )
            return [dict(space) for space in spaces]

    @staticmethod
    def get_legacy_zone_assignments():
        with db_session() as conn:
            return [dict(row) for row in AllocationRepository.fetch_all_assignments(conn)]
