import math
import copy
from typing import List, Dict, Optional

from ..types import Warehouse, Group, Item, Aisle, Lane, Slot, Box3, Vec3, BSPNode
from .bsp_tree import BSPTree
from ..utils import vec3, box3, get_box_volume, get_box_dims

EPS = 1e-6
MIN_THICKNESS = 0.05  # 5cm

# Define a constant for the deferred group ID to prevent typos
DEFERRED_GROUP_ID = "DEFERRED_PLACEMENT"

# Define a color palette for visualization
LANE_COLOR_PALETTE = {
    DEFERRED_GROUP_ID: "#E74C3C",  # Red
    "DEFAULT": "#3498DB",             # Blue
    "G1": "#F1C40F",                  # Yellow
    "G2": "#2ECC71",                  # Green
    "G3": "#9B59B6",                  # Purple
    "G4": "#E67E22",                  # Orange
}

class LaneManager:
    def __init__(self, warehouse: Warehouse, aisles: List[Aisle]):
        self.warehouse_bounds = warehouse.bounds
        self.lanes: Dict[str, Lane] = {}
        print("✅ LaneManager (v6, Enriched Meta) initialized.")

    def plan_lanes(self, groups: List[Group], items: List[Item]):
        """
        Plans and allocates lanes, enriching them with metadata for frontend visualization.
        """
        print("🚀 Starting lane planning (v6, Enriched Meta).")

        # 1. Calculate volume demands
        vol_demand = self._calculate_volume_demands(groups, items)
        total_demand_vol = vol_demand['total_confirmed'] + vol_demand['total_unconfirmed']

        if total_demand_vol < EPS:
            print("⚠️ No items with volume found. Skipping lane planning.")
            return

        # 2. Determine allocation ratios
        confirmed_ratio = vol_demand['total_confirmed'] / total_demand_vol
        unconfirmed_ratio = vol_demand['total_unconfirmed'] / total_demand_vol

        print(f"📊 Volume Ratios: Confirmed={confirmed_ratio:.2%}, Unconfirmed={unconfirmed_ratio:.2%}")

        # 3. Partition the main warehouse space
        warehouse_dims = get_box_dims(self.warehouse_bounds)
        split_axis = 'x'
        total_width = getattr(warehouse_dims, split_axis)

        if total_width < EPS:
            print("⚠️ Warehouse has zero width. Skipping lane planning.")
            return

        confirmed_width = total_width * confirmed_ratio
        unconfirmed_width = total_width * unconfirmed_ratio

        current_x = self.warehouse_bounds.min.x

        # 4. Create the 'unconfirmed' (deferred) lane if needed
        if unconfirmed_width > MIN_THICKNESS:
            unconfirmed_max_x = current_x + unconfirmed_width
            self._create_lane(
                lane_id="LANE_DEFERRED",
                group_id=DEFERRED_GROUP_ID,
                bounds=box3(
                    min_vec=vec3(current_x, self.warehouse_bounds.min.y, self.warehouse_bounds.min.z),
                    max_vec=vec3(unconfirmed_max_x, self.warehouse_bounds.max.y, self.warehouse_bounds.max.z)
                ),
                access_cost=100.0,
                mode='overflow-lane',
                total_warehouse_width=total_width,
                label_override="Deferred"
            )
            current_x = unconfirmed_max_x

        # 5. Partition the 'confirmed' space for each group
        if confirmed_width > MIN_THICKNESS:
            confirmed_space_bounds = box3(
                min_vec=vec3(current_x, self.warehouse_bounds.min.y, self.warehouse_bounds.min.z),
                max_vec=vec3(self.warehouse_bounds.max.x, self.warehouse_bounds.max.y, self.warehouse_bounds.max.z)
            )
            self._partition_confirmed_space(confirmed_space_bounds, vol_demand['groups'], total_width)

        print("✅ Lane planning finished.")

    def _calculate_volume_demands(self, groups: List[Group], items: List[Item]) -> Dict:
        """Calculates the required volume for each group and for all unconfirmed items."""
        volume_demands = {
            'total_confirmed': 0.0,
            'total_unconfirmed': 0.0,
            'groups': {}
        }
        
        # Initialize group demands
        for group in groups:
            volume_demands['groups'][group.id] = 0.0

        for item in items:
            item_vol = get_box_volume(Box3(min=Vec3(0,0,0), max=item.dims))
            if item.confirmed:
                if item.group_id in volume_demands['groups']:
                    volume_demands['groups'][item.group_id] += item_vol
                    volume_demands['total_confirmed'] += item_vol
            else:
                volume_demands['total_unconfirmed'] += item_vol
        
        return volume_demands

    def _partition_confirmed_space(self, space_bounds: Box3, group_demands: Dict[str, float], total_warehouse_width: float):
        """Divides the confirmed space and creates lanes with rich metadata."""
        total_confirmed_vol = sum(group_demands.values())
        if total_confirmed_vol < EPS:
            return

        space_dims = get_box_dims(space_bounds)
        total_confirmed_width = space_dims.x
        current_x = space_bounds.min.x

        groups_to_plan = {gid: vol for gid, vol in group_demands.items() if vol > EPS}
        
        print(f"📦 Partitioning confirmed space of width {total_confirmed_width:.2f} for {len(groups_to_plan)} groups.")

        for i, (group_id, demand_vol) in enumerate(groups_to_plan.items()):
            ratio_of_confirmed_space = demand_vol / total_confirmed_vol
            lane_width = total_confirmed_width * ratio_of_confirmed_space
            
            lane_max_x = current_x + lane_width
            # Ensure the last lane extends to the end to prevent floating point gaps
            if i == len(groups_to_plan) - 1:
                lane_max_x = space_bounds.max.x

            if lane_width > MIN_THICKNESS:
                self._create_lane(
                    lane_id=f"LANE_{group_id}",
                    group_id=group_id,
                    bounds=box3(
                        min_vec=vec3(current_x, space_bounds.min.y, space_bounds.min.z),
                        max_vec=vec3(lane_max_x, space_bounds.max.y, space_bounds.max.z)
                    ),
                    access_cost=10.0,
                    mode='pallet-lane',
                    total_warehouse_width=total_warehouse_width
                )
            current_x = lane_max_x

    def _create_lane(self, lane_id: str, group_id: str, bounds: Box3, access_cost: float, mode: str, total_warehouse_width: float, label_override: Optional[str] = None):
        """Helper to create and register a new lane with rich metadata."""
        lane_dims = get_box_dims(bounds)
        lane_vol = get_box_volume(bounds)

        if lane_vol < EPS:
            print(f"⚠️ Skipping creation of lane {lane_id} due to zero volume.")
            return

        # Calculate ratio based on width
        ratio = lane_dims.x / total_warehouse_width if total_warehouse_width > EPS else 0

        # Create label
        if label_override:
            label = f"{label_override} ({ratio:.1%})"
        else:
            label = f"{group_id} ({ratio:.1%})"

        # Create meta dictionary
        meta = {
            "volume": round(lane_vol, 2),
            "ratio": round(ratio, 4),
            "width": round(lane_dims.x, 2),
            "height": round(lane_dims.y, 2),
            "depth": round(lane_dims.z, 2),
            "label": label,
            "color": LANE_COLOR_PALETTE.get(group_id, LANE_COLOR_PALETTE["DEFAULT"])
        }

        lane = Lane(
            id=lane_id,
            group_id=group_id,
            frontage_axis='x',
            bounds=bounds,
            capacity_slots=1000,
            access_cost=access_cost,
            last_used_ts=0,
            mode=mode,
            meta=meta  # Add the metadata here
        )
        self.lanes[lane_id] = lane
        print(f"  -> Created Lane '{lane_id}' for Group '{group_id}' (Width: {lane_dims.x:.2f}, Ratio: {ratio:.2%})")