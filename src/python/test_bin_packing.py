#!/usr/bin/env python3
"""
3D Bin Packing API 測試腳本
測試同步和非同步打包功能
"""

import requests
import json
import time
import sys
import os

# 添加路徑
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

BASE_URL = "http://localhost:8889"

def test_health_check():
    """測試健康檢查端點"""
    print("🔍 測試健康檢查...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            print("✅ 健康檢查通過")
            return True
        else:
            print(f"❌ 健康檢查失敗: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 健康檢查異常: {e}")
        return False

def create_test_objects():
    """創建測試物件"""
    return [
        {
            "uuid": "obj-1",
            "type": "BoxGeometry",
            "position": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 10, "y": 10, "z": 10},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "material": {"color": 16711680, "metalness": 0, "roughness": 1}
        },
        {
            "uuid": "obj-2",
            "type": "SphereGeometry",
            "position": {"x": 20, "y": 0, "z": 0},
            "scale": {"x": 8, "y": 8, "z": 8},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "material": {"color": 65280, "metalness": 0, "roughness": 1}
        },
        {
            "uuid": "obj-3",
            "type": "CylinderGeometry",
            "position": {"x": 0, "y": 20, "z": 0},
            "scale": {"x": 6, "y": 12, "z": 6},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "material": {"color": 255, "metalness": 0, "roughness": 1}
        }
    ]

def test_sync_packing():
    """測試同步打包"""
    print("\n📦 測試同步打包...")
    
    pack_request = {
        "objects": create_test_objects(),
        "container_size": {"width": 100, "height": 100, "depth": 100},
        "optimization_type": "volume_utilization",
        "algorithm": "blf_sa",
        "async_mode": False,
        "timeout": 30
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/pack_objects",
            json=pack_request,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 同步打包成功")
            print(f"   體積利用率: {result.get('volume_utilization', 0):.2f}%")
            print(f"   執行時間: {result.get('execution_time', 0):.2f}秒")
            print(f"   打包物件數: {len(result.get('packed_objects', []))}")
            return True
        else:
            print(f"❌ 同步打包失敗: {response.status_code}")
            print(f"   錯誤: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 同步打包異常: {e}")
        return False

def test_async_packing():
    """測試非同步打包"""
    print("\n🔄 測試非同步打包...")
    
    # 創建更多物件以觸發非同步模式
    objects = []
    for i in range(15):
        objects.append({
            "uuid": f"obj-{i+1}",
            "type": "BoxGeometry",
            "position": {"x": i*5, "y": 0, "z": 0},
            "scale": {"x": 5, "y": 5, "z": 5},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "material": {"color": 16711680, "metalness": 0, "roughness": 1}
        })
    
    pack_request = {
        "objects": objects,
        "container_size": {"width": 150, "height": 150, "depth": 150},
        "optimization_type": "volume_utilization",
        "algorithm": "blf_sa",
        "async_mode": True,
        "timeout": 30
    }
    
    try:
        # 發送打包請求
        response = requests.post(
            f"{BASE_URL}/pack_objects",
            json=pack_request,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("status") == "async":
                job_id = result.get("job_id")
                print(f"✅ 非同步任務已啟動，Job ID: {job_id}")
                
                # 輪詢任務狀態
                max_polls = 30  # 最多輪詢30次
                poll_count = 0
                
                while poll_count < max_polls:
                    status_response = requests.get(f"{BASE_URL}/job_status/{job_id}")
                    if status_response.status_code == 200:
                        status = status_response.json()
                        print(f"   進度: {status.get('progress', 0):.1f}% - {status.get('status', 'unknown')}")
                        
                        if status.get("status") == "completed":
                            result = status.get("result")
                            if result and result.get("success"):
                                print("✅ 非同步打包完成")
                                print(f"   體積利用率: {result.get('volume_utilization', 0):.2f}%")
                                print(f"   執行時間: {result.get('execution_time', 0):.2f}秒")
                                return True
                            else:
                                print("❌ 非同步打包失敗")
                                return False
                        elif status.get("status") == "failed":
                            print(f"❌ 非同步打包失敗: {status.get('error', 'Unknown error')}")
                            return False
                    
                    time.sleep(1)  # 等待1秒
                    poll_count += 1
                
                print("❌ 非同步打包超時")
                return False
            else:
                print("❌ 未返回非同步狀態")
                return False
        else:
            print(f"❌ 非同步打包請求失敗: {response.status_code}")
            print(f"   錯誤: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 非同步打包異常: {e}")
        return False

def test_job_management():
    """測試任務管理功能"""
    print("\n📋 測試任務管理...")
    
    try:
        # 列出所有任務
        response = requests.get(f"{BASE_URL}/list_jobs")
        if response.status_code == 200:
            jobs = response.json().get("jobs", [])
            print(f"✅ 當前任務數量: {len(jobs)}")
            
            # 清理已完成任務
            clear_response = requests.post(f"{BASE_URL}/clear_completed_jobs")
            if clear_response.status_code == 200:
                result = clear_response.json()
                print(f"✅ 清理完成: {result.get('cleared_count', 0)} 個任務")
                return True
            else:
                print(f"❌ 清理任務失敗: {clear_response.status_code}")
                return False
        else:
            print(f"❌ 獲取任務列表失敗: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 任務管理異常: {e}")
        return False

def main():
    """主測試函數"""
    print("🚀 開始3D Bin Packing API測試")
    print("=" * 50)
    
    # 檢查服務器是否運行
    if not test_health_check():
        print("❌ 服務器未運行，請先啟動服務器")
        return
    
    # 執行測試
    tests = [
        ("同步打包", test_sync_packing),
        ("非同步打包", test_async_packing),
        ("任務管理", test_job_management)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} 測試通過")
            else:
                print(f"❌ {test_name} 測試失敗")
        except Exception as e:
            print(f"❌ {test_name} 測試異常: {e}")
    
    print("\n" + "=" * 50)
    print(f"📊 測試結果: {passed}/{total} 通過")
    
    if passed == total:
        print("🎉 所有測試通過！")
    else:
        print("⚠️ 部分測試失敗，請檢查服務器狀態")

if __name__ == "__main__":
    main()
