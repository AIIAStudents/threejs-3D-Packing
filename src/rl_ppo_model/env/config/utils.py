import json
import os

def load_scene_config(base_dir=None):
    """
    根據來源目錄載入 config 資料夾中的場景設定，
    並確保所有物件包含 geometry 和 physics 資訊。
    """
    # 自動定位 base 路徑
    if base_dir is None:
        base_dir = os.path.dirname(__file__)  # 即 env/config/

    # 讀取 scene_profile.json
    profile_path = os.path.join(base_dir, "scene_profile.json")
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    # 通用 JSON 載入函數
    def load_component(filename):
        comp_path = os.path.join(base_dir, filename)
        with open(comp_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # 載入 objects.json
    objects_path = os.path.normpath(os.path.join(base_dir, "..", profile["components"]["objects"]))
    with open(objects_path, "r", encoding="utf-8") as f:
        object_data = json.load(f)

    # ✅ 驗證並補足物件資訊
    enriched_objects = []
    for obj in object_data:
        # 預設 geometry 與 physics 結構
        default_geometry = {"width": 1, "height": 1, "depth": 1}
        default_physics = {"shape": "box", "mass": 1}

        obj.setdefault("geometry", default_geometry)
        obj.setdefault("physics", default_physics)
        obj.setdefault("position", "manual")

        # 顯示前幾個物件作驗證
        if obj.get("id") and obj.get("geometry"):
            print(f"[驗證通過] {obj['id']} geometry: {obj['geometry']}")

        enriched_objects.append(obj)

    # 回傳完整場景設定
    return {
        "name": profile.get("name", "unnamed_scene"),
        "description": profile.get("description", ""),
        "environment_meta": load_component(profile["components"]["meta"]),
        "object_creation": load_component(profile["components"]["creation"]),
        "objects": enriched_objects,
    }