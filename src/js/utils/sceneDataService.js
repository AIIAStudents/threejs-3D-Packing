// js/utils/sceneDataService.js

/**
 * 將場景物件轉換為後端需要的格式
 * @param {Array} objects - 三維物件列表
 * @param {number} boundarySize - 場景邊界大小
 * @returns {Object} 場景設定 JSON
 */
export function getSceneConfig(objects, boundarySize) {
  const objectData = objects.map(obj => ({
    uuid: obj.uuid,  // ⭐ 加入這一行，關鍵對應！
    type: obj.geometry?.type || 'Mesh',
    position: {
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z
    },
    scale: {
      x: obj.scale.x,
      y: obj.scale.y,
      z: obj.scale.zcl3
    },
    material: {
      color: obj.material?.color?.getHex?.(),
      metalness: obj.material?.metalness,
      roughness: obj.material?.roughness
    }
  }));

  return {
    environment_meta: {
      boundarySize
    },
    objects: objectData
  };
}