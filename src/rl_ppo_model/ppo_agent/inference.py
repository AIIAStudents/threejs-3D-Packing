import os
import numpy as np
from stable_baselines3 import PPO
from env.custom_env import CustomEnv

def evaluate_model(model_path, num_episodes=10, render=False):
    # 建立環境
    env = CustomEnv()

    # 載入訓練完成的模型
    model = PPO.load(model_path)

    total_rewards = []
    total_successes = 0
    total_actions = 0

    print(f"🚀 開始模型測試，共執行 {num_episodes} 個場景")

    for episode in range(num_episodes):
        obs, _ = env.reset()
        done = False
        episode_reward = 0
        episode_success = 0

        while not done:
            action, _states = model.predict(obs)
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated  # 合併成舊版的 done 判斷
            episode_reward += reward
            total_actions += 1
            if info.get("status") == "success":
                episode_success += 1
            if render:
                env.render()

        total_rewards.append(episode_reward)
        total_successes += episode_success

        print(f"[Episode {episode+1}] Reward = {episode_reward:.2f}, Successes = {episode_success}")

    avg_reward = np.mean(total_rewards)
    avg_success_rate = total_successes / total_actions if total_actions > 0 else 0

    print("\n📊 模型評估結果:")
    print(f"🔹 平均 Reward: {avg_reward:.2f}")
    print(f"🔹 平均成功率: {avg_success_rate*100:.2f}%")

if __name__ == "__main__":
    model_path = "models/ppo_cube_v1.pt"
    evaluate_model(model_path, num_episodes=10, render=False)