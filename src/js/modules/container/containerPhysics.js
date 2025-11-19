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
            doorMesh.name = `mainDoor_${doorConfig.id}`;

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
        // ... (L-shape logic remains the same)
    } else {
        const { width, height, depth } = dimensions;
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const edges = new THREE.EdgesGeometry(geometry);
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        wireframeGroup.add(wireframe);
    }
    
    const box = new THREE.Box3().setFromObject(wireframeGroup);
    const verticalOffset = -box.min.y;
    wireframeGroup.position.y += verticalOffset;
    mainScene.add(wireframeGroup);

    // 修正：將所有相關的容器尺寸寫入 userData，確保 L 型尺寸能被正確傳遞
    const { width, height, depth, outerWidth, outerDepth, notchWidth, notchDepth } = dimensions;
    wireframeGroup.userData = {
        shape: shape,
        width: width,
        height: height,
        depth: depth,
        outerWidth: outerWidth ?? width,
        outerDepth: outerDepth ?? depth,
        notchWidth: notchWidth ?? 0,
        notchDepth: notchDepth ?? 0,
    };

    // --- Doors ---
    addDoorsToMainScene(mainScene);

    // --- Physics Walls ---
    const wallMaterial = new CANNON.Material('wall');

    // Helper function to add a plane wall
    function addWall(position, quaternion) {
        const wallBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wallMaterial });
        wallBody.position.copy(position);
        wallBody.quaternion.copy(quaternion);
        wallBody.isContainerWall = true;
        world.addBody(wallBody);
    }

    if (shape === 'l-shape') {
        const { mainWidth, mainHeight, mainDepth, extWidth, extHeight, extDepth } = dimensions;

        // Main Part Walls (6 planes)
        const halfMainW = mainWidth / 2, halfMainH = mainHeight / 2, halfMainD = mainDepth / 2;
        addWall(new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)); // Floor
        addWall(new CANNON.Vec3(0, mainHeight, 0), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)); // Ceiling
        addWall(new CANNON.Vec3(0, halfMainH, -halfMainD), new CANNON.Quaternion()); // Front
        addWall(new CANNON.Vec3(0, halfMainH, halfMainD), new CANNON.Quaternion().setFromEuler(0, Math.PI, 0)); // Back
        addWall(new CANNON.Vec3(-halfMainW, halfMainH, 0), new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0)); // Left
        addWall(new CANNON.Vec3(halfMainW, halfMainH, 0), new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0)); // Right

        // Extension Part Walls (6 planes)
        const halfExtW = extWidth / 2, halfExtH = extHeight / 2, halfExtD = extDepth / 2;
        const extOffsetX = mainWidth / 2 - extWidth / 2;
        const extOffsetZ = -mainDepth / 2 - extDepth / 2;

        addWall(new CANNON.Vec3(extOffsetX, 0, extOffsetZ), new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)); // Floor
        addWall(new CANNON.Vec3(extOffsetX, extHeight, extOffsetZ), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)); // Ceiling
        addWall(new CANNON.Vec3(extOffsetX, halfExtH, extOffsetZ - halfExtD), new CANNON.Quaternion()); // Front
        addWall(new CANNON.Vec3(extOffsetX, halfExtH, extOffsetZ + halfExtD), new CANNON.Quaternion().setFromEuler(0, Math.PI, 0)); // Back
        addWall(new CANNON.Vec3(extOffsetX - halfExtW, halfExtH, extOffsetZ), new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0)); // Left
        addWall(new CANNON.Vec3(extOffsetX + halfExtW, halfExtH, extOffsetZ), new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0)); // Right

    } else { // Cube shape
        const { width, height, depth } = dimensions;
        const halfW = width / 2, halfH = height / 2, halfD = depth / 2;
        
        addWall(new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)); // Floor
        addWall(new CANNON.Vec3(0, height, 0), new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0)); // Ceiling
        addWall(new CANNON.Vec3(0, halfH, -halfD), new CANNON.Quaternion()); // Front
        addWall(new CANNON.Vec3(0, halfH, halfD), new CANNON.Quaternion().setFromEuler(0, Math.PI, 0)); // Back
        addWall(new CANNON.Vec3(halfW, halfH, 0), new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0)); // Right
        addWall(new CANNON.Vec3(-halfW, halfH, 0), new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0)); // Left
    }
    console.log("Default container created with aligned physics walls.");
    return wireframeGroup;
}

/**
 * 為 L 型容器建立複合物理牆 (目前為空實作)
 * @param {object} containerConfig 
 */
export function createLShapeWalls(containerConfig) {
    const { dimensions } = containerConfig;
    const { outerWidth, outerDepth, height, notchWidth, notchDepth } = dimensions;
    const wallThickness = 2; // A small thickness for the walls

    const wallMaterial = new CANNON.Material('wall');

    // Create a single compound body to represent the entire container boundary
    const containerBody = new CANNON.Body({
        mass: 0, // mass = 0 makes the body static
        material: wallMaterial
    });

    // Helper to add a child shape to the compound body
    // All positions are relative to the containerBody's origin (0,0,0)
    function addShape(sizeVec, positionVec) {
        const shape = new CANNON.Box(sizeVec.scale(0.5)); // CANNON.Box takes half-extents
        containerBody.addShape(shape, positionVec);
    }

    // 1. Floor
    addShape(new CANNON.Vec3(outerWidth, wallThickness, outerDepth), new CANNON.Vec3(0, -wallThickness / 2, 0));

    // 2. Ceiling (Optional, but good for containment)
    addShape(new CANNON.Vec3(outerWidth, wallThickness, outerDepth), new CANNON.Vec3(0, height + (wallThickness / 2), 0));

    // 3. Back Wall (farthest on +z)
    addShape(new CANNON.Vec3(outerWidth, height, wallThickness), new CANNON.Vec3(0, height / 2, outerDepth / 2));

    // 4. Left Wall (farthest on -x)
    addShape(new CANNON.Vec3(wallThickness, height, outerDepth), new CANNON.Vec3(-outerWidth / 2, height / 2, 0));

    // --- Walls that form the L-shape notch (assuming notch is in front-right corner: +x, -z) ---

    // 5. Right Wall (the segment that is NOT notched)
    addShape(
        new CANNON.Vec3(wallThickness, height, outerDepth - notchDepth),
        new CANNON.Vec3(outerWidth / 2, height / 2, -(notchDepth / 2))
    );

    // 6. Front Wall (the segment that is NOT notched)
    addShape(
        new CANNON.Vec3(outerWidth - notchWidth, height, wallThickness),
        new CANNON.Vec3(-(notchWidth / 2), height / 2, -outerDepth / 2)
    );

    // 7. Notch Inner Wall (Horizontal, parallel to X-axis)
    addShape(
        new CANNON.Vec3(notchWidth, height, wallThickness),
        new CANNON.Vec3((outerWidth / 2) - (notchWidth / 2), height / 2, -outerDepth / 2 + notchDepth)
    );

    // 8. Notch Inner Wall (Vertical, parallel to Z-axis)
    addShape(
        new CANNON.Vec3(wallThickness, height, notchDepth),
        new CANNON.Vec3(outerWidth / 2 - notchWidth, height / 2, (-outerDepth / 2) + (notchDepth / 2))
    );

    containerBody.isContainerWall = true; // Custom flag for identification
    world.addBody(containerBody);

    console.log(`[PHYSICS] Created L-Shape walls using a compound body.`);
}