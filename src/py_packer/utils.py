import math
from .types import Box3, Vec3

EPS = 1e-6

def vec3(x: float = 0, y: float = 0, z: float = 0) -> Vec3:
    return Vec3(x, y, z)

def box3(min_vec: Vec3, max_vec: Vec3) -> Box3:
    return Box3(min=min_vec, max=max_vec)

def get_box_dims(box: Box3) -> Vec3:
    return vec3(
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z
    )

def get_box_volume(box: Box3) -> float:
    dims = get_box_dims(box)
    return dims.x * dims.y * dims.z

def box_fits_in(inner_box: Box3, outer_box: Box3, tolerance: float = EPS) -> bool:
    """Check if inner_box is completely inside outer_box with a tolerance."""
    return (
        (inner_box.min.x + tolerance >= outer_box.min.x) and
        (inner_box.min.y + tolerance >= outer_box.min.y) and
        (inner_box.min.z + tolerance >= outer_box.min.z) and
        (inner_box.max.x - tolerance <= outer_box.max.x) and
        (inner_box.max.y - tolerance <= outer_box.max.y) and
        (inner_box.max.z - tolerance <= outer_box.max.z)
    )

def boxes_intersect(a: Box3, b: Box3, tolerance: float = EPS) -> bool:
    """Check if two boxes intersect with a tolerance."""
    return (
        (a.min.x + tolerance < b.max.x) and (a.max.x - tolerance > b.min.x) and
        (a.min.y + tolerance < b.max.y) and (a.max.y - tolerance > b.min.y) and
        (a.min.z + tolerance < b.max.z) and (a.max.z - tolerance > b.min.z)
    )

def get_longest_axis(box: Box3):
    dims = get_box_dims(box)
    if dims.x >= dims.y and dims.x >= dims.z:
        return 'x'
    if dims.y >= dims.x and dims.y >= dims.z:
        return 'y'
    return 'z'
