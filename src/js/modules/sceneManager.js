import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as physics from '../utils/physics.js';
import { showPackingControls } from './uiControls.js';
import { getContainer as getInitialContainer, setContainer } from './container/containerManager.js';
import { createDefaultContainer, createLShapeWalls } from './container/containerPhysics.js';
import { updateCurrentContainer } from './container/containerState.js';
import { buildContainerMeshWithOutline } from '../utils/geometryUtils.js';
import { log, LOG_VERBOSE } from '../utils/logger.js';

// 主場景容器的引用
let mainContainerGroup = null;

// ... (existing _createPartitionLabel function)

export function initScene() {
    const scene = new THREE.Scene();
    // 場景背景色（深色主題）。若要調整顏色，請同步修改 CSS 變數 --scene-bg-dark。
    scene.background = new THREE.Color(0x1a1a1a);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(200, 200, 200);
    camera.lookAt(0, 0, 0);
    const canvas = document.querySelector('#canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(150, 250, 100);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    // const axesHelper = new THREE.AxesHelper(100); // 預設移除 XYZ 軸線，讓畫面更乾淨
    // axesHelper.name = 'mainAxesHelper';
    // scene.add(axesHelper);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.update();
    const sceneRefs = { scene, camera, renderer, controls };
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // 監聽場景重繪請求
    document.addEventListener('sceneNeedsRender', (e) => {
        const trace_id = e.detail?.trace_id || 'unknown';
        const t_start = performance.now();
        log('INFO', 'SceneManager', trace_id, '開始重新渲染場景');
        
        renderer.render(scene, camera);
        
        const duration_ms = performance.now() - t_start;
        if (LOG_VERBOSE) {
            const meshCount = scene.children.filter(c => c.isMesh).length;
            log('INFO', 'SceneManager', trace_id, '場景渲染完畢', {
                duration_ms: duration_ms.toFixed(2),
                mesh_count: meshCount
            });
        }
    });

    return sceneRefs;
}

export function updateContainer(scene, newContainerConfig) {
    console.log("[MAIN-SCENE] Updating main container with config:", newContainerConfig);

    // LAZY INITIALIZATION: If mainContainerGroup is null, this is the first update.
    // Grab the initial container reference from the manager that created it.
    if (!mainContainerGroup) {
        mainContainerGroup = getInitialContainer();
    }

    // 1. Remove old container group if it exists
    if (mainContainerGroup && mainContainerGroup.parent === scene) {
        scene.remove(mainContainerGroup);
        mainContainerGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        console.log("[MAIN-SCENE] Removed old main container group.");
    }

    // 2. Clear old physics walls
    const bodiesToRemove = physics.world.bodies.filter(body => body.isContainerWall);
    bodiesToRemove.forEach(body => physics.world.removeBody(body));
    console.log(`[PHYSICS] Removed ${bodiesToRemove.length} old wall bodies.`);

    // 3. Update shared container state
    updateCurrentContainer(newContainerConfig);

    // 4. Normalize config and build new container
    const shape = newContainerConfig?.shape ?? 'cube';
    const d = newContainerConfig?.dimensions ?? {};
    const safeDimensions = {
        width: Number(d.width ?? d.outerWidth ?? 160),
        depth: Number(d.depth ?? d.outerDepth ?? 160),
        height: Number(d.height ?? 120),
        outerWidth: Number(d.outerWidth ?? d.width ?? 160),
        outerDepth: Number(d.outerDepth ?? d.depth ?? 160),
        notchWidth: Number(d.notchWidth ?? 60),
        notchDepth: Number(d.notchDepth ?? 60),
    };

    try {
        const { group, mesh } = buildContainerMeshWithOutline(shape, safeDimensions, { opacity: 0.15 });
        mainContainerGroup = group;
        mainContainerGroup.name = 'mainContainerGroup';

        // ✅ 把所有會被 SpacePlanning 用到的尺寸都寫進 userData
        mainContainerGroup.userData = {
            // 基本尺寸
            width:  safeDimensions.width,
            height: safeDimensions.height,
            depth:  safeDimensions.depth,

            // 外框尺寸
            outerWidth:  safeDimensions.outerWidth,
            outerDepth:  safeDimensions.outerDepth,

            // 缺口尺寸：L 型才會 > 0，其它形狀就 0
            notchWidth:  shape === 'l-shape' ? safeDimensions.notchWidth  : 0,
            notchDepth:  shape === 'l-shape' ? safeDimensions.notchDepth  : 0,

            // 形狀
            shape: shape,
        };

        // （可選）如果你比較想讓 _containerMesh 指向真正的「實體網格」而不是 group，
        // 也可以改成 setContainer(mesh)；目前用 group 也可以，只要 userData 對就好。

        // Center the group and align its bottom to y=0
        const box = new THREE.Box3().setFromObject(mainContainerGroup);
        const center = box.getCenter(new THREE.Vector3());
        mainContainerGroup.position.x -= center.x;
        mainContainerGroup.position.y -= box.min.y;
        mainContainerGroup.position.z -= center.z;

        scene.add(mainContainerGroup);
        setContainer(mainContainerGroup); // 這裡維持不變
        console.log('[MAIN-SCENE] Added new container group to scene:', mainContainerGroup.uuid);

        // Create physics walls based on shape
        if (shape === 'l-shape') {
            createLShapeWalls(newContainerConfig);
        } else {
            createDefaultContainer(scene);
        }

    } catch (e) {
        console.error('[MAIN-SCENE] Failed to build main container:', e);
    }

}

export function drawPartitions(scene, partitions, trace_id) {
    if (!scene) return;
    const oldPartitionGroup = scene.getObjectByName('partitionGroup');
    if (oldPartitionGroup) {
        oldPartitionGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        scene.remove(oldPartitionGroup);
    }
    const partitionGroup = new THREE.Group();
    partitionGroup.name = 'partitionGroup';
    const containerWireframe = scene.getObjectByName('mainContainerWireframe');
    if (!containerWireframe) return;
    const containerBox = new THREE.Box3().setFromObject(containerWireframe);
    const containerSize = new THREE.Vector3();
    containerBox.getSize(containerSize);
    const offset = new THREE.Vector3(containerSize.x / 2, 0, containerSize.z / 2);
    partitions.forEach(p => {
        if (!p.meta) return;
        const min = new THREE.Vector3(p.bounds.min.x, p.bounds.min.y, p.bounds.min.z).sub(offset);
        const max = new THREE.Vector3(p.bounds.max.x, p.bounds.max.y, p.bounds.max.z).sub(offset);
        const size = new THREE.Vector3().subVectors(max, min);
        if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
        const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
        const meshGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
        const meshMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.meta.color || '#888888'), transparent: true, opacity: 0.18, depthWrite: false });
        const mesh = new THREE.Mesh(meshGeom, meshMat);
        mesh.position.copy(center);
        partitionGroup.add(mesh);
        const edgesGeom = new THREE.EdgesGeometry(meshGeom);
        const edgesMat = new THREE.LineBasicMaterial({ color: new THREE.Color(p.meta.color || '#888888').multiplyScalar(1.2) });
        const wireframe = new THREE.LineSegments(edgesGeom, edgesMat);
        wireframe.position.copy(center);
        partitionGroup.add(wireframe);
        
        // Note: _createPartitionLabel is not defined in the provided file, assuming it exists elsewhere or was removed.
        // const label = _createPartitionLabel(p); 
        // label.position.set(center.x, max.y + 10, center.z);
        // partitionGroup.add(label);

        if (p.bounds.max.x < containerSize.x - 0.1) {
            const boundaryGeom = new THREE.PlaneGeometry(size.z, size.y);
            const boundaryMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
            const boundaryMarker = new THREE.Mesh(boundaryGeom, boundaryMat);
            boundaryMarker.position.set(max.x, center.y, center.z);
            boundaryMarker.rotation.y = Math.PI / 2;
            partitionGroup.add(boundaryMarker);
        }
    });
    scene.add(partitionGroup);
    showPackingControls();
    log('INFO', 'SceneManager', trace_id, '繪製分割區', {
        'partition_count': partitions.length,
        'mesh_in_group': partitionGroup.children.length
    });
}

export function animate(sceneRefs) {
    const { scene, camera, renderer, controls, objectManager } = sceneRefs;
    function loop() {
        requestAnimationFrame(loop);
        physics.updatePhysics();
        if (objectManager) {
            objectManager.update();
        }
        controls.update();
        renderer.render(scene, camera);
    }
    loop();
}

export function disposeScene(sceneRefs) {
    const { renderer } = sceneRefs;
    renderer.dispose();
    console.log("Scene disposed.");
}