import os
import json
import uuid
import datetime
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from gymnasium.utils.env_checker import check_env

# 導入強化學習環境與場景管理器
from rl_ppo_model.env.item_env import EnvClass
from rl_ppo_model.env.custom_env import CustomEnv
from rl_ppo_model.core.scene_manager import SceneManager
from rl_ppo_model.ppo_agent.train_agent import run_training_step

# 導入3D Bin packing功能
from .bin_packing_api import create_bin_packing_routes, BLF_SA_Algorithm

# 初始化 Flask 應用與 CORS
app = Flask(__name__)
CORS(app)

# 初始化環境與場景管理器（只為 submit_scene）
init_env = EnvClass()
scene_mgr = SceneManager.get_instance()
scene_mgr.attach_env(init_env)

# 添加3D Bin packing路由
create_bin_packing_routes(app)

@app.route('/')
def home():
    return "🎉 API 已成功啟動！請使用 /status, /submit_scene 或 /get_action"

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
        # 只用 init_env 驗證和載入
        init_env.load_scene(data)

        # 儲存 JSON 檔案
        scene_id = data.get("scene_id", "unnamed")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:6]
        filename = f"{scene_id}_{timestamp}_{unique_id}.json"

        save_dir = os.path.join("rl_ppo_model", "tests", "json_testfile")
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

@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        state = request.get_json()

        if not state or 'objects' not in state or not isinstance(state['objects'], list):
            return jsonify({
                "error": "場景資料錯誤：缺少 'objects' 欄位或格式不正確"
            }), 400

        for i, obj in enumerate(state['objects']):
            missing_fields = []
            if 'uuid' not in obj:
                missing_fields.append('uuid')
            if 'position' not in obj:
                missing_fields.append('position')
            if 'scale' not in obj:
                missing_fields.append('scale')

            if missing_fields:
                return jsonify({
                    "error": f"第 {i} 個物件缺少欄位：{', '.join(missing_fields)}",
                    "object": obj
                }), 400

        # 初始化環境
        train_env = CustomEnv(state)

        try:
            print("[API] calling check_env...")
            check_env(train_env)
            print("[API] check_env passed")
        except Exception as e:
            return jsonify({
                "error": f"環境格式錯誤：{str(e)}"
            }), 400

        # 執行推論，拿到完整結果 dict
        result = run_training_step(train_env)

        # 直接回傳整包結果
        return jsonify(result)

    except Exception as e:
        print("🔥 執行 get_action 發生例外：", str(e))
        return jsonify({
            "error": f"執行失敗：{str(e)}"
        }), 400

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

    # 基本的資料驗證
    if not isinstance(data, dict) or 'shape' not in data or 'dimensions' not in data or 'doors' not in data:
        return jsonify({
            "error_code": "INVALID_CONTAINER_CONFIG",
            "error": "容器設定格式不正確，必須包含 'shape', 'dimensions', 和 'doors'。"
        }), 400

    try:
        # 將設定儲存至專案根目錄下的 container_config.json 檔案
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
    app.run(port=8888)