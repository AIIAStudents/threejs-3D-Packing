import * as THREE from 'three';

/*
 * @param {THREE.Scene} scene
 * @param {dat.GUI} gui
 * @param {Array} objects
 * @param {number} objectCount
 * @returns {number} updated object count
*/

export function addObject_createIcosahedron(objectCount, scene, objects, gui){
    const default_parameters_settings = {
        radius: 10,  // 1-20
        detail: 0,  // 0-5
    };
    const mesh = createIcosahedron(default_parameters_settings.radius, default_parameters_settings.detail);
    mesh.position.x = (objectCount % 5) * 25 - 50;
    mesh.position.y = -Math.floor(objectCount / 5) * 25;
    scene.add(mesh);
    objects.push(mesh);

    //createIcosahedron(radius, detail)
    const folder = gui.addFolder(`Object ${objectCount + 1}`);
    folder.add(default_parameters_settings, 'radius', 1, 20)
        .step(0.228)
        .onChange((value) => {
            updateGeometry(mesh, value, default_parameters_settings.detail);
        });
    folder.add(default_parameters_settings, 'detail', 0, 5)
        .step(1)
        .onChange((value) => {
            updateGeometry(mesh, default_parameters_settings.radius, value);
        });
    folder.add({delete:() => {
        const delete_messenge = window.confirm("Are you sure you want to delete this object?");
        if(delete_messenge){
            scene.remove(mesh);
            const index = objects.indexOf(mesh);
            if (index > -1) {
                objects.splice(index, 1);
            }
            gui.removeFolder(folder);
            mesh.geometry.dispose(); 
            mesh.material.dispose(); 
        }
    }}, 'delete').name('Delete Object');
    
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

