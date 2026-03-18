#!/usr/bin/env python3
"""
3D Bin Packing 服務器啟動腳本
運行在端口 8889，與原有的 RL API 服務器分離
"""

import sys
import os

# --- Start of Path Resolution Modification ---
# Make paths robust by calculating them relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# The project root is two levels up from this script's directory (src/python -> src -> PROJECT_ROOT)
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))

# Add project root to python path to solve module import issues
sys.path.insert(0, PROJECT_ROOT)
# --- End of Path Resolution Modification ---

from flask import Flask, jsonify
from flask_cors import CORS # 重新啟用
from flask import request
from src.api_server.packer_service import run_packing_from_request

def main():
    print("啟動 3D Bin Packing 服務器...")
    
    # 創建 Flask 應用
    app = Flask(__name__)
    
    # --- 全域 CORS 設定 (App 層級) ---
    # 設為允許所有來源，簡化開發時的跨域問題
    CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
    
    # --- 全域錯誤處理 ---
    # 確保任何未處理的例外都能以 JSON 格式回傳，並套用 CORS
    @app.errorhandler(Exception)
    def handle_exception(e):
        # 記錄完整的 exception trace
        app.logger.exception(e)
        # 回傳統一的 JSON 錯誤格式
        return jsonify({
            "success": False,
            "message": "An unexpected server error occurred.",
            "error": str(e)
        }), 500

    # 添加路由
    @app.route('/pack', methods=['POST'])
    def handle_packing_request():
        """處理來自前端的打包請求"""
        request_data = request.get_json()
        if not request_data:
            return jsonify({"success": False, "message": "Invalid or missing JSON data"}), 400
        
        # 適配前端發送的資料格式 (container, items) 到後端服務所需的格式 (container_size, objects)
        if 'items' in request_data:
            request_data['objects'] = request_data.pop('items')
        if 'container' in request_data:
            request_data['container_size'] = request_data.pop('container')

        # 呼叫核心打包邏輯
        result = run_packing_from_request(request_data)
        
        return jsonify(result)
    
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
            <li><code>POST /pack</code> - 執行3D Bin Packing</li>
            <li><code>GET /health</code> - 健康檢查</li>
        </ul>
        '''
    
    print("服務器配置完成")
    print("服務器將在 http://localhost:8889 啟動")
    print("3D Bin Packing API 端點: http://localhost:8889/pack")
    print("按 Ctrl+C 停止服務器")
    
    # 啟動服務器
    app.run(host='127.0.0.1', port=8889, debug=False, use_reloader=False)

if __name__ == "__main__":
    main()