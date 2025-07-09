import * as THREE from 'three';

export function addObject_createSphere(objectCount, scene, objects, gui, addToList, guiFoldersMap){
    const default_parameters_settings = {
        radius: 15,  
        widthSegments: 32,
        heightSegments: 16,
        phiStart: 0,
        phiLength: Math.PI * 2,  
        thetaStart: 0,
        thetaLength: Math.PI,
    };
    // createSphere(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength)
    const mesh = createSphere   ( default_parameters_settings.radius,
                                    default_parameters_settings.widthSegments, 
                                    default_parameters_settings.heightSegments,
                                    default_parameters_settings.phiStart,
                                    default_parameters_settings.phiLength,
                                    default_parameters_settings.thetaStart,
                                    default_parameters_settings.thetaLength
                                );
    const currentIndex = objectCount;                          
    mesh.position.x = (currentIndex % 5) * 25 - 50;
    mesh.position.y = -Math.floor(currentIndex / 5) * 25;
    
    scene.add(mesh);
    objects.push(mesh);

    if(typeof addToList === 'function'){
        addToList(`Object ${objectCount + 1}`, mesh);
    }
    //THREE.SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
    const folder = gui.addFolder(`Object ${objectCount + 1}`);
    folder.domElement.style.display = 'none'; // 初始隱藏
    if (guiFoldersMap) {
        guiFoldersMap.set(mesh, folder); // ⬅ 儲存 folder 給該物件
    }
    folder.add(default_parameters_settings, 'radius', 1, 30)
        .step(0.348)
        .onChange((value) => {
            // mesh, radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength
            updateGeometry( mesh, 
                            value,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.phiStart,
                            default_parameters_settings.phiLength,
                            default_parameters_settings.thetaStart,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'widthSegments', 3, 64)
        .step(1)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            value,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.phiStart,
                            default_parameters_settings.phiLength,
                            default_parameters_settings.thetaStart,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'heightSegments', 2, 32)
        .step(1)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            default_parameters_settings.widthSegments,
                            value,
                            default_parameters_settings.phiStart,
                            default_parameters_settings.phiLength,
                            default_parameters_settings.thetaStart,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'phiStart', 0, 6.283185)
        .step(0.081681)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            value,
                            default_parameters_settings.phiLength,
                            default_parameters_settings.thetaStart,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'phiLength', 0, 6.283185)
        .step(0.081681)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.phiStart,
                            value,
                            default_parameters_settings.thetaStart,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'thetaStart', 0, 6.283185)
        .step(0.081681)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.phiStart,
                            default_parameters_settings.phiLength,
                            value,
                            default_parameters_settings.thetaLength
                          );
        });
    folder.add(default_parameters_settings, 'thetaLength', 0, 6.283185)
        .step(0.081681)
        .onChange((value) => {
            updateGeometry( mesh, 
                            default_parameters_settings.radius,
                            default_parameters_settings.widthSegments,
                            default_parameters_settings.heightSegments,
                            default_parameters_settings.phiStart,
                            default_parameters_settings.phiLength,
                            default_parameters_settings.thetaStart,
                            value
                          );
        });

    folder.add(mesh.position, 'x', -200, 200).step(1).name('Position X');
    folder.add(mesh.position, 'y', -200, 200).step(1).name('Position Y');
    folder.add(mesh.position, 'z', -200, 200).step(1).name('Position Z');
    
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

    guiFoldersMap.set(mesh, folder);    
    folder.open();

    return objectCount + 1; 
}

export function createSphere(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength) {
    const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
    const material = new THREE.MeshStandardMaterial({
        color: 0xfff5e7,
        flatShading: true,
    });
    return new THREE.Mesh(geometry, material);
}

export function updateGeometry(mesh, radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength) {
    const newGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
    mesh.geometry.dispose(); 
    mesh.geometry = newGeometry; 
}
