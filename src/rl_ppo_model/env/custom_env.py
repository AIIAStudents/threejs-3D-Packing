import numpy as np
from gymnasium import spaces
from env.env_reward import calculate_longterm_reward
import gymnasium as gym

class CustomEnv(gym.Env):

    def __init__(self):
        super(CustomEnv, self).__init__()

        # 觀察空間：可視化用 64×64 圖像（或後續改為 3D voxel 表示）
        self.observation_shape = (64, 64, 1)
        self.observation_space = spaces.Box(low=0, high=255, shape=self.observation_shape, dtype=np.uint8)

        self.action_space = spaces.Discrete(100)  # 假設有 100 種放置策略

        self.scene_dims = np.array([150, 150, 150])  # 3D 場景大小
        self.placed_items = []
        self.step_count = 0
        self.max_steps = 50

        self.state = self._generate_scene()

    def reset(self, seed: int = None, options: dict = None):
        super().reset(seed=seed)
        self.placed_items = []
        self.step_count = 0
        self.state = self._generate_scene()

        info = {}  # 可加上初始 metadata
        return self.state, info

    def step(self, action):
        self.step_count += 1

        item = self._action_to_item(action)
        reward, status = calculate_longterm_reward(item, self.placed_items, self.scene_dims, False)

        if status == "success":
            self.placed_items.append(item)

        self.state = self._update_scene(item)

        terminated = False  # 你可根據狀態進行終止判斷
        truncated = self.step_count >= self.max_steps

        info = {"status": status, "placed": len(self.placed_items)}

        return self.state, reward, terminated, truncated, info

    def render(self, mode='human'):
        # 可整合 Three.js 或建立 matplotlib 可視化
        pass

    def _generate_scene(self):
        return np.zeros(self.observation_shape, dtype=np.uint8)

    def _update_scene(self, item):
        updated = self.state.copy()
        # 可視化邏輯（簡化）以 2D 投影表示 3D 放置物件
        x, y = int(item["pos"][0] * 64 / self.scene_dims[0]), int(item["pos"][2] * 64 / self.scene_dims[2])
        w, h = max(1, item["size"][0] // 5), max(1, item["size"][2] // 5)
        updated[y:y+h, x:x+w, 0] = 255
        return updated

    def _action_to_item(self, action):
        # 假設 action 編碼為放置位置與大小的映射
        grid_size = 10
        grid_pos = action % (grid_size ** 3)
        x = (grid_pos % grid_size) * (self.scene_dims[0] // grid_size)
        y = ((grid_pos // grid_size) % grid_size) * (self.scene_dims[1] // grid_size)
        z = (grid_pos // (grid_size ** 2)) * (self.scene_dims[2] // grid_size)

        # 固定大小 or 可隨機調整
        size = np.array([15, 15, 15])
        return {"pos": np.array([x, y, z]), "size": size}
        
    def load_scene(self, data):
        self.placed_items = []
        self.step_count = 0
        self.state = self._generate_scene()
        self.current_scene_id = data.get("scene_id", "unknown_scene")

        for obj in data.get("objects", []):
            item = {
                "pos": np.array(obj["pos"]),
                "size": np.array(obj["size"])
            }
            self.placed_items.append(item)
            self.state = self._update_scene(item)
