from typing import List, Dict, Optional, Tuple
import math

from ..types import Item, Lane, Placement, Box3, Vec3
from ..partition.lane_manager import LaneManager
from ..utils import vec3, box3, get_box_dims, get_box_volume, box_fits_in, boxes_intersect, EPS

class ItemPlacer:
    def __init__(self, lane_manager: LaneManager):
        self.lane_manager = lane_manager
        self.placements: List[Placement] = []
        self.unplaced_item_ids: List[str] = []
        print("✅ ItemPlacer (v2, Grid Stacking) initialized.")

    def _stack_items_in_lane(self, items_to_pack: List[Item], lane: Lane) -> Tuple[List[Placement], List[str]]:
        """
        Stacks items within a single lane using a layered grid (Y->Z->X) approach.
        """
        if not items_to_pack:
            return [], []

        # 1. Sort items by volume (desc) for deterministic packing
        sorted_items = sorted(items_to_pack, key=lambda i: get_box_volume(Box3(min=Vec3(), max=i.dims)), reverse=True)

        # 2. Determine slot dimensions from the largest item in the batch
        max_w = max(item.dims.x for item in sorted_items)
        max_h = max(item.dims.y for item in sorted_items)
        max_d = max(item.dims.z for item in sorted_items)
        slot_dims = vec3(max_w, max_h, max_d)

        if slot_dims.x < EPS or slot_dims.y < EPS or slot_dims.z < EPS:
            print(f"[DEBUG] ⚠️ Skipping lane {lane.id} due to zero slot dimensions.")
            return [], [item.id for item in sorted_items]
        
        print(f"[DEBUG] Stacking in Lane '{lane.id}'. Slot dims: w={slot_dims.x:.2f}, h={slot_dims.y:.2f}, d={slot_dims.z:.2f}")

        lane_placements: List[Placement] = []
        placed_item_ids = set()

        # 3. Iterate through grid positions (Layers -> Rows -> Columns)
        current_y = lane.bounds.min.y
        while current_y + slot_dims.y <= lane.bounds.max.y + EPS:
            current_z = lane.bounds.min.z
            while current_z + slot_dims.z <= lane.bounds.max.z + EPS:
                current_x = lane.bounds.min.x
                while current_x + slot_dims.x <= lane.bounds.max.x + EPS:
                    
                    # 4. Try to place an item at this grid position
                    for item in sorted_items:
                        if item.id in placed_item_ids:
                            continue

                        item_pose = box3(
                            min_vec=vec3(current_x, current_y, current_z),
                            max_vec=vec3(current_x + item.dims.x, current_y + item.dims.y, current_z + item.dims.z)
                        )

                        if not box_fits_in(item_pose, lane.bounds):
                            continue

                        is_overlapping = False
                        for existing_placement in lane_placements:
                            if boxes_intersect(item_pose, existing_placement.pose):
                                is_overlapping = True
                                break
                        
                        if not is_overlapping:
                            placement = Placement(item_id=item.id, partition_id=lane.id, pose=item_pose)
                            lane_placements.append(placement)
                            placed_item_ids.add(item.id)
                            goto_next_position = True
                            break
                    else:
                        goto_next_position = False

                    current_x += slot_dims.x
                current_z += slot_dims.z
            current_y += slot_dims.y
        
        unplaced_ids = [item.id for item in sorted_items if item.id not in placed_item_ids]
        print(f"[DEBUG] Lane '{lane.id}' packing finished. Placed: {len(lane_placements)}, Unplaced: {len(unplaced_ids)}")
        return lane_placements, unplaced_ids

    def pack(self, items: List[Item], slot_dims: Vec3) -> Dict:
        """
        Main packing loop using logic based on item's 'confirmed' status.
        Dispatches items to the correct lane and uses the grid stacking strategy.
        """
        print(f"🚀 ItemPlacer starting to pack {len(items)} items with grid stacking logic...")

        unconfirmed_items = [item for item in items if not item.confirmed]
        confirmed_items_by_group: Dict[str, List[Item]] = {}
        for item in items:
            if item.confirmed:
                confirmed_items_by_group.setdefault(item.group_id, []).append(item)
        
        print(f"[DEBUG] Found {len(unconfirmed_items)} unconfirmed items and {len(confirmed_items_by_group)} confirmed groups.")

        for group_id, group_items in confirmed_items_by_group.items():
            lane_id = f"LANE_{group_id}"
            target_lane = self.lane_manager.lanes.get(lane_id)
            
            if target_lane:
                print(f"[DEBUG] Packing {len(group_items)} confirmed items for group '{group_id}' into lane '{lane_id}'...")
                placements, unplaced = self._stack_items_in_lane(group_items, target_lane)
                self.placements.extend(placements)
                self.unplaced_item_ids.extend(unplaced)
            else:
                print(f"[DEBUG] ⚠️ No lane found for group '{group_id}'. Marking {len(group_items)} items as unplaced.")
                self.unplaced_item_ids.extend([item.id for item in group_items])

        deferred_lane = self.lane_manager.lanes.get("LANE_DEFERRED")
        if deferred_lane and unconfirmed_items:
            lane_dims = get_box_dims(deferred_lane.bounds)
            print(f"[DEBUG] 📦 Packing {len(unconfirmed_items)} unconfirmed items into deferred lane '{deferred_lane.id}'.")
            print(f"[DEBUG] Deferred lane dims: w={lane_dims.x:.2f}, h={lane_dims.y:.2f}, d={lane_dims.z:.2f}")
            placements, unplaced = self._stack_items_in_lane(unconfirmed_items, deferred_lane)
            self.placements.extend(placements)
            self.unplaced_item_ids.extend(unplaced)
        elif unconfirmed_items:
            print(f"[DEBUG] ⚠️ No deferred lane found for {len(unconfirmed_items)} unconfirmed items. Marking as unplaced.")
            self.unplaced_item_ids.extend([item.id for item in unconfirmed_items])

        print(f"✅ ItemPlacer finished packing.")
        print(f"  - Total Placed: {len(self.placements)}")
        print(f"  - Total Unplaced: {len(self.unplaced_item_ids)}")

        placed_item_dims = {item.id: item.dims for item in items}
        total_used_volume = sum(
            get_box_volume(Box3(min=Vec3(), max=placed_item_dims[p.item_id]))
            for p in self.placements
        )

        return {
            "placements": self.placements,
            "unplaced_item_ids": self.unplaced_item_ids,
            "total_used_volume": total_used_volume,
            "borrow_ops": [],
            "spill_ops": []
        }
