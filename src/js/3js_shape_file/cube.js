import * as THREE from 'three';

export function addObject_createcube(objectCount, scene, objects, gui, addToList, guiFoldersMap) {

    const default_parameters_settings = {
    width: 15,
    height: 15,
    depth: 15,
    widthSegments: 1,
    heightSegments: 1,
    depthSegments: 1,
  };

  const mesh = createCube(
    default_parameters_settings.width,
    default_parameters_settings.height,
    default_parameters_settings.depth,
    default_parameters_settings.widthSegments,
    default_parameters_settings.heightSegments,
    default_parameters_settings.depthSegments,
  );

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

  folder.add(default_parameters_settings, 'width', 1, 30).step(0.131).onChange((value) => {
    updateGeometry(
      mesh,
      value,
      default_parameters_settings.height,
      default_parameters_settings.depth,
      default_parameters_settings.widthSegments,
      default_parameters_settings.heightSegments,
      default_parameters_settings.depthSegments
    );
  });

  folder.add(default_parameters_settings, 'height', 3, 64).step(0.131).onChange((value) => {
    updateGeometry(
      mesh,
      default_parameters_settings.width,
      value,
      default_parameters_settings.depth,
      default_parameters_settings.widthSegments,
      default_parameters_settings.heightSegments,
      default_parameters_settings.depthSegments
    );
  });

  folder.add(default_parameters_settings, 'depth', 1, 30).step(0.131).onChange((value) => {
    updateGeometry(
      mesh,
      default_parameters_settings.width,
      default_parameters_settings.height,
      value,
      default_parameters_settings.widthSegments,
      default_parameters_settings.heightSegments,
      default_parameters_settings.depthSegments
    );
  });

  folder.add(default_parameters_settings, 'widthSegments', 1, 10).step(1).onChange((value) => {
    updateGeometry(
      mesh,
      default_parameters_settings.width,
      default_parameters_settings.height,
      default_parameters_settings.depth,
      value,
      default_parameters_settings.heightSegments,
      default_parameters_settings.depthSegments
    );
  });

  folder.add(default_parameters_settings, 'heightSegments', 1, 10).step(1).onChange((value) => {
    updateGeometry(
      mesh,
      default_parameters_settings.width,
      default_parameters_settings.height,
      default_parameters_settings.depth,
      default_parameters_settings.widthSegments,
      value,
      default_parameters_settings.depthSegments
    );
  });

  folder.add(default_parameters_settings, 'depthSegments', 1, 10).step(1).onChange((value) => {
    updateGeometry(
      mesh,
      default_parameters_settings.width,
      default_parameters_settings.height,
      default_parameters_settings.depth,
      default_parameters_settings.widthSegments,
      default_parameters_settings.heightSegments,
      value
    );
  });

  folder.add(mesh.position, 'x', -200, 200).step(1).name('Position X');
  folder.add(mesh.position, 'y', -200, 200).step(1).name('Position Y');
  folder.add(mesh.position, 'z', -200, 200).step(1).name('Position Z');

  folder.add({
    delete: () => {
      const confirmDelete = window.confirm("Are you sure you want to delete this object?");
      if (confirmDelete) {
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
  
  folder.open();
  return objectCount + 1;
}

export function createCube(width, height, depth, widthSegments, heightSegments, depthSegments) {
  const geometry = new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments);
  const material = new THREE.MeshStandardMaterial({
    color: 0xfff5e7,
    flatShading: true,
  });
  return new THREE.Mesh(geometry, material);

}

export function updateGeometry(mesh, width, height, depth, widthSegments, heightSegments, depthSegments) {
  const newGeometry = new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments);
  mesh.geometry.dispose();
  mesh.geometry = newGeometry;
}
