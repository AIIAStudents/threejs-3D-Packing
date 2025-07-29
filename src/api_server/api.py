from flask import Flask, request, jsonify
from flask_cors import CORS  # ← 加這行來支援跨來源請求
from rl_ppo_model.env.item_env import EnvClass

app = Flask(__name__)
CORS(app)  # ← 允許從不同來源（如 Vite 前端）發送 fetch 請求

env = EnvClass()

@app.route('/')
def home():
    return "🎉 API 已成功啟動！請使用 /status, /submit_scene 或 /get_action"

@app.route('/status')
def status():
    return {'ok': True}

@app.route('/submit_scene', methods=['GET', 'POST', 'OPTIONS'])
def submit_scene():
    if request.method == 'GET':
        return jsonify({"error": "請使用 POST 方法提交場景資料"}), 405

    if request.method == 'OPTIONS':
        # 預檢（preflight）請求，自動回應
        return '', 200

    try:
        data = request.get_json()
        print(f"[method] {request.method}")
        print(f"[headers] {request.headers}")
        print(f"[data] {data}")

        env.load_scene(data)
        num_objects = len(data["objects"]) if "objects" in data else 0
        return jsonify({"status": "scene received", "num_objects": num_objects})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/get_action', methods=['POST'])
def get_action():
    try:
        state = request.get_json()
        action, reward = env.step_from_state(state)
        return jsonify({
            "action": action,
            "reward": reward
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(port=8888)