#!/usr/bin/env python3
"""
啟動腳本：同時運行RL API服務器和3D Bin Packing服務器
"""

import subprocess
import sys
import os
import time
import signal
import threading

# --- Start of Path Resolution Modification ---
# Make paths robust by calculating them relative to this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# The project root is two levels up from this script's directory (src/python -> src -> PROJECT_ROOT)
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))

# Add project root to python path to solve module import issues
# This ensures that `from src.db...` works correctly
sys.path.insert(0, PROJECT_ROOT)
# --- End of Path Resolution Modification ---

# Custom import for database initialization
from src.db.init_db import initialize_database, reset_database

def start_rl_server():
    """啟動RL API服務器"""
    print("啟動RL API服務器 (端口 8888)...")
    try:
        script_path = os.path.join(PROJECT_ROOT, "src", "api_server", "api.py")
        process = subprocess.Popen([
            sys.executable,
            script_path
        ], cwd=PROJECT_ROOT) # Run from the project root
        return process
    except Exception as e:
        print(f"啟動RL API服務器失敗: {e}")
        return None

def start_http_server():
    """啟動HTTP服務器用於前端"""
    print("啟動HTTP服務器 (端口 8000)...")
    try:
        # The HTTP server should serve from the project root ('3js/three.js')
        process = subprocess.Popen([
            sys.executable, "-m", "http.server", "8000"
        ], cwd=PROJECT_ROOT)
        return process
    except Exception as e:
        print(f"啟動HTTP服務器失敗: {e}")
        return None

def signal_handler(signum, frame):
    """信號處理器，用於優雅關閉"""
    print("\n收到關閉信號，正在停止所有服務器...")
    sys.exit(0)

def main():
    """主函數"""
    print("3D Bin Packing 系統啟動器")
    print("=" * 50)
    
    # Initialize and reset the database at the start
    print("正在準備資料庫...")
    # The init_db functions should now work correctly because of the sys.path modification
    initialize_database()
    reset_database()
    print("=" * 50)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    processes = []
    
    try:
        # 啟動服務器
        api_process = start_rl_server()
        if api_process:
            processes.append(("API Server", api_process))
            time.sleep(2)  # 等待服務器啟動
        
        print("\n服務器已啟動")
        print("=" * 50)
        print("服務器地址:")
        print("   - API Server: http://localhost:8888")
        print("\n可用的API端點:")
        print("   - GET /groups - 獲取所有群組")
        print("   - POST /pack_objects - 執行3D打包")
        print("\n按 Ctrl+C 停止所有服務器")
        print("=" * 50)
        
        while True:
            for name, process in processes:
                if process.poll() is not None:
                    print(f"{name} 服務器已停止")
                    # Exit the main script if any server stops
                    for _, p in processes:
                        if p.poll() is None:
                            p.terminate()
                    return
            
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n收到中斷信號")
    except Exception as e:
        print(f"啟動過程中發生錯誤: {e}")
    finally:
        print("正在關閉所有服務器...")
        for name, process in processes:
            try:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
                    print(f"{name} 服務器已關閉")
            except subprocess.TimeoutExpired:
                if process.poll() is None:
                    process.kill()
                    print(f"{name} 服務器被強制關閉")
            except Exception as e:
                print(f"關閉 {name} 服務器時發生錯誤: {e}")
        
        print("所有服務器已關閉")

if __name__ == "__main__":
    main()

