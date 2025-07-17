import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getStackedPosition } from '../utils/placement.js';
import { addPhysicsObject, updatePhysicsShape, removePhysicsObject } from '../physics.js';

export function addObject_createcube(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    width: 15,
    height: 15,
    depth: 15,
  };

  const mesh = createCube(
    default_parameters_settings.width,
    default_parameters_settings.height,
    default_parameters_settings.depth
  );
  const pos = getStackedPosition(objectCount);
  mesh.position.set(pos.x, pos.y, pos.z);

  scene.add(mesh);
  objects.push(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(
    default_parameters_settings.width / 2,
    default_parameters_settings.height / 2,
    default_parameters_settings.depth / 2
  ));
  addPhysicsObject(mesh, shape, 1);

  if (typeof addToList === 'function') {
    addToList(`Object ${objectCount + 1}`, mesh);
  }

  const folder = gui.addFolder(`Object ${objectCount + 1}`);
  folder.domElement.style.display = 'none';

  if (guiFoldersMap) {
    guiFoldersMap.set(mesh, folder);
  }

  function updateAll() {
    const { width, height, depth } = default_parameters_settings;
    updateGeometry(mesh, width, height, depth);
    const newShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    updatePhysicsShape(mesh, newShape);
  }

  folder.add(default_parameters_settings, 'width', 1, 50).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'height', 1, 50).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'depth', 1, 50).step(1).onChange(updateAll);

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

export function createCube(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0xcceeff });
  return new THREE.Mesh(geometry, material);
}

export function updateGeometry(mesh, width, height, depth) {
  const newGeometry = new THREE.BoxGeometry(width, height, depth);
  mesh.geometry.dispose();
  mesh.geometry = newGeometry;
}
