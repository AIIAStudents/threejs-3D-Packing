import json
import time

from src.backend.contexts.packing.infrastructure.packing_repository import (
    PackingRepository,
)
from src.backend.shared.db.sqlite import db_session


def _map_result_items(result_json, include_unpacked=True):
    items = []
    for placement in result_json.get("placements", []):
        items.append(
            {
                **placement,
                "length": placement.get("dimensions", {}).get("x", 0),
                "height": placement.get("dimensions", {}).get("y", 0),
                "width": placement.get("dimensions", {}).get("z", 0),
                "packed": True,
            }
        )

    if include_unpacked:
        for item_id in result_json.get("unplaced_ids", []):
            items.append({"item_id": item_id, "packed": False})

    return items


class PackingResultsQueryService:
    @staticmethod
    def get_latest_result():
        print(f"DEBUG: [latest-result] Hit at {time.ctime()}")

        with db_session() as conn:
            job_id_raw = PackingRepository.fetch_latest_result_job_id(conn)
            if not job_id_raw:
                print("DEBUG: [latest-result] No results found in database.")
                return {
                    "job_id": None,
                    "container": {
                        "shape": "rect",
                        "parameters": {"length": 0, "width": 0, "height": 0},
                    },
                    "zones": [],
                    "spaces": [],
                    "total_packed": 0,
                    "total_unpacked": 0,
                }

            job_id = int(job_id_raw) if str(job_id_raw).isdigit() else job_id_raw
            job = PackingRepository.fetch_cutting_job(conn, job_id)
            container_data = {}
            if job:
                container_data = {
                    "shape": job["container_shape"],
                    "parameters": json.loads(job["container_parameters"]),
                }

            zones = PackingRepository.fetch_zones_for_job(conn, job_id)
            results = PackingRepository.fetch_latest_results_for_job(conn, job_id)
            print(
                f"DEBUG: [latest-result] Found {len(results)} zone results for job {job_id}"
            )

            spaces_summary = []
            total_packed = 0
            total_unpacked = 0
            total_time = 0

            for row in results:
                result_row = dict(row)
                result_json = json.loads(result_row["result_json"])
                utilization = result_row.get("volume_utilization")
                if utilization is None:
                    utilization = result_json.get("metrics", {}).get("utilization", 0)

                spaces_summary.append(
                    {
                        "zone_id": row["zone_id"],
                        "zone_label": row["zone_label"],
                        "packed_count": row["packed_count"],
                        "unpacked_count": row["unpacked_count"],
                        "result": {
                            "items": _map_result_items(result_json),
                            "volume_utilization": utilization,
                        },
                    }
                )

                total_packed += row["packed_count"] or 0
                total_unpacked += row["unpacked_count"] or 0
                total_time += row["execution_time_ms"] or 0

            return {
                "job_id": job_id,
                "container": container_data,
                "zones": [dict(zone) for zone in zones],
                "spaces": spaces_summary,
                "total_packed": total_packed,
                "total_unpacked": total_unpacked,
                "total_execution_time": total_time,
            }

    @staticmethod
    def get_space_result(space_id):
        with db_session() as conn:
            result = PackingRepository.fetch_latest_result_for_zone(conn, space_id)
            if not result:
                return None

            result_row = dict(result)
            result_json = json.loads(result_row["result_json"])
            items = _map_result_items(result_json, include_unpacked=False)

            return {
                "zone_id": result_row["zone_id"],
                "zone_label": result_row["zone_label"],
                "packed_count": result_row["packed_count"],
                "unpacked_count": result_row["unpacked_count"],
                "volume_utilization": result_row["volume_utilization"] or 0,
                "execution_time_ms": result_row["execution_time_ms"],
                "result": {"items": items},
            }
