import gym
import numpy as np
import matplotlib.pyplot as plt
from gym import spaces
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import os
import sys

# 模組匯入
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.item_scene_db import load_scene_and_items
from env.utils import get_color
from env.env_reward_utils import calculate_longterm_reward  # ✅ 新版獎懲

class BackpackEnv(gym.Env):
    def __init__(self, db_path="item_scene_data.sqlite", enable_logs=True):
        super(BackpackEnv, self).__init__()
        self.enable_logs = enable_logs
        self.log_messages = []

        # 載入場景與物品
        scene, raw_items = load_scene_and_items(db_path)
        self.scene_width = scene["width"]
        self.scene_height = scene["height"]
        self.scene_depth = scene["depth"]
        self.scene_dims = (self.scene_width, self.scene_height, self.scene_depth)

        self.raw_items = raw_items
        self.items = []
        for item in raw_items:
            size = item["properties"].get("size")
            if isinstance(size, list) and len(size) == 3:
                self.items.append(tuple(size))
            elif self.enable_logs:
                self.log_messages.append(f"❗ 無效尺寸，跳過: {item['name']} - {size}")

        self.action_space = spaces.Box(
            low=0,
            high=max(self.scene_width, self.scene_height, self.scene_depth),
            shape=(3,),
            dtype=np.float32
        )

        self.observation_space = spaces.Box(
            low=0,
            high=max(self.scene_width, self.scene_height, self.scene_depth),
            shape=(len(self.items) * 6 + 4,),
            dtype=np.float32
        )

        self.reset()

    def reset(self):
        self.placed_items = []
        self.current_index = 0
        self.log_messages.clear()
        return self._get_observation()

    def step(self, action):
        if self.current_index >= len(self.items):
            if self.enable_logs:
                self._flush_logs()
            return self._get_observation(), 0.0, True, {}

        name = self.raw_items[self.current_index]["name"]
        size = self.items[self.current_index]
        pos = np.clip(action, 0, [self.scene_width, self.scene_height, self.scene_depth])
        item = {"name": name, "pos": np.array(pos), "size": np.array(size)}

        done = (self.current_index + 1) >= len(self.items)
        reward, status = calculate_longterm_reward(item, self.placed_items, self.scene_dims, done)

        if status == "success":
            self.placed_items.append(item)

        if self.enable_logs:
            self.log_messages.append(f"{status} ➤ {name} at {pos}, reward={reward:.2f}")

        self.current_index += 1

        if done and self.enable_logs:
            self._flush_logs()

        return self._get_observation(), reward, done, {}

    def _get_observation(self):
        obs = []
        for item in self.placed_items:
            obs.extend(item["pos"].tolist())
            obs.extend(item["size"].tolist())

        while len(obs) < len(self.items) * 6:
            obs.append(0.0)

        remaining_volume = self.scene_width * self.scene_height * self.scene_depth
        used_volume = sum(np.prod(item["size"]) for item in self.placed_items)
        obs.append(remaining_volume - used_volume)

        if self.current_index < len(self.items):
            obs.extend(self.items[self.current_index])
        else:
            obs.extend([0.0, 0.0, 0.0])

        return np.array(obs, dtype=np.float32)

    def _flush_logs(self):
        print("\n🧾 放置紀錄")
        for msg in self.log_messages:
            print(f"  {msg}")

    def render(self, mode="plot"):
        fig = plt.figure()
        ax = fig.add_subplot(111, projection='3d')
        ax.set_xlim([0, self.scene_width])
        ax.set_ylim([0, self.scene_height])
        ax.set_zlim([0, self.scene_depth])
        ax.set_xlabel("X")
        ax.set_ylabel("Y")
        ax.set_zlabel("Z")
        plt.title("Backpack Packing")

        for item in self.placed_items:
            color = get_color(item["name"])
            self._draw_box(ax, item["pos"], item["size"], color)

        plt.tight_layout()
        plt.show()

    def _draw_box(self, ax, pos, size, color="skyblue"):
        x, y, z = pos
        dx, dy, dz = size
        vertices = [
            [x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z],
            [x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]
        ]
        faces = [
            [vertices[i] for i in [0, 1, 2, 3]],
            [vertices[i] for i in [4, 5, 6, 7]],
            [vertices[i] for i in [0, 1, 5, 4]],
            [vertices[i] for i in [2, 3, 7, 6]],
            [vertices[i] for i in [1, 2, 6, 5]],
            [vertices[i] for i in [0, 3, 7, 4]]
        ]
        ax.add_collection3d(Poly3DCollection(faces, facecolors=color, linewidths=0.3, edgecolors='k', alpha=0.7))