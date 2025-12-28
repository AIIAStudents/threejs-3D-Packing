"""
Utility functions for geometric calculations.
Ported from py_packer v1.
"""
from .types import Vec3, Box3

EPS = 1e-6  # Epsilon for floating point comparisons


def vec3(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Vec3:
    """Create a Vec3 instance"""
    return Vec3(x=x, y=y, z=z)


def box3(min_vec: Vec3, max_vec: Vec3) -> Box3:
    """Create a Box3 instance"""
    return Box3(min=min_vec, max=max_vec)


def get_box_dims(box: Box3) -> Vec3:
    """Get dimensions of a box"""
    return box.max - box.min


def get_box_volume(box: Box3) -> float:
    """Calculate volume of a box"""
    dims = get_box_dims(box)
    return dims.x * dims.y * dims.z


def box_fits_in(inner: Box3, outer: Box3) -> bool:
    """Check if inner box fits completely inside outer box"""
    return (
        inner.min.x >= outer.min.x - EPS and
        inner.min.y >= outer.min.y - EPS and
        inner.min.z >= outer.min.z - EPS and
        inner.max.x <= outer.max.x + EPS and
        inner.max.y <= outer.max.y + EPS and
        inner.max.z <= outer.max.z + EPS
    )


def boxes_intersect(box1: Box3, box2: Box3) -> bool:
    """Check if two boxes intersect (overlap)"""
    return not (
        box1.max.x <= box2.min.x + EPS or
        box1.min.x >= box2.max.x - EPS or
        box1.max.y <= box2.min.y + EPS or
        box1.min.y >= box2.max.y - EPS or
        box1.max.z <= box2.min.z + EPS or
        box1.min.z >= box2.max.z - EPS
    )
