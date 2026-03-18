import time

from src.backend.contexts.packing.infrastructure.packing_repository import (
    PackingRepository,
)
from src.backend.shared.db.sqlite import db_session
from src.py_packer_v2.packer import pack_items_simple
from src.py_packer_v2.types import Box3, Item as AlgoItem, Vec3


class PackingExecutionService:
    @staticmethod
    def execute():
        with db_session() as conn:
            latest_job = PackingRepository.fetch_latest_job(conn)
            if not latest_job:
                raise ValueError("No cutting job found. Please cut a container first.")

            job_id = latest_job["id"]
            zones = PackingRepository.fetch_zones_for_job(conn, job_id)
            results_summary = []
            start_time_all = time.time()

            for zone in zones:
                zone_id = zone["id"]
                zone_label = zone["label"]
                group_ids = PackingRepository.fetch_zone_group_ids(conn, zone_id)

                all_items = []
                for group_id in group_ids:
                    all_items.extend(
                        PackingRepository.fetch_inventory_for_group(conn, group_id)
                    )

                if not all_items:
                    results_summary.append(
                        {
                            "zone": zone_label,
                            "status": "skipped",
                            "message": "No items assigned",
                        }
                    )
                    continue

                algo_items = [
                    AlgoItem(
                        id=str(item["id"]),
                        group_id=str(item["group_id"]),
                        dims=Vec3(
                            x=float(item["length"]),
                            y=float(item["height"]),
                            z=float(item["width"]),
                        ),
                        order=int(item.get("item_order", 0)),
                    )
                    for item in all_items
                ]

                container_bounds = Box3(
                    min=Vec3(x=0, y=0, z=0),
                    max=Vec3(
                        x=float(zone["length"]),
                        y=float(zone["height"]),
                        z=float(zone["width"]),
                    ),
                )

                start_time_zone = time.time()
                placements, unplaced_ids = pack_items_simple(algo_items, container_bounds)
                end_time_zone = time.time()

                placements_json = []
                for placement in placements:
                    placements_json.append(
                        {
                            "item_id": placement.item_id,
                            "position": {
                                "x": placement.pose.min.x,
                                "y": placement.pose.min.y,
                                "z": placement.pose.min.z,
                            },
                            "dimensions": {
                                "x": placement.pose.max.x - placement.pose.min.x,
                                "y": placement.pose.max.y - placement.pose.min.y,
                                "z": placement.pose.max.z - placement.pose.min.z,
                            },
                        }
                    )

                zone_volume = (
                    float(zone["length"])
                    * float(zone["height"])
                    * float(zone["width"])
                )
                placed_volume = sum(
                    (placement.pose.max.x - placement.pose.min.x)
                    * (placement.pose.max.y - placement.pose.min.y)
                    * (placement.pose.max.z - placement.pose.min.z)
                    for placement in placements
                )
                utilization = placed_volume / zone_volume if zone_volume > 0 else 0

                result_data = {
                    "placements": placements_json,
                    "unplaced_ids": unplaced_ids,
                    "metrics": {
                        "total_items": len(algo_items),
                        "placed_items": len(placements),
                        "unplaced_items": len(unplaced_ids),
                        "utilization": utilization,
                    },
                }

                PackingRepository.insert_packing_result(
                    conn,
                    {
                        "job_id": job_id,
                        "zone_id": zone_id,
                        "zone_label": zone_label,
                        "result_data": result_data,
                        "success": len(unplaced_ids) == 0,
                        "packed_count": len(placements),
                        "unpacked_count": len(unplaced_ids),
                        "volume_utilization": utilization,
                        "execution_time_ms": (end_time_zone - start_time_zone) * 1000,
                    },
                )

                results_summary.append(
                    {
                        "zone": zone_label,
                        "status": "success" if len(unplaced_ids) == 0 else "partial",
                        "packed": len(placements),
                        "unpacked": len(unplaced_ids),
                    }
                )

            conn.commit()

        return {
            "status": "success",
            "message": f"Successfully executed packing for {len(results_summary)} zones",
            "summary": results_summary,
            "total_execution_time_ms": (time.time() - start_time_all) * 1000,
        }
