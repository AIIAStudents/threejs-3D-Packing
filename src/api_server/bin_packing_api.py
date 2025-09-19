import os
import json
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
    
    def __init__(self, container_size: Dict[str, float], initial_obstacles: List[Dict] = None):
        self.container_width = container_size.get('width', 0)
        self.container_height = container_size.get('height', 0)
        self.container_depth = container_size.get('depth', 0)
        self.container_volume = self.container_width * self.container_height * self.container_depth
        self.min_gap = 0.0 # 設置為0以確保完全利用邊界
        self.initial_obstacles = initial_obstacles or []

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
        
        actual_packed = [obj for obj in packed_objects if not obj.get('is_obstacle')]

        count = len(actual_packed)
        total_packed_volume = sum(
            (obj['dimensions']['x'] * obj['dimensions']['y'] * obj['dimensions']['z'])
            for obj in actual_packed
        )
        utilization = (total_packed_volume / self.container_volume) * 100 if self.container_volume > 0 else 0
        return (count, utilization)

    def _can_place_at(self, obj_dims: Dict, position: Dict, packed_objects: List[Dict]) -> bool:
        gap = self.min_gap
        if not (position['x'] >= 0 and position['x'] + obj_dims['x'] <= self.container_width + gap and
                position['y'] >= 0 and position['y'] + obj_dims['y'] <= self.container_height + gap and
                position['z'] >= 0 and position['z'] + obj_dims['z'] <= self.container_depth + gap):
            return False

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
            possible_positions = [{'x': 0, 'y': 0, 'z': 0}]
            for packed in packed_objects:
                p_dims = packed['dimensions']
                p_pos = packed['position']
                possible_positions.extend([
                    {'x': p_pos['x'] + p_dims['x'], 'y': p_pos['y'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'] + p_dims['y'], 'z': p_pos['z']},
                    {'x': p_pos['x'], 'y': p_pos['y'], 'z': p_pos['z'] + p_dims['z']},
                ])
            
            valid_positions = []
            for pos in possible_positions:
                if (pos['x'] + rot_dims['x'] <= self.container_width and
                    pos['y'] + rot_dims['y'] <= self.container_height and
                    pos['z'] + rot_dims['z'] <= self.container_depth):
                    valid_positions.append(pos)

            for candidate_pos in sorted(valid_positions, key=lambda p: (p['y'], p['z'], p['x'])):
                final_y = 0
                support_objects = [
                    p for p in packed_objects
                    if (p['position']['x'] < candidate_pos['x'] + rot_dims['x'] and
                        candidate_pos['x'] < p['position']['x'] + p['dimensions']['x'] and
                        p['position']['z'] < candidate_pos['z'] + rot_dims['z'] and
                        candidate_pos['z'] < p['position']['z'] + p['dimensions']['z'])
                ]
                if support_objects:
                    final_y = max(p['position']['y'] + p['dimensions']['y'] for p in support_objects)

                final_pos = {'x': candidate_pos['x'], 'y': final_y, 'z': candidate_pos['z']}

                if final_y + rot_dims['y'] > self.container_height:
                    continue

                if self._can_place_at(rot_dims, final_pos, packed_objects):
                    if final_pos['y'] < min_y:
                        min_y = final_pos['y']
                        best_pos = final_pos
                        best_rot_dims = rot_dims
                        if min_y == 0:
                            break
            if best_pos and min_y == 0:
                break

        if best_pos:
            return best_pos, best_rot_dims
        return None, None

    def _blf_pack_with_rotation(self, objects: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        packed_objects = self.initial_obstacles.copy()
        unpacked_objects = []
        
        for obj in objects:
            if 'dimensions' not in obj or not obj['dimensions']:
                 obj['dimensions'] = obj.get('size', {'x':1, 'y':1, 'z':1})

        # 根據高度升序排序，矮的先放
        objects.sort(key=lambda o: o['dimensions']['y'])

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
                return PackResult(job_id="", success=True, packed_objects=[], volume_utilization=0.0, execution_time=0, algorithm_used="BLF_SA_V6", message="沒有物件需要打包。")

            fittable_objects, unfittable_objects = self._pre_filter_unfittable_objects(objects)
            
            if not fittable_objects:
                all_unpacked = []
                for obj in objects:
                    obj_copy = obj.copy()
                    obj_copy['packed'] = False
                    all_unpacked.append(obj_copy)
                return PackResult(job_id="", success=True, packed_objects=all_unpacked, volume_utilization=0.0, execution_time=time.time() - start_time, algorithm_used="BLF_SA_V6", message=f"所有 {len(objects)} 個物件都因尺寸過大而無法放入容器。")

            packed_solution, unpacked_from_sa = self.simulated_annealing_optimization(fittable_objects, progress_callback=progress_callback)
            
            final_packed_solution = [obj for obj in packed_solution if not obj.get('is_obstacle')]

            final_objects = []
            packed_ids = {o['uuid'] for o in final_packed_solution}
            
            for obj in objects:
                obj_copy = obj.copy()
                if obj_copy['uuid'] in packed_ids:
                    packed_version = next((p for p in final_packed_solution if p['uuid'] == obj_copy['uuid']), None)
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
            message = f"成功打包 {len(final_packed_solution)}/{len(objects)} 個物件。體積利用率: {utilization:.2f}%"
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
        initial_obstacles = job.get('initial_obstacles', [])
        algorithm = BLF_SA_Algorithm(job['request'].container_size, initial_obstacles=initial_obstacles)

        def progress_callback(p):
            job['progress'] = p
            job['last_update'] = time.time()

        result = algorithm.pack_objects(job['request'].objects, progress_callback)
        result.job_id = job_id
        job['result'] = asdict(result)
        job['status'] = JobStatus.COMPLETED
        job['progress'] = 100.0

    except Exception as e:
        job['status'] = JobStatus.FAILED
        job['error'] = str(e)

def create_bin_packing_routes(app: Flask):
    @app.route('/pack_objects', methods=['POST'])
    def pack_objects():
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400

            # --- Get Container Size ---
            container_size = None
            config_path = 'container_config.json'
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    container_config = json.load(f)
                if container_config.get('shape') == 'l-shape':
                    return jsonify({
                        "error": "L-Shape container packing is not yet supported by the algorithm.",
                        "error_code": "L_SHAPE_UNSUPPORTED"
                    }), 400
                if container_config.get('shape') == 'cube':
                    container_size = container_config.get('dimensions')

            if container_size is None:
                if 'container_size' not in data:
                    return jsonify({"error": "Missing required field: container_size (or no valid container_config.json found)"}), 400
                container_size = data['container_size']

            initial_obstacles = data.get('initial_obstacles', [])
            start_time = time.time()

            # --- Handle different request formats (groups vs flat objects) ---
            if 'groups' in data and data['groups']:
                # New format: Process by groups
                groups = sorted(data['groups'], key=lambda g: g.get('priority', 0))
                
                if not groups:
                     return jsonify({"error": "Groups field is empty"}), 400

                final_packed_objects = []
                total_item_volume = 0
                
                # Use the main container depth for slicing
                main_container_depth = container_size.get('depth', 0)
                if main_container_depth == 0:
                    return jsonify({"error": "Container depth cannot be zero for group packing"}), 400

                sub_container_depth = main_container_depth / len(groups)

                for i, group in enumerate(groups):
                    group_objects = group.get('objects', [])
                    if not group_objects:
                        continue

                    sub_container_size = container_size.copy()
                    sub_container_size['depth'] = sub_container_depth
                    
                    algorithm = BLF_SA_Algorithm(sub_container_size, initial_obstacles=[])
                    
                    # We call the internal packing method directly
                    packed_solution, unpacked_from_sa = algorithm.simulated_annealing_optimization(group_objects)
                    
                    # Apply Z-offset and collect results
                    z_offset = i * sub_container_depth
                    for packed_obj in packed_solution:
                        if not packed_obj.get('is_obstacle'):
                            packed_obj['position']['z'] += z_offset
                            final_packed_objects.append(packed_obj)
                            total_item_volume += packed_obj['dimensions']['x'] * packed_obj['dimensions']['y'] * packed_obj['dimensions']['z']

                total_container_volume = container_size['width'] * container_size['height'] * container_size['depth']
                final_utilization = (total_item_volume / total_container_volume) * 100 if total_container_volume > 0 else 0
                
                # Reconstruct the final list of all objects with their packed status
                all_input_objects = [obj for group in groups for obj in group.get('objects', [])]
                packed_ids = {o['uuid'] for o in final_packed_objects}
                final_objects_with_status = []

                for obj in all_input_objects:
                    obj_copy = obj.copy()
                    if obj_copy['uuid'] in packed_ids:
                        packed_version = next((p for p in final_packed_objects if p['uuid'] == obj_copy['uuid']), None)
                        if packed_version:
                            obj_copy['packed'] = True
                            obj_copy['position'] = packed_version['position']
                            obj_copy['dimensions'] = packed_version['dimensions']
                    else:
                        obj_copy['packed'] = False
                    final_objects_with_status.append(obj_copy)

                result = PackResult(
                    job_id="sync_group_" + str(uuid.uuid4())[:8],
                    success=True,
                    packed_objects=final_objects_with_status,
                    volume_utilization=final_utilization,
                    execution_time=time.time() - start_time,
                    algorithm_used="BLF_SA_V6_Groups",
                    message=f"Successfully packed {len(final_packed_objects)} objects from {len(groups)} groups."
                )
                return jsonify(asdict(result))

            elif 'objects' in data:
                # Old format: Process a flat list of objects
                pack_request = PackRequest(
                    objects=data['objects'],
                    container_size=container_size,
                    optimization_type=data.get('optimization_type', 'volume_utilization'),
                    algorithm=data.get('algorithm', 'blf_sa'),
                    async_mode=data.get('async_mode', False),
                    timeout=data.get('timeout', 30)
                )
                algorithm = BLF_SA_Algorithm(pack_request.container_size, initial_obstacles=initial_obstacles)
                result = algorithm.pack_objects(pack_request.objects)
                result.job_id = "sync_flat_" + str(uuid.uuid4())[:8]
                return jsonify(asdict(result))
            
            else:
                return jsonify({"error": "Missing required field: 'objects' or 'groups'"}), 400

        except Exception as e:
            return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

    @app.route('/save_container_config', methods=['POST'])
    def save_container_config():
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400
            
            config_path = 'container_config.json'
            
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            
            return jsonify({"message": f"Container configuration saved successfully to {config_path}"})

        except Exception as e:
            return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

    @app.route('/load_container_config', methods=['GET'])
    def load_container_config():
        try:
            config_path = 'container_config.json'
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                return jsonify(config)
            else:
                default_config = {
                    "shape": "cube",
                    "dimensions": {"width": 587, "height": 234, "depth": 238},
                    "doors": []
                }
                return jsonify(default_config)
        except Exception as e:
            return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

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
            elapsed = time.time() - job['created_at']
            eta_total = elapsed / (job['progress'] / 100.0)
            response.estimated_time_remaining = max(0, eta_total - elapsed)
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
        return jsonify({"error": "Cannot cancel completed or failed job"}), 400

    @app.route('/list_jobs', methods=['GET'])
    def list_jobs():
        return jsonify({"jobs": [{
            'job_id': jid,
            'status': j['status'].value,
            'progress': j['progress'],
            'created_at': j['created_at'],
            'object_count': len(j['request'].objects)
        } for jid, j in jobs.items()]})

    @app.route('/clear_completed_jobs', methods=['POST'])
    def clear_completed_jobs():
        done = [jid for jid, j in jobs.items() if j['status'] in [JobStatus.COMPLETED, JobStatus.FAILED]]
        for jid in done:
            del jobs[jid]
        return jsonify({"message": f"Cleared {len(done)} completed jobs", "cleared_count": len(done)})

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



