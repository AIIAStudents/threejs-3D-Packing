#!/usr/bin/env python3
"""
測試3D Bin Packing API的簡單腳本
"""

import requests
import json
import time

BASE_URL = "http://localhost:8889"

def test_health():
    """測試健康檢查端點"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"✅ 健康檢查: {response.status_code}")
        print(f"   響應: {response.json()}")
        return True
    except Exception as e:
        print(f"❌ 健康檢查失敗: {e}")
        return False

def test_pack_objects():
    """測試打包物件端點"""
    # 創建測試數據
    test_data = {
        "objects": [
            {
                "uuid": "test-cube-1",
                "type": "cube",
                "dimensions": {"x": 10, "y": 10, "z": 10},
                "position": {"x": 0, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "rotation": {"x": 0, "y": 0, "z": 0}
            },
            {
                "uuid": "test-cube-2",
                "type": "cube",
                "dimensions": {"x": 8, "y": 8, "z": 8},
                "position": {"x": 15, "y": 0, "z": 0},
                "scale": {"x": 1, "y": 1, "z": 1},
                "rotation": {"x": 0, "y": 0, "z": 0}
            }
        ],
        "container_size": {
            "width": 120,
            "height": 120,
            "depth": 120
        },
        "optimization_type": "volume_utilization",
        "algorithm": "blf_sa",
        "async_mode": True,
        "timeout": 30
    }
    
    try:
        print("📦 發送打包請求...")
        response = requests.post(
            f"{BASE_URL}/pack_objects",
            json=test_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 打包請求成功: {response.status_code}")
            print(f"   響應: {json.dumps(result, indent=2)}")
            
            if "job_id" in result:
                return result["job_id"]
            else:
                print("⚠️ 響應中沒有job_id")
                return None
        else:
            print(f"❌ 打包請求失敗: {response.status_code}")
            print(f"   錯誤: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ 打包請求異常: {e}")
        return None

def test_job_status(job_id):
    """測試任務狀態端點"""
    try:
        print(f"🔄 檢查任務狀態: {job_id}")
        response = requests.get(f"{BASE_URL}/job_status/{job_id}")
        
        if response.status_code == 200:
            status = response.json()
            print(f"✅ 任務狀態: {status['status']}")
            print(f"   進度: {status.get('progress', 'N/A')}%")
            
            if status['status'] == 'completed':
                print(f"   結果: {json.dumps(status.get('result', {}), indent=2)}")
            
            return status
        else:
            print(f"❌ 獲取任務狀態失敗: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"❌ 獲取任務狀態異常: {e}")
        return None

def main():
    """主測試函數"""
    print("🧪 開始測試3D Bin Packing API...")
    print(f"🌐 目標URL: {BASE_URL}")
    print("-" * 50)
    
    # 1. 測試健康檢查
    if not test_health():
        print("❌ 服務器不可用，停止測試")
        return
    
    print("-" * 50)
    
    # 2. 測試打包請求
    job_id = test_pack_objects()
    if not job_id:
        print("❌ 無法創建打包任務，停止測試")
        return
    
    print("-" * 50)
    
    # 3. 輪詢任務狀態直到完成
    print("⏳ 等待任務完成...")
    max_attempts = 30
    attempt = 0
    
    while attempt < max_attempts:
        status = test_job_status(job_id)
        if not status:
            break
            
        if status['status'] == 'completed':
            print("🎉 任務完成！")
            break
        elif status['status'] == 'failed':
            print("💥 任務失敗！")
            break
        else:
            print(f"⏳ 任務進行中... ({attempt + 1}/{max_attempts})")
            time.sleep(2)
            attempt += 1
    
    if attempt >= max_attempts:
        print("⏰ 任務超時")
    
    print("-" * 50)
    print("🏁 測試完成")

if __name__ == "__main__":
    main()
