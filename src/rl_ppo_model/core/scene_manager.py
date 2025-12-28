# rl_ppo_model/core/scene_manager.py

class SceneManager:
    _instance = None

    def __init__(self):
        self.scene_data = {}
        self.env = None  # 可選：儲存 EnvClass 實例

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def set_scene(self, data):
        self.scene_data = data

    def get_scene(self):
        return self.scene_data

    def attach_env(self, env_instance):
        self.env = env_instance

    def get_env(self):
        return self.env