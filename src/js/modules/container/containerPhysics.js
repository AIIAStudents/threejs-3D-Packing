import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DOOR_SIZES } from './containerState.js';
import { world } from '../../utils/physics.js';
import { currentContainer } from './containerState.js';

/**
 * 創建單個門的視覺網格。
 * @param {object} doorConfig - 門的配置對象。
 * @param {object} dimensions - 容器的尺寸。
 * @param {string} shape - 容器的形狀。
 * @returns {THREE.Mesh | null} 門的 Three.js 網格對象，如果門未啟用或類型無效則返回 null。
 */
export function createDoorMeshVisuals(doorConfig, dimensions, shape) {
    const doorSize = DOOR_SIZES[doorConfig.type];
    if (!doorSize || !doorConfig.enabled) return null;

    const geom = new THREE.PlaneGeometry(doorSize.w, doorSize.h);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4444, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);

    // 計算 local Y（container 中心為基準）
    const containerHeight = (shape === 'l-shape') ? (dimensions.mainHeight || dimensions.extHeight || 0) : (dimensions.height || 0);
    const localY = - (containerHeight / 2) + (doorSize.h / 2) + (doorConfig.position.y || 0);
    mesh.position.y = localY;

    // 根據面和 container dimensions 計算 local X,Z
    const pos = doorConfig.position || { x: 0, z: 0 };
    const offset = 0.1; // 微偏移避免 z-fighting

    if (shape === 'cube') {
        const { width, depth } = dimensions;
        switch (doorConfig.face) {
            case 'front':
                mesh.position.x = pos.x || 0;
                mesh.position.z = (depth / 2) + offset;
                break;
            case 'back':
                mesh.position.x = pos.x || 0;
                mesh.position.z = - (depth / 2) - offset;
                mesh.rotation.y = Math.PI;
                break;
            case 'left':
                mesh.position.x = - (width / 2) - offset;
                mesh.position.z = pos.x || 0;
                mesh.rotation.y = -Math.PI / 2;
                break;
            case 'right':
                mesh.position.x = (width / 2) + offset;
                mesh.position.z = pos.x || 0;
                mesh.rotation.y = Math.PI / 2;
                break;
        }
    } else if (shape === 'l-shape') {
        const { mainWidth, mainDepth, extWidth, extDepth } = dimensions;
        const ext_x_offset = mainWidth / 2 - extWidth / 2;
        const ext_z_offset = -mainDepth / 2 - extDepth / 2;

        switch (doorConfig.face) {
            // Main Body
            case 'main_front':
                mesh.position.x = pos.x || 0;
                mesh.position.z = (mainDepth / 2) + offset;
                break;
            case 'main_back':
                mesh.position.x = pos.x || 0;
                mesh.position.z = -(mainDepth / 2) - offset;
                mesh.rotation.y = Math.PI;
                break;
            case 'main_left':
                mesh.position.x = -(mainWidth / 2) - offset;
                mesh.position.z = pos.x || 0;
                mesh.rotation.y = -Math.PI / 2;
                break;
            case 'main_right':
                mesh.position.x = (mainWidth / 2) + offset;
                mesh.position.z = pos.x || 0;
                mesh.rotation.y = Math.PI / 2;
                break;
            // Extension Body
            case 'ext_front':
                mesh.position.x = ext_x_offset + (pos.x || 0);
                mesh.position.z = ext_z_offset + (extDepth / 2) + offset;
                break;
            case 'ext_back':
                mesh.position.x = ext_x_offset + (pos.x || 0);
                mesh.position.z = ext_z_offset - (extDepth / 2) - offset;
                mesh.rotation.y = Math.PI;
                break;
            case 'ext_left':
                mesh.position.x = ext_x_offset - (extWidth / 2) - offset;
                mesh.position.z = ext_z_offset + (pos.x || 0);
                mesh.rotation.y = -Math.PI / 2;
                break;
            case 'ext_right':
                mesh.position.x = ext_x_offset + (extWidth / 2) + offset;
                mesh.position.z = ext_z_offset + (pos.x || 0);
                mesh.rotation.y = Math.PI / 2;
                break;
        }
    }

    mesh.name = `door-${doorConfig.id || Date.now()}`;
    console.log(`Door ${doorConfig.id} position.y: ${mesh.position.y}`);
    return mesh;
}

/**
 * 將當前容器配置中的所有門添加到主場景。
 * @param {THREE.Scene} mainScene - 主 3D 場景。
 */
function addDoorsToMainScene(mainScene) {
    const { doors, dimensions, shape } = currentContainer;
    // 清除舊的門視覺物件
    mainScene.children.filter(child => child.name && child.name.startsWith('mainDoor_')).forEach(doorMesh => {
        mainScene.remove(doorMesh);
        doorMesh.geometry.dispose();
        doorMesh.material.dispose();
    });

    doors.forEach(doorConfig => {
        const doorMesh = createDoorMeshVisuals(doorConfig, dimensions, shape);
        if (doorMesh) {
            doorMesh.name = `mainDoor_${doorConfig.id}`; // 給門一個獨特的名稱以便移除

            // 在主場景中，門的網格是直接加入的，沒有經過容器群組的 Y 軸平移。
            // createDoorMeshVisuals 計算出的 Y 座標是相對於容器中心的局部座標。
            // 為了讓門的底部與地板 (y=0) 對齊，我們需要手動將其 Y 座標向上平移 containerHeight / 2。
            const containerHeight = (shape === 'l-shape') ? (dimensions.mainHeight || dimensions.height || 0) : (dimensions.height || 0);
            doorMesh.position.y += containerHeight / 2;

            mainScene.add(doorMesh);
        }
    });
}

/**
 * 在主場景中創建預設的容器，包括視覺輔助線和物理邊界。
 * @param {THREE.Scene} mainScene - 主 3D 場景。
 */
export function createDefaultContainer(mainScene) {
    const { dimensions, shape } = currentContainer;

    // --- Create Wireframe ---
    const wireframeGroup = new THREE.Group();
    wireframeGroup.name = 'mainContainerWireframe';
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });

    if (shape === 'l-shape') {
        console.log("Creating L-shape container in main scene.");
        const { mainWidth, mainHeight, mainDepth, extWidth, extHeight, extDepth } = dimensions;

        // Main box
        const mainGeom = new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth);
        const mainEdges = new THREE.LineSegments(new THREE.EdgesGeometry(mainGeom), lineMaterial);
        wireframeGroup.add(mainEdges);

        // Extension box
        const extGeom = new THREE.BoxGeometry(extWidth, extHeight, extDepth);
        const extEdges = new THREE.LineSegments(new THREE.EdgesGeometry(extGeom), lineMaterial);
        extEdges.position.set(
            mainWidth / 2 - extWidth / 2,
            0, // Assumes main and ext centers are at same Y
            -mainDepth / 2 - extDepth / 2
        );
        wireframeGroup.add(extEdges);
    } else {
        console.log("Creating cube container in main scene.");
        const { width, height, depth } = dimensions;
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const edges = new THREE.EdgesGeometry(geometry);
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        wireframeGroup.add(wireframe);
    }
    
    // Align the wireframe group to the floor.
    const box = new THREE.Box3().setFromObject(wireframeGroup);
    wireframeGroup.position.y -= box.min.y;
    mainScene.add(wireframeGroup);



    // --- Doors ---
    addDoorsToMainScene(mainScene);

    // --- Physics Walls ---
    const wallMaterial = new CANNON.Material('wall');
    
    if (shape === 'l-shape') {
        // 賦值給 overallBox 變數
        const overallBox = new THREE.Box3().setFromObject(wireframeGroup);
        console.warn("L-shape physics walls are approximated by a simple box. This is a temporary solution.");
        const overallSize = overallBox.getSize(new THREE.Vector3());
        const center = overallBox.getCenter(new THREE.Vector3());
        const walls = [
            { quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0), position: new CANNON.Vec3(0, 0, 0) },
            { quaternion: new CANNON.Quaternion(), position: new CANNON.Vec3(center.x, center.y, center.z - overallSize.z / 2) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI, 0), position: new CANNON.Vec3(center.x, center.y, center.z + overallSize.z / 2) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0), position: new CANNON.Vec3(center.x + overallSize.x / 2, center.y, center.z) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0), position: new CANNON.Vec3(center.x - overallSize.x / 2, center.y, center.z) }
        ];
        walls.forEach(wallData => {
            const wallBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wallMaterial, position: wallData.position, quaternion: wallData.quaternion });
            wallBody.isContainerWall = true;
            world.addBody(wallBody);
        });
    } else {
        const { width, height, depth } = dimensions;
        const walls = [
            { quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0), position: new CANNON.Vec3(0, 0, 0) },
            { quaternion: new CANNON.Quaternion(), position: new CANNON.Vec3(0, height / 2, -depth / 2) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI, 0), position: new CANNON.Vec3(0, height / 2, depth / 2) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0), position: new CANNON.Vec3(width / 2, height / 2, 0) },
            { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0), position: new CANNON.Vec3(-width / 2, height / 2, 0) }
        ];
        walls.forEach(wallData => {
            const wallBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wallMaterial, position: wallData.position, quaternion: wallData.quaternion });
            wallBody.isContainerWall = true;
            world.addBody(wallBody);
        });
    }
    console.log("Default container created in the main scene.");
    console.log("Container dimensions:", dimensions);
}
