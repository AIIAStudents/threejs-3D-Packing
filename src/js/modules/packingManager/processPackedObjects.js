import { updateProgress } from "./updateProgressDisplay.js";
import { updateDOM } from "./updateDOM.js";

export function processPackedObjects(result, objectManager, physicsEnabled) {
    const { 
        packed_objects : packedObjects, 
        volume_utilization: utilization,
        execution_time : executionTime
    } = result ;
    const objects = objectManager.getObjects();
    const sceneMeshes = objects.map(obj => obj.mesh);
  
    console.log('🎯 場景中的物件:', objects.map(obj => ({ uuid: obj.mesh.uuid, type: obj.type })));
  
    // === 核心迴圈：套用打包結果到 3D 場景 ===
    packedObjects.forEach((packedObj, index) => {
      console.log(`🔍 尋找物件 ${packedObj.uuid} 在場景中...`);
  
      // 嘗試匹配場景物件
      let sceneObj = sceneMeshes.find(mesh => mesh.uuid === packedObj.uuid)
                  || sceneMeshes[index]; // UUID 找不到就用索引兜底
  
      if (!sceneObj) {
        console.warn(`⚠️ 找不到物件 ${packedObj.uuid} 在場景中`);
        console.warn(`📋 可用的物件UUID:`, sceneMeshes.map(mesh => mesh.uuid));
        return;
      }
  
      console.log(`🎯 更新物件 ${packedObj.uuid} 的位置`);
  
      // === 從後端座標轉換到前端座標 ===
      // 取得容器尺寸（含預設值）
      const containerWidth  = packedObj.container_size?.width  || 120;
      const containerHeight = packedObj.container_size?.height || 120;
      const containerDepth  = packedObj.container_size?.depth  || 120;

      // 容器的半尺寸（方便從角點系統轉換到中心系統）
      const halfOffset = {
        x: containerWidth  / 2,
        y: containerHeight / 2,
        z: containerDepth  / 2
      };

      // 防呆夾值函數
      const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

      // 物件尺寸與半尺寸
      const size = packedObj.dimensions || packedObj.size || { x: 0, y: 0, z: 0 };
      const halfSize = {
        x: size.x / 2,
        y: size.y / 2,
        z: size.z / 2
      };
        // 計算位置
      const margin = 0.5; 
      const para = 0.3;

      const targetX = clamp(
      (packedObj.position?.x || 0) + halfSize.x - halfOffset.x,
        -halfOffset.x + margin,
        halfOffset.x - margin
      );
      
      const targetZ = clamp(
        (packedObj.position?.z || 0) + halfSize.z - halfOffset.z,
        -halfOffset.z + margin,
        halfOffset.z - margin
      );
      
      // Y 軸：物件底面貼地，再加 para 微調
      const targetY = halfSize.y + para;
    

      // 設定到場景物件
      sceneObj.position.set(targetX, targetY, targetZ);

      console.log(`📍 新位置:`, { x: targetX, y: targetY, z: targetZ });
      console.log(`📏 尺寸:`, size);
  
      // === 視覺反饋：改顏色表示更新中 ===
      const originalColor = sceneObj.material.color.clone();
      sceneObj.material.color.setHex(0xff0000);
  
      // 更新位置與旋轉
      sceneObj.position.set(targetX, targetY, targetZ);
      sceneObj.rotation.set(
        packedObj.rotation?.x || 0,
        packedObj.rotation?.y || 0,
        packedObj.rotation?.z || 0
      );
  
      // 強制刷新矩陣
      sceneObj.matrixWorldNeedsUpdate = true;
      sceneObj.matrixAutoUpdate = true;
      sceneObj.updateMatrix();
      sceneObj.updateMatrixWorld(true);
  
      // 若有物理體，也同步更新
      if (sceneObj.userData?.physicsBody) {
        const body = sceneObj.userData.physicsBody;
        body.position.set(targetX, targetY, targetZ);
        body.quaternion.setFromEuler(
          packedObj.rotation?.x || 0,
          packedObj.rotation?.y || 0,
          packedObj.rotation?.z || 0
        );
      }
  
      // 延遲恢復顏色
      setTimeout(() => sceneObj.material.color.copy(originalColor), 1000);
  
      console.log(`✅ 物件 ${packedObj.uuid} 更新完成`);
    });
  
    // 關閉物理引擎
    if (window.packingManager) {
      window.packingManager.setPhysicsEnabled(false);
      console.log("🔄 已經關閉物理引擎 !");
    }
    
    // physicsEnabled = false;
    // console.log("🔄 已經關閉物理引擎 !");


    // === 安全格式化利用率與執行時間 ===
    const utilizationText = formatMetric(utilization, '%');
    const executionTimeText = formatMetric(executionTime, 's');
  
    console.log('📊 格式化後的顯示數據:', { utilization: utilizationText, executionTime: executionTimeText });
  
    // 更新 UI
    updateDOM(utilizationText, executionTimeText);
    updateProgress({
      status: 'completed',
      progress: 100,
      utilization: utilizationText,
      executionTime: executionTimeText
    });
  
    // 強制刷新 3D 場景
    forceUpdateScene();
  }
  
  // 小工具方法：安全格式化數值
function formatMetric(value, unit) {
    if (value === undefined || value === null || isNaN(value)) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '-' : `${num.toFixed(2)}${unit}`;
  }

 // 強制更新3D場景 - 新增方法
function  forceUpdateScene() {
    console.log('🎨 強制更新3D場景渲染');
    
    if (window.scene && window.renderer && window.camera) {
        // 多次強制更新，確保渲染
        for (let i = 0; i < 5; i++) {
            window.renderer.render(window.scene, window.camera);
        }
        
        // 標記場景需要持續更新
        if (window.scene.userData) {
            window.scene.userData.needsUpdate = true;
            window.scene.userData.lastUpdateTime = Date.now();
            console.log("✅ 設定 needsUpdate = true !");
        }
        // 強制更新所有物件的可見性和矩陣
        const allMeshes = [];
        window.scene.traverse((child) => {
            if (child.isMesh) {
                allMeshes.push(child);
            }
        });
        
        allMeshes.forEach(mesh => {
            mesh.visible = true;
            mesh.matrixWorldNeedsUpdate = true;
            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);
        
            // 強制更新材質
            if (mesh.material) {
                mesh.material.needsUpdate = true;
            }
        });
        
        console.log('✅ 3D場景渲染更新完成');
      
      // 啟動持續更新機制
      startContinuousRendering();
    } else {
      console.warn('⚠️ 無法找到場景、渲染器或相機引用');
      console.log('🔍 全局變量檢查:', {
        scene: !!window.scene,
        renderer: !!window.renderer,
        camera: !!window.camera
      });
    }
  }

  // 啟動持續渲染機制 - 新增方法
function startContinuousRendering() {
    console.log('🔄 啟動持續渲染機制...');
    
    let updateCount = 0;
    const maxUpdates = 100; // 增加更新次數
    const updateInterval = setInterval(() => {
      if (window.scene && window.renderer && window.camera && updateCount < maxUpdates) {
        // 每次更新都強制渲染
        window.renderer.render(window.scene, window.camera);
        updateCount++;
        
        if (updateCount % 20 === 0) {
          console.log(`🔄 持續渲染 ${updateCount}/${maxUpdates}`);
        }
      } else {
        clearInterval(updateInterval);
        console.log('✅ 持續渲染完成，物件位置應該已經穩定顯示');
        
        // 最後一次強制渲染
        if (window.scene && window.renderer && window.camera) {
          window.renderer.render(window.scene, window.camera);
          console.log('🎯 最終強制渲染完成');
        }
      }
    }, 30); // 減少間隔時間，提高更新頻率
  }
