import gymnasium as gym
import torch
import numpy as np
from gymnasium import spaces
from .config.utils import load_scene_config
from rl_ppo_model.utils.scene_preprocess import normalize_object

class EnvClass(gym.Env):
    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(self, render_mode=None):
        super().__init__()
        self.scene = None
        self.objects = []
        self.agent = None

        self.max_objects = 20
        self.obs_dim = 18
        self.step_limit = 100
        self.step_count = 0
        self.render_mode = render_mode
        self._rng = np.random.default_rng()

        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(self.max_objects, self.obs_dim),
            dtype=np.float32
        )

        self.action_space = spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(3,),
            dtype=np.float32
        )

    def load_scene(self, scene_data: dict):
        self.scene = scene_data
        raw_objects = scene_data.get("objects", [])
        self.objects = [normalize_object(obj) for obj in raw_objects]

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            self._rng = np.random.default_rng(seed)
            torch.manual_seed(seed)

        if not self.scene:
            raise RuntimeError("請先呼叫 load_scene(scene_data)")
        self.step_count = 0

        obs = self._get_obs()
        info = {}
        return obs, info

    def step(self, action):
        if not self.scene:
            raise RuntimeError("請先呼叫 load_scene(scene_data)")
        self.step_count += 1

        reward = self._compute_reward(self.scene, action)
        obs = self._get_obs()
        terminated = self.step_count >= self.step_limit
        truncated = False
        info = {}

        return obs, reward, terminated, truncated, info

    def _get_obs(self):
        tensor = self.get_state_tensor()
        pad_size = self.max_objects - tensor.shape[0]
        if pad_size > 0:
            pad = torch.zeros((pad_size, self.obs_dim))
            tensor = torch.cat([tensor, pad], dim=0)
        return tensor.numpy()

    def _compute_reward(self, state, action):
        return 1.0  # TODO: 根據任務定義計算 reward

    def get_state_tensor(self):
        state = []
        for obj in self.objects:
            pos = obj["position"]
            scale = obj["scale"]
            material = obj["material"]
            rotation = obj["rotation"]
            bbox = obj["bbox"]
            velocity = obj["velocity"]

            feat = [
                pos["x"], pos["y"], pos["z"],
                scale["x"], scale["y"], scale["z"],
                material["metalness"],
                material["roughness"],
                material["color"] / 16777215,
                rotation["x"], rotation["y"], rotation["z"],
                bbox["width"], bbox["height"], bbox["depth"],
                velocity["x"], velocity["y"], velocity["z"]
            ]
            state.append(feat)

        return torch.tensor(state, dtype=torch.float32)

    def render(self):
        if self.render_mode == "human":
            print(f"Rendering scene with {len(self.objects)} objects")

    def close(self):
        pass
    
if __name__ == "__main__":
    scene = load_scene_config()
    print("[初始化容器]", scene["environment_meta"]["container"])
    print("[物件數量]", len(scene["objects"]))

    env = EnvClass()
    env.load_scene(scene)

    obs, info = env.reset(seed=42)
    print("[初始觀察值 Shape]", obs.shape)

    action = env.action_space.sample()
    print("[隨機動作]", action)

    next_obs, reward, terminated, truncated, info = env.step(action)
    print("[Agent 執行後觀察]", next_obs.shape)
    print("[Reward]", reward)
    print("[Terminated]", terminated)
    print("[Truncated]", truncated)