"""
Simplified packing algorithm using grid-based stacking.
High CP value: fast, simple, maintainable.
"""
from typing import List, Tuple
from .types import Item, Box3, Placement, Vec3
from .utils import vec3, box3, get_box_volume, box_fits_in, boxes_intersect, EPS


def pack_items_simple(items: List[Item], container_bounds: Box3) -> Tuple[List[Placement], List[str]]:
    """
    Pack items into container using a simple grid-based stacking algorithm.
    
    Strategy:
    1. Sort items by volume (largest first)
    2. Calculate grid slot size based on largest item dimensions
    3. Try to place each item in grid positions (Y->Z->X order)
    4. Skip positions that cause overlaps
    
    Args:
        items: List of items to pack (already sorted by user-defined order)
        container_bounds: Container bounding box
        
    Returns:
        Tuple of (placements, unplaced_item_ids)
    """
    if not items:
        return [], []
    
    # Sort by volume (largest first) for better space utilization
    # But preserve original order information in metadata
    sorted_items = sorted(items, key=lambda i: get_box_volume(Box3(min=Vec3(), max=i.dims)), reverse=True)
    
    # Calculate slot dimensions based on largest item
    max_w = max((item.dims.x for item in sorted_items), default=0)
    max_h = max((item.dims.y for item in sorted_items), default=0)
    max_d = max((item.dims.z for item in sorted_items), default=0)
    slot_dims = vec3(max_w, max_h, max_d)
    
    # Validate slot dimensions
    if slot_dims.x < EPS or slot_dims.y < EPS or slot_dims.z < EPS:
        print(f"Warning: Invalid slot dimensions {slot_dims}, cannot pack items")
        return [], [item.id for item in sorted_items]
    
    placements: List[Placement] = []
    placed_item_ids = set()
    
    # Grid-based placement loop: Z(外層) → X(中層) → Y(內層)
    # 這樣實現「先填滿 XY 平面，再往 Z 軸堆疊」
    
    current_z = container_bounds.min.z
    while current_z + slot_dims.z <= container_bounds.max.z + EPS:
        
        current_x = container_bounds.min.x
        while current_x + slot_dims.x <= container_bounds.max.x + EPS:
            
            current_y = container_bounds.min.y
            while current_y + slot_dims.y <= container_bounds.max.y + EPS:
                
                # Try to place an item at this grid position
                for item in sorted_items:
                    if item.id in placed_item_ids:
                        continue
                    
                    # Calculate item pose at current position
                    item_pose = box3(
                        min_vec=vec3(current_x, current_y, current_z),
                        max_vec=vec3(current_x + item.dims.x, current_y + item.dims.y, current_z + item.dims.z)
                    )
                    
                    # Check if item fits in container
                    if not box_fits_in(item_pose, container_bounds):
                        continue
                    
                    # Check for overlaps with already placed items
                    is_overlapping = any(boxes_intersect(item_pose, p.pose) for p in placements)
                    
                    if not is_overlapping:
                        # Successfully place the item
                        placement = Placement(item_id=item.id, pose=item_pose)
                        placements.append(placement)
                        placed_item_ids.add(item.id)
                        break  # Move to next grid position
                
                current_y += slot_dims.y
            current_x += slot_dims.x
        current_z += slot_dims.z

    
    # Collect unplaced items
    unplaced_ids = [item.id for item in sorted_items if item.id not in placed_item_ids]
    
    print(f"Packing complete: {len(placements)} placed, {len(unplaced_ids)} unplaced")
    return placements, unplaced_ids
