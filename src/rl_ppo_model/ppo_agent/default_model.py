import os
import time
from stable_baselines3 import PPO
from rl_ppo_model.env.custom_env import CustomEnv

# 📁 預設模型儲存路徑
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
default_model_dir = os.path.join(base_dir, 'models', 'default')
default_model_path = os.path.join(default_model_dir, 'default_model.zip')
os.makedirs(default_model_dir, exist_ok=True)

def train_model(env, total_steps=100_000, save_path=default_model_path):
    """訓練 PPO 模型並儲存至指定路徑"""
    print(f"🚀 開始訓練預設模型，儲存至：{save_path}")
    model = PPO("MlpPolicy", env, verbose=1)
    model.learn(total_timesteps=total_steps)
    model.save(save_path)
    print(f"✅ 預設模型訓練完成並儲存至 {save_path}")

def run_training_step(env, model_path=None):
    """
    單步推論：若模型不存在則使用預設模型訓練
    - env：已準備好的 CustomEnv
    - model_path：目標模型路徑（可選）
    """
    # 如果沒指定模型路徑，或指定的模型不存在，就使用預設模型
    if not model_path or not os.path.exists(model_path):
        print("⚠️ 模型路徑無效或模型不存在，將使用預設模型重新訓練")
        train_model(env)  # 使用預設路徑訓練
        model_path = default_model_path

    # 載入模型並執行推論
    model = PPO.load(model_path, env=env)
    obs, info = env.reset()
    action, _ = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    return action.tolist(), reward

if __name__ == "__main__":
    # 初始化環境（請替換成你的真實場景資料）
    scene_data = {"objects": []}
    env = CustomEnv(scene_data)

    # 嘗試推論（可指定模型路徑）
    action, reward = run_training_step(env, model_path=None)
    print(f"🎯 推論結果：action={action}, reward={reward}")