import * as THREE from 'three';
import { depth } from 'three/tsl';

/*
 * @param {THREE.Scene} scene
 * @param {dat.GUI} gui
 * @param {Array} objects
 * @param {number} objectCount
 * @returns {number} updated object count
*/

export function addObject_createcube(objectCount, scene, objects, gui){
    const default_parameters_settings = {
        width: 15,
        height: 15,
        depth: 15,
        widthSegments: 1,
        heightSegments: 1,
        depthSegments: 1,
    };
    //createCube(width, height, depth, widthSegments, heightSegments, depthSegments)
    const mesh = createCube ( default_parameters_settings.width,
                              default_parameters_settings.height, 
                              default_parameters_settings.depth,
                              default_parameters_settings.widthSegments,
                              default_parameters_settings.heightSegments,
                              default_parameters_settings.depthSegments,
                          );
    mesh.position.x = (objectCount % 5) * 25 - 50;
    mesh.position.y = -Math.floor(objectCount / 5) * 25;
    scene.add(mesh);
    objects.push(mesh);

    const folder = gui.addFolder(`Object ${objectCount + 1}`);
    folder.add(default_parameters_settings, 'width', 1, 30)
        .step(0.131)
        .onChange((value) => {
            // function updateGeometry(mesh, width, height, depth, widthSegments, heightSegments, depthSegments) 
            updateGeometry( mesh, 
                            value,
                            default_parameters_settings.height,
                            default_parameters_settings.depth,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.depthSegments,
                          );
        });
    folder.add(default_parameters_settings, 'height', 3, 64)
        .step(0.131)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.width,
                            value,
                            default_parameters_settings.depth,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.depthSegments,
                          );
        });
    folder.add(default_parameters_settings, 'depth', 1, 30)
        .step(0.131)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.width,
                            default_parameters_settings.height,
                            value,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.depthSegments,
                          );
        });
    folder.add(default_parameters_settings, 'widthSegments', 1, 10)
        .step(1)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.width,
                            default_parameters_settings.height,
                            default_parameters_settings.depth,
                            value,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.depthSegments,
                          );
        });
    folder.add(default_parameters_settings, 'heightSegments', 1, 10)
        .step(1)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.width,
                            default_parameters_settings.height,
                            default_parameters_settings.depth,
                            default_parameters_settings.widthSegments,
                            value,
                            default_parameters_settings.depthSegments,
                          );
        });
    folder.add(default_parameters_settings, 'depthSegment', 1, 10)
        .step(1)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.width,
                            default_parameters_settings.height,
                            default_parameters_settings.depth,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            value,
                          );
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
