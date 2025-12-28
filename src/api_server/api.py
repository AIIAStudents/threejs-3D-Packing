import os
import json
import uuid
import datetime
import traceback
import sys
import sqlite3
import time
import traceback
from flask import Flask, request, jsonify, g, make_response
from flask_cors import CORS

# Add the project's 'src' directory to the Python path
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# 導入自訂日誌模組
from api_server.logger import log, LOG_VERBOSE

# 導入需要的 API 模組
from api_server.group_api import create_group_routes
from api_server.item_api import create_item_routes
from api_server.assignment_api import assignment_api # <-- 匯入新的 assignment API
from api_server.packer_service import run_packing_from_request # <-- 匯入新的打包服務

# 初始化 Flask 應用與 CORS
app = Flask(__name__)
# FIX: Allow all origins for easier local development, and expose custom headers
CORS(app, resources={r"/*": {"origins": "http://localhost:5173", "expose_headers": "X-Trace-Id"}})

# 註冊路由
create_group_routes(app)
create_item_routes(app)
app.register_blueprint(assignment_api) # <-- 註冊新的 assignment blueprint

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
def convert_frontend_payload(data):
    """Converts the old frontend payload format to the one expected by the packer_service."""
    if 'container_size' in data and 'objects' in data:
        return data  # Already in the new format

    new_data = {}
    # Convert container -> container_size
    if 'container' in data:
        new_data['container_size'] = {
            'width': data['container'].get('width'),
            'height': data['container'].get('height'),
            'depth': data['container'].get('depth')
        }
    
    # Convert items_to_pack -> objects
    if 'items_to_pack' in data:
        new_data['objects'] = data['items_to_pack']
        
    return new_data

@app.route('/pack', methods=['POST', 'OPTIONS'])
def pack_alias():
    """Alias for /api/pack_objects for backward compatibility."""
    if request.method == 'OPTIONS':
        return '', 200
    
    # 呼叫主打包函式
    return pack_objects()


@app.route('/api/pack_objects', methods=['POST', 'OPTIONS'])
def pack_objects():
    """處理 3D Bin Packing 請求，並整合結構化日誌"""
    if request.method == 'OPTIONS':
        return '', 200

    t_start = time.time()
    data = request.get_json(force=True, silent=True) or {}
    
    # 1. 獲取或生成 trace_id
    trace_id = request.headers.get('X-Trace-Id') or data.get('trace_id') or f"be-gen-{uuid.uuid4().hex[:8]}"

    log('INFO', 'FlaskAPI', trace_id, '收到打包請求',
        path=request.path,
        method=request.method,
        content_length=request.content_length or 0
    )

    result = {}
    status_code = 500

    try:
        if not data:
            raise ValueError("請求內容為空或非有效 JSON")

        if LOG_VERBOSE:
            log('INFO', 'FlaskAPI', trace_id, '請求內容預覽',
                object_count=len(data.get('objects', [])),
                zone_count=len(data.get('zones', [])),
                container_size=data.get('container_size')
            )

        # 2. 呼叫核心打包服務，傳入 trace_id
        result = run_packing_from_request(data, trace_id)
        
        if result.get('success'):
            status_code = 200
        else:
            # 如果服務內部回傳錯誤，但不是 Exception
            status_code = 400
            log('ERROR', 'FlaskAPI', trace_id, '打包服務回報錯誤', error=result.get('error'))

    except Exception as e:
        status_code = 500
        error_info = {
            "error_type": type(e).__name__,
            "message": str(e),
            "trace": traceback.format_exc().splitlines()[-3:]
        }
        result = {"success": False, "error": "伺服器處理時發生未預期錯誤", "details": error_info}
        log('ERROR', 'FlaskAPI', trace_id, '請求處理時發生例外', **error_info)

    finally:
        duration_ms = (time.time() - t_start) * 1000
        
        if status_code == 200:
            stats = result.get('statistics', {})
            log('INFO', 'FlaskAPI', trace_id, '請求成功完成',
                duration_ms=round(duration_ms, 2),
                packed_count=stats.get('packed_objects', 0),
                unpacked_count=stats.get('unpacked_objects', 0),
                volume_utilization=round(stats.get('volume_utilization', 0), 4)
            )
        else:
            log('INFO', 'FlaskAPI', trace_id, '請求處理結束(失敗)',
                duration_ms=round(duration_ms, 2),
                status_code=status_code
            )

        response = make_response(jsonify(result), status_code)
        response.headers['X-Trace-Id'] = trace_id
        return response

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

@app.route('/save_container_config', methods=['POST', 'OPTIONS'])
def save_container_config():
    if request.method == 'OPTIONS':
        return '', 200
        
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
