import time
import dataclasses
from typing import List

from .types import Group, Item, Warehouse, PackingResult, PackedObject, UnpackedObject, Aisle, Vec3
from .partition.lane_manager import LaneManager
from .packing.item_placer import ItemPlacer
from .utils import get_box_volume, vec3

def pack_warehouse(warehouse: Warehouse, groups: List[Group], items: List[Item]) -> PackingResult:
    print("🚀 Starting warehouse packing process with Lane-based architecture...")
    start_time = time.perf_counter()

    # 1. Define warehouse layout (aisles) and default slot size
    # This would typically come from warehouse configuration
    aisles = [Aisle(id="A1", line='y', coord=0.0)]
    slot_dims = vec3(50, 50, 50) # Assuming a default slot size for demand calculation

    # 2. Initialize the LaneManager and plan the layout
    lane_manager = LaneManager(warehouse, aisles)
    lane_manager.plan_lanes(groups, items)

    # 3. Initialize the ItemPlacer and pack items into the planned lanes
    item_placer = ItemPlacer(lane_manager)
    internal_report = item_placer.pack(items, slot_dims)

    end_time = time.perf_counter()
    execution_time_ms = (end_time - start_time) * 1000

    # 4. Process the results into the final PackingResult object
    packed_items = [
        PackedObject(item_id=p.item_id, partition_id=p.partition_id, pose=p.pose)
        for p in internal_report["placements"]
    ]
    unpacked_items = [
        UnpackedObject(item_id=item_id)
        for item_id in internal_report["unplaced_item_ids"]
    ]

    total_volume = get_box_volume(warehouse.bounds)
    used_volume = internal_report["total_used_volume"]
    volume_utilization = (used_volume / total_volume) if total_volume > 0 else 0

    # Extract and serialize lane data for visualization (re-using the 'partitions' field)
    lane_data = [dataclasses.asdict(lane) for lane in lane_manager.lanes.values()]

    result = PackingResult(
        job_id=f"job_{int(time.time())}",
        success=len(unpacked_items) == 0,
        message=f"Packing complete. {len(packed_items)} items packed, {len(unpacked_items)} unpacked.",
        total_volume=total_volume,
        used_volume=used_volume,
        volume_utilization=volume_utilization,
        execution_time_ms=execution_time_ms,
        items=packed_items + unpacked_items,
        borrow_ops=internal_report["borrow_ops"],
        spill_ops=internal_report["spill_ops"],
        partitions=lane_data,  # Frontend will visualize these 'lanes' as partitions
    )
    
    print("✅ Warehouse packing process finished.")
    return result
