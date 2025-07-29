import json
import os

def load_scene_config(base_dir=None):
    """
    根據來源目錄載入 config 資料夾中的場景設定
    """
    # 自動定位當前檔案所在資料夾
    if base_dir is None:
        base_dir = os.path.dirname(__file__)  # utils.py 所在位置，即 env/config/

    profile_path = os.path.join(base_dir, "scene_profile.json")
    with open(profile_path, "r") as f:
        profile = json.load(f)

    def load_component(filename):
        comp_path = os.path.join(base_dir, filename)
        with open(comp_path, "r") as f:
            return json.load(f)

    objects_path = os.path.normpath(os.path.join(base_dir, "..", profile["components"]["objects"]))
    with open(objects_path, "r") as f:
        object_data = json.load(f)

    return {
        "name": profile["name"],
        "description": profile.get("description", ""),
        "environment_meta": load_component(profile["components"]["meta"]),
        "object_creation": load_component(profile["components"]["creation"]),
        "objects": object_data
    }