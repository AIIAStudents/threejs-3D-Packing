import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getStackedPosition } from '../utils/placement.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { addPhysicsObject, updatePhysicsShape, removePhysicsObject } from '../physics.js';

export function addObject_createIrregular(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    pointCount: 20,
  };

  const mesh = createIrregularGeometry(default_parameters_settings.pointCount);

  const pos = getStackedPosition(objectCount);
  mesh.position.set(pos.x, pos.y, pos.z);
  
  scene.add(mesh);
  objects.push(mesh);

  const shape = getBoundingSphereShape(mesh.geometry);
  addPhysicsObject(mesh, shape, 1);

  if (typeof addToList === 'function') {
    addToList(`Irregular ${objectCount + 1}`, mesh);
  }

  const folder = gui.addFolder(`Irregular ${objectCount + 1}`);
  folder.domElement.style.display = 'none';

  if (guiFoldersMap) {
    guiFoldersMap.set(mesh, folder);
  }

  function updateAll() {
    updateGeometry(mesh, default_parameters_settings.pointCount);
    const newShape = getBoundingSphereShape(mesh.geometry);
    updatePhysicsShape(mesh, newShape);
  }

  folder.add(default_parameters_settings, 'pointCount', 4, 50).step(1).onChange(updateAll).name('頂點數');
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
        removePhysicsObject(mesh);
      }
    }
  }, 'delete').name('Delete Object');

  folder.open();
  return objectCount + 1;
}

export function createIrregularGeometry(pointCount) {
  const points = [];
  for (let i = 0; i < pointCount; i++) {
    points.push(new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(20),
      THREE.MathUtils.randFloatSpread(20),
      THREE.MathUtils.randFloatSpread(20)
    ));
  }
  const geometry = new ConvexGeometry(points);
  const material = new THREE.MeshStandardMaterial({ color: 0xff7700, flatShading: true });
  return new THREE.Mesh(geometry, material);
}

export function updateGeometry(mesh, pointCount) {
  const newMesh = createIrregularGeometry(pointCount);
  mesh.geometry.dispose();
  mesh.geometry = newMesh.geometry;
  mesh.material = newMesh.material;
}

export function getBoundingSphereShape(geometry) {
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere.radius;
  return new CANNON.Sphere(radius); // 物理上以球體近似
}
