#!/usr/bin/env python3
"""
簡單的3D Bin Packing API服務器
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import uuid
import time
import math

app = Flask(__name__)
CORS(app)

# 存儲任務狀態
jobs = {}

@app.route('/health')
def health():
    """健康檢查端點"""
    return {'status': 'healthy', 'service': '3d-bin-packing'}

@app.route('/pack_objects', methods=['POST'])
def pack_objects():
    """執行3D Bin Packing"""
    try:
        data = request.get_json()
        print(f"📦 收到打包請求: {data}")
        
        # 創建任務ID
        job_id = str(uuid.uuid4())[:8]
        
        # 模擬打包過程
        jobs[job_id] = {
            'status': 'processing',
            'progress': 0,
            'created_at': time.time(),
            'request': data
        }
        
        # 模擬打包算法
        objects = data.get('objects', [])
        container_size = data.get('container_size', {})
        
        # 簡單的打包邏輯：將物件排列在容器底部
        packed_objects = []
        current_x = 0
        current_z = 0
        max_y = 0
        
        for obj in objects:
            dims = obj.get('dimensions', {})
            width = dims.get('x', 10)
            height = dims.get('y', 10)
            depth = dims.get('z', 10)
            
            # 檢查是否需要換行
            if current_x + width > container_size.get('width', 120):
                current_x = 0
                current_z += max_y
                max_y = 0
            
            # 檢查是否需要換層
            if current_z + depth > container_size.get('depth', 120):
                current_x = 0
                current_z = 0
                max_y = 0
            
            # 設置物件位置
            packed_obj = {
                'uuid': obj.get('uuid'),
                'position': {
                    'x': current_x,
                    'y': 0,
                    'z': current_z
                },
                'dimensions': dims,
                'rotation': obj.get('rotation', {'x': 0, 'y': 0, 'z': 0})
            }
            
            packed_objects.append(packed_obj)
            
            # 更新位置
            current_x += width
            max_y = max(max_y, height)
        
        # 計算體積利用率
        total_volume = sum(
            obj.get('dimensions', {}).get('x', 0) * 
            obj.get('dimensions', {}).get('y', 0) * 
            obj.get('dimensions', {}).get('z', 0) 
            for obj in objects
        )
        container_volume = (
            container_size.get('width', 120) * 
            container_size.get('height', 120) * 
            container_size.get('depth', 120)
        )
        utilization = (total_volume / container_volume) * 100 if container_volume > 0 else 0
        
        # 創建結果
        result = {
            'packed_objects': packed_objects,
            'volume_utilization': utilization,
            'execution_time': 2.5,  # 模擬執行時間
            'algorithm_used': 'simple_packing'
        }
        
        # 更新任務狀態
        jobs[job_id]['status'] = 'completed'
        jobs[job_id]['progress'] = 100
        jobs[job_id]['result'] = result
        
        print(f"✅ 打包完成，任務ID: {job_id}")
        print(f"   體積利用率: {utilization:.2f}%")
        print(f"   打包物件數量: {len(packed_objects)}")
        
        return jsonify({
            "job_id": job_id,
            "status": "completed",
            "result": result
        })
        
    except Exception as e:
        print(f"❌ 打包失敗: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/job_status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """獲取任務狀態"""
    if job_id not in jobs:
        return jsonify({"error": "Job not found"}), 404
    
    job = jobs[job_id]
    
    response = {
        'job_id': job_id,
        'status': job['status'],
        'progress': job['progress'],
        'result': job.get('result'),
        'error': job.get('error', '')
    }
    
    # 如果是進行中的任務，模擬進度更新
    if job['status'] == 'processing':
        elapsed = time.time() - job['created_at']
        if elapsed < 2.0:  # 前2秒
            job['progress'] = min(90, int(elapsed * 45))  # 0-90%
        else:
            job['progress'] = 90  # 保持在90%
    
    response['progress'] = job['progress']
    
    return jsonify(response)

@app.route('/')
def home():
    """首頁"""
    return '''
    <h1>3D Bin Packing API (Simple)</h1>
    <p>服務已啟動，可用的端點：</p>
    <ul>
        <li><code>POST /pack_objects</code> - 執行3D Bin Packing</li>
        <li><code>GET /job_status/&lt;job_id&gt;</code> - 獲取任務狀態</li>
        <li><code>GET /health</code> - 健康檢查</li>
    </ul>
    '''

if __name__ == "__main__":
    print("🚀 啟動簡單的3D Bin Packing API服務器...")
    print("🌐 服務器將在 http://localhost:8889 啟動")
    print("📦 按 Ctrl+C 停止服務器")
    
    app.run(host='0.0.0.0', port=8889, debug=True)
