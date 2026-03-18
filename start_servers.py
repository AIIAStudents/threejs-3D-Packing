"""
統一啟動腳本 - 僅啟動後端服務器
Unified Server Startup Script - Backend Only
"""
import subprocess
import sys
import os
from pathlib import Path

def main():
    print("=" * 70)
    print("  3D Packing System - Backend Server (API)")
    print("=" * 70)
    print()
    sys.stdout.flush()
    
    # Get project root directory
    project_root = Path(__file__).parent
    backend_dir = project_root / "src" / "api_server_v2"
    
    # Check if backend directory exists
    if not backend_dir.exists():
        print(f"❌ 錯誤：找不到後端目錄 {backend_dir}")
        print(f"❌ Error: Backend directory not found at {backend_dir}")
        sys.exit(1)
    
    # Copy environment and set RESET_DB=1 to clear database on startup  
    env = os.environ.copy()
    env['PYTHONPATH'] = str(project_root)
    env['PYTHONIOENCODING'] = 'utf-8'  # Fix Unicode issues on Windows
    env['RESET_DB'] = '1'  # 🔴 清空資料庫
    
    print("🔧 啟動後端服務器 (Flask)...")
    print("🔧 Starting backend server (Flask)...")
    print(f"   目錄: {backend_dir}")
    print(f"   端口: 8888")
    print("   ⚠️  RESET_DB=1 - 資料庫將被清空 (Database will be cleared)")
    print()
    print("📋 所有請求日誌將顯示如下 (Logs will appear below):")
    print("=" * 70)
    sys.stdout.flush()
    
    try:
        # Start Backend directly using subprocess.run
        # This streams output directly to the console
        subprocess.run(
            [sys.executable, "-m", "src.api_server_v2.app"],
            cwd=str(project_root),  # Run from project root
            env=env,
            check=False 
        )
    except KeyboardInterrupt:
        print("\n")
        print("=" * 70)
        print("🛑 服務器已停止 (Server stopped)")
        print("=" * 70)

if __name__ == "__main__":
    main()
