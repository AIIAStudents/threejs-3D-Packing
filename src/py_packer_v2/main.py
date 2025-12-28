"""
Main entry point for packing execution.
Called by the API server to perform packing operations.
"""
import time
import dataclasses
from typing import List, Dict, Any

from .types import Item, Container, PackingResult, PackedObject, UnpackedObject, Vec3, Box3
from .packer import pack_items_simple
from .utils import vec3, box3, get_box_volume


def execute_packing(items_data: List[Dict], groups_data: List[Dict], container_data: Dict) -> Dict[str, Any]:
    """
    Execute packing algorithm with data from database.
    
    Args:
        items_data: List of item dictionaries from DB
        groups_data: List of group dictionaries from DB
        container_data: Container dictionary from DB
        
    Returns:
        Dictionary containing PackingResult (serializable to JSON)
    """
    print(f"🚀 Starting packing execution with {len(items_data)} items")
    start_time = time.perf_counter()
    
    # 1. Convert DB data to algorithm data structures
    items = []
    for item_dict in items_data:
        item = Item(
            id=str(item_dict['id']),
            group_id=str(item_dict['group_id']),
            dims=vec3(
                float(item_dict.get('length', 0)),
                float(item_dict.get('height', 0)),
                float(item_dict.get('width', 0))
            ),
            order=int(item_dict.get('item_order', 0)),
            rotatable=True,
            weight=int(item_dict.get('weight', 0))
        )
        items.append(item)
    
    # Sort items by user-defined order
    items.sort(key=lambda x: x.order)
    
    # Parse container bounds
    if container_data and 'parameters' in container_data:
        params = container_data['parameters']
        
        # 支援多種參數名稱格式（前端使用 widthX/heightY/depthZ）
        width_x = float(params.get('widthX') or params.get('length') or params.get('width', 100))
        height_y = float(params.get('heightY') or params.get('height', 50))
        depth_z = float(params.get('depthZ') or params.get('depth', 60))
        
        container_bounds = box3(
            min_vec=vec3(0, 0, 0),
            max_vec=vec3(width_x, height_y, depth_z)
        )
        
        print(f"📦 Container bounds: X={width_x}, Y={height_y}, Z={depth_z}")
    else:
        # Default container size
        container_bounds = box3(min_vec=vec3(0, 0, 0), max_vec=vec3(100, 50, 60))
    
    container = Container(id="container_1", bounds=container_bounds)
    
    # 2. Execute packing algorithm
    placements, unplaced_ids = pack_items_simple(items, container.bounds)
    
    # 3. Calculate metrics
    end_time = time.perf_counter()
    execution_time_ms = (end_time - start_time) * 1000
    
    total_volume = get_box_volume(container.bounds)
    
    # Calculate used volume from placed items
    item_dims_map = {item.id: item.dims for item in items}
    used_volume = sum(
        get_box_volume(Box3(min=Vec3(), max=item_dims_map[p.item_id]))
        for p in placements if p.item_id in item_dims_map
    )
    
    volume_utilization = (used_volume / total_volume) if total_volume > 0 else 0
    
    # 4. Build result objects
    packed_objects = [
        PackedObject(
            item_id=p.item_id,
            pose=p.pose,
            zone_id=p.zone_id
        )
        for p in placements
    ]
    
    unpacked_objects = [
        UnpackedObject(item_id=item_id)
        for item_id in unplaced_ids
    ]
    
    result = PackingResult(
        job_id=f"job_{int(time.time())}",
        success=len(unpacked_objects) == 0,
        message=f"Packing complete. {len(packed_objects)} items packed, {len(unpacked_objects)} unpacked.",
        total_volume=total_volume,
        used_volume=used_volume,
        volume_utilization=volume_utilization,
        execution_time_ms=execution_time_ms,
        packed_count=len(packed_objects),
        unpacked_count=len(unpacked_objects),
        items=packed_objects + unpacked_objects
    )
    
    print(f"✅ Packing execution complete in {execution_time_ms:.2f}ms")
    print(f"   Packed: {len(packed_objects)}, Unpacked: {len(unpacked_objects)}")
    print(f"   Volume utilization: {volume_utilization*100:.2f}%")
    
    # 5. Convert to JSON-serializable dict
    return dataclasses.asdict(result)
