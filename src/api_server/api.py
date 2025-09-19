import os
import json
import uuid
import datetime
import traceback
import sys
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS

# Add the project's 'src' directory to the Python path
# This allows us to use absolute imports from 'src'
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# 導入3D Bin packing功能 (using absolute imports)
from api_server.bin_packing_api import create_bin_packing_routes, BLF_SA_Algorithm
from api_server.group_api import create_group_routes

# 初始化 Flask 應用與 CORS
app = Flask(__name__)
CORS(app) # 允許所有來源的跨域請求，適合開發環境


# 添加3D Bin packing路由
create_bin_packing_routes(app)
create_group_routes(app)

def get_db_connection():
    """Creates a database connection."""
    base_dir = os.path.dirname(__file__)
    db_path = os.path.abspath(os.path.join(base_dir, '..', '..', '..', 'database.db'))
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/api/get-scene', methods=['GET'])
def get_scene():
    """Fetches all items from the database and formats them for the frontend."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # This query joins the necessary tables to get the base information for each scene item.
        # We are fetching the most recent status for each item type from inventory_items.
        query = """
            SELECT
                si.id as scene_item_id,
                si.x, si.y, si.z,
                i.id as item_id,
                i.name as item_name,
                inv.status
            FROM scene_items si
            JOIN items i ON si.item_id = i.id
            LEFT JOIN (
                SELECT item_type_id, status, ROW_NUMBER() OVER(PARTITION BY item_type_id ORDER BY created_at DESC) as rn
                FROM inventory_items
            ) inv ON i.id = inv.item_type_id AND inv.rn = 1
            WHERE si.scene_id = 1; -- Assuming a single scene with id=1
        """
        cursor.execute(query)
        rows = cursor.fetchall()

        objects = []
        for row in rows:
            # For each item, get its specific properties (width, height, etc.)
            prop_cursor = conn.cursor()
            prop_cursor.execute("SELECT property_key, property_val FROM item_properties WHERE item_id = ?", (row['item_id'],))
            properties = prop_cursor.fetchall()
            
            geometry_params = {prop['property_key']: prop['property_val'] for prop in properties}

            # Map database schema to the frontend's expected JSON format
            obj = {
                "uuid": f"db-item-{row['scene_item_id']}", # Create a stable UUID
                "name": row['item_name'],
                "type": f"{row['item_name']}Geometry", # e.g., 'Cube' -> 'CubeGeometry'
                "status": 'unconfirmed' if row['status'] == 'pending' else 'confirmed',
                "position": {"x": row['x'], "y": row['y'], "z": row['z']},
                "scale": {"x": 1, "y": 1, "z": 1}, # Default scale
                "rotation": {"x": 0, "y": 0, "z": 0}, # Default rotation
                "geometry": geometry_params,
                "material": { # Default material, can be customized
                    "color": 0xcceeff,
                    "metalness": 0,
                    "roughness": 1
                },
                "physics": { # Default physics
                    "shape": row['item_name'].lower(),
                    "mass": 1
                }
            }
            objects.append(obj)

        conn.close()
        return jsonify({"objects": objects})

    except Exception as e:
        return jsonify({
            "error_code": "DATABASE_ERROR",
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

@app.route('/')
def home():
    return "🎉 API 已成功啟動！請使用 /status 或 /submit_scene"

@app.route('/status')
def status():
    return {'ok': True}

@app.route('/submit_scene', methods=['GET', 'POST', 'OPTIONS'])
def submit_scene():
    if request.method == 'OPTIONS':
        return '', 200
    if request.method != 'POST':
        return jsonify({
            "error_code": "METHOD_NOT_ALLOWED",
            "error": "請使用 POST 方法提交場景資料"
        }), 405

    data = request.get_json(silent=True)
    if data is None:
        print("收到前端場景資料：None")
        return jsonify({
            "error_code": "NO_JSON",
            "error": "未收到任何 JSON 資料"
        }), 400

    print("收到前端場景資料：", json.dumps(data, indent=2, ensure_ascii=False))

    if not isinstance(data, dict):
        return jsonify({
            "error_code": "INVALID_JSON",
            "error": "JSON 格式不正確"
        }), 400

    if 'objects' not in data or not isinstance(data['objects'], list):
        return jsonify({
            "error_code": "INVALID_OBJECTS",
            "error": "缺少 objects 欄位或格式錯誤"
        }), 400

    for idx, obj in enumerate(data['objects']):
        if not isinstance(obj, dict):
            return jsonify({
                "error_code": "INVALID_OBJECT_ITEM",
                "error": f"第 {idx} 個物件格式錯誤，需為物件"
            }), 400
        if 'position' not in obj or 'scale' not in obj:
            return jsonify({
                "error_code": "MISSING_FIELDS",
                "error": f"第 {idx} 個物件缺少 position 或 scale"
            }), 400

    try:
        # 儲存 JSON 檔案
        scene_id = data.get("scene_id", "unnamed")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:6]
        filename = f"{scene_id}_{timestamp}_{unique_id}.json"

        # Modified save_dir to not depend on rl_ppo_model
        save_dir = os.path.join("src", "test_file", "json_testfile")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        return jsonify({
            "status": "scene received",
            "num_objects": len(data["objects"]),
            "saved_to": save_path
        })

    except Exception as e:
        return jsonify({
            "error_code": "SERVER_ERROR",
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

@app.route('/api/save_container', methods=['POST', 'OPTIONS'])
def save_container():
    """
    Saves the container configuration (shape, dimensions, doors) to a JSON file.
    """
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({
            "error_code": "NO_JSON",
            "error": "未收到容器設定的 JSON 資料。"
        }), 400

    print("收到容器設定資料：", json.dumps(data, indent=2, ensure_ascii=False))

    if not isinstance(data, dict) or 'shape' not in data or 'dimensions' not in data or 'doors' not in data:
        return jsonify({
            "error_code": "INVALID_CONTAINER_CONFIG",
            "error": "容器設定格式不正確，必須包含 'shape', 'dimensions', 和 'doors'。"
        }), 400

    try:
        # This path is relative to the project root where the script is run from
        save_path = "container_config.json"

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)

        return jsonify({
            "status": "容器設定已儲存",
            "saved_to": save_path
        })

    except Exception as e:
        return jsonify({
            "error_code": "SERVER_ERROR",
            "error": str(e),
            "trace": traceback.format_exc()
        }), 500

if __name__ == "__main__":
    app.run(port=8889, debug=True)
