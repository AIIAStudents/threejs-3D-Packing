// physics.js
import * as CANNON from 'cannon-es';

export let world;

export function initPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
}

// 建立物理 body（可提供共用函式）
export function createSphereBody(radius, position, mass = 1) {
  const body = new CANNON.Body({
    mass,
    shape: new CANNON.Sphere(radius),
    position: new CANNON.Vec3(...position)
  });
  world.addBody(body);
  return body;
}

export const physicsObjects = [];

export function addPhysicsObject(mesh, shape, mass = 1) {
  const body = new CANNON.Body({ mass, shape });
  body.position.copy(mesh.position);
  body.quaternion.copy(mesh.quaternion);
  world.addBody(body);
  physicsObjects.push({ mesh, body });
}

export function updatePhysicsShape(mesh, newShape) {
  const obj = physicsObjects.find(o => o.mesh === mesh);
  if (obj) {
    const { body } = obj;
    const newBody = new CANNON.Body({
      mass: body.mass,
      shape: newShape,
    });
    newBody.position.copy(body.position);
    newBody.quaternion.copy(body.quaternion);
    world.removeBody(body);
    world.addBody(newBody);
    obj.body = newBody;
  }
}

export function removePhysicsObject(mesh) {
  const index = physicsObjects.findIndex(o => o.mesh === mesh);
  if (index !== -1) {
    world.removeBody(physicsObjects[index].body);
    physicsObjects.splice(index, 1);
  }
}

export function updatePhysics() {
  world.step(1 / 60);
  for (const { mesh, body } of physicsObjects) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}
