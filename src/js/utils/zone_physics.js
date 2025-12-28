import * as CANNON from 'cannon-es';
import { world } from './physics.js';

const zoneBodies = [];
const WALL_THICKNESS = 0.5;

/**
 * Removes all previously created zone physics walls from the world.
 */
export function clearZonePhysicsWalls() {
  if (!world) return;
  console.log(`[ZonePhysics] Clearing ${zoneBodies.length} old wall bodies.`);
  zoneBodies.forEach(body => {
    world.removeBody(body);
  });
  zoneBodies.length = 0; // Clear the array
}

/**
 * Creates 5 static physics bodies (4 walls + 1 floor) to enclose a zone.
 * @param {object} zone - The zone object containing worldBounds.
 */
export function createZonePhysicsWalls(zone) {
  if (!world || !zone || !zone.worldBounds) return;

  const { x, y, z, width, height, depth } = zone.worldBounds;
  const wallMaterial = new CANNON.Material('zoneWall'); // Optional: for contact properties

  const wallPositions = [
    // Floor
    { pos: [x + width / 2, y + WALL_THICKNESS / 2, z + depth / 2], size: [width / 2, WALL_THICKNESS / 2, depth / 2] },
    // Wall -X
    { pos: [x - WALL_THICKNESS / 2, y + height / 2, z + depth / 2], size: [WALL_THICKNESS / 2, height / 2, depth / 2] },
    // Wall +X
    { pos: [x + width + WALL_THICKNESS / 2, y + height / 2, z + depth / 2], size: [WALL_THICKNESS / 2, height / 2, depth / 2] },
    // Wall -Z
    { pos: [x + width / 2, y + height / 2, z - WALL_THICKNESS / 2], size: [width / 2, height / 2, WALL_THICKNESS / 2] },
    // Wall +Z
    { pos: [x + width / 2, y + height / 2, z + depth + WALL_THICKNESS / 2], size: [width / 2, height / 2, WALL_THICKNESS / 2] },
  ];

  wallPositions.forEach(wall => {
    const shape = new CANNON.Box(new CANNON.Vec3(...wall.size));
    const body = new CANNON.Body({
      mass: 0, // Static body
      position: new CANNON.Vec3(...wall.pos),
      shape: shape,
      material: wallMaterial,
    });
    body.name = `zone-wall-${zone.id}`;
    world.addBody(body);
    zoneBodies.push(body);
  });

  console.log(`[ZonePhysics] built walls for zone ${zone.id}: 5 bodies`);
}
