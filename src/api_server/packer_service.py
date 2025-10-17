from typing import Dict, List, Any

# 確保 py_packer 可以被找到
import sys
import os
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

from py_packer.main import pack_warehouse
from py_packer.types import Warehouse, Group, Item, Vec3, Box3
from py_packer.utils import vec3, box3

def run_packing_from_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    接收來自 API 的請求字典，轉換為 py_packer 所需的格式，
    執行演算法，然後將結果轉換回可 JSON 化的字典。
    """
    try:
        # 1. 將請求資料轉換為 py_packer 的資料結構
        
        # --- 建立 Warehouse ---
        container_spec = request_data.get('container_size')
        if not container_spec:
            raise ValueError("Request data must contain 'container_size'")

        warehouse = Warehouse(
            id='api_warehouse',
            bounds=box3(
                min_vec=vec3(0, 0, 0),
                max_vec=vec3(
                    x=float(container_spec.get('width', 1000)),
                    y=float(container_spec.get('height', 1000)),
                    z=float(container_spec.get('depth', 1000)),
                )
            ),
            overflow_partition_id='part_overflow' # 指定一個預設的溢出分區ID
        )

        # --- 動態建立 Groups ---
        # 計算倉庫總體積，以便為群組設定最小保證空間
        warehouse_volume = (warehouse.bounds.max.x - warehouse.bounds.min.x) * \
                           (warehouse.bounds.max.y - warehouse.bounds.min.y) * \
                           (warehouse.bounds.max.z - warehouse.bounds.min.z)

        group_ids = set(item.get('group_id', 'G1') for item in request_data.get('objects', []))
        if not group_ids:
            group_ids.add('G1') # 確保至少有一個預設群組

        # 為每個群組設定一個最小保證體積，例如總體積的 25%
        # 這可以避免因初始物品過少而導致分區過於狹小
        min_group_volume = warehouse_volume / 4 

        groups = [
            Group(
                id=str(gid), 
                name=f"Group {gid}", 
                reserve_ratio=0.15, 
                weight=10, 
                min_volume=min_group_volume
            )
            for gid in group_ids
        ]

        # --- 建立 Items 並分配到對應群組 ---
        items_data = request_data.get('objects', [])
        items: List[Item] = []
        for item_data in items_data:
            dims = item_data.get('dimensions', {})
            # 如果前端沒提供 group_id，就預設為 G1
            group_id_for_item = str(item_data.get('group_id', 'G1'))
            
            item = Item(
                id=str(item_data.get('uuid', 'unknown')),
                group_id=group_id_for_item,
                dims=vec3(
                    x=float(dims.get('width', 10)),
                    y=float(dims.get('height', 10)),
                    z=float(dims.get('depth', 10)),
                ),
                weight=int(item_data.get('weight', 0)),
                confirmed=bool(item_data.get('confirmed', False))
            )
            items.append(item)

        # 2. 執行 py_packer 演算法
        packing_result = pack_warehouse(warehouse, groups, items)

        # 3. 將 PackingResult (dataclass) 轉換為可序列化的字典
        #    dataclasses.asdict 是一個好方法，但為了避免額外 import，手動轉換
        result_dict = {
            "job_id": packing_result.job_id,
            "success": packing_result.success,
            "message": packing_result.message,
            "total_volume": packing_result.total_volume,
            "used_volume": packing_result.used_volume,
            "volume_utilization": packing_result.volume_utilization,
            "execution_time_ms": packing_result.execution_time_ms,
            "items": [],
            "borrow_ops": packing_result.borrow_ops,
            "spill_ops": packing_result.spill_ops,
            "partitions": packing_result.partitions, # Add partitions to the response
            # 為了與前端期望的 `statistics` 和 `packed_objects` 格式相容，我們重新組合一下
            "status": "completed" if packing_result.success else "failed",
            "statistics": {
                'total_objects': len(items),
                'packed_objects': len([i for i in packing_result.items if i.is_packed]),
                'volume_utilization': packing_result.volume_utilization
            },
            "packed_objects": []
        }

        # 建立一個查詢字典，方便從 uuid 找到原始 item data
        items_data_map = {str(item.get('uuid')): item for item in items_data}

        for item_result in packing_result.items:
            if item_result.is_packed:
                # 將 pose (min/max) 轉換為前端需要的 position/dimensions
                pose_dims = vec3(
                    x=item_result.pose.max.x - item_result.pose.min.x,
                    y=item_result.pose.max.y - item_result.pose.min.y,
                    z=item_result.pose.max.z - item_result.pose.min.z,
                )
                # 從原始資料中獲取 confirmed 狀態
                original_item = items_data_map.get(item_result.item_id, {})
                is_confirmed = original_item.get('confirmed', False)

                # 將 min corner position 轉換為 center position (如果前端需要)
                # 暫時我們先用 min corner position，因為這更接近原始打包結果
                result_dict["packed_objects"].append({
                    'uuid': item_result.item_id,
                    'position': item_result.pose.min.__dict__,
                    'dimensions': pose_dims.__dict__,
                    'rotation': {'x': 0, 'y': 0, 'z': 0}, # 演算法目前不輸出旋轉
                    'confirmed': is_confirmed # <-- 新增的欄位
                })
            result_dict["items"].append(item_result.__dict__)

        return result_dict

    except Exception as e:
        import traceback
        print(f"❌ Error in packer_service: {e}")
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "message": "An error occurred in the packing service.",
            "trace": traceback.format_exc()
        }