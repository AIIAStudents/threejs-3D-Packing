from flask import Flask, jsonify
import os

# 建立 Flask 應用實例
app = Flask(__name__)

# --- 藍圖註冊 ---
# 從我們建立的模組中導入藍圖變數
from .groups_api import groups_api_blueprint
from .groups_inventory_api import items_api_blueprint

# 註冊藍圖，並設定所有此藍圖的 API 路徑都以 /api/v2/ 為前綴
app.register_blueprint(groups_api_blueprint, url_prefix='/api/v2/groups')
app.register_blueprint(items_api_blueprint, url_prefix='/api/v2/items')
# --- 藍圖註冊結束 ---

# 設定 CORS (跨來源資源共用)，允許前端從不同來源訪問 API
from flask_cors import CORS
CORS(app)

@app.route('/api/v2/status', methods=['GET'])
def get_status():
    """
    一個簡單的 API 端點，用於檢查伺服器是否正常運行。
    """
    return jsonify({"status": "ok", "message": "API Server v2 is running"}), 200

# 其他 API 端點可以定義在這裡...

if __name__ == '__main__':
    """
    主程式進入點。
    當這個腳本被直接執行時 (例如 python api.py)，這段程式碼會被觸發。
    """
    # 使用與舊版伺服器相同的 8888 port
    # host='0.0.0.0' 讓伺服器可以從本地網路中的其他裝置訪問
    port = int(os.environ.get('PORT', 8888))
    app.run(host='0.0.0.0', port=port, debug=True)
