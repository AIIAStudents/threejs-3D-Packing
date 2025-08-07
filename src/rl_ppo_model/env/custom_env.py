import numpy as np
from gymnasium import spaces
from .env_reward import calculate_longterm_reward
from rl_ppo_model.utils.scene_preprocess import normalize_object
from rl_ppo_model.utils.standardize_item import standardize_item
from .item_env import EnvClass
import gymnasium as gym

class CustomEnv(gym.Env):
    metadata = {"render_modes": ["human"], "render_fps": 30}

    def __init__(self, scene_data, render_mode=None):
        super().__init__()
        self.render_mode = render_mode
        self.envcore = EnvClass()
        self.envcore.load_scene(scene_data)
        self.observation_shape = (64, 64, 1)
        self.observation_space = spaces.Box(low=0, high=255, shape=self.observation_shape, dtype=np.uint8)
        self.action_space = spaces.Discrete(100)
        self.scene_dims = np.array([150, 150, 150])
        self.placed_items = []
        self.step_count = 0
        self.max_steps = 50
        
        # 👇 先依現有物件產生正確的 state
        self.load_scene(scene_data)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.step_count = 0
        self.placed_items = []
        if seed is not None:
            np.random.seed(seed)
        self.state = self._generate_scene()
        assert self.observation_space.contains(self.state), \
            f"❌ obs 不符合 observation_space 定義\nobs shape: {self.state.shape}, dtype: {self.state.dtype}\nexpected space: {self.observation_space}"
        info = {}
        return self.state, info

    def step(self, action):
        self.step_count += 1

        item = self._action_to_item(action)
        print("🧪 item 結構:", item)
        if "pos" not in item or not isinstance(item["pos"], np.ndarray):
                raise ValueError(f"❌ 無效的 item 結構：{item}")
        reward, status = calculate_longterm_reward(
            item, self.placed_items, self.scene_dims, False
        )

        if status == "success":
            self.placed_items.append(item)

        self.state = self._update_scene(item)

        # 👇 update_scene: 會同步 self.placed_items 和 envcore.objects
        self.update_scene(self.placed_items)
        self.state = self._generate_scene()
        if self.state.ndim == 2:
            self.state = np.expand_dims(self.state, axis=-1)
            
        assert self.observation_space.contains(self.state), \
            f"❌ step() 回傳的 obs 不符合 observation_space 定義\nobs shape: {self.state.shape}, dtype: {self.state.dtype}\nexpected space: {self.observation_space}"

        terminated = False
        truncated = self.step_count >= self.max_steps
        info = {"status": status, "placed": len(self.placed_items)}

        return self.state, reward, terminated, truncated, info

    def _generate_scene(self):
        # 根據 self.placed_items 產生 2D 場景 state
        scene_img = np.zeros(self.observation_shape, dtype=np.uint8)
        for item in self.placed_items:
            scene_img = self._update_scene(item, base=scene_img)
        return scene_img

    def _update_scene(self, item, base=None):
        # 支援外部傳 base image，否則預設用 self.state
        updated = base.copy() if base is not None else self.state.copy()
        if updated.ndim == 2:
            updated = np.expand_dims(updated, axis=-1)
        elif updated.shape != self.observation_shape:
            updated = np.zeros(self.observation_shape, dtype=np.uint8)

        if "pos" not in item or "size" not in item:
            print(f"⚠️ item 缺少必要欄位：{item}")
            return updated

        try:
            x = int(item["pos"][0] * 64 / self.scene_dims[0])
            y = int(item["pos"][2] * 64 / self.scene_dims[2])
            w = max(1, item["size"][0] // 5)
            h = max(1, item["size"][2] // 5)
            updated[y:y + h, x:x + w, 0] = 255
        except Exception as e:
            print(f"⚠️ 更新場景失敗：{e}, item={item}")

        return updated.astype(np.uint8)

    def _action_to_item(self, action):
        grid_size = 10
        grid_pos = action % (grid_size ** 3)
        x = (grid_pos % grid_size) * (self.scene_dims[0] // grid_size)
        y = ((grid_pos // grid_size) % grid_size) * (self.scene_dims[1] // grid_size)
        z = (grid_pos // (grid_size ** 2)) * (self.scene_dims[2] // grid_size)
        size = np.array([15, 15, 15])
        item = {
            "pos": np.array([x, y, z]),
            "size": size
        }
        assert "pos" in item and isinstance(item["pos"], np.ndarray), f"❌ item 缺少 'pos' 欄位：{item}"
        return item

    def render(self):
        if self.render_mode == "human":
            print(f"Rendering: {len(self.placed_items)} items placed")

    def close(self):
        pass

    def load_scene(self, data):
        self.step_count = 0
        self.placed_items = []
        self.current_scene_id = data.get("scene_id", "unknown")

        # 依物件標準化並加入 placed_items
        for i, obj in enumerate(data.get("objects", [])):
            try:
                item = standardize_item(obj)
                self.placed_items.append(item)
            except Exception as e:
                print(f"⚠️ 忽略第 {i} 個無效物件：{e}")

        # 依 placed_items 產生正確 state
        self.state = self._generate_scene()

        # 同步將整個場景交給底層 EnvClass
        self.envcore.load_scene(data)

    def get_state_tensor(self):
        return self.envcore.get_state_tensor()

    def update_scene(self, items):
        # 👇 同步 self.placed_items 與 envcore.objects
        self.placed_items = [item for item in items]
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


if __name__ == "__main__":
    dummy_scene = {"objects": []}
    env = CustomEnv(dummy_scene)
    obs, info = env.reset()
    print("✅ reset obs shape:", obs.shape)
    print("✅ reset obs dtype:", obs.dtype)
    assert env.observation_space.contains(obs), "❌ reset obs 不符合 observation_space"

    action = env.action_space.sample()
    obs, reward, terminated, truncated, info = env.step(action)
    print("✅ step obs shape:", obs.shape)
    print("✅ step obs dtype:", obs.dtype)
    assert env.observation_space.contains(obs), "❌ step obs 不符合 observation_space"