from typing import Optional, Dict, Any
from ..types import Item, Partition, Placement
from ..partition.partition_manager import PartitionManager
from ..packing.extreme_point_3d import ExtremePoint3D

class OverflowManager:
    def __init__(self, partition_manager: PartitionManager):
        self.partition_manager = partition_manager
        self.policy = 'borrow-first'

    def handle_overflow(self, item: Item, source_partition: Partition, packer: ExtremePoint3D, report: Dict[str, Any]) -> Optional[Placement]:
        if self.policy == 'borrow-first':
            placement = self._try_borrow(item, source_partition, packer, report)
            if placement:
                return placement
            return self._try_spill(item, report)
        else:
            placement = self._try_spill(item, report)
            if placement:
                return placement
            return self._try_borrow(item, source_partition, packer, report)

    def _try_borrow(self, item: Item, source_partition: Partition, packer: ExtremePoint3D, report: Dict[str, Any]) -> Optional[Placement]:
        print(f"[OverflowManager] Attempting to borrow space for item {item.id} by resizing partition {source_partition.id}.")
        item_volume = item.dims.x * item.dims.y * item.dims.z

        for neighbor_id in source_partition.neighbors:
            neighbor_partition = self.partition_manager.partitions.get(neighbor_id)
            if not neighbor_partition: continue

            neighbor_free_volume = neighbor_partition.reserved_volume - neighbor_partition.used_volume
            if neighbor_free_volume >= item_volume:
                print(f"[OverflowManager] Found potential donor: {neighbor_id} with {neighbor_free_volume:.0f} free volume.")
                
                resize_success = self.partition_manager.resize_partition(
                    source_partition.id,
                    neighbor_id,
                    item_volume
                )

                if resize_success:
                    print(f"[OverflowManager] Resize successful. Re-attempting placement of item {item.id} in expanded partition {source_partition.id}.")
                    placement = packer.place_item(item)

                    if placement:
                        print(f"[OverflowManager] Successfully placed item {item.id} after borrowing space from {neighbor_id}.")
                        source_partition.borrowed_in_volume += item_volume
                        neighbor_partition.borrowed_out_volume += item_volume
                        report['borrow_ops'].append({
                            "fromPartitionId": neighbor_id,
                            "toPartitionId": source_partition.id,
                            "volume": item_volume,
                        })
                        return placement
        
        print(f"[OverflowManager] Borrowing failed for item {item.id}.")
        return None

    def _try_spill(self, item: Item, report: Dict[str, Any]) -> Optional[Placement]:
        overflow_partition_id = next((p.id for p in self.partition_manager.partitions.values() if not p.group_id), None)
        if not overflow_partition_id:
            print(f"[OverflowManager] WARN: No overflow partition designated. Cannot spill item {item.id}.")
            return None

        print(f"[OverflowManager] Spilling item {item.id} to overflow partition {overflow_partition_id}.")
        overflow_partition = self.partition_manager.partitions[overflow_partition_id]
        packer = ExtremePoint3D(overflow_partition)
        placement = packer.place_item(item)

        if placement:
            report['spill_ops'].append({"toPartitionId": overflow_partition_id, "itemId": item.id})
            placement.partition_id = overflow_partition_id
        
        return placement
