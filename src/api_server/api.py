import os
import json
import uuid
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

#  導入強化學習環境與場景管理器
from rl_ppo_model.env.item_env import EnvClass
from rl_ppo_model.core.scene_manager import SceneManager
from rl_ppo_model.ppo_agent.train_agent import run_training_step

#  初始化 Flask 應用與 CORS
app = Flask(__name__)
CORS(app)  # 允許跨來源請求

#  初始化環境與場景管理器
env = EnvClass()
scene_mgr = SceneManager.get_instance()
scene_mgr.attach_env(env)

#  預設首頁提示
@app.route('/')
def home():
    return "🎉 API 已成功啟動！請使用 /status, /submit_scene 或 /get_action"

#  API 健康檢查
@app.route('/status')
def status():
    return {'ok': True}

#  提交場景路由
@app.route('/submit_scene', methods=['GET', 'POST', 'OPTIONS'])
def submit_scene():
    # 禁止使用 GET 方法提交場景
    if request.method == 'GET':
        return jsonify({"error": "請使用 POST 方法提交場景資料"}), 405

    # CORS 預檢請求回應
    if request.method == 'OPTIONS':
        return '', 200

    try:
        # 解析 JSON 資料
        data = request.get_json()
        print(f"[method] {request.method}")
        print(f"[headers] {request.headers}")
        print(f"[data] {json.dumps(data, indent=2, ensure_ascii=False)}")

        #  載入場景進 RL 環境
        env.load_scene(data)
        num_objects = len(data.get("objects", []))

        # 🗂 儲存 JSON 檔案
        scene_id = data.get("scene_id", "unnamed")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:6]
        filename = f"{scene_id}_{timestamp}_{unique_id}.json"

        save_dir = os.path.join("rl_ppo_model", "tests", "json_testfile")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[ JSON 已儲存] {save_path}")

        return jsonify({
            "status": "scene received",
            "num_objects": num_objects,
            "saved_to": save_path
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

#  根據場景狀態產出行動與獎勵
@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        state = request.get_json()

        # 🔍 資料格式檢查
        if not state or 'objects' not in state or not isinstance(state['objects'], list):
            return jsonify({
                "error": "場景資料錯誤：缺少 'objects' 欄位或格式不正確"
            }), 400

        for i, obj in enumerate(state['objects']):
            if 'uuid' not in obj or 'position' not in obj:
                return jsonify({
                    "error": f"第 {i} 個物件缺少必要欄位：uuid 或 position",
                    "object": obj
                }), 400

        # ✅ 利用 state 初始化環境
        env.load_from_state(state)

        # ✅ 執行訓練
        action, reward = run_training_step(env)

        # 🎯 成功回應
        return jsonify({
            "action": action,
            "reward": reward
        })

    except Exception as e:
        print("🔥 執行 get_action 發生例外：", str(e))
        return jsonify({
            "error": f"執行失敗：{str(e)}"
        }), 400
#  啟動 Flask 伺服器
if __name__ == "__main__":
    app.run(port=8888)