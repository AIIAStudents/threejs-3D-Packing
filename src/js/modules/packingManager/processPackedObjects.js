import * as THREE from 'three';
import { formatMetric } from './updateProgressDisplay.js';
import {forceUpdateDOM} from './updateDOM.js';

export function processPackedObjects(
  packedObjects,
  utilization,
  executionTime,
  forceUpdateScene,
  objectManager,
  updateProgressDisplay
) {
    const sceneItems = objectManager.getSceneObjects();

    console.log('🎯 場景中的概念物件:', sceneItems.map(item => ({ uuid: item.mesh?.uuid, type: item.type })));

    // 暫時將所有物理剛體設為靜態
    sceneItems.forEach(item => {
        if (item.body) {
            item.body.type = CANNON.Body.STATIC;
            item.body.updateMassProperties();
        }
    });
    
    packedObjects.forEach(packedObj => {
      const sceneItem = sceneItems.find(item => item.userData.id === packedObj.uuid); // 假設 userData.id 存儲了物件的唯一 ID
      if (!sceneItem) {
        console.warn(`⚠️ 找不到 ID 為 ${packedObj.uuid} 的場景物件`);
        return;
      }

      const mesh = sceneItem; // sceneItem is the mesh itself
      const body = sceneItem.userData.body; // The body is stored in userData
      const containerSize = { x: 120, y: 120, z: 120 };

      const halfOffset = { x: containerSize.x / 2, y: 0, z: containerSize.z / 2 };
      const size = packedObj.dimensions || { x: 0, y: 0, z: 0 };
      const halfSize = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
      const margin = 0.1;

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

      if (mesh) {
          mesh.position.copy(targetPosition);
          mesh.quaternion.copy(targetQuaternion);
          mesh.updateMatrixWorld(true); // 強制更新物件的世界矩陣
      }
      if (body) {
        body.position.copy(targetPosition);
        body.quaternion.copy(targetQuaternion);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
      }
  
      console.log(`✅ 物件 ${packedObj.uuid} 更新完成`);
    });

    // 恢復物理
    sceneItems.forEach(item => {
        if (item.body) {
            item.body.type = CANNON.Body.DYNAMIC;
            item.body.mass = item.userData.mass ?? item.body.mass; 
            item.body.updateMassProperties();
            item.body.sleep();
        }
    });
    console.log("🔄 所有物理剛體已重新啟用並設為睡眠狀態!");

    // 更新 UI
    const utilizationText = formatMetric(utilization, '%');
    const executionTimeText = formatMetric(executionTime, 's');
    console.log('📊 格式化後的顯示數據:', { utilization: utilizationText, executionTime: executionTimeText });

    if (typeof forceUpdateScene === 'function') {
        forceUpdateScene();
    }
    forceUpdateDOM(utilizationText, executionTimeText);

    if (typeof updateProgressDisplay === 'function') {
        updateProgressDisplay({
          status: 'completed',
          progress: 100,
          utilization: utilizationText,
          execution_time: executionTimeText
        });
    }
}
