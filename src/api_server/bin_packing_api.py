import uuid
import time
import threading
import queue
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import math
import random

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
    """前端送出的pack request schema"""
    objects: List[Dict]
    container_size: Dict[str, float]  # {width, height, depth}
    optimization_type: str = "volume_utilization"  # 優化目標
    algorithm: str = "blf_sa"  # 使用的算法
    async_mode: bool = False  # 是否使用非同步模式
    timeout: int = 30  # 超時時間(秒)

@dataclass
class PackResult:
    """後端回傳的pack result schema"""
    job_id: str
    success: bool
    packed_objects: List[Dict]  # 包含新位置的物件列表
    volume_utilization: float
    execution_time: float
    algorithm_used: str
    message: str = ""
    error: str = ""

@dataclass
class JobStatusResponse:
    """非同步流程的job status response schema"""
    job_id: str
    status: JobStatus
    progress: float  # 0-100
    estimated_time_remaining: Optional[float] = None
    result: Optional[PackResult] = None
    error: str = ""

# 全局變數
jobs: Dict[str, Dict] = {}  # 存儲所有任務
job_queue = queue.Queue()

class BLF_SA_Algorithm:
    """BLF (Bottom-Left-Fill) + SA (Simulated Annealing) 算法實現"""
    
    def __init__(self, container_size: Dict[str, float]):
        self.container_width = container_size['width']
        self.container_height = container_size['height']
        self.container_depth = container_size['depth']
        self.container_volume = self.container_width * self.container_height * self.container_depth
        self.min_gap = 0.5  # 最小間隙，避免物體緊貼造成重疊/物理爆開

    def _dims(self, obj: Dict) -> Dict[str, float]:
        """取得物件的實際尺寸。優先使用 dimensions，其次使用 scale。"""
        d = obj.get('dimensions') or obj.get('size') or obj.get('scale') or {}
        return {
            'x': float(d.get('x', 0.0)),
            'y': float(d.get('y', 0.0)),
            'z': float(d.get('z', 0.0)),
        }
        
    def calculate_volume_utilization(self, packed_objects: List[Dict]) -> float:
        """計算體積利用率"""
        total_packed_volume = 0
        for obj in packed_objects:
            dims = self._dims(obj)
            volume = dims['x'] * dims['y'] * dims['z']
            total_packed_volume += volume
        return (total_packed_volume / self.container_volume) * 100
    
    def can_place_object(self, obj: Dict, position: Dict, packed_objects: List[Dict]) -> bool:
        """檢查物件是否可以放置在指定位置"""
        dims = self._dims(obj)
        obj_width = dims['x']
        obj_height = dims['y']
        obj_depth = dims['z']
        
        # 檢查是否超出容器邊界（保留最小間隙）
        g = self.min_gap
        if (position['x'] < 0 or position['y'] < 0 or position['z'] < 0 or
            position['x'] + obj_width + g > self.container_width or
            position['y'] + obj_height + g > self.container_height or
            position['z'] + obj_depth + g > self.container_depth):
            return False
        
        # 檢查是否與其他物件重疊
        for packed_obj in packed_objects:
            if self.objects_overlap(obj, position, packed_obj, packed_obj['position']):
                return False
        
        return True
    
    def objects_overlap(self, obj1: Dict, pos1: Dict, obj2: Dict, pos2: Dict) -> bool:
        """檢查兩個物件是否重疊"""
        d1 = self._dims(obj1)
        d2 = self._dims(obj2)
        g = self.min_gap
        # 若有至少 g 的分離，則不重疊
        return not (
            (pos1['x'] + d1['x'] + g <= pos2['x']) or
            (pos2['x'] + d2['x'] + g <= pos1['x']) or
            (pos1['y'] + d1['y'] + g <= pos2['y']) or
            (pos2['y'] + d2['y'] + g <= pos1['y']) or
            (pos1['z'] + d1['z'] + g <= pos2['z']) or
            (pos2['z'] + d2['z'] + g <= pos1['z'])
        )
    
    def find_best_position_blf(self, obj: Dict, packed_objects: List[Dict]) -> Optional[Dict]:
        """
        使用 BLF (Bottom-Left-Front) 算法尋找最佳位置
        - 水平優先: X → Z → Y
        - 邊界夾限: 確保不超出容器
        - 起始偏移: 預留 min_gap 作為間距
        """
        # 取得物件尺寸
        dims = self._dims(obj)
        obj_width = dims['x']
        obj_height = dims['y']
        obj_depth = dims['z']

        # 起始偏移與步長
        step = max(1, int(self.min_gap))

        # 最大可放置位置 (避免超界)
        max_x = self.container_width  - obj_width - self.min_gap
        max_z = self.container_depth  - obj_depth - self.min_gap

        # y 固定為 0（或某個地面高度）
        for x in range(0, int(max_x) + 1, step):
            for z in range(0, int(max_z) + 1, step):
                y = 0
                position = {'x': x, 'y': y, 'z': z}
                if self.can_place_object(obj, position, packed_objects):
                    return position

        # 找不到合法位置
        return None
    def simulated_annealing_optimization(self, objects: List[Dict], max_iterations: int = 1000) -> Tuple[List[Dict], float]:
        """使用模擬退火法優化物件排列"""
        # 初始解：使用BLF算法
        current_solution = []
        for obj in objects:
            position = self.find_best_position_blf(obj, current_solution)
            if position:
                packed_obj = obj.copy()
                packed_obj['position'] = position
                current_solution.append(packed_obj)
        
        current_utilization = self.calculate_volume_utilization(current_solution)
        best_solution = current_solution.copy()
        best_utilization = current_utilization
        
        # 模擬退火參數
        temperature = 100.0
        cooling_rate = 0.95
        min_temperature = 0.1
        
        for iteration in range(max_iterations):
            # 生成鄰居解：隨機交換兩個物件的位置
            if len(current_solution) > 1:
                neighbor_solution = current_solution.copy()
                i, j = random.sample(range(len(neighbor_solution)), 2)
                
                # 交換位置
                temp_pos = neighbor_solution[i]['position'].copy()
                neighbor_solution[i]['position'] = neighbor_solution[j]['position'].copy()
                neighbor_solution[j]['position'] = temp_pos
                
                # 檢查新解是否可行
                valid_solution = True
                for k, obj in enumerate(neighbor_solution):
                    if not self.can_place_object(obj, obj['position'], neighbor_solution[:k]):
                        valid_solution = False
                        break
                
                if valid_solution:
                    neighbor_utilization = self.calculate_volume_utilization(neighbor_solution)
                    
                    # 計算接受概率
                    delta_e = neighbor_utilization - current_utilization
                    if delta_e > 0 or random.random() < math.exp(delta_e / temperature):
                        current_solution = neighbor_solution
                        current_utilization = neighbor_utilization
                        
                        if current_utilization > best_utilization:
                            best_solution = current_solution.copy()
                            best_utilization = current_utilization
            
            # 降溫
            temperature *= cooling_rate
            if temperature < min_temperature:
                break
        
        return best_solution, best_utilization
    
    def pack_objects(self, objects: List[Dict], progress_callback=None) -> PackResult:
        """執行3D Bin packing"""
        start_time = time.time()
        
        try:
            # 使用BLF + SA算法
            packed_objects, utilization = self.simulated_annealing_optimization(objects)
            
            execution_time = time.time() - start_time
            
            return PackResult(
                job_id="",  # 將由調用者設置
                success=True,
                packed_objects=packed_objects,
                volume_utilization=utilization,
                execution_time=execution_time,
                algorithm_used="BLF_SA",
                message=f"成功打包 {len(packed_objects)}/{len(objects)} 個物件，體積利用率: {utilization:.2f}%"
            )
            
        except Exception as e:
            execution_time = time.time() - start_time
            return PackResult(
                job_id="",
                success=False,
                packed_objects=[],
                volume_utilization=0.0,
                execution_time=execution_time,
                algorithm_used="BLF_SA",
                error=str(e)
            )

def process_job_async(job_id: str):
    """非同步處理任務"""
    if job_id not in jobs:
        return
    
    job = jobs[job_id]
    job['status'] = JobStatus.PROCESSING
    job['progress'] = 0.0
    
    try:
        # 創建算法實例
        algorithm = BLF_SA_Algorithm(job['request'].container_size)
        
        # 模擬進度更新
        def progress_callback(progress):
            job['progress'] = progress
            job['last_update'] = time.time()
        
        # 執行打包算法
        result = algorithm.pack_objects(job['request'].objects, progress_callback)
        result.job_id = job_id
        
        job['result'] = result
        job['status'] = JobStatus.COMPLETED
        job['progress'] = 100.0
        
    except Exception as e:
        job['status'] = JobStatus.FAILED
        job['error'] = str(e)

def start_worker_thread():
    """啟動工作線程處理非同步任務"""
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

# 啟動工作線程
start_worker_thread()

def create_bin_packing_routes(app: Flask):
    """創建3D Bin packing相關的API路由"""
    
    @app.route('/pack_objects', methods=['POST'])
    def pack_objects():
        """3D Bin packing主端點"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"error": "No JSON data provided"}), 400
            
            # 驗證請求數據
            if 'objects' not in data or 'container_size' not in data:
                return jsonify({"error": "Missing required fields: objects, container_size"}), 400
            
            # 創建PackRequest對象
            pack_request = PackRequest(
                objects=data['objects'],
                container_size=data['container_size'],
                optimization_type=data.get('optimization_type', 'volume_utilization'),
                algorithm=data.get('algorithm', 'blf_sa'),
                async_mode=data.get('async_mode', False),
                timeout=data.get('timeout', 30)
            )
            
            # 檢查物件數量決定同步或非同步
            object_count = len(pack_request.objects)
            should_use_async = pack_request.async_mode or object_count > 10
            
            if should_use_async:
                # 非同步處理
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
                
                # 加入隊列
                job_queue.put(job_id)
                
                return jsonify({
                    "job_id": job_id,
                    "status": "async",
                    "message": f"任務已加入隊列，物件數量: {object_count}"
                })
            else:
                # 同步處理
                algorithm = BLF_SA_Algorithm(pack_request.container_size)
                result = algorithm.pack_objects(pack_request.objects)
                result.job_id = "sync_" + str(uuid.uuid4())[:8]
                
                return jsonify(asdict(result))
                
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route('/job_status/<job_id>', methods=['GET'])
    def get_job_status(job_id):
        """獲取任務狀態"""
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
        
        # 計算預估剩餘時間
        if job['status'] == JobStatus.PROCESSING and job['progress'] > 0:
            elapsed_time = time.time() - job['created_at']
            estimated_total_time = elapsed_time / (job['progress'] / 100.0)
            response.estimated_time_remaining = max(0, estimated_total_time - elapsed_time)

        # 將 Enum 轉為可序列化的字串值
        payload = asdict(response)
        payload['status'] = response.status.value

        return jsonify(payload)
    
    @app.route('/cancel_job/<job_id>', methods=['POST'])
    def cancel_job(job_id):
        """取消任務"""
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
        """列出所有任務"""
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
        """清理已完成的任務"""
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
