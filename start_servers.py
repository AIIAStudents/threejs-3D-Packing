"""
統一啟動腳本 - 同時啟動前端和後端服務器
Unified Server Startup Script - Start both frontend and backend servers
"""
import subprocess
import sys
import time
import os
from pathlib import Path

def main():
    print("=" * 70)
    print("  3D Packing System - 統一啟動程序")
    print("  3D Packing System - Unified Startup")
    print("=" * 70)
    print()
    sys.stdout.flush()  # 強制立即輸出
    
    # Get project root directory
    project_root = Path(__file__).parent
    backend_dir = project_root / "src" / "api_server_v2"
    
    # Check if backend directory exists
    if not backend_dir.exists():
        print(f"❌ 錯誤：找不到後端目錄 {backend_dir}")
        print(f"❌ Error: Backend directory not found at {backend_dir}")
        sys.stdout.flush()
        sys.exit(1)
    
    processes = []
    
    try:
        # Start Flask backend server
        print("🔧 啟動後端服務器 (Flask)...")
        print("🔧 Starting backend server (Flask)...")
        print(f"   目錄: {backend_dir}")
        print(f"   端口: 8888")
        print()
        sys.stdout.flush()
        
        # Copy environment and set RESET_DB=1 to clear database on startup  
        env = os.environ.copy()
        env['PYTHONPATH'] = str(project_root)
        env['PYTHONIOENCODING'] = 'utf-8'  # Fix Unicode issues on Windows
        env['RESET_DB'] = '1'  # 🔴 清空資料庫（只在 start_servers.py 啟動時）
        
        print("   ⚠️  RESET_DB=1 - 資料庫將被清空")
        print()
        sys.stdout.flush()
        
        print("   正在啟動後端進程...")
        sys.stdout.flush()
        
        backend_process = subprocess.Popen(
            [sys.executable, "-m", "src.api_server_v2.app"],
            cwd=str(project_root),  # Run from project root
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        processes.append(("Backend", backend_process))
        
        # Wait and check if backend started successfully
        print("   等待後端啟動...")
        sys.stdout.flush()
        
        for i in range(3):
            time.sleep(1)
            print(f"   ... {i+1}秒")
            sys.stdout.flush()
            if backend_process.poll() is not None:
                break
        
        if backend_process.poll() is not None:
            # Backend crashed, show error
            stdout, stderr = backend_process.communicate()
            print("\n❌ 後端啟動失敗！錯誤信息：")
            print("=" * 70)
            if stdout:
                print("STDOUT:")
                print(stdout)
            if stderr:
                print("STDERR:")
                print(stderr)
            print("=" * 70)
            print("\n請檢查後端配置和依賴是否正確安裝。")
            print("您可以單獨運行後端查看詳細錯誤：")
            print(f"  cd {project_root}")
            print(f"  python -m src.api_server_v2.app")
            sys.stdout.flush()
            sys.exit(1)
        
        print("   ✓ 後端啟動成功")
        print()
        sys.stdout.flush()
        
        # Start Vite frontend server
        print("🎨 啟動前端服務器 (Vite)...")
        print("🎨 Starting frontend server (Vite)...")
        print(f"   目錄: {project_root}")
        print(f"   端口: 5173")
        print()
        
        # On Windows, npm needs to be run through shell
        frontend_process = subprocess.Popen(
            "npm run dev",
            cwd=str(project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            shell=True
        )
        processes.append(("Frontend", frontend_process))
        
        # Wait and check if frontend started successfully
        print("   等待前端啟動...")
        time.sleep(3)
        
        if frontend_process.poll() is not None:
            # Frontend crashed, show error
            stdout, stderr = frontend_process.communicate()
            print("\n❌ 前端啟動失敗！錯誤信息：")
            print("=" * 70)
            if stdout:
                print("STDOUT:")
                print(stdout)
            if stderr:
                print("STDERR:")
                print(stderr)
            print("=" * 70)
            print("\n請檢查前端配置。")
            print("您可以單獨運行前端查看詳細錯誤：")
            print(f"  cd {project_root}")
            print(f"  npm run dev")
            sys.exit(1)
        
        print("   ✓ 前端啟動成功")
        print()
        
        print("=" * 70)
        print("✅ 所有服務器已啟動！")
        print("✅ All servers started successfully!")
        print()
        print("📍 訪問地址:")
        print("   前端 (Frontend):  http://localhost:5173")
        print("   後端 (Backend):   http://localhost:8888")
        print()
        print("⚠️  按 Ctrl+C 停止所有服務器")
        print("⚠️  Press Ctrl+C to stop all servers")
        print("=" * 70)
        print()
        
        # Simplified monitoring - just wait for Ctrl+C
        try:
            while True:
                # Check if any process has stopped
                for name, process in processes:
                    if process.poll() is not None:
                        print(f"\n❌ {name} 服務器已停止 (exit code: {process.returncode})")
                        print(f"❌ {name} server stopped (exit code: {process.returncode})")
                        raise KeyboardInterrupt
                
                time.sleep(1)  # Check every second
        except KeyboardInterrupt:
            pass  # Continue to cleanup
    
    except KeyboardInterrupt:
        print("\n")
        print("=" * 70)
        print("🛑 正在停止所有服務器...")
        print("🛑 Stopping all servers...")
        print("=" * 70)
        
        for name, process in processes:
            if process.poll() is None:
                print(f"   停止 {name}...")
                process.terminate()
                try:
                    process.wait(timeout=5)
                    print(f"   ✓ {name} 已停止")
                except subprocess.TimeoutExpired:
                    print(f"   ⚠️ {name} 強制終止")
                    process.kill()
        
        print()
        print("✅ 所有服務器已停止")
        print("✅ All servers stopped")
        print("=" * 70)

if __name__ == "__main__":
    main()
