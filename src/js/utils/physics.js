// physics.js
import * as CANNON from 'cannon-es';

export let world;

// This array will store the link between a conceptual object ID and its physics body
export const physicsBodies = new Map();

export function initPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
}

// Refactored to not depend on a mesh object
export function addPhysicsObject(position, quaternion, shape, itemId, mass = 1) {
  const body = new CANNON.Body({ mass, shape });
  body.position.copy(position);
  body.quaternion.copy(quaternion);
  world.addBody(body);
  physicsBodies.set(itemId, body); // Store body by its unique conceptual ID
  return body;
}

export function removePhysicsObject(itemId) {
  if (physicsBodies.has(itemId)) {
    const body = physicsBodies.get(itemId);
    world.removeBody(body);
    physicsBodies.delete(itemId);
  }
}

// The updatePhysics function should ONLY step the world.
// Syncing visuals to physics is the responsibility of the renderer/main loop.
export function updatePhysics() {
  if (world) {
    world.step(1 / 60);
  }
}
