from stable_baselines3 import PPO
from rl_model.env.env import BackpackEnv
import os
from datetime import datetime
import argparse

def main():
    # 加入訓練參數設定
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=50000)
    args = parser.parse_args()

    # 檢查是否存在舊模型並載入
    env = BackpackEnv()
    model_path = "ppo_backpack"

    if os.path.exists(f"{model_path}.zip"):
        model = PPO.load(model_path, env=env)
        print("載入舊模型繼續訓練")
    else:
        # 訓練日誌與 TensorBoard
        model = PPO("MlpPolicy", env, verbose=1, tensorboard_log="./ppo_logs/")

    model.learn(total_timesteps=args.steps)
    
    # 設定儲存資料夾與時間戳
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model.save(f"{model_path}_{timestamp}")

    # 加入自動評估與模型測試
    obs = env.reset()
    for _ in range(100):
        action, _ = model.predict(obs)
        obs, reward, done, _ = env.step(action)
        env.render()
        if done:
            break

if __name__ == "__main__":
    main()
