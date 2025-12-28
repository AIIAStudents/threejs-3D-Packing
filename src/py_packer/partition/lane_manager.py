import math
import copy
from typing import List, Dict, Optional

from ..types import Warehouse, Group, Item, Aisle, Lane, Slot, Box3, Vec3, BSPNode
from .bsp_tree import BSPTree
from ..utils import vec3, box3, get_box_volume, get_box_dims
from api_server.logger import log, LOG_VERBOSE

EPS = 1e-6
MIN_THICKNESS = 0.05  # 5cm

DEFERRED_GROUP_ID = "DEFERRED_PLACEMENT"

LANE_COLOR_PALETTE = {
    DEFERRED_GROUP_ID: "#E74C3C",
    "DEFAULT": "#3498DB",
    "G1": "#F1C40F", "G2": "#2ECC71", "G3": "#9B59B6", "G4": "#E67E22",
}

class LaneManager:
    def __init__(self, warehouse: Warehouse, aisles: List[Aisle]):
        self.warehouse_bounds = warehouse.bounds
        self.lanes: Dict[str, Lane] = {}
        # Initialization should be silent.

    def plan_lanes(self, groups: List[Group], items: List[Item], trace_id: str):
        """
        規劃並分配 lanes，同時為前端視覺化豐富元數據。
        """
        log('INFO', 'LaneManager', trace_id, '開始規劃Lane')

        vol_demand = self._calculate_volume_demands(groups, items)
        total_demand_vol = vol_demand['total_confirmed'] + vol_demand['total_unconfirmed']

        if total_demand_vol < EPS:
            log('WARN', 'LaneManager', trace_id, '總需求體積為零，跳過Lane規劃')
            return

        confirmed_ratio = vol_demand['total_confirmed'] / total_demand_vol
        unconfirmed_ratio = vol_demand['total_unconfirmed'] / total_demand_vol

        log('INFO', 'LaneManager', trace_id, '體積需求計算完成',
            total_volume=round(total_demand_vol, 2),
            confirmed_ratio=round(confirmed_ratio, 4),
            unconfirmed_ratio=round(unconfirmed_ratio, 4)
        )

        warehouse_dims = get_box_dims(self.warehouse_bounds)
        split_axis = 'x'
        total_width = getattr(warehouse_dims, split_axis)

        if total_width < EPS:
            log('WARN', 'LaneManager', trace_id, '倉庫寬度為零，跳過Lane規劃')
            return

        confirmed_width = total_width * confirmed_ratio
        unconfirmed_width = total_width * unconfirmed_ratio
        current_x = self.warehouse_bounds.min.x

        if unconfirmed_width > MIN_THICKNESS:
            unconfirmed_max_x = current_x + unconfirmed_width
            self._create_lane(
                lane_id="LANE_DEFERRED", group_id=DEFERRED_GROUP_ID,
                bounds=box3(
                    min_vec=vec3(current_x, self.warehouse_bounds.min.y, self.warehouse_bounds.min.z),
                    max_vec=vec3(unconfirmed_max_x, self.warehouse_bounds.max.y, self.warehouse_bounds.max.z)
                ),
                access_cost=100.0, mode='overflow-lane', total_warehouse_width=total_width,
                trace_id=trace_id, label_override="延遲"
            )
            current_x = unconfirmed_max_x

        if confirmed_width > MIN_THICKNESS:
            confirmed_space_bounds = box3(
                min_vec=vec3(current_x, self.warehouse_bounds.min.y, self.warehouse_bounds.min.z),
                max_vec=vec3(self.warehouse_bounds.max.x, self.warehouse_bounds.max.y, self.warehouse_bounds.max.z)
            )
            self._partition_confirmed_space(confirmed_space_bounds, vol_demand['groups'], total_width, trace_id)

        log('INFO', 'LaneManager', trace_id, 'Lane規劃結束', created_lanes=list(self.lanes.keys()))

    def _calculate_volume_demands(self, groups: List[Group], items: List[Item]) -> Dict:
        volume_demands = {'total_confirmed': 0.0, 'total_unconfirmed': 0.0, 'groups': {g.id: 0.0 for g in groups}}
        for item in items:
            item_vol = get_box_volume(Box3(min=Vec3(0,0,0), max=item.dims))
            if item.confirmed:
                if item.group_id in volume_demands['groups']:
                    volume_demands['groups'][item.group_id] += item_vol
                    volume_demands['total_confirmed'] += item_vol
            else:
                volume_demands['total_unconfirmed'] += item_vol
        return volume_demands

    def _partition_confirmed_space(self, space_bounds: Box3, group_demands: Dict[str, float], total_warehouse_width: float, trace_id: str):
        total_confirmed_vol = sum(group_demands.values())
        if total_confirmed_vol < EPS: return

        space_dims = get_box_dims(space_bounds)
        total_confirmed_width = space_dims.x
        current_x = space_bounds.min.x
        groups_to_plan = {gid: vol for gid, vol in group_demands.items() if vol > EPS}
        
        log('INFO', 'LaneManager', trace_id, '開始分割已確認空間',
            space_width=round(total_confirmed_width, 2),
            group_count=len(groups_to_plan)
        )

        for i, (group_id, demand_vol) in enumerate(groups_to_plan.items()):
            ratio = demand_vol / total_confirmed_vol
            lane_width = total_confirmed_width * ratio
            lane_max_x = current_x + lane_width
            if i == len(groups_to_plan) - 1: lane_max_x = space_bounds.max.x

            if lane_width > MIN_THICKNESS:
                self._create_lane(
                    lane_id=f"LANE_{group_id}", group_id=group_id,
                    bounds=box3(
                        min_vec=vec3(current_x, space_bounds.min.y, space_bounds.min.z),
                        max_vec=vec3(lane_max_x, space_bounds.max.y, space_bounds.max.z)
                    ),
                    access_cost=10.0, mode='pallet-lane', total_warehouse_width=total_warehouse_width, trace_id=trace_id
                )
            current_x = lane_max_x

    def _create_lane(self, lane_id: str, group_id: str, bounds: Box3, access_cost: float, mode: str, total_warehouse_width: float, trace_id: str, label_override: Optional[str] = None):
        lane_dims = get_box_dims(bounds)
        lane_vol = get_box_volume(bounds)

        if lane_vol < EPS:
            log('WARN', 'LaneManager', trace_id, 'Lane體積為零，跳過建立', lane_id=lane_id)
            return

        ratio = lane_dims.x / total_warehouse_width if total_warehouse_width > EPS else 0
        label = f"{label_override} ({ratio:.1%})" if label_override else f"{group_id} ({ratio:.1%})"

        meta = {
            "volume": round(lane_vol, 2), "ratio": round(ratio, 4),
            "width": round(lane_dims.x, 2), "height": round(lane_dims.y, 2), "depth": round(lane_dims.z, 2),
            "label": label, "color": LANE_COLOR_PALETTE.get(group_id, LANE_COLOR_PALETTE["DEFAULT"])
        }

        self.lanes[lane_id] = Lane(
            id=lane_id, group_id=group_id, frontage_axis='x', bounds=bounds,
            capacity_slots=1000, access_cost=access_cost, last_used_ts=0, mode=mode, meta=meta
        )
        if LOG_VERBOSE:
            log('INFO', 'LaneManager', trace_id, '成功建立Lane',
                lane_id=lane_id, group_id=group_id, width=meta['width'], ratio=meta['ratio']
            )