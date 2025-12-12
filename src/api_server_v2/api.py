from flask import Flask, jsonify
import os
import sys

# -- Robust Path Handling --
# Ensure the project root is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
# Assuming api.py is in src/api_server_v2/, project root is 3 levels up
project_root = os.path.abspath(os.path.join(current_dir, '..', '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)
# -- End Robust Path Handling --


# --- Centralized Database Management ---
# 1. Import shared path and all table initializers using absolute paths
from src.api_server_v2.db_config import SHARED_DATABASE_PATH
from src.api_server_v2.groups_inventory.groups_api import init_groups_table
from src.api_server_v2.groups_inventory.groups_inventory_api import init_items_table
from src.api_server_v2.container.container_parameters import init_containers_table
from src.api_server_v2.container.container_cut_space import init_cutting_tables
from src.api_server_v2.assignment_api import init_assignments_table

# 2. Delete the old database file on server startup to ensure a clean slate
if os.path.exists(SHARED_DATABASE_PATH):
    os.remove(SHARED_DATABASE_PATH)
    print(f"Removed old database file: {SHARED_DATABASE_PATH}")

# 3. Re-initialize all tables in the new, empty database file
print("--- Initializing all database tables ---")
init_groups_table()
init_items_table()
init_containers_table()
init_cutting_tables()
init_assignments_table()
print("--- Database initialization complete ---")
# --- End of Database Management ---


# 建立 Flask 應用實例
app = Flask(__name__)

# --- 藍圖註冊 ---
# 從我們建立的模組中導入藍圖變數 (using absolute paths)
from src.api_server_v2.groups_inventory.groups_api import groups_api_blueprint
from src.api_server_v2.groups_inventory.groups_inventory_api import items_api_blueprint
from src.api_server_v2.container.container_parameters import container_api_blueprint
from src.api_server_v2.container.container_cut_space import cut_space_api_blueprint
from src.api_server_v2.assignment_api import assignment_api_blueprint

# 註冊藍圖，並設定所有此藍圖的 API 路徑都以 /api/v2/ 為前綴
app.register_blueprint(groups_api_blueprint, url_prefix='/api/v2/groups')
app.register_blueprint(items_api_blueprint, url_prefix='/api/v2/items')
app.register_blueprint(container_api_blueprint, url_prefix='/api/v2/containers')
app.register_blueprint(cut_space_api_blueprint, url_prefix='/api/v2/cutting')
app.register_blueprint(assignment_api_blueprint, url_prefix='/api')
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
