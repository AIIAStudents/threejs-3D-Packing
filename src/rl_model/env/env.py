import gym
import numpy as np
from gym import spaces
from rl_model.db.item_scene_db import load_scene_and_items
from rl_model.env.utils import get_item_size, check_overlap

class BackpackEnv(gym.Env):
  def __init__(self):
      super().__init__()
      # 從資料庫載入場景與物品
      self.scene, self.items = load_scene_and_items()
      self.scene_width = self.scene["width"]
      self.scene_height = self.scene["height"]
      self.scene_depth = self.scene["depth"]

      self.remaining_items = self.items.copy()
      self.placed_items = []

      obs_dim = 50 * 6
      self.observation_space = spaces.Box(
          low=0,
          high=max(self.scene_width, self.scene_height, self.scene_depth),
          shape=(obs_dim,),
          dtype=np.float32
      )

      self.action_space = spaces.Box(
          low=np.array([0, 0, 0, 0]),
          high=np.array([len(self.items) - 1, self.scene_width, self.scene_height, self.scene_depth]),
          dtype=np.float32
      )

  def reset(self):
      self.remaining_items = self.items.copy()
      self.placed_items = []
      return self._get_observation()

  def step(self, action):
      item_idx = int(action[0])
      x, y, z = action[1:]

      reward = 0
      done = False
      info = {}

      if item_idx < 0 or item_idx >= len(self.remaining_items):
          return self._get_observation(), -2.0, done, info

      item = self.remaining_items[item_idx]
      size = get_item_size(item["properties"])
      pos = np.array([x, y, z])

      if np.any(pos < 0) or np.any(pos + size > [self.scene_width, self.scene_height, self.scene_depth]):
          reward = -2.0
      elif check_overlap(pos, size, self.placed_items):
          reward = -2.0
      else:
          self.placed_items.append({
              "name": item["name"],
              "pos": pos,
              "size": size
          })
          self.remaining_items.pop(item_idx)
          reward = 1.0

      if not self.remaining_items:
          reward += 10.0
          done = True

      return self._get_observation(), reward, done, info

  def _get_observation(self):
      obs = []
      for item in self.placed_items:
          obs.extend(item["pos"].tolist())
          obs.extend(item["size"].tolist())
      while len(obs) < self.observation_space.shape[0]:
          obs.append(0.0)
      return np.array(obs, dtype=np.float32)

  def render(self, mode="human"):
      print("目前擺放狀態：")
      for item in self.placed_items:
          print(f"- {item['name']} @ {item['pos']}")
