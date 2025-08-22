// packingManager.js - 主要控制流程檔案
import { executePacking } from './executePacking.js';

// PackingManager 主控制器
export class PackingManager {
  constructor(objectManager) {
    this.objectManager = objectManager;
    this.physicsEnabled = true;
  }

  // 主要的執行3D打包方法 - 控制整個流程
  async executePacking() {
    return await executePacking(this.objectManager, this.physicsEnabled);
  }

  // 取消打包
  cancelPacking() {
    document.getElementById('packing-panel').style.display = 'none';
    // 取消打包的邏輯
  }

  // 設置物理引擎狀態
  setPhysicsEnabled(enabled) {
    this.physicsEnabled = enabled;
  }
}