import numpy as np
import gym
from env.env import BackpackEnv

class SingleShapeEnv(gym.Wrapper):
    def __init__(self, shape: str, target_count: int = 2):
        super().__init__(BackpackEnv(enable_logs=False))
        self.shape = shape
        self.target_count = target_count
        self.placed_count = 0

        # 👇 加入這行：定義 observation 空間為長度 28 的連續向量
        self.observation_space = gym.spaces.Box(low=-1.0, high=1.0, shape=(28,), dtype=np.float32)

    def reset(self):
        obs = self.env.reset()
        self.placed_count = 0
        self.env.raw_items = [item for item in self.env.raw_items if self.shape.lower() in item["name"].lower()]
        self.env.items = [item for item in self.env.items if self.shape.lower() in str(item)]

        # 👇 如果原始 obs 長度不足 28，進行 padding
        obs = self._pad_obs(obs)
        return obs

    def step(self, action):
        obs, reward, done, info = self.env.step(action)
        status = "success" if reward >= 0 else "fail"
        info = {"status": status, "success": reward >= 0}

        if reward >= 0:
            self.placed_count += 1

        if self.placed_count >= self.target_count:
            done = True
            info["goal_achieved"] = True

        # 👇 padding step 回傳的 obs
        obs = self._pad_obs(obs)
        return obs, reward, done, info

    def _pad_obs(self, obs):
        obs = np.array(obs, dtype=np.float32)
        if obs.shape[0] < 28:
            obs = np.pad(obs, (0, 28 - obs.shape[0]), 'constant')
        elif obs.shape[0] > 28:
            obs = obs[:28]  # 截斷以符合 PPO 模型需求
        return obs