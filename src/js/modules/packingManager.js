// 3D打包管理模組
export class PackingManager {
  constructor(objectManager) {
    this.objectManager = objectManager;
  }

  // 執行3D打包
  async executePacking() {
    console.log('🚀 開始執行3D打包...');
    
    const objects = this.objectManager.getObjects();
    console.log('📦 當前物件數量:', objects.length);
    
    if (objects.length === 0) {
      alert('請先添加物件');
      return;
    }
    
    const packingPanel = document.getElementById('packing-panel');
    packingPanel.style.display = 'block';
    
    // 重置進度顯示
    this.updateProgressDisplay({ status: 'pending', progress: 0 });
    
    try {
      // 轉換物件格式
      const packObjects = objects.map(obj => {
        const mesh = obj.mesh;
        // 根據物件類型獲取尺寸
        let dims;
        switch (obj.type) {
          case 'cube':
            dims = {
              x: parseFloat(document.getElementById('cube-width').value) || 15,
              y: parseFloat(document.getElementById('cube-height').value) || 15,
              z: parseFloat(document.getElementById('cube-depth').value) || 15
            };
            break;
          case 'sphere':
            const radius = parseFloat(document.getElementById('sphere-radius').value) || 10;
            dims = { x: radius * 2, y: radius * 2, z: radius * 2 };
            break;
          case 'cylinder':
            const cylinderHeight = parseFloat(document.getElementById('cylinder-height').value) || 10;
            const cylinderRadius = Math.max(
              parseFloat(document.getElementById('cylinder-radiusTop').value) || 5,
              parseFloat(document.getElementById('cylinder-radiusBottom').value) || 5
            );
            dims = { x: cylinderRadius * 2, y: cylinderHeight, z: cylinderRadius * 2 };
            break;
          case 'icosahedron':
            const icosahedronRadius = parseFloat(document.getElementById('icosahedron-radius').value) || 10;
            dims = { x: icosahedronRadius * 2, y: icosahedronRadius * 2, z: icosahedronRadius * 2 };
            break;
          case 'irregular':
            dims = {
              x: parseFloat(document.getElementById('irregular-width').value) || 10,
              y: parseFloat(document.getElementById('irregular-height').value) || 15,
              z: parseFloat(document.getElementById('irregular-depth').value) || 8
            };
            break;
          default:
            dims = { x: 1, y: 1, z: 1 };
        }
        
        const packObj = {
          uuid: mesh.uuid,
          type: obj.type,
          dimensions: dims,
          position: {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z
          },
          scale: { x: 1, y: 1, z: 1 },
          rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
          material: {
            color: mesh.material?.color?.getHex?.() || 0xffffff,
            metalness: 0,
            roughness: 1
          }
        };
        
        console.log(`📦 物件 ${mesh.uuid} 打包數據:`, packObj);
        return packObj;
      });
      
      console.log('📦 所有物件打包數據:', packObjects);
      
      // 使用固定的120^3容器
      const packContainer = {
        width: 120,
        height: 120,
        depth: 120
      };
      
      // 發送打包請求
      const request = {
        objects: packObjects,
        container_size: packContainer,
        optimization_type: 'volume_utilization',
        algorithm: 'blf_sa',
        async_mode: true,
        timeout: 30
      };
      
      console.log('📤 發送打包請求:', request);
      
      // 這裡需要導入binPackingAPI
      if (window.requestBinPacking) {
        console.log('✅ Bin packing API 可用，發送請求...');
        try {
          const response = await window.requestBinPacking(request);
          console.log('📥 收到打包響應:', response);
          
          if (response.job_id) {
            console.log('🆔 任務ID:', response.job_id);
            // 輪詢結果
            if (window.pollJobUntilComplete) {
              console.log('🔄 開始輪詢任務結果...');
              const result = await window.pollJobUntilComplete(response.job_id, (progress) => {
                console.log('📊 進度更新:', progress);
                this.updateProgressDisplay(progress);
              });
              
              console.log('🎯 輪詢完成，最終結果:', result);
              if (result) {
                this.applyPackingResult(result);
              }
            } else {
              console.error('❌ pollJobUntilComplete 函數不可用');
            }
          } else {
            console.warn('⚠️ 響應中沒有job_id');
            // 可能是同步響應，直接處理
            if (response.packed_objects || response.result) {
              console.log('🔄 處理同步響應...');
              this.applyPackingResult(response);
            }
          }
        } catch (apiError) {
          console.warn('⚠️ API調用失敗，使用模擬打包:', apiError);
          // 如果API調用失敗，使用模擬打包
          this.simulatePacking(packObjects, packContainer);
        }
      } else {
        console.log('🔄 Bin packing API 不可用，使用模擬打包...');
        // 使用模擬打包
        this.simulatePacking(packObjects, packContainer);
      }
    } catch (error) {
      console.error('❌ 打包失敗:', error);
      alert('打包失敗: ' + error.message);
      // 顯示錯誤狀態
      this.updateProgressDisplay({ status: 'failed', progress: 0 });
    }
  }

  // 模擬打包功能
  simulatePacking(objects, containerSize) {
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
        const packedObjects = this.simulatePackingAlgorithm(objects, containerSize);
        const result = {
          packed_objects: packedObjects,
          volume_utilization: this.calculateVolumeUtilization(packedObjects, containerSize),
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
  simulatePackingAlgorithm(objects, containerSize) {
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
  calculateVolumeUtilization(packedObjects, containerSize) {
    const totalVolume = packedObjects.reduce((sum, obj) => {
      const dims = obj.dimensions;
      return sum + (dims.x * dims.y * dims.z);
    }, 0);
    
    const containerVolume = containerSize.width * containerSize.height * containerSize.depth;
    return (totalVolume / containerVolume) * 100;
  }

  // 應用打包結果
  applyPackingResult(result) {
    console.log('📦 應用打包結果:', result);
    
    // 檢查結果結構，適配不同的後端響應格式
    let packedObjects = [];
    let utilization = null;
    let executionTime = null;
    
    // 處理不同的結果格式
    if (result.packed_objects) {
      // 標準格式：{ packed_objects: [...], utilization: ..., execution_time: ... }
      packedObjects = result.packed_objects;
      utilization = result.volume_utilization || result.utilization;
      executionTime = result.execution_time;
    } else if (Array.isArray(result)) {
      // 直接是物件陣列
      packedObjects = result;
    } else if (result.result && result.result.packed_objects) {
      // 嵌套在result字段中
      packedObjects = result.result.packed_objects;
      utilization = result.result.volume_utilization || result.result.utilization;
      executionTime = result.result.execution_time;
    } else {
      console.warn('⚠️ 無法識別的結果格式:', result);
      return;
    }
    
    console.log('📦 解析後的打包物件:', packedObjects);
    console.log('📦 體積利用率:', utilization);
    console.log('📦 執行時間:', executionTime);
    
    const objects = this.objectManager.getObjects();
    console.log('🎯 場景中的物件:', objects.map(obj => ({ uuid: obj.mesh.uuid, type: obj.type })));
    
    const sceneMeshes = objects.map(obj => obj.mesh);
    
    // 手動應用打包結果到3D場景
    packedObjects.forEach(packedObj => {
      console.log(`🔍 尋找物件 ${packedObj.uuid} 在場景中...`);
      
      // 嘗試多種方式匹配物件
      let sceneObj = sceneMeshes.find(mesh => mesh.uuid === packedObj.uuid);
      
      if (!sceneObj) {
        // 如果UUID不匹配，嘗試通過索引匹配
        const index = packedObjects.indexOf(packedObj);
        if (index < sceneMeshes.length) {
          sceneObj = sceneMeshes[index];
          console.log(`⚠️ UUID不匹配，使用索引 ${index} 匹配物件`);
        }
      }
      
      if (sceneObj) {
        console.log(`🎯 更新物件 ${packedObj.uuid} 的位置`);
        console.log(`📍 原始位置:`, { x: sceneObj.position.x, y: sceneObj.position.y, z: sceneObj.position.z });
        
        // 位置轉換：從後端座標轉換到前端座標
        const halfOffset = {
          x: 60, // 120/2
          y: 60, // 120/2
          z: 60  // 120/2
        };
        
        // 調整Y軸偏移，因為容器位置改變了
        const containerYOffset = 3; // 120/40
        
        const size = packedObj.dimensions || packedObj.size || { x: 0, y: 0, z: 0 };
        const halfSize = { 
          x: size.x / 2, 
          y: size.y / 2, 
          z: size.z / 2 
        };
        
        const targetX = (packedObj.position.x || 0) + halfSize.x - halfOffset.x;
        const targetY = (packedObj.position.y || 0) + halfSize.y - halfOffset.y + containerYOffset;
        const targetZ = (packedObj.position.z || 0) + halfSize.z - halfOffset.z;
        
        console.log(`🎯 物件 ${packedObj.uuid} 新位置:`, { x: targetX, y: targetY, z: targetZ });
        console.log(`📏 物件尺寸:`, size);
        console.log(`🔢 計算參數:`, { halfSize, halfOffset, containerYOffset });
        
        // 添加視覺反饋：改變物件顏色表示正在移動
        const originalColor = sceneObj.material.color.clone();
        sceneObj.material.color.setHex(0xff0000); // 紅色表示移動中
        
        // 強制更新位置 - 使用多種方法確保更新
        sceneObj.position.set(targetX, targetY, targetZ);
        sceneObj.rotation.set(
          packedObj.rotation?.x || 0,
          packedObj.rotation?.y || 0,
          packedObj.rotation?.z || 0
        );
        
        // 強制更新所有矩陣
        sceneObj.matrixWorldNeedsUpdate = true;
        sceneObj.matrixAutoUpdate = true;
        
        // 強制更新子物件
        sceneObj.updateMatrix();
        sceneObj.updateMatrixWorld(true);
        
        // 如果物件有物理體，也更新物理位置
        if (sceneObj.userData && sceneObj.userData.physicsBody) {
          const body = sceneObj.userData.physicsBody;
          body.position.set(targetX, targetY, targetZ);
          body.quaternion.setFromEuler(
            packedObj.rotation?.x || 0,
            packedObj.rotation?.y || 0,
            packedObj.rotation?.z || 0
          );
        }
        
        // 延遲恢復原始顏色
        setTimeout(() => {
          sceneObj.material.color.copy(originalColor);
          console.log(`🎨 物件 ${packedObj.uuid} 顏色已恢復`);
        }, 1000);
        
        console.log(`✅ 物件 ${packedObj.uuid} 位置更新完成`);
      } else {
        console.warn(`⚠️ 找不到物件 ${packedObj.uuid} 在場景中`);
        console.warn(`📋 可用的物件UUID:`, sceneMeshes.map(mesh => mesh.uuid));
      }
    });
    
    // 更新顯示 - 修復NaN問題
    // 安全地處理體積利用率
    let utilizationText = '-';
    if (utilization !== undefined && utilization !== null && !isNaN(utilization)) {
      if (typeof utilization === 'number') {
        utilizationText = `${utilization.toFixed(2)}%`;
      } else if (typeof utilization === 'string') {
        const parsed = parseFloat(utilization);
        if (!isNaN(parsed)) {
          utilizationText = `${parsed.toFixed(2)}%`;
        }
      }
    }
    
    // 安全地處理執行時間
    let executionTimeText = '-';
    if (executionTime !== undefined && executionTime !== null && !isNaN(executionTime)) {
      if (typeof executionTime === 'number') {
        executionTimeText = `${executionTime.toFixed(2)}s`;
      } else if (typeof executionTime === 'string') {
        const parsed = parseFloat(executionTime);
        if (!isNaN(parsed)) {
          executionTimeText = `${parsed.toFixed(2)}s`;
        }
      }
    }
    
    console.log('📊 格式化後的顯示數據:', {
      utilization: utilizationText,
      executionTime: executionTimeText
    });
    
    // 更新DOM元素
    const utilizationElement = document.getElementById('utilization-text');
    const executionTimeElement = document.getElementById('execution-time-text');
    
    if (utilizationElement) {
      utilizationElement.textContent = utilizationText;
      console.log('✅ 體積利用率已更新:', utilizationText);
    } else {
      console.warn('⚠️ 找不到體積利用率顯示元素');
    }
    
    if (executionTimeElement) {
      executionTimeElement.textContent = executionTimeText;
      console.log('✅ 執行時間已更新:', executionTimeText);
    } else {
      console.warn('⚠️ 找不到執行時間顯示元素');
    }
    
    // 顯示完成狀態
    this.updateProgressDisplay({ 
      status: 'completed', 
      progress: 100,
      utilization: utilizationText,
      execution_time: executionTimeText
    });
    
    console.log('✅ 打包結果顯示更新完成:', {
      utilization: utilizationText,
      executionTime: executionTimeText
    });
    
    // 強制更新3D場景
    if (window.scene && window.renderer && window.camera) {
      console.log('🎨 強制更新3D場景渲染');
      
      // 多次強制更新，確保渲染
      for (let i = 0; i < 3; i++) {
        window.renderer.render(window.scene, window.camera);
      }
      
      // 標記場景需要持續更新
      if (window.scene.userData) {
        window.scene.userData.needsUpdate = true;
        window.scene.userData.lastUpdateTime = Date.now();
      }
      
      // 強制更新所有物件的可見性
      const objects = this.objectManager.getObjects();
      objects.forEach(obj => {
        if (obj.mesh) {
          obj.mesh.visible = true;
          obj.mesh.matrixWorldNeedsUpdate = true;
          obj.mesh.updateMatrix();
          obj.mesh.updateMatrixWorld(true);
        }
      });
      
      console.log('✅ 3D場景渲染更新完成');
    } else {
      console.warn('⚠️ 無法找到場景、渲染器或相機引用');
      console.log('🔍 全局變量檢查:', {
        scene: !!window.scene,
        renderer: !!window.renderer,
        camera: !!window.camera
      });
    }
    
    // 額外的場景更新機制
    setTimeout(() => {
      console.log('🔄 延遲場景更新...');
      if (window.scene && window.renderer && window.camera) {
        // 強制更新所有物件
        const objects = this.objectManager.getObjects();
        objects.forEach(obj => {
          if (obj.mesh) {
            obj.mesh.matrixWorldNeedsUpdate = true;
          }
        });
        
        window.renderer.render(window.scene, window.camera);
        console.log('✅ 延遲場景更新完成');
      }
    }, 100);
    
    // 再次延遲更新，確保所有變化都已應用
    setTimeout(() => {
      console.log('🔄 最終場景更新...');
      if (window.scene && window.renderer && window.camera) {
        // 最後一次強制更新
        window.renderer.render(window.scene, window.camera);
        console.log('✅ 最終場景更新完成');
      }
    }, 500);
    
    // 持續更新機制 - 確保物件位置變化持續顯示
    let updateCount = 0;
    const maxUpdates = 50; // 增加更新次數
    const updateInterval = setInterval(() => {
      if (window.scene && window.renderer && window.camera && updateCount < maxUpdates) {
        // 每次更新都強制渲染
        window.renderer.render(window.scene, window.camera);
        updateCount++;
        if (updateCount % 10 === 0) {
          console.log(`🔄 持續更新 ${updateCount}/${maxUpdates}`);
        }
      } else {
        clearInterval(updateInterval);
        console.log('✅ 持續更新完成，物件位置應該已經穩定顯示');
        
        // 最後一次強制渲染
        if (window.scene && window.renderer && window.camera) {
          window.renderer.render(window.scene, window.camera);
          console.log('🎯 最終強制渲染完成');
        }
      }
    }, 50); // 減少間隔時間，提高更新頻率
  }

  // 更新進度顯示
  updateProgressDisplay(progress) {
    console.log('🔄 更新進度顯示:', progress);
    
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const progressStatus = document.querySelector('.progress-status');
    
    if (!progressFill || !progressText || !progressStatus) {
      console.warn('⚠️ 找不到進度顯示元素');
      return;
    }
    
    // 處理進度百分比
    let progressPercent = 0;
    if (progress.progress !== undefined) {
      progressPercent = Math.min(100, Math.max(0, progress.progress * 100));
    } else if (progress.percentage !== undefined) {
      progressPercent = Math.min(100, Math.max(0, progress.percentage));
    }
    
    // 更新進度條
    progressFill.style.width = `${progressPercent}%`;
    progressText.textContent = `${progressPercent.toFixed(1)}%`;
    
    // 更新狀態文字
    let statusText = '準備中...';
    if (progress.status) {
      switch (progress.status) {
        case 'pending':
          statusText = '等待中...';
          break;
        case 'processing':
          statusText = '計算中...';
          break;
        case 'completed':
          statusText = '完成';
          break;
        case 'failed':
          statusText = '失敗';
          break;
        default:
          statusText = progress.status;
      }
    } else if (progress.state) {
      statusText = progress.state;
    }
    
    progressStatus.textContent = statusText;
    
    // 如果完成，顯示結果
    if (progress.status === 'completed') {
      console.log('✅ 打包完成，更新結果顯示');
      
      // 處理體積利用率
      if (progress.utilization) {
        const utilizationElement = document.getElementById('utilization-text');
        if (utilizationElement) {
          utilizationElement.textContent = progress.utilization;
          console.log('✅ 體積利用率已更新:', progress.utilization);
        }
      }
      
      // 處理執行時間
      if (progress.execution_time) {
        const executionTimeElement = document.getElementById('execution-time-text');
        if (executionTimeElement) {
          executionTimeElement.textContent = progress.execution_time;
          console.log('✅ 執行時間已更新:', progress.execution_time);
        }
      }
    }
    
    console.log('🔄 進度顯示更新完成:', {
      status: statusText,
      progress: progressPercent,
      utilization: progress.utilization,
      executionTime: progress.execution_time
    });
  }

  // 取消打包
  cancelPacking() {
    document.getElementById('packing-panel').style.display = 'none';
    // 這裡可以添加取消打包的邏輯
  }
}

