import os
import argparse
from datetime import datetime

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecMonitor
from stable_baselines3.common.callbacks import EvalCallback, StopTrainingOnRewardThreshold

from model.test_shape import SingleShapeEnv
from env.env import BackpackEnv

from stable_baselines3.common.monitor import Monitor

def make_env(rank: int):
    def _init():
        env = BackpackEnv(enable_logs=False)
        return env
    return _init

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=500000)
    parser.add_argument("--n_envs", type=int, default=8)
    args = parser.parse_args()

    # 1. 向量化環境（使用 DummyVecEnv）
    envs = DummyVecEnv([make_env(i) for i in range(args.n_envs)])
    envs = VecMonitor(envs)

    # 2. 載入或新建模型
    model_path = "ppo_backpack"
    if os.path.exists(f"{model_path}.zip"):
        model = PPO.load(model_path, env=envs, device="cuda", reset_num_timesteps=False)
        print("載入舊模型，繼續訓練…")
    else:
        model = PPO(
            policy="MlpPolicy",
            env=envs,
            verbose=1,
            tensorboard_log="./ppo_logs",
            learning_rate=3e-4,
            gamma=0.98,
            n_steps=1024,
            device="cuda"
        )

    # 3. 評估 callback
    eval_env = DummyVecEnv([make_env(999)])
    stop_cb = StopTrainingOnRewardThreshold(reward_threshold=20, verbose=1)
    eval_callback = EvalCallback(
        eval_env,
        callback_on_new_best=stop_cb,
        best_model_save_path="./best_model",
        log_path="./eval_logs",
        eval_freq=5000,
        n_eval_episodes=5,
        deterministic=True,
        verbose=1
    )

    # 4. 開始訓練
    model.learn(total_timesteps=args.steps, callback=eval_callback)

    # 5. 儲存最終模型
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    model.save(f"{model_path}_{ts}")

    # 6. 測試並 render 多輪
    test_env = BackpackEnv(enable_logs=True)
    obs = test_env.reset()
    for _ in range(1000):
        action, _ = model.predict(obs, deterministic=True)
        obs, _, done, _ = test_env.step(action)
        test_env.render()
        if done:
            obs = test_env.reset()
    test_env.close()

if __name__ == "__main__":
    main()

