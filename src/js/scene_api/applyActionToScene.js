export function applyActionToScene(action, objects, physicsObjects) {
  const target = objects.find(obj => obj.uuid === action.uuid);
  if (!target) {
    console.warn("⚠️ 找不到物件:", action.uuid);
    return;
  }

  // 更新位置
  if (action.position && isFinite(action.position.x)) {
    target.position.set(action.position.x, action.position.y, action.position.z);
  }

  // 更新大小
  if (action.scale && isFinite(action.scale.x)) {
    target.scale.set(action.scale.x, action.scale.y, action.scale.z);
  }

  // 更新顏色（支援 HEX / RGB）
  if (action.material?.color) {
    try {
      const hexColor = typeof action.material.color === 'number'
        ? action.material.color
        : parseInt(action.material.color.replace('#', ''), 16);
      target.material.color.setHex(hexColor);
    } catch (err) {
      console.warn("⚠️ 顏色格式錯誤:", action.material.color);
    }
  }

  // 更新剛體位置
  const physical = physicsObjects?.find(o => o.mesh === target);
  if (physical) {
    physical.body.position.copy(target.position);
    physical.body.velocity.set(0, 0, 0);
  }

  console.log(`✅ 套用成功！[${action.uuid}]`);
}