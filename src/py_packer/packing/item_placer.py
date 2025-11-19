from typing import List, Dict, Optional, Tuple
import math
from collections import Counter

from ..types import Item, Lane, Placement, Box3, Vec3
from ..partition.lane_manager import LaneManager
from ..utils import vec3, box3, get_box_dims, get_box_volume, box_fits_in, boxes_intersect, EPS
from api_server.logger import log, LOG_VERBOSE

class ItemPlacer:
    def __init__(self, lane_manager: Optional[LaneManager]):
        self.lane_manager = lane_manager
        self.placements: List[Placement] = []
        self.unplaced_item_ids: List[str] = []
        # No print statement here, initialization should be silent.

    def _stack_items_in_lane(self, items_to_pack: List[Item], lane: Lane, trace_id: str) -> Tuple[List[Placement], List[str]]:
        """
        在單一 lane 中使用分層網格法 (Y->Z->X) 堆疊物品。
        """
        if not items_to_pack:
            return [], []

        sorted_items = sorted(items_to_pack, key=lambda i: get_box_volume(Box3(min=Vec3(), max=i.dims)), reverse=True)

        max_w = max((item.dims.x for item in sorted_items), default=0)
        max_h = max((item.dims.y for item in sorted_items), default=0)
        max_d = max((item.dims.z for item in sorted_items), default=0)
        slot_dims = vec3(max_w, max_h, max_d)

        if slot_dims.x < EPS or slot_dims.y < EPS or slot_dims.z < EPS:
            log('WARN', 'ItemPlacer', trace_id, '偵測到零尺寸slot，跳過lane', lane_id=lane.id)
            return [], [item.id for item in sorted_items]

        if LOG_VERBOSE:
            log('INFO', 'ItemPlacer', trace_id, '開始在Lane中堆疊',
                lane_id=lane.id,
                item_count=len(sorted_items),
                slot_dims={'w': round(slot_dims.x,2), 'h': round(slot_dims.y,2), 'd': round(slot_dims.z,2)}
            )

        lane_placements: List[Placement] = []
        placed_item_ids = set()
        
        # 3. 遍歷網格位置 (層 -> 行 -> 列)
        current_y = lane.bounds.min.y
        while current_y + slot_dims.y <= lane.bounds.max.y + EPS:
            current_z = lane.bounds.min.z
            while current_z + slot_dims.z <= lane.bounds.max.z + EPS:
                current_x = lane.bounds.min.x
                while current_x + slot_dims.x <= lane.bounds.max.x + EPS:
                    
                    # 4. 嘗試在此網格位置放置物品
                    for item in sorted_items:
                        if item.id in placed_item_ids:
                            continue

                        item_pose = box3(
                            min_vec=vec3(current_x, current_y, current_z),
                            max_vec=vec3(current_x + item.dims.x, current_y + item.dims.y, current_z + item.dims.z)
                        )

                        if not box_fits_in(item_pose, lane.bounds):
                            continue

                        is_overlapping = any(boxes_intersect(item_pose, p.pose) for p in lane_placements)
                        
                        if not is_overlapping:
                            placement = Placement(item_id=item.id, partition_id=lane.id, pose=item_pose)
                            lane_placements.append(placement)
                            placed_item_ids.add(item.id)
                            break # 成功放置，跳到下一個網格位置
                    
                    current_x += slot_dims.x
                current_z += slot_dims.z
            current_y += slot_dims.y
        
        unplaced_ids = [item.id for item in sorted_items if item.id not in placed_item_ids]
        
        log('INFO', 'ItemPlacer', trace_id, 'Lane堆疊結束',
            lane_id=lane.id,
            placed_count=len(lane_placements),
            unplaced_count=len(unplaced_ids)
        )
        return lane_placements, unplaced_ids

    def pack(self, items: List[Item], slot_dims: Vec3, trace_id: str) -> Dict:
        """
        主打包迴圈，根據物品的 'confirmed' 狀態分派任務。
        """
        log('INFO', 'ItemPlacer', trace_id, '開始主打包流程', item_count=len(items))

        unconfirmed_items = [item for item in items if not item.confirmed]
        confirmed_items_by_group: Dict[str, List[Item]] = {}
        for item in items:
            if item.confirmed:
                confirmed_items_by_group.setdefault(item.group_id, []).append(item)
        
        if LOG_VERBOSE:
            log('INFO', 'ItemPlacer', trace_id, '物品分類統計',
                unconfirmed_count=len(unconfirmed_items),
                confirmed_groups=list(confirmed_items_by_group.keys())
            )

        for group_id, group_items in confirmed_items_by_group.items():
            lane_id = f"LANE_{group_id}"
            target_lane = self.lane_manager.lanes.get(lane_id)
            
            if target_lane:
                placements, unplaced = self._stack_items_in_lane(group_items, target_lane, trace_id)
                self.placements.extend(placements)
                self.unplaced_item_ids.extend(unplaced)
            else:
                log('WARN', 'ItemPlacer', trace_id, '找不到對應Lane，物品標記為未放置',
                    group_id=group_id,
                    item_count=len(group_items)
                )
                self.unplaced_item_ids.extend([item.id for item in group_items])

        deferred_lane = self.lane_manager.lanes.get("LANE_DEFERRED")
        if deferred_lane and unconfirmed_items:
            placements, unplaced = self._stack_items_in_lane(unconfirmed_items, deferred_lane, trace_id)
            self.placements.extend(placements)
            self.unplaced_item_ids.extend(unplaced)
        elif unconfirmed_items:
            log('WARN', 'ItemPlacer', trace_id, '找不到延遲Lane，未確認物品標記為未放置',
                item_count=len(unconfirmed_items)
            )
            self.unplaced_item_ids.extend([item.id for item in unconfirmed_items])

        placed_item_dims = {item.id: item.dims for item in items}
        total_used_volume = sum(
            get_box_volume(Box3(min=Vec3(), max=placed_item_dims[p.item_id]))
            for p in self.placements if p.item_id in placed_item_dims
        )
        
        log('INFO', 'ItemPlacer', trace_id, '主打包流程結束',
            total_placed=len(self.placements),
            total_unplaced=len(self.unplaced_item_ids),
            total_used_volume=round(total_used_volume, 2)
        )

        return {
            "placements": self.placements,
            "unplaced_item_ids": self.unplaced_item_ids,
            "total_used_volume": total_used_volume,
            "borrow_ops": [],
            "spill_ops": []
        }
