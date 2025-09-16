#!/usr/bin/env python3
"""
3D Bin Packing 服務器啟動腳本
運行在端口 8889，與原有的 RL API 服務器分離
"""

import sys
import os

# 添加路徑
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask
from flask_cors import CORS
from api_server.bin_packing_api import create_bin_packing_routes

def main():
    print("啟動 3D Bin Packing 服務器...")
    
    # 創建 Flask 應用
    app = Flask(__name__)
    CORS(app)
    
    # 添加路由
    create_bin_packing_routes(app)
    
    # 添加健康檢查端點
    @app.route('/health')
    def health():
        return {'status': 'healthy', 'service': '3d-bin-packing'}
    
    @app.route('/')
    def home():
        return '''
        <h1>3D Bin Packing API</h1>
        <p>服務已啟動，可用的端點：</p>
        <ul>
            <li><code>POST /pack_objects</code> - 執行3D Bin Packing</li>
            <li><code>GET /job_status/&lt;job_id&gt;</code> - 獲取任務狀態</li>
            <li><code>POST /cancel_job/&lt;job_id&gt;</code> - 取消任務</li>
            <li><code>GET /list_jobs</code> - 列出所有任務</li>
            <li><code>POST /clear_completed_jobs</code> - 清理已完成任務</li>
            <li><code>GET /health</code> - 健康檢查</li>
        </ul>
        '''
    
    print("服務器配置完成")
    print("服務器將在 http://localhost:8889 啟動")
    print("3D Bin Packing API 端點: http://localhost:8889/pack_objects")
    print("按 Ctrl+C 停止服務器")
    
    # 啟動服務器
    app.run(host='0.0.0.0', port=8889, debug=True)

if __name__ == "__main__":
    main()