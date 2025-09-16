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

# Custom import for database initialization
from src.db.init_db import initialize_database, reset_database

def start_rl_server():
    """啟動RL API服務器"""
    print("啟動RL API服務器 (端口 8888)...")
    try:
        process = subprocess.Popen([
            sys.executable, 
            os.path.join("src", "api_server", "api.py")
        ], cwd=os.getcwd())
        return process
    except Exception as e:
        print(f"啟動RL API服務器失敗: {e}")
        return None

def start_bin_packing_server():
    """啟動3D Bin Packing服務器"""
    print("啟動3D Bin Packing服務器 (端口 8889)...")
    try:
        # Note: Changed to run the specific server script directly
        process = subprocess.Popen([
            sys.executable, 
            os.path.join("src", "python", "run_bin_packing_server.py")
        ], cwd=os.getcwd())
        return process
    except Exception as e:
        print(f"啟動3D Bin Packing服務器失敗: {e}")
        return None

def start_http_server():
    """啟動HTTP服務器用於前端"""
    print("啟動HTTP服務器 (端口 8000)...")
    try:
        process = subprocess.Popen([
            sys.executable, "-m", "http.server", "8000"
        ], cwd=os.getcwd())
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
    initialize_database()
    reset_database()
    print("=" * 50)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    processes = []
    
    try:
        # 啟動RL服務器
        rl_process = start_rl_server()
        if rl_process:
            processes.append(("RL API", rl_process))
            time.sleep(2)  # 等待服務器啟動
        
        bin_packing_process = start_bin_packing_server()
        if bin_packing_process:
            processes.append(("3D Bin Packing", bin_packing_process))
            time.sleep(2)  # 等待服務器啟動
        
        # # 啟動HTTP服務器 (已停用, 由 Vite 取代)
        # http_process = start_http_server()
        # if http_process:
        #     processes.append(("HTTP Server", http_process))
        #     time.sleep(1)  # 等待服務器啟動
        
        print("\n所有服務器已啟動")
        print("=" * 50)
        print("服務器地址:")
        # print("   - 前端: http://localhost:8000") # Vite will provide the address
        # print("   - RL API: http://localhost:8888")
        print("   - 3D Bin Packing API: http://localhost:8889")
        print("\n可用的API端點:")
        print("   - POST /pack_objects - 執行3D打包")
        print("   - GET /job_status/<job_id> - 獲取任務狀態")
        print("\n按 Ctrl+C 停止所有服務器")
        print("=" * 50)
        
        while True:
            for name, process in processes:
                if process.poll() is not None:
                    print(f"{name} 服務器已停止")
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
                process.terminate()
                process.wait(timeout=5)
                print(f"{name} 服務器已關閉")
            except subprocess.TimeoutExpired:
                process.kill()
                print(f"{name} 服務器被強制關閉")
            except Exception as e:
                print(f"關閉 {name} 服務器時發生錯誤: {e}")
        
        print("所有服務器已關閉")

if __name__ == "__main__":
    main()

