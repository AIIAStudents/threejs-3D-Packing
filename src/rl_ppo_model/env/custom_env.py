import numpy as np
from gymnasium import spaces
from .env_reward import calculate_longterm_reward
from .item_env import EnvClass
import gymnasium as gym

class CustomEnv(gym.Env):
    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(self, render_mode=None):
        super().__init__()
        self.render_mode = render_mode

        # 📦 Observation space: 2D grayscale image
        self.observation_shape = (64, 64, 1)
        self.observation_space = spaces.Box(
            low=0, high=255,
            shape=self.observation_shape,
            dtype=np.uint8
        )

        # 🎮 Action space: Discrete grid position
        self.action_space = spaces.Discrete(100)

        # 🎯 初始化場景參數
        self.scene_dims = np.array([150, 150, 150])
        self.placed_items = []
        self.step_count = 0
        self.max_steps = 50
        self.state = self._generate_scene()

        # 🧠 整合 EnvClass（3D 空間 + 特徵抽取）
        self.envcore = EnvClass()

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)

        self.step_count = 0
        self.placed_items = []
        self.state = self._generate_scene()

        if seed is not None:
            np.random.seed(seed)

        self.envcore.reset()  # 同步重置核心環境

        info = {}
        return self.state, info

    def step(self, action):
        self.step_count += 1

        item = self._action_to_item(action)

        reward, status = calculate_longterm_reward(
            item, self.placed_items, self.scene_dims, False
        )

        if status == "success":
            self.placed_items.append(item)

        self.state = self._update_scene(item)

        self.envcore.update_scene(self.placed_items)

        terminated = False
        truncated = self.step_count >= self.max_steps
        info = {"status": status, "placed": len(self.placed_items)}

        return self.state, reward, terminated, truncated, info

    def _generate_scene(self):
        return np.zeros(self.observation_shape, dtype=np.uint8)

    def _update_scene(self, item):
        updated = self.state.copy()
        x = int(item["pos"][0] * 64 / self.scene_dims[0])
        y = int(item["pos"][2] * 64 / self.scene_dims[2])
        w = max(1, item["size"][0] // 5)
        h = max(1, item["size"][2] // 5)
        updated[y:y + h, x:x + w, 0] = 255
        return updated

    def _action_to_item(self, action):
        grid_size = 10
        grid_pos = action % (grid_size ** 3)
        x = (grid_pos % grid_size) * (self.scene_dims[0] // grid_size)
        y = ((grid_pos // grid_size) % grid_size) * (self.scene_dims[1] // grid_size)
        z = (grid_pos // (grid_size ** 2)) * (self.scene_dims[2] // grid_size)
        size = np.array([15, 15, 15])
        return {"pos": np.array([x, y, z]), "size": size}

    def render(self):
        if self.render_mode == "human":
            print(f"Rendering: {len(self.placed_items)} items placed")

    def close(self):
        pass

    def load_scene(self, data):
        self.step_count = 0
        self.placed_items = []
        self.state = self._generate_scene()
        self.current_scene_id = data.get("scene_id", "unknown")

        for obj in data.get("objects", []):
            item = {
                "pos": np.array(obj["pos"]),
                "size": np.array(obj["size"])
            }
            self.placed_items.append(item)
            self.state = self._update_scene(item)

        self.envcore.load_scene(data)

    def get_state_tensor(self):
        return self.envcore.get_state_tensor()

    def update_scene(self, items):
        # 讓 EnvClass 也支援 update_scene 呼叫
        self.envcore.objects = [self._normalize_item(item) for item in items]

    def _normalize_item(self, item):
        return {
            "position": {"x": item["pos"][0], "y": item["pos"][1], "z": item["pos"][2]},
            "scale": {"x": item["size"][0], "y": item["size"][1], "z": item["size"][2]},
            "material": {"metalness": 0, "roughness": 0, "color": 16777215},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "bbox": {"width": item["size"][0], "height": item["size"][1], "depth": item["size"][2]},
            "velocity": {"x": 0, "y": 0, "z": 0},
            "uuid": "custom-" + str(np.random.randint(10000)),
            "type": "box"
        }
