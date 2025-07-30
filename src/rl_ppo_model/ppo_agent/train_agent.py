import os
import gym
from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from ppo_agent.custom_env import CustomEnv  # 根據實際路徑調整

def main():
    # 建立環境實例
    env = CustomEnv()

    # 檢查 gym 相容性（可選）
    check_env(env)

    # 建立 PPO 模型：使用 CNN policy，觀察空間為圖像格式
    model = PPO(
        policy="CnnPolicy",
        env=env,
        verbose=1,
        tensorboard_log="./tensorboard_logs/"  # 選用：可視化訓練曲線
    )

    # 訓練模型
    total_steps = 100_000
    print(f"🚀 開始訓練 {total_steps} steps ...")
    model.learn(total_timesteps=total_steps)

    # 儲存模型
    save_path = "ppo_cube_packer"
    os.makedirs("models", exist_ok=True)
    model.save(os.path.join("models", save_path))
    print(f"✅ 模型已儲存到 models/{save_path}")

if __name__ == "__main__":
    main()