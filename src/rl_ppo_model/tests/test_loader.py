import os
import json

def show_scene_json():
    # 🔍 取得檔案路徑
    current_dir = os.path.dirname(__file__)
    json_path = os.path.join(current_dir, "scene_test_cases", "sample_scene.json")

    # 📖 讀取 JSON 資料
    with open(json_path, "r") as f:
        scene_data = json.load(f)

    # 🖨️ 顯示整份 JSON 結構
    print(json.dumps(scene_data, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    show_scene_json()