import os
import json
import numpy as np
from stable_baselines3 import PPO
from rl_ppo_model.env.custom_env import CustomEnv

def make_json_safe(obj):
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_safe(v) for v in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj

def train_model(env, total_steps=100_000, save_path="ppo_model.zip"):
    """訓練 PPO 模型並儲存"""
    model = PPO("MlpPolicy", env, verbose=1)
    model.learn(total_timesteps=total_steps)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    model.save(save_path)
    print(f"✅ 模型儲存至 {save_path}")

def run_training_step(env, model_path=None, auto_train_if_missing=True):
    """
    單步推論：自動使用預設模型，並在缺失時自動訓練
    - env：已初始化的 CustomEnv
    - model_path：可選，若未提供則使用預設模型
    - auto_train_if_missing：若模型不存在，是否自動訓練
    - 回傳 dict，包含前端要的 action 物件、reward、done、info
    """
    # 1. 準備預設模型路徑
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_model_path = os.path.join(base_dir, 'models', 'default', 'default_model.zip')
    if model_path is None:
        print("📢 未指定模型路徑，使用預設模型")
        model_path = default_model_path

    # 2. 如果模型不存在，自動訓練
    if not os.path.exists(model_path):
        if auto_train_if_missing:
            print(f"⚠️ 模型不存在：{model_path}\n🚀 開始自動訓練預設模型...")
            train_model(env, total_steps=100_000, save_path=model_path)
        else:
            raise FileNotFoundError(f"❌ 模型檔案不存在：{model_path}")

    # 3. 載入模型並推論
    model = PPO.load(model_path, env=env)
    obs, _ = env.reset()
    action_idx, _ = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action_idx)

    # 4. 把 action_idx 轉成前端要的完整物件
    item = env._action_to_item(action_idx)
    action_obj = env._normalize_item(item)

    # 5. 回傳 dict，直接給 jsonify
    return make_json_safe({
        "action": action_obj,
        "reward": reward,
        "done": bool(terminated or truncated),
        "info": info
    })

if __name__ == "__main__":
    # 範例場景資料，請替換成你的真實 state
    scene_data = {
        "objects": [
            # {"uuid": "...", "position": {...}, ...}
        ]
    }
    env = CustomEnv(scene_data)

    # 執行單步推論（若無模型會自動訓練）
    result = run_training_step(env)
    # 直接印出 JSON 結構
    print("🎯 推論結果：")
    print(json.dumps(result, ensure_ascii=False, indent=2))

    
