import math
import time
import traceback
from typing import Dict, List, Any
from collections import Counter

# 確保 py_packer 可以被找到
import sys
import os
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# 導入日誌與類型
from api_server.logger import log, LOG_VERBOSE
from py_packer.packing.item_placer import ItemPlacer
from py_packer.types import Item, Vec3, Lane, Box3
from py_packer.utils import vec3, get_box_volume

def is_finite_vec3(v: Dict[str, float]) -> bool:
    """Checks if all components of a vector dictionary are finite numbers."""
    return all(map(math.isfinite, [v.get('x', float('inf')), v.get('y', float('inf')), v.get('z', float('inf'))]))

def run_packing_from_request(request_data: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    """
    接收來自 API 的請求，處理每個 zone 作為獨立的打包空間，並回傳打包結果。
    """
    t_start = time.time()
    log('INFO', 'PackerService', trace_id, '開始執行打包服務')

    try:
        container_spec = request_data.get('container_size')
        items_data = request_data.get('objects', [])
        raw_zones = request_data.get('zones', [])

        if not container_spec:
            raise ValueError("請求資料中必須包含 'container_size'")

        # 如果沒有 zones，則將整個容器視為一個 zone
        zones = raw_zones or [{
            "id": "WHOLE_CONTAINER",
            "world_bounds": {
                "x": 0, "y": 0, "z": 0,
                "width": float(container_spec.get('width', 1000)),
                "height": float(container_spec.get('height', 1000)),
                "depth": float(container_spec.get('depth', 1000))
            },
            # 將所有物件的 group_id 都加入，確保所有物件都能被打包
            "group_ids": list(set(item.get('group_id', 'G1') for item in items_data))
        }]

        if not items_data:
            log('WARN', 'PackerService', trace_id, '沒有物件需要打包，提前結束')
            return {"success": True, "message": "沒有提供需要打包的物件。", "packed_objects": [], "partitions": zones, "statistics": {}}

        log('INFO', 'PackerService', trace_id, '打包初始化',
            object_count=len(items_data),
            zone_count=len(zones)
        )

        all_items: List[Item] = [Item(
            id=str(item_data.get('uuid', 'unknown')),
            group_id=str(item_data.get('group_id', 'G1')),
            dims=vec3(
                x=float(dims.get('width', 10)),
                y=float(dims.get('height', 10)),
                z=float(dims.get('depth', 10)),
            ),
            weight=int(item_data.get('weight', 0)),
            confirmed=bool(item_data.get('confirmed', False))
        ) for item_data in items_data if (dims := item_data.get('dimensions'))]

        all_packed_objects = []
        all_unpacked_ids = []
        item_placer = ItemPlacer(None) # 直接呼叫堆疊函式，不需 lane_manager

        total_item_volume = sum(get_box_volume(item.get_box()) for item in all_items)
        total_packed_volume = 0

        for zone in zones:
            zone_id = zone['id']
            zone_bounds = zone['world_bounds']
            
            lane = Lane(
                id=zone_id, group_id=zone_id,
                bounds=Box3(
                    min=vec3(0, 0, 0),
                    max=vec3(float(zone_bounds['width']), float(zone_bounds['height']), float(zone_bounds['depth']))
                ),
                frontage_axis='x', capacity_slots=1000, access_cost=10.0, last_used_ts=0.0, mode='pallet-lane'
            )

            zone_group_ids = set(str(gid) for gid in zone.get('group_ids', []))
            items_for_zone = [item for item in all_items if item.group_id in zone_group_ids]

            if not items_for_zone:
                continue

            # 傳入 trace_id
            placements, unpacked_ids = item_placer._stack_items_in_lane(items_for_zone, lane, trace_id)
            all_unpacked_ids.extend(unpacked_ids)

            for placement in placements:
                total_packed_volume += get_box_volume(placement.get_item_box(all_items))
                pose_min_relative = placement.pose.min
                pose_dims = placement.pose.max - pose_min_relative
                center_point = pose_min_relative + pose_dims / 2.0
                
                # 轉換到世界座標
                world_center = vec3(
                    x=center_point.x + float(zone_bounds['x']),
                    y=center_point.y + float(zone_bounds['y']),
                    z=center_point.z + float(zone_bounds['z'])
                )

                all_packed_objects.append({
                    "uuid": placement.item_id,
                    "position": world_center.__dict__,
                    "dimensions": pose_dims.__dict__,
                    "rotation": {"x": 0, "y": 0, "z": 0},
                    "zone_id": zone_id
                })

        duration_ms = (time.time() - t_start) * 1000
        volume_utilization = total_packed_volume / total_item_volume if total_item_volume > 0 else 0

        stats = {
            'total_objects': len(all_items),
            'packed_objects': len(all_packed_objects),
            'unpacked_objects': len(all_items) - len(all_packed_objects),
            'duration_ms': round(duration_ms, 2),
            'total_item_volume': round(total_item_volume, 2),
            'total_packed_volume': round(total_packed_volume, 2),
            'volume_utilization': round(volume_utilization, 4)
        }

        log('INFO', 'PackerService', trace_id, '打包服務執行完畢', **stats)

        return {
            "success": True,
            "message": f"Packed {stats['packed_objects']} of {stats['total_objects']} items.",
            "statistics": stats,
            "packed_objects": all_packed_objects,
            "partitions": zones, # 回傳 zones 作為 partitions
        }

    except Exception as e:
        duration_ms = (time.time() - t_start) * 1000
        error_info = {
            "error_type": type(e).__name__,
            "message": str(e),
            "trace": traceback.format_exc().splitlines()[-3:]
        }
        log('ERROR', 'PackerService', trace_id, '打包服務發生例外', duration_ms=round(duration_ms, 2), **error_info)
        return {
            "success": False,
            "error": str(e),
            "message": "打包服務發生錯誤。",
            "trace": traceback.format_exc()
        }
