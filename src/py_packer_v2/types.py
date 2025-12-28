"""
Data types for the packing algorithm.
Simplified version ported from py_packer v1.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal, Union


@dataclass
class Vec3:
    """3D Vector"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __sub__(self, other):
        if not isinstance(other, Vec3):
            return NotImplemented
        return Vec3(self.x - other.x, self.y - other.y, self.z - other.z)


@dataclass
class Box3:
    """3D Bounding Box"""
    min: Vec3
    max: Vec3


@dataclass
class Item:
    """Item to be packed"""
    id: str
    group_id: str
    dims: Vec3
    rotatable: bool = True
    weight: int = 0
    order: int = 0
    meta: Dict[str, any] = field(default_factory=dict)


@dataclass
class Group:
    """Group of items"""
    id: str
    name: str
    reserve_ratio: float = 0.0
    weight: int = 0


@dataclass
class Container:
    """Container/Warehouse bounds"""
    id: str
    bounds: Box3


@dataclass
class Placement:
    """Placement result for a single item"""
    item_id: str
    pose: Box3
    zone_id: Optional[str] = None


@dataclass
class PackedObject:
    """Successfully packed item"""
    item_id: str
    is_packed: Literal[True] = True
    pose: Box3 = field(default_factory=lambda: Box3(min=Vec3(), max=Vec3()))
    zone_id: Optional[str] = None


@dataclass
class UnpackedObject:
    """Item that could not be packed"""
    item_id: str
    is_packed: Literal[False] = False
    reason: str = 'NO_SPACE_AVAILABLE'


@dataclass
class PackingResult:
    """Complete packing result"""
    job_id: str
    success: bool
    message: str
    total_volume: float
    used_volume: float
    volume_utilization: float
    execution_time_ms: float
    packed_count: int
    unpacked_count: int
    items: List[Union[PackedObject, UnpackedObject]]
