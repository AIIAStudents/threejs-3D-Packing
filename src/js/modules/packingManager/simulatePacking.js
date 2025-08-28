import * as THREE from 'three';

// 模擬打包功能
export function simulatePacking(objects, containerSize) {
    console.log('🎭 開始模擬打包...');
      
    // 模擬進度更新
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 10;
      this.updateProgressDisplay({ 
        status: 'processing', 
        progress: progress / 100 
      });
      
      if (progress >= 100) {
        clearInterval(progressInterval);
        
        // 模擬打包結果
        const packedObjects = simulatePackingAlgorithm(objects, containerSize);
        const result = {
          packed_objects: packedObjects,
          volume_utilization: calculateVolumeUtilization(packedObjects, containerSize),
          execution_time: 2.5
        };
        
        console.log('🎭 模擬打包完成:', result);
        
        // 直接調用結果應用，確保顯示更新
        this.applyPackingResult(result);
        
        // 強制更新進度顯示為完成狀態
        this.updateProgressDisplay({ 
          status: 'completed', 
          progress: 1,
          utilization: `${result.volume_utilization.toFixed(2)}%`,
          execution_time: `${result.execution_time.toFixed(2)}s`
        });
      }
    }, 200);
}

// 模擬打包算法
export function simulatePackingAlgorithm(objects, containerSize) {
    console.log('🎭 開始模擬打包算法...');
    console.log('📦 輸入物件:', objects.map(obj => ({ uuid: obj.uuid, dimensions: obj.dimensions })));
      
    const packedObjects = [];
    let currentX = 0;
    let currentZ = 0;
    let maxY = 0;
      
    objects.forEach((obj, index) => {
      const dims = obj.dimensions;
      const width = dims.x;
      const height = dims.y;
      const depth = dims.z;
        
      console.log(`📦 處理物件 ${index}:`, { uuid: obj.uuid, dimensions: dims });
        
      // 檢查是否需要換行
      if (currentX + width > containerSize.width) {
        currentX = 0;
        currentZ += maxY;
        maxY = 0;
        console.log(`🔄 換行: currentX=${currentX}, currentZ=${currentZ}`);
      }
        
      // 檢查是否需要換層
      if (currentZ + depth > containerSize.depth) {
        currentX = 0;
        currentZ = 0;
        maxY = 0;
        console.log(`🔄 換層: currentX=${currentX}, currentZ=${currentZ}`);
      }
        
      // 設置物件位置
      const packedObj = {
        uuid: obj.uuid, // 使用原始物件的UUID
        position: {
          x: currentX,
          y: 0,
          z: currentZ
        },
        dimensions: dims,
        rotation: obj.rotation || { x: 0, y: 0, z: 0 }
      };
        
      console.log(`📍 物件 ${obj.uuid} 打包位置:`, packedObj.position);
        
      packedObjects.push(packedObj);
        
      // 更新位置
      currentX += width;
      maxY = Math.max(maxY, height);
    });
      
    console.log('🎭 模擬打包算法完成，結果:', packedObjects);
    return packedObjects;
}

// 計算體積利用率
export function calculateVolumeUtilization(packedObjects, containerSize) {
    const totalVolume = packedObjects.reduce((sum, obj) => {
      const dims = obj.dimensions;
      return sum + (dims.x * dims.y * dims.z);
    }, 0);
      
    const containerVolume = containerSize.width * containerSize.height * containerSize.depth;
    return (totalVolume / containerVolume) * 100;
}