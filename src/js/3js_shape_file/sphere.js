import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addPhysicsObject, updatePhysicsShape, removePhysicsObject } from '../utils/physics.js';

export function addObject_createSphere(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    radius: 10,
    widthSegments: 16,
    heightSegments: 16,
  };

  const mesh = createSphere(
    default_parameters_settings.radius,
    default_parameters_settings.widthSegments,
    default_parameters_settings.heightSegments
  );
  const currentIndex = objectCount;
  mesh.position.x = (currentIndex % 5) * 25 - 50;
  mesh.position.y = -Math.floor(currentIndex / 5) * 25;

  scene.add(mesh);
  objects.push(mesh);

  const shape = new CANNON.Sphere(default_parameters_settings.radius);
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
    const { radius, widthSegments, heightSegments } = default_parameters_settings;
    updateGeometry(mesh, radius, widthSegments, heightSegments);
    const newShape = new CANNON.Sphere(radius);
    updatePhysicsShape(mesh, newShape);
  }

  folder.add(default_parameters_settings, 'radius', 1, 20).step(0.5).onChange(updateAll);
  folder.add(default_parameters_settings, 'widthSegments', 3, 64).step(1).onChange(updateAll);
  folder.add(default_parameters_settings, 'heightSegments', 2, 32).step(1).onChange(updateAll);

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

export function createSphere(radius, widthSegments, heightSegments) {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const material = new THREE.MeshStandardMaterial({ color: 0xffd1dc });
  return new THREE.Mesh(geometry, material);
}

export function updateGeometry(mesh, radius, widthSegments, heightSegments) {
  const newGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  mesh.geometry.dispose();
  mesh.geometry = newGeometry;
}
