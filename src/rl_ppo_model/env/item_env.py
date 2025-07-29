from .config.utils import load_scene_config

class EnvClass:
    def __init__(self):
        self.scene = None
        self.objects = []
        self.agent = None  # 可後續接入 PPO agent

    def load_scene(self, scene_data: dict):
        self.scene = scene_data
        self.objects = scene_data.get("objects", [])

    def step_from_state(self, state: dict):
        obs = self._convert_state_to_obs(state)
        action = self.agent.predict(obs) if self.agent else [0, 0, 0]
        reward = self._compute_reward(state, action)
        return action, reward

    def _convert_state_to_obs(self, state):
        return [obj["position"] for obj in state.get("objects", [])]

    def _compute_reward(self, state, action):
        return 1.0  # 暫時固定回饋值


if __name__ == "__main__":
    # 🧪 可作為環境測試用的小工具
    scene = load_scene_config()
    print("[初始化容器]", scene["environment_meta"]["container"])
    print("[物件數量]", len(scene["objects"]))

    env = EnvClass()
    env.load_scene(scene)

    # 模擬執行一步行動
    dummy_state = scene  # 測試用（通常來自前端）
    action, reward = env.step_from_state(dummy_state)
    print("[Agent 動作]", action)
    print("[Reward]", reward)