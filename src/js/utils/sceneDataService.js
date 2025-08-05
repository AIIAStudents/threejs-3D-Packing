// js/utils/sceneDataService.js

/**
 * 將場景物件轉換為後端需要的格式
 * @param {Array} objects - 三維物件列表
 * @param {number} boundarySize - 場景邊界大小 // getSceneConfig
 * @returns {Object} 場景設定 JSON
 */
export function getSceneConfig(objects, boundarySize) {
  const objectData = objects
    .filter(obj => obj.isMesh && obj.position)  // 避免空值錯誤
    .map(serializeObject);  // ✅ 使用單一物件序列器

  return {
    environment_meta: {
      boundarySize
    },
    objects: objectData
  };
}

export function serializeObject(object) {
  const geoParams = object.geometry?.parameters || {};
  const geoType = object.geometry?.type || "UnknownGeometry";

  return {
    uuid: object.uuid,
    type: geoType,
    position: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z
    },
    scale: {
      x: object.scale.x,
      y: object.scale.y,
      z: object.scale.z
    },
    rotation: {
      x: object.rotation.x,
      y: object.rotation.y,
      z: object.rotation.z
    },
    material: {
      color: object.material?.color?.getHex?.() || 0,
      metalness: object.material?.metalness ?? 0,
      roughness: object.material?.roughness ?? 1
    },
    geometry: geoParams,
    physics: object.userData?.physics || {
      shape: inferShape(geoType),
      mass: 1
    },
    positionMode: object.userData?.position || "manual"
  };
}

export function inferShape(geoType) {
  if (geoType === "BoxGeometry") return "box";
  if (geoType === "SphereGeometry") return "sphere";
  if (geoType === "CylinderGeometry") return "cylinder";
  if (geoType === "IcosahedronGeometry") return "sphere";
  return "mesh";
}

// 獲取當前場景、物品資訊
export function getLiveSceneSnapshot(scene, boundarySize) {
  if (!scene || !Array.isArray(scene.children)) {
    console.warn("⚠️ scene 物件異常：", scene);
    return getSceneConfig([], boundarySize);
  }
  const currentObjects = scene.children.filter(obj => obj.isMesh && obj.visible);
  return getSceneConfig(currentObjects, boundarySize);
}