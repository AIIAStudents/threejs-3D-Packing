import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getStackedPosition } from '../utils/placement.js';
import { addPhysicsObject, updatePhysicsShape, removePhysicsObject } from '../physics.js';

export function addObject_createIcosahedron(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    radius: 10,
    detail: 0,
  };

  const mesh = createIcosahedron(default_parameters_settings.radius, default_parameters_settings.detail);
  
  const pos = getStackedPosition(objectCount);
  mesh.position.set(pos.x, pos.y, pos.z);

  scene.add(mesh);
  objects.push(mesh);

  // 初始加上物理剛體
  const shape = new CANNON.Sphere(default_parameters_settings.radius);
  addPhysicsObject(mesh, shape, 1);

  if (typeof addToList === 'function') {
    addToList(`Object ${objectCount + 1}`, mesh);
  }

  const folder = gui.addFolder(`Object ${objectCount + 1}`);
  folder.domElement.style.display = 'none'; // 初始隱藏

  if (guiFoldersMap) {
    guiFoldersMap.set(mesh, folder);
  }

  // ✅ 統一更新幾何與剛體
  function updateAll() {
    const { radius, detail } = default_parameters_settings;
    updateGeometry(mesh, radius, detail);

    const newShape = new CANNON.Sphere(radius);
    updatePhysicsShape(mesh, newShape);
  }

  folder.add(default_parameters_settings, 'radius', 1, 20).step(0.228).onChange(updateAll);
  folder.add(default_parameters_settings, 'detail', 0, 5).step(1).onChange(updateAll);

  folder.add(mesh.position, 'x', -200, 200).step(1).name('Position X');
  folder.add(mesh.position, 'y', -200, 200).step(1).name('Position Y');
  folder.add(mesh.position, 'z', -200, 200).step(1).name('Position Z');

  folder.add({
    delete: () => {
      const deleteMessage = window.confirm("Are you sure you want to delete this object?");
      if (deleteMessage) {
        scene.remove(mesh);
        const index = objects.indexOf(mesh);
        if (index > -1) {
          objects.splice(index, 1);
        }
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
export function createIcosahedron(radius, detail) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const material = new THREE.MeshStandardMaterial({
    color: 0xfff5e7,
    flatShading: true,
  });
  return new THREE.Mesh(geometry, material);
}

export function updateGeometry(mesh, radius, detail) {
  const newGeometry = new THREE.IcosahedronGeometry(radius, detail);
  mesh.geometry.dispose();
  mesh.geometry = newGeometry;
}