import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function processPackedObjects(packedObjects, utilization, executionTime, forceUpdateScene) {
    // 獲取包含實例化資訊和物理剛體的完整物件列表
    const sceneItems = this.objectManager.getObjects();
  
    console.log('🎯 場景中的概念物件:', sceneItems.map(item => ({ uuid: item.uuid, type: item.type })));
  
    // 在更新位置前，暫時將所有物理剛體設為靜態
    sceneItems.forEach(item => {
        if (item.body) {
            item.body.type = CANNON.Body.STATIC;
            item.body.updateMassProperties();
        }
    });

    // === 核心迴圈：套用打包結果到 Mesh 上 ===
    packedObjects.forEach(packedObj => {
      // 使用為實例創建的唯一UUID來查找物件
      const sceneItem = sceneItems.find(item => item.uuid === packedObj.uuid);
  
      if (!sceneItem) {
        console.warn(`⚠️ 找不到 UUID 為 ${packedObj.uuid} 的場景物件`);
        return; // 跳過這個找不到的物件
      }
  
      const { mesh, body } = sceneItem; // Now using mesh directly

      // === 從後端座標轉換到前端中心座標 ===
      const containerWidth  = 120;
      const containerHeight = 120;
      const containerDepth  = 120;

      const halfOffset = { x: containerWidth / 2, y: 0, z: containerDepth / 2 }; // Y軸底部在0，不偏移
      const size = packedObj.dimensions || { x: 0, y: 0, z: 0 };
      const halfSize = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
      const margin = 0.1; // 增加微小間隙防止物理爆炸

      const targetPosition = new THREE.Vector3(
        (packedObj.position?.x || 0) + halfSize.x - halfOffset.x + margin,
        (packedObj.position?.y || 0) + halfSize.y + margin,
        (packedObj.position?.z || 0) + halfSize.z - halfOffset.z + margin
      );

      const targetQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
            packedObj.rotation?.x || 0,
            packedObj.rotation?.y || 0,
            packedObj.rotation?.z || 0
        )
      );

      // --- 更新 Mesh 的位置和旋轉 ---
      if (mesh) {
          mesh.position.copy(targetPosition);
          mesh.quaternion.copy(targetQuaternion);
      }

      // --- 同步更新物理剛體 (Body) ---
      if (body) {
        body.position.copy(targetPosition);
        body.quaternion.copy(targetQuaternion);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
  
      console.log(`✅ 物件 ${packedObj.uuid} 更新完成`);
    });

    // 在所有物件都放置好後，重新啟用物理並設為睡眠
    sceneItems.forEach(item => {
        if (item.body) {
            item.body.type = CANNON.Body.DYNAMIC;
            item.body.mass = 1;
            item.body.updateMassProperties();
            item.body.sleep(); 
        }
    });
    console.log("🔄 所有物理剛體已重新啟用並設為睡眠狀態!");

    // === 更新UI和場景 ===
    const utilizationText = this.formatMetric(utilization, '%');
    const executionTimeText = this.formatMetric(executionTime, 's');
  
    console.log('📊 格式化後的顯示數據:', { utilization: utilizationText, executionTime: executionTimeText });
  
    if (typeof forceUpdateScene === 'function') {
        forceUpdateScene();
    }

    this.forceUpdateDOM(utilizationText, executionTimeText);
    this.updateProgressDisplay({
      status: 'completed',
      progress: 100,
      utilization: utilizationText,
      execution_time: executionTimeText
    });
}
