import os
from stable_baselines3 import PPO
from rl_ppo_model.env.custom_env import CustomEnv

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
    """
    # 預設模型路徑
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_model_path = os.path.join(base_dir, 'models', 'default', 'default_model.zip')

    # 使用預設模型路徑（如果未指定）
    if model_path is None:
        print("📢 未指定模型路徑，使用預設模型")
        model_path = default_model_path

    # 如果模型不存在，根據設定自動訓練
    if not os.path.exists(model_path):
        if auto_train_if_missing:
            print(f"⚠️ 模型不存在：{model_path}\n🚀 開始自動訓練預設模型...")
            train_model(env, total_steps=100_000, save_path=model_path)
        else:
            raise FileNotFoundError(f"❌ 模型檔案不存在：{model_path}")

    # 載入模型並推論
    model = PPO.load(model_path, env=env)
    obs, info = env.reset()
    action, _ = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    return action.tolist(), reward

if __name__ == "__main__":
    scene_data = {"objects": []}  # ← 換成你的真實場景資料
    env = CustomEnv(scene_data)

    # 不指定模型 → 自動使用預設模型，並在缺失時自動訓練
    action, reward = run_training_step(env)
    print(f"🎯 推論結果：action={action}, reward={reward}")
    
