export function applyActionToScene(action, objects, physicsObjects) {
  const target = objects.find(obj => obj.uuid === action.uuid);
  if (!target) {
    console.warn("找不到物件:", action.uuid);
    return;
  }

  if (action.position) {
    target.position.set(action.position.x, action.position.y, action.position.z);
  }

  if (action.scale) {
    target.scale.set(action.scale.x, action.scale.y, action.scale.z);
  }

  if (action.material?.color) {
    target.material.color.setHex(action.material.color);
  }

  const physical = physicsObjects?.find(o => o.mesh === target);
  if (physical) {
    physical.body.position.copy(target.position);
    physical.body.velocity.set(0, 0, 0);
  }

  console.log("✅ 套用成功！");
}