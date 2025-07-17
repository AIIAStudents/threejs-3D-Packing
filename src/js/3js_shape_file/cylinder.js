import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getStackedPosition } from '../utils/placement.js';
import { physicsObjects, world } from '../utils/physics.js';
import { CSG } from 'three-csg-ts';

export function addObject_createCylinder(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    radiusTop: 8,
    radiusBottom: 8,
    height: 20,
    radialSegments: 32,
    heightSegments: 1,
    openEnded: false,
    hollow: false,
    wallThickness: 2
  };

  let mesh = createCylinder(default_parameters_settings);
  const pos = getStackedPosition(objectCount);
  mesh.position.set(pos.x, pos.y, pos.z);
  scene.add(mesh);
  objects.push(mesh);

  let body = createPhysicsBody(mesh, default_parameters_settings);
  world.addBody(body);
  physicsObjects.push({ mesh, body });

  if (typeof addToList === 'function') {
    addToList(`Object ${objectCount + 1}`, mesh);
  }

  const folder = gui.addFolder(`Object ${objectCount + 1}`);
  folder.domElement.style.display = 'none';
  guiFoldersMap?.set(mesh, folder);

  function updateAll() {
    const p = default_parameters_settings;

    const newMesh = createCylinder(p);
    scene.remove(mesh);
    scene.add(newMesh);

    const index = objects.indexOf(mesh);
    if (index !== -1) objects[index] = newMesh;

    newMesh.position.copy(mesh.position);
    newMesh.rotation.copy(mesh.rotation);

    guiFoldersMap.delete(mesh);
    guiFoldersMap.set(newMesh, folder);

    world.removeBody(body);
    const newBody = createPhysicsBody(newMesh, p);
    newBody.position.copy(newMesh.position);
    world.addBody(newBody);

    const physicsObjIndex = physicsObjects.findIndex(o => o.mesh === mesh);
    if (physicsObjIndex !== -1) physicsObjects[physicsObjIndex] = { mesh: newMesh, body: newBody };

    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = newMesh;
    body = newBody;
  }

  folder.add(default_parameters_settings, 'radiusTop', 1, 30).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'radiusBottom', 1, 30).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'height', 1, 50).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'radialSegments', 3, 64).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'heightSegments', 1, 10).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'openEnded').onChange(updateAll);
  folder.add(default_parameters_settings, 'hollow').onChange(updateAll);
  folder.add(default_parameters_settings, 'wallThickness', 1, 10).step(1).onChange(updateAll);

  folder.add(mesh.position, 'x', -200, 200).step(1).name('Position X');
  folder.add(mesh.position, 'y', -200, 200).step(1).name('Position Y');
  folder.add(mesh.position, 'z', -200, 200).step(1).name('Position Z');

  folder.add({
    delete: () => {
      if (window.confirm("Are you sure you want to delete this object?")) {
        scene.remove(mesh);
        const index = objects.indexOf(mesh);
        if (index > -1) objects.splice(index, 1);
        gui.removeFolder(folder);
        mesh.geometry.dispose();
        mesh.material.dispose();
        world.removeBody(body);
        const pIndex = physicsObjects.findIndex(p => p.mesh === mesh);
        if (pIndex !== -1) physicsObjects.splice(pIndex, 1);
      }
    }
  }, 'delete').name('Delete Object');

  folder.open();
  return objectCount + 1;
}

function createCylinder(p) {
  const outerGeo = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments, p.heightSegments, p.openEnded);
  const outerMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);

  if (!p.hollow) return outerMesh;

  const innerGeo = new THREE.CylinderGeometry(
    Math.max(0.1, p.radiusTop - p.wallThickness),
    Math.max(0.1, p.radiusBottom - p.wallThickness),
    p.height + 0.1,
    p.radialSegments,
    p.heightSegments,
    p.openEnded
  );
  const innerMesh = new THREE.Mesh(innerGeo);
  const result = CSG.subtract(outerMesh, innerMesh);
  result.material = outerMat;
  return result;
}

function createPhysicsBody(mesh, p) {
  if (!p.hollow) {
    const shape = new CANNON.Cylinder(p.radiusTop, p.radiusBottom, p.height, p.radialSegments);
    return new CANNON.Body({ mass: 1, shape });
  }

  const segments = 4;
  const thickness = p.wallThickness;
  const angleStep = (2 * Math.PI) / segments;
  const body = new CANNON.Body({ mass: 1 });

  for (let i = 0; i < segments; i++) {
    const angle = i * angleStep;
    const x = Math.cos(angle) * (p.radiusTop - thickness / 2);
    const z = Math.sin(angle) * (p.radiusTop - thickness / 2);
    const box = new CANNON.Box(new CANNON.Vec3(thickness / 2, p.height / 2, thickness / 2));
    body.addShape(box, new CANNON.Vec3(x, 0, z));
  }

  return body;
}
