# rl_ppo_model/env/item_env.py
import copy
from rl_ppo_model.utils.scene_preprocess import normalize_object

class EnvClass:
    """
    EnvClass ：
      1) load_scene: 接收原始場景 dict，做欄位驗證
      2) 資料標準化：呼叫 normalize_object() 產生統一格式
      3) 提供 get_objects() 回傳標準化後的物件列表
    """

    def __init__(self):
        self.scene_data = None
        self.objects = []
    
    def update_scene(self, items):
        # 根據需求補充
        pass
    
    def load_scene(self, scene_data: dict):
        """
        載入並驗證場景資料。
        :param scene_data: 必須包含 'objects'（list），每個 obj 為 dict。
        """
        self._validate_scene_data(scene_data)
        # 深拷貝原始資料，避免外部修改影響
        self.scene_data = copy.deepcopy(scene_data)

        raw_objects = scene_data.get("objects", [])
        # 標準化每個物件結構，呼叫 normalize_object 產生完整欄位
        self.objects = [normalize_object(obj) for obj in raw_objects]

    def _validate_scene_data(self, data: dict):
        if not isinstance(data, dict):
            raise ValueError("scene_data 必須為 dict")

        if "objects" not in data or not isinstance(data["objects"], list):
            raise ValueError("場景資料必須包含 'objects' 欄位且為 list")

        for i, obj in enumerate(data["objects"]):
            if not isinstance(obj, dict):
                raise ValueError(f"第 {i} 個物件格式錯誤，應為 dict")

            # 檢查最基本必要欄位
            for field in ("uuid", "position", "scale"):
                if field not in obj:
                    raise ValueError(f"第 {i} 個物件缺少 '{field}' 欄位")

    def get_objects(self) -> list:
        """
        回傳 normalize_object(obj) 後的列表，
        每個元素都長得像：
        {
          "uuid": str,
          "position": {...},
          "scale": {...},
          "material": {...},
          "rotation": {...},
          "bbox": {...},
          "velocity": {...},
          ...
        }
        """
        if self.scene_data is None:
            raise RuntimeError("請先呼叫 load_scene(scene_data)")
        return self.objects