import * as THREE from 'three';

export function addObject_createIcosahedron(objectCount, scene, objects, gui, addToList, guiFoldersMap) {
  const default_parameters_settings = {
    radius: 10,
    detail: 0,
  };

  const mesh = createIcosahedron(default_parameters_settings.radius, default_parameters_settings.detail);
  
  const currentIndex = objectCount;
  mesh.position.x = (currentIndex % 5) * 25 - 50;
  mesh.position.y = -Math.floor(currentIndex / 5) * 25;
  
  scene.add(mesh);
  objects.push(mesh);

  if (typeof addToList === 'function') {
    addToList(`Object ${objectCount + 1}`, mesh);
  }

  const folder = gui.addFolder(`Object ${objectCount + 1}`);
  folder.domElement.style.display = 'none'; // 初始隱藏
  if (guiFoldersMap) {
        guiFoldersMap.set(mesh, folder); // ⬅ 儲存 folder 給該物件
  }
  folder.add(default_parameters_settings, 'radius', 1, 20).step(0.228).onChange((value) => {
    updateGeometry(mesh, value, default_parameters_settings.detail);
  });
  folder.add(default_parameters_settings, 'detail', 0, 5).step(1).onChange((value) => {
    updateGeometry(mesh, default_parameters_settings.radius, value);
  });

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
      }
    }
  }, 'delete').name('Delete Object');
  
  guiFoldersMap.set(mesh, folder);
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
