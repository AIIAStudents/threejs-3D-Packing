import numpy as np
from gymnasium import spaces
from .env_reward import calculate_longterm_reward
from .env_reward import check_validity
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
        self.observation_shape = (64, 64, 1)
        self.observation_space = spaces.Box(low=0, high=255, shape=self.observation_shape, dtype=np.uint8)
        self.action_space = spaces.Discrete(100)
        self.scene_dims = np.array([150, 150, 150])
        self.placed_items = []
        self.step_count = 0
        self.max_steps = 50
        
        # 👇 先依現有物件產生正確的 state
        self.load_scene(scene_data)
        print(f"[INIT] scene_id={self.current_scene_id}, objects={len(self.envcore.objects)}")


    def reset(self, *, seed=None, options=None):
        print(f"[RESET] seed={seed}, has_np_random={hasattr(self, 'np_random')}")
        # 1) 讓 Gymnasium 設好亂數器與 bookkeeping
        super().reset(seed=seed)

        # 2) 保險：確保 np_random 存在（某些版本/包裝器環境）
        if not hasattr(self, "np_random") or self.np_random is None:
            # 使用 numpy 的 default_rng，與 gymnasium 一致的隨機器
            self.np_random = np.random.default_rng(seed)

        # 3) 重置內部狀態
        self.step_count = 0
        self.placed_items = []

        # 4) 用當前物件生成觀測
        self.state = self._generate_scene()
        assert self.observation_space.contains(self.state), \
            f"❌ obs 不符合 observation_space 定義\nobs shape: {self.state.shape}, dtype: {self.state.dtype}\nexpected space: {self.observation_space}"

        info = {}
        return self.state, info

    def step(self, action):
        self.step_count += 1
        item = self._action_to_item(action)
        reward, status = calculate_longterm_reward(item, self.placed_items, self.scene_dims, False)
        valid, reasons = check_validity(item, self.placed_items, self.scene_dims)

        if status == "success":
            self.placed_items.append(item)
        self.state = self._update_scene(item)
        self.update_scene(self.placed_items)
        self.state = self._generate_scene()
        if self.state.ndim == 2:
            self.state = np.expand_dims(self.state, axis=-1)
        assert self.observation_space.contains(self.state)
        terminated = False
        truncated = self.step_count >= self.max_steps
        return self.state, reward, terminated, truncated, {
            "status": status,
            "placed": len(self.placed_items),
            "reasons": reasons,
            "pos": item["pos"].tolist(),
            "size": item["size"].tolist(),
        }

    def _generate_scene(self):
        scene_img = np.zeros(self.observation_shape, dtype=np.uint8)
        for item in self.placed_items:
            scene_img = self._update_scene(item, base=scene_img)
        return scene_img

    def _update_scene(self, item, base=None):
        updated = base.copy() if base is not None else self.state.copy()
        if updated.ndim == 2:
            updated = np.expand_dims(updated, axis=-1)
        elif updated.shape != self.observation_shape:
            updated = np.zeros(self.observation_shape, dtype=np.uint8)

        if "pos" not in item or "size" not in item:
            print(f"⚠️ item 缺少必要欄位：{item}")
            return updated

        try:
            # 中心對齊座標轉換
            half = self.scene_dims / 2.0
            x = int((item["pos"][0] + half[0]) * 64 / self.scene_dims[0])
            y = int((item["pos"][2] + half[2]) * 64 / self.scene_dims[2])

            # 尺寸縮放（單位轉成 grid cell）

            w = int(max(1, item["size"][0] / 5))
            h = int(max(1, item["size"][2] / 5))

            # 邊界裁切
            x = max(0, min(63, x))
            y = max(0, min(63, y))
            w = max(1, min(64 - x, w))
            h = max(1, min(64 - y, h))

            updated[y:y + h, x:x + w, 0] = 255
        except Exception as e:
            print(f"⚠️ 更新場景失敗：{e}, item={item}")

        return updated.astype(np.uint8)


    def _action_to_item(self, action):
        """根據 action index 操作現有物件，確保 uuid 可追蹤"""
        if not self.envcore.objects:
            raise ValueError("❌ 場景中沒有可操作的物件")

        idx = int(action) % len(self.envcore.objects)
        base = self.envcore.objects[idx]

        offset = np.array([5.0, 0.0, 0.0], dtype=float)  # 簡單示意
        new_pos = np.array([
            base["position"]["x"] + offset[0],
            base["position"]["y"] + offset[1],
            base["position"]["z"] + offset[2],
        ], dtype=float)
        new_size = np.array([
            base["scale"]["x"],
            base["scale"]["y"],
            base["scale"]["z"],
        ], dtype=float)

        return {
            "pos": new_pos,
            "size": new_size,
            "uuid": base["uuid"]
        }

    def render(self):
        if self.render_mode == "human":
            print(f"Rendering: {len(self.placed_items)} items placed")

    def close(self):
        pass

    def load_scene(self, data):
        # 1) 基本重置與場景識別
        self.step_count = 0
        self.placed_items = []
        self.current_scene_id = data.get("scene_id", "unknown")

        raw_objs = data.get("objects", [])
        runtime_items = []
        errors = []
        default_material = {"metalness": 0.0, "roughness": 0.0, "color": 16777215}

        # 2) 標準化每一個物件 → 統一為 runtime dict
        for i, obj in enumerate(raw_objs):
            try:
                std = standardize_item(obj)  # 支援回傳 dataclass 或 dict

                # a) dataclass: 取屬性
                if hasattr(std, "__dict__") and hasattr(std, "pos") and hasattr(std, "size"):
                    item = {
                        "pos": np.asarray(std.pos, dtype=float),
                        "size": np.asarray(std.size, dtype=float),
                        "uuid": getattr(std, "uuid", None),
                        "type": getattr(std, "type", "box"),
                        "material": getattr(std, "material", default_material) or default_material,
                    }

                # b) dict: 兼容 pos/size 或 position/scale 兩種鍵型
                elif isinstance(std, dict):
                    if "pos" in std and "size" in std:
                        item = {
                            "pos": np.asarray(std["pos"], dtype=float),
                            "size": np.asarray(std["size"], dtype=float),
                            "uuid": std.get("uuid"),
                            "type": std.get("type", "box"),
                            "material": std.get("material", default_material) or default_material,
                        }
                    elif "position" in std and "scale" in std:
                        p, s = std["position"], std["scale"]
                        item = {
                            "pos": np.array([p["x"], p["y"], p["z"]], dtype=float),
                            "size": np.array([s["x"], s["y"], s["z"]], dtype=float),
                            "uuid": std.get("uuid"),
                            "type": std.get("type", "box"),
                            "material": std.get("material", default_material) or default_material,
                        }
                    else:
                        raise ValueError("standardize_item 輸出缺少 pos/size 或 position/scale")
                else:
                    raise TypeError(f"不支援的 standardize_item 輸出型態：{type(std)}")

                if not item.get("uuid"):
                    raise ValueError("缺少 uuid")

                runtime_items.append(item)

            except Exception as e:
                errors.append((i, str(e)))

        if errors:
            for i, msg in errors:
                print(f"⚠️ 忽略第 {i} 個無效物件：{msg}")

        # 3) UUID 唯一性檢查（避免後續動作追蹤錯亂）
        uuids = [it["uuid"] for it in runtime_items]
        if len(set(uuids)) != len(uuids):
            dupes = {u for u in uuids if uuids.count(u) > 1}
            raise ValueError(f"❌ 場景包含重複 uuid：{sorted(dupes)}")

        # 4) 寫入 placed_items 並同步 envcore.objects（一次就好）
        self.placed_items = runtime_items
        self.envcore.objects = [self._normalize_item(it) for it in runtime_items]

        # 5) 產生並驗證觀測
        self.state = self._generate_scene()
        if self.state.ndim == 2:
            self.state = np.expand_dims(self.state, axis=-1)
        assert self.observation_space.contains(self.state), (
            f"❌ obs 不符合 observation_space 定義\n"
            f"obs shape: {self.state.shape}, dtype: {self.state.dtype}\n"
            f"expected space: {self.observation_space}"
        )

        print(f"[LOAD_SCENE] scene_id={self.current_scene_id}, items={len(self.placed_items)}, envcore.objects={len(self.envcore.objects)}")

    def get_state_tensor(self):
        return self.envcore.get_state_tensor()

    def update_scene(self, items):
        if items:
            # 確認所有 item 都有 uuid
            for it in items:
                if "uuid" not in it:
                    raise ValueError(f"❌ update_scene 收到沒有 uuid 的 item：{it}")
            self.placed_items = [item.copy() for item in items]
            self.envcore.objects = [self._normalize_item(item) for item in items]
        else:
            print("[ENV] update_scene skipped (no items); keeping existing envcore.objects")

        
    def _normalize_item(self, item):
        if "uuid" not in item:
            raise ValueError(f"❌ _normalize_item 需要 uuid，但 item 沒提供：{item}")
        pos = np.asarray(item["pos"], dtype=float)
        size = np.asarray(item["size"], dtype=float)
        uid = item["uuid"]
        return {
            "position": {"x": float(pos[0]), "y": float(pos[1]), "z": float(pos[2])},
            "scale":    {"x": float(size[0]), "y": float(size[1]), "z": float(size[2])},
            "material": item.get("material", {"metalness": 0, "roughness": 0, "color": 16777215}),
            "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
            "bbox":     {"width": float(size[0]), "height": float(size[1]), "depth": float(size[2])},
            "velocity": {"x": 0.0, "y": 0.0, "z": 0.0},
            "uuid": uid,
            "type": item.get("type", "box")
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