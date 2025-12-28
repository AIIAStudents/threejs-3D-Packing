from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Union

@dataclass
class Vec3:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __sub__(self, other):
        if not isinstance(other, Vec3):
            return NotImplemented
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)

@dataclass
class Box3:
    min: Vec3
    max: Vec3

@dataclass
class Warehouse:
    id: str
    bounds: Box3
    overflow_partition_id: Optional[str] = None

@dataclass
class Group:
    id: str
    name: str
    reserve_ratio: float
    weight: int = 0
    min_volume: Optional[float] = None # FIX: Add minimum guaranteed volume

@dataclass
class Item:
    id: str
    group_id: str
    dims: Vec3
    rotatable: bool = True
    weight: int = 0
    confirmed: bool = False
    meta: Dict[str, any] = field(default_factory=dict)

@dataclass
class EPState:
    points: List[Vec3]
    placed_item_ids: List[str] = field(default_factory=list)

@dataclass
class Partition:
    id: str
    bounds: Box3
    group_id: Optional[str] = None
    reserved_volume: float = 0.0
    used_volume: float = 0.0
    borrowed_in_volume: float = 0.0
    borrowed_out_volume: float = 0.0
    ep_state: EPState = field(default_factory=lambda: EPState(points=[]))
    neighbors: List[str] = field(default_factory=list)

@dataclass
class BSPNode:
    id: str
    bounds: Box3
    left: Optional['BSPNode'] = None
    right: Optional['BSPNode'] = None
    axis: Optional[Literal['x', 'y', 'z']] = None
    split_value: Optional[float] = None
    partition_id: Optional[str] = None

@dataclass
class Placement:
    item_id: str
    partition_id: str
    pose: Box3

# --- API Output Contracts ---

@dataclass
class PackedObject:
    item_id: str
    partition_id: str
    is_packed: Literal[True] = True
    pose: Box3 = field(default_factory=lambda: Box3(min=Vec3(), max=Vec3()))

@dataclass
class UnpackedObject:
    item_id: str
    is_packed: Literal[False] = False
    reason: str = 'NO_SPACE_AVAILABLE'

@dataclass
class PackingResult:
    job_id: str
    success: bool
    message: str
    total_volume: float
    used_volume: float
    volume_utilization: float
    execution_time_ms: float
    items: List[Union[PackedObject, UnpackedObject]]
    borrow_ops: List[Dict[str, any]] = field(default_factory=list)
    spill_ops: List[Dict[str, any]] = field(default_factory=list)
    partitions: List[Dict[str, any]] = field(default_factory=list)


# --- New Data Models for Lane-based Warehouse Management ---

@dataclass
class Aisle:
    id: str
    line: str  # 'x' or 'y' 走向
    coord: float  # 走道在空間中的坐標 (例如 x = 0 的走道)

@dataclass
class Lane:  # 車道（對應 LIFO 堆疊）
    id: str
    group_id: Optional[str]
    frontage_axis: str  # 與走道相垂直的軸，如 'x'
    bounds: Box3        # 寬×高×深
    capacity_slots: int # 槽位數（可放幾托/幾箱）
    access_cost: float  # 可及性成本（越小越好）
    last_used_ts: float
    mode: str           # 'pallet-lane' | 'shelf-pick' | 'bulk-overflow'
    meta: Dict[str, any] = field(default_factory=dict)

@dataclass
class Slot:  # 具體的取放單位
    id: str
    lane_id: str
    depth_index: int  # 0 = 最前端（最容易拿）
    occupied_item_id: Optional[str]
