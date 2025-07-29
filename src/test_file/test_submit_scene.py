import requests
import json

# API 端點
URL = "http://127.0.0.1:8888/submit_scene"

# 測試場景 JSON 結構
scene_data = {
    "environment_meta": {
        "container": { "boundarySize": 150 }
    },
    "objects": [
        {
            "id": "obj1",
            "type": "cube",
            "position": [0, 0, 0],
            "size": [1, 1, 1]
        },
        {
            "id": "obj2",
            "type": "sphere",
            "position": [2, 3, 1],
            "size": [0.5, 0.5, 0.5]
        }
    ]
}

# 發送 POST 請求
try:
    response = requests.post(URL, json=scene_data)
    print(f"[狀態碼] {response.status_code}")
    print("[回應內容]", response.json())
except Exception as e:
    print("[錯誤]", e)