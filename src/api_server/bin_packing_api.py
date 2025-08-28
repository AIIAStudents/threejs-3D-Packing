import uuid
import time
import threading
import queue
import itertools
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import math
import random
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS

# 定義數據結構
class JobStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class PackRequest:
    objects: List[Dict]
    container_size: Dict[str, float]
    optimization_type: str = "volume_utilization"
    algorithm: str = "blf_sa"
    async_mode: bool = False
    timeout: int = 30

@dataclass
class PackResult:
    job_id: str
    success: bool
    packed_objects: List[Dict]
    volume_utilization: float
    execution_time: float
    algorithm_used: str
    message: str = ""
    error: str = ""

@dataclass
class JobStatusResponse:
    job_id: str
    status: JobStatus
    progress: float
    estimated_time_remaining: Optional[float] = None
    result: Optional[PackResult] = None
    error: str = ""

# 全局變數
jobs: Dict[str, Dict] = {}
job_queue = queue.Queue()

class BLF_SA_Algorithm:
    """BLF (Bottom-Left-Fill) + SA (Simulated Annealing) 算法實現 (V6)
    
    主要改進:
    1. 排序策略: 體積 -> 最長邊，解決同體積物件順序不穩定問題。
    2. SA鄰域生成: 改為交換兩個物件，避免過度隨機。
    3. 放置點優化: 候選點生成時過濾邊界外位置。
    4. 重力下墜: 在找尋最佳位置時，模擬物件下墜，使其緊靠支撐面。
    5. 邊界檢查: 確保物件嚴格在容器內部 (減去gap)。
    """
    
    def __init__(self, container_size: Dict[str, float]):
        self.container_width = container_size.get('width', 0)
        self.container_height = container_size.get('height', 0)
        self.container_depth = container_size.get('depth', 0)
        self.container_volume = self.container_width * self.container_height * self.container_depth
        self.min_gap = 0.0 # 設置為0以確保完全利用邊界

    def _get_rotations(self, obj: Dict) -> List[Dict]:
        dims = obj.get('dimensions') or obj.get('size') or {}
        d = [dims.get('x', 1), dims.get('y', 1), dims.get('z', 1)]
        if d[0] == d[1] and d[1] == d[2]:
            return [{'x': d[0], 'y': d[1], 'z': d[2]}]
        unique_permutations = set(itertools.permutations(d))
        return [{'x': p[0], 'y': p[1], 'z': p[2]} for p in unique_permutations]

    def _pre_filter_unfittable_objects(self, objects: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        fittable_objects = []
        unfittable_objects = []
        for obj in objects:
            can_fit_any_rotation = False
            for rot_dims in self._get_rotations(obj):
                if (rot_dims['x'] <= self.container_width and
                    rot_dims['y'] <= self.container_height and
                    rot_dims['z'] <= self.container_depth):
                    can_fit_any_rotation = True
                    break
            if can_fit_any_rotation:
                fittable_objects.append(obj)
            else:
                unfittable_objects.append(obj)
        return fittable_objects, unfittable_objects

    def calculate_cost(self, packed_objects: List[Dict]) -> Tuple[int, float]:
        if not self.container_volume:
            return 0, 0.0
        
        count = len(packed_objects)
        total_packed_volume = sum(
            (obj['dimensions']['x'] * obj['dimensions']['y'] * obj['dimensions']['z'])
            for obj in packed_objects
        )
        utilization = (total_packed_volume / self.container_volume) * 100 if self.container_volume > 0 else 0
        return (count, utilization)

    def _can_place_at(self, obj_dims: Dict, position: Dict, packed_objects: List[Dict]) -> bool:
        gap = self.min_gap
        # 1. 檢查是否在容器邊界內
        if not (position['x'] >= 0 and position['x'] + obj_dims['x'] <= self.container_width + gap and
                position['y'] >= 0 and position['y'] + obj_dims['y'] <= self.container_height + gap and
                position['z'] >= 0 and position['z'] + obj_dims['z'] <= self.container_depth + gap):
            return False

        # 2. 檢查是否與已放置物件重疊
        for packed in packed_objects:
            packed_dims = packed['dimensions']
            packed_pos = packed['position']
            if not (
                position['x'] >= packed_pos['x'] + packed_dims['x'] + gap or
                position['x'] + obj_dims['x'] + gap <= packed_pos['x'] or
                position['y'] >= packed_pos['y'] + packed_dims['y'] + gap or
                position['y'] + obj_dims['y'] + gap <= packed_pos['y'] or
                position['z'] >= packed_pos['z'] + packed_dims['z'] + gap or
                position['z'] + obj_dims['z'] + gap <= packed_pos['z']
            ):
                return False
        return True

    def _find_best_position_for_item(self, obj: Dict, packed_objects: List[Dict]) -> Optional[Tuple[Dict, Dict]]:
        best_pos = None
        best_rot_dims = None
        min_y = float('inf')

        for rot_dims in self._get_rotations(obj):
            # 生成有效的候選放置點
            possible_positions = [{'x': 0, 'y': 0, 'z': 0}]
            for packed in packed_objects:
                p_dims = packed['dimensions']
                p_pos = packed['position']
                # 在每個已放置物件的頂面和三個方向的側面生成候選點
                possible_positions.extend([
                    {'x': p_pos['x'] + p_dims['x'], 'y': p_pos['y'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'] + p_dims['y'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'], 'z': p_pos['z'] + p_dims['z']},
                ])
            
            # 過濾掉超出邊界的候選點
            valid_positions = []
            for pos in possible_positions:
                if (pos['x'] + rot_dims['x'] <= self.container_width and
                    pos['y'] + rot_dims['y'] <= self.container_height and
                    pos['z'] + rot_dims['z'] <= self.container_depth):
                    valid_positions.append(pos)

            # 按 y, z, x 排序，優先考慮較低的位置
            for candidate_pos in sorted(valid_positions, key=lambda p: (p['y'], p['z'], p['x'])):
                # 模擬重力下墜
                final_y = 0
                # 找到所有在當前物件投影下方的已放置物件
                support_objects = [
                    p for p in packed_objects
                    if (p['position']['x'] < candidate_pos['x'] + rot_dims['x'] and
                        candidate_pos['x'] < p['position']['x'] + p['dimensions']['x'] and
                        p['position']['z'] < candidate_pos['z'] + rot_dims['z'] and
                        candidate_pos['z'] < p['position']['z'] + p['dimensions']['z'])
                ]
                if support_objects:
                    # 將 y 座標設置為最高支撐物件的頂部
                    final_y = max(p['position']['y'] + p['dimensions']['y'] for p in support_objects)

                final_pos = {'x': candidate_pos['x'], 'y': final_y, 'z': candidate_pos['z']}

                # 再次檢查下墜後的位置是否合法
                if final_y + rot_dims['y'] > self.container_height:
                    continue

                if self._can_place_at(rot_dims, final_pos, packed_objects):
                    if final_pos['y'] < min_y:
                        min_y = final_pos['y']
                        best_pos = final_pos
                        best_rot_dims = rot_dims
                        # 如果已經在底部，這就是最佳位置
                        if min_y == 0:
                            break
            if best_pos and min_y == 0:
                break

        if best_pos:
            return best_pos, best_rot_dims
        return None, None

    def _blf_pack_with_rotation(self, objects: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        packed_objects = []
        unpacked_objects = []
        
        # 確保物件有尺寸信息
        for obj in objects:
            if 'dimensions' not in obj or not obj['dimensions']:
                 obj['dimensions'] = obj.get('size', {'x':1, 'y':1, 'z':1})

        # 排序：體積 -> 最長邊
        objects.sort(key=lambda o: (
            o['dimensions']['x'] * o['dimensions']['y'] * o['dimensions']['z'],
            max(o['dimensions'].values())
        ), reverse=True)

        for obj in objects:
            position, rotation_dims = self._find_best_position_for_item(obj, packed_objects)
            if position and rotation_dims:
                packed_obj = obj.copy()
                packed_obj['position'] = position
                packed_obj['dimensions'] = rotation_dims
                packed_objects.append(packed_obj)
            else:
                unpacked_objects.append(obj)
        return packed_objects, unpacked_objects

    def simulated_annealing_optimization(self, objects: List[Dict], max_iterations: int = 100, progress_callback=None) -> Tuple[List[Dict], List[Dict]]:
        # 初始排序
        initial_objects = objects.copy()
        for obj in initial_objects:
             if 'dimensions' not in obj or not obj['dimensions']:
                 obj['dimensions'] = obj.get('size', {'x':1, 'y':1, 'z':1})
        initial_objects.sort(key=lambda o: (
            o['dimensions']['x'] * o['dimensions']['y'] * o['dimensions']['z'],
            max(o['dimensions'].values())
        ), reverse=True)

        current_solution_order = initial_objects
        current_packed, _ = self._blf_pack_with_rotation(current_solution_order)
        current_cost = self.calculate_cost(current_packed)
        
        best_solution_packed = current_packed
        best_cost = current_cost
        
        temperature = 1.0
        cooling_rate = 0.99
        
        for i in range(max_iterations):
            if progress_callback:
                progress_callback(i / max_iterations * 100)

            # 鄰域操作：交換兩個物件
            neighbor_order = current_solution_order.copy()
            if len(neighbor_order) > 1:
                idx1, idx2 = random.sample(range(len(neighbor_order)), 2)
                neighbor_order[idx1], neighbor_order[idx2] = neighbor_order[idx2], neighbor_order[idx1]

            neighbor_packed, _ = self._blf_pack_with_rotation(neighbor_order)
            neighbor_cost = self.calculate_cost(neighbor_packed)
            
            if neighbor_cost > current_cost:
                current_solution_order = neighbor_order
                current_packed = neighbor_packed
                current_cost = neighbor_cost
                if current_cost > best_cost:
                    best_solution_packed = current_packed
                    best_cost = current_cost
            else:
                delta = (neighbor_cost[0] - current_cost[0]) * 100 + (neighbor_cost[1] - current_cost[1])
                if temperature > 0 and math.exp(delta / temperature) > random.random():
                    current_solution_order = neighbor_order
                    current_packed = neighbor_packed
                    current_cost = neighbor_cost
            
            temperature *= cooling_rate
        
        if progress_callback:
            progress_callback(100)
            
        packed_ids = {o['uuid'] for o in best_solution_packed}
        unpacked_objects = [o for o in objects if o['uuid'] not in packed_ids]

        return best_solution_packed, unpacked_objects

    def pack_objects(self, objects: List[Dict], progress_callback=None) -> PackResult:
        start_time = time.time()
        try:
            if not objects:
                return PackResult(job_id="", success=True, packed_objects=[], volume_utilization=0.0, execution_time=0, algorithm_used="BLF_SA_V6", message="沒有物件需要打包。 সন")

            fittable_objects, unfittable_objects = self._pre_filter_unfittable_objects(objects)
            
            if not fittable_objects:
                all_unpacked = []
                for obj in objects:
                    obj_copy = obj.copy()
                    obj_copy['packed'] = False
                    all_unpacked.append(obj_copy)
                return PackResult(job_id="", success=True, packed_objects=all_unpacked, volume_utilization=0.0, execution_time=time.time() - start_time, algorithm_used="BLF_SA_V6", message=f"所有 {len(objects)} 個物件都因尺寸過大而無法放入容器。 সন")

            packed_solution, unpacked_from_sa = self.simulated_annealing_optimization(fittable_objects, progress_callback=progress_callback)
            
            final_objects = []
            packed_ids = {o['uuid'] for o in packed_solution}
            
            for obj in objects:
                obj_copy = obj.copy()
                if obj_copy['uuid'] in packed_ids:
                    packed_version = next((p for p in packed_solution if p['uuid'] == obj_copy['uuid']), None)
                    if packed_version:
                        obj_copy['packed'] = True
                        obj_copy['position'] = packed_version['position']
                        obj_copy['dimensions'] = packed_version['dimensions']
                    else:
                         obj_copy['packed'] = False
                else:
                    obj_copy['packed'] = False
                final_objects.append(obj_copy)

            _, utilization = self.calculate_cost(packed_solution)
            execution_time = time.time() - start_time
            
            total_unpacked_count = len(unfittable_objects) + len(unpacked_from_sa)
            message = f"成功打包 {len(packed_solution)}/{len(objects)} 個物件。體積利用率: {utilization:.2f}%"
            if total_unpacked_count > 0:
                message += f" ({total_unpacked_count} 個物件無法放入)"

            return PackResult(
                job_id="",
                success=True,
                packed_objects=final_objects,
                volume_utilization=utilization,
                execution_time=execution_time,
                algorithm_used="BLF_SA_V6",
                message=message
            )

        except Exception as e:
            error_info = traceback.format_exc()
            execution_time = time.time() - start_time
            return PackResult(
                job_id="",
                success=False,
                packed_objects=[],
                volume_utilization=0.0,
                execution_time=execution_time,
                algorithm_used="BLF_SA_V6",
                error=str(e) + "\n" + error_info
            )

def process_job_async(job_id: str):
    if job_id not in jobs:
        return
    
    job = jobs[job_id]
    job['status'] = JobStatus.PROCESSING
    job['progress'] = 0.0
    
    try:
        algorithm = BLF_SA_Algorithm(job['request'].container_size)
        
        def progress_callback(progress):
            job['progress'] = progress
            job['last_update'] = time.time()
        
        result = algorithm.pack_objects(job['request'].objects, progress_callback)
        result.job_id = job_id
        
        job['result'] = asdict(result) # 修正: 序列化 PackResult 物件
        job['status'] = JobStatus.COMPLETED
        job['progress'] = 100.0
        
    except Exception as e:
        job['status'] = JobStatus.FAILED
        job['error'] = str(e)

def start_worker_thread():
    def worker():
        while True:
            try:
                job_id = job_queue.get(timeout=1)
                process_job_async(job_id)
                job_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Worker thread error: {e}")
    
    worker_thread = threading.Thread(target=worker, daemon=True)
    worker_thread.start()

start_worker_thread()

def create_bin_packing_routes(app: Flask):
    @app.route('/pack_objects', methods=['POST'])
    def pack_objects():
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400
            
            if 'objects' not in data or 'container_size' not in data:
                return jsonify({"error": "Missing required fields: objects, container_size"}), 400
            
            pack_request = PackRequest(
                objects=data['objects'],
                container_size=data['container_size'],
                optimization_type=data.get('optimization_type', 'volume_utilization'),
                algorithm=data.get('algorithm', 'blf_sa'),
                async_mode=data.get('async_mode', False),
                timeout=data.get('timeout', 30)
            )
            
            object_count = len(pack_request.objects)
            should_use_async = pack_request.async_mode or object_count > 10
            
            if should_use_async:
                job_id = str(uuid.uuid4())
                jobs[job_id] = {
                    'request': pack_request,
                    'status': JobStatus.PENDING,
                    'progress': 0.0,
                    'created_at': time.time(),
                    'last_update': time.time(),
                    'result': None,
                    'error': ''
                }
                
                job_queue.put(job_id)
                
                return jsonify({
                    "job_id": job_id,
                    "status": "async",
                    "message": f"任務已加入隊列，物件數量: {object_count}"
                })
            else:
                algorithm = BLF_SA_Algorithm(pack_request.container_size)
                result = algorithm.pack_objects(pack_request.objects)
                result.job_id = "sync_" + str(uuid.uuid4())[:8]
                
                return jsonify(asdict(result))
                
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route('/job_status/<job_id>', methods=['GET'])
    def get_job_status(job_id):
        if job_id not in jobs:
            return jsonify({"error": "Job not found"}), 404
        
        job = jobs[job_id]
        response = JobStatusResponse(
            job_id=job_id,
            status=job['status'],
            progress=job['progress'],
            result=job.get('result'),
            error=job.get('error', '')
        )
        
        if job['status'] == JobStatus.PROCESSING and job['progress'] > 0:
            elapsed_time = time.time() - job['created_at']
            estimated_total_time = elapsed_time / (job['progress'] / 100.0)
            response.estimated_time_remaining = max(0, estimated_total_time - elapsed_time)

        payload = asdict(response)
        payload['status'] = response.status.value

        return jsonify(payload)
    
    @app.route('/cancel_job/<job_id>', methods=['POST'])
    def cancel_job(job_id):
        if job_id not in jobs:
            return jsonify({"error": "Job not found"}), 404
        
        job = jobs[job_id]
        if job['status'] in [JobStatus.PENDING, JobStatus.PROCESSING]:
            job['status'] = JobStatus.FAILED
            job['error'] = "Task cancelled by user"
            return jsonify({"message": "Job cancelled successfully"})
        else:
            return jsonify({"error": "Cannot cancel completed or failed job"}), 400
    
    @app.route('/list_jobs', methods=['GET'])
    def list_jobs():
        job_list = []
        for job_id, job in jobs.items():
            job_info = {
                'job_id': job_id,
                'status': job['status'].value,
                'progress': job['progress'],
                'created_at': job['created_at'],
                'object_count': len(job['request'].objects)
            }
            job_list.append(job_info)
        
        return jsonify({"jobs": job_list})
    
    @app.route('/clear_completed_jobs', methods=['POST'])
    def clear_completed_jobs():
        completed_jobs = [job_id for job_id, job in jobs.items() 
                         if job['status'] in [JobStatus.COMPLETED, JobStatus.FAILED]]
        
        for job_id in completed_jobs:
            del jobs[job_id]
        
        return jsonify({
            "message": f"Cleared {len(completed_jobs)} completed jobs",
            "cleared_count": len(completed_jobs)
        })

if __name__ == "__main__":
    app = Flask(__name__)
    CORS(app)
    create_bin_packing_routes(app)
    app.run(port=8889, debug=True)
