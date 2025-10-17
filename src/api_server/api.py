import os
import json
import uuid
import datetime
import traceback
import sys
import sqlite3
from flask import Flask, request, jsonify, g
from flask_cors import CORS

# Add the project's 'src' directory to the Python path
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# 導入需要的 API 模組
from api_server.group_api import create_group_routes
from api_server.item_api import create_item_routes
from api_server.packer_service import run_packing_from_request # <-- 匯入新的打包服務

# 初始化 Flask 應用與 CORS
app = Flask(__name__)
# FIX: Allow all origins for easier local development
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

# 註冊路由
create_group_routes(app)
create_item_routes(app)

# --- Database Connection ---
def get_db():
    """Opens a new database connection if there is none yet for the
    current application context.
    """
    if 'db' not in g:
        base_dir = os.path.dirname(__file__)
        db_path = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'database.db'))
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()
@app.route('/api/pack_objects', methods=['POST', 'OPTIONS'])
def pack_objects():
    """處理 3D Bin Packing 請求"""
    
    # 處理 CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    # 記錄請求資訊（除錯用）
    print("=" * 60)
    print("📥 收到 pack_objects 請求")
    print(f"Content-Type: {request.content_type}")
    print(f"Request data length: {len(request.data) if request.data else 0}")
    print("=" * 60)
    
    # 嘗試解析 JSON
    try:
        data = request.get_json(force=True)
        
        # 檢查是否成功解析
        if data is None:
            print("❌ JSON 解析結果為 None")
            return jsonify({
                "success": False,
                "error": "未收到有效的 JSON 資料",
                "message": "Request body 是空的或格式不正確"
            }), 400
        
        print(f"✅ 成功解析 JSON，包含 {len(data.get('objects', []))} 個物件")
        print(f"容器類型: {data.get('container_type', 'unknown')}")
        
        # === FIX: 呼叫新的 py_packer 演算法服務 ===
        result = run_packing_from_request(data)
        
        # 檢查 packer_service 內部是否發生錯誤
        if 'error' in result:
            print(f"❌ 演算法服務回傳錯誤: {result.get('error')}")
            return jsonify(result), 500

        print(f"✅ 打包完成，回傳 {len(result.get('packed_objects', []))} 個物件")
        return jsonify(result), 200
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失敗: {e}")
        return jsonify({
            "success": False,
            "error": f"JSON 格式錯誤: {str(e)}",
            "message": "請確認發送的資料是有效的 JSON 格式"
        }), 400
        
    except Exception as e:
        print(f"❌ 伺服器錯誤: {e}")
        print(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "伺服器處理請求時發生錯誤",
            "trace": traceback.format_exc()
        }), 500

# --- Routes ---
@app.route('/api/get-scene', methods=['GET'])
def get_scene():
    """Fetches all items from the database and formats them for the frontend."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        query = """
            SELECT
                si.id as scene_item_id, si.x, si.y, si.z,
                i.id as item_id, i.name as item_name, inv.status
            FROM scene_items si
            JOIN items i ON si.item_id = i.id
            LEFT JOIN (
                SELECT item_type_id, status, ROW_NUMBER() OVER(PARTITION BY item_type_id ORDER BY created_at DESC) as rn
                FROM inventory_items
            ) inv ON i.id = inv.item_type_id AND inv.rn = 1
            WHERE si.scene_id = 1;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        objects = []
        for row in rows:
            prop_cursor = conn.cursor()
            prop_cursor.execute("SELECT property_key, property_val FROM item_properties WHERE item_id = ?", (row['item_id'],))
            properties = prop_cursor.fetchall()
            geometry_params = {prop['property_key']: prop['property_val'] for prop in properties}
            obj = {
                "uuid": f"db-item-{row['scene_item_id']}",
                "name": row['item_name'],
                "type": f"{row['item_name']}Geometry",
                "status": 'unconfirmed' if row['status'] == 'pending' else 'confirmed',
                "position": {"x": row['x'], "y": row['y'], "z": row['z']},
                "scale": {"x": 1, "y": 1, "z": 1},
                "rotation": {"x": 0, "y": 0, "z": 0},
                "geometry": geometry_params,
                "material": {"color": 0xcceeff, "metalness": 0, "roughness": 1},
                "physics": {"shape": row['item_name'].lower(), "mass": 1}
            }
            objects.append(obj)
        return jsonify({"objects": objects})
    except Exception as e:
        return jsonify({"error_code": "DATABASE_ERROR", "error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/')
def home():
    return "🎉 RL/Group API is running!"

@app.route('/status')
def status():
    return jsonify({'ok': True})

@app.route('/submit_scene', methods=['POST', 'OPTIONS'])
def submit_scene():
    if request.method == 'OPTIONS':
        return '', 200
    if request.method != 'POST':
        return jsonify({"error_code": "METHOD_NOT_ALLOWED", "error": "請使用 POST 方法提交場景資料"}), 405

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error_code": "NO_JSON", "error": "未收到任何 JSON 資料"}), 400

    if not isinstance(data, dict):
        return jsonify({"error_code": "INVALID_JSON", "error": "JSON 格式不正確"}), 400

    if 'objects' not in data or not isinstance(data['objects'], list):
        return jsonify({"error_code": "INVALID_OBJECTS", "error": "缺少 objects 欄位或格式錯誤"}), 400

    for idx, obj in enumerate(data['objects']):
        if not isinstance(obj, dict):
            return jsonify({"error_code": "INVALID_OBJECT_ITEM", "error": f"第 {idx} 個物件格式錯誤，需為物件"}), 400
        if 'position' not in obj or 'scale' not in obj:
            return jsonify({"error_code": "MISSING_FIELDS", "error": f"第 {idx} 個物件缺少 position 或 scale"}), 400

    try:
        scene_id = data.get("scene_id", "unnamed")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:6]
        filename = f"{scene_id}_{timestamp}_{unique_id}.json"
        
        # Use absolute path for saving files
        save_dir = os.path.join(src_path, "test_file", "json_testfile")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return jsonify({"status": "scene received", "num_objects": len(data["objects"]), "saved_to": save_path})
    except Exception as e:
        return jsonify({"error_code": "SERVER_ERROR", "error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/save_container_config', methods=['POST'])
def save_container_config():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error_code": "NO_JSON", "error": "未收到容器設定的 JSON 資料。"}), 400

    if not isinstance(data, dict) or 'shape' not in data or 'dimensions' not in data or 'doors' not in data:
        return jsonify({"error_code": "INVALID_CONTAINER_CONFIG", "error": "容器設定格式不正確，必須包含 'shape', 'dimensions', 和 'doors'。"}), 400

    try:
        # Use absolute path for saving files
        save_path = os.path.join(src_path, "container_config.json")
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return jsonify({"status": "容器設定已儲存", "saved_to": save_path})
    except Exception as e:
        return jsonify({"error_code": "SERVER_ERROR", "error": str(e), "trace": traceback.format_exc()}), 500

if __name__ == "__main__":
    # To prevent issues with the reloader, we run with debug and reloader disabled.
    app.run(host="127.0.0.1", port=8888, debug=False, use_reloader=False)
