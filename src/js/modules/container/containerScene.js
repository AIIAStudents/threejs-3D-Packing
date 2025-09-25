/**
 * containerScene.js
 * 
 * 這個模組專門處理所有與 Three.js 相關的 3D 預覽場景邏輯。
 * 主要功能包括：
 * - 初始化 3D 預覽場景 (相機、燈光、渲染器、控制器)。
 * - 根據 currentContainer 狀態渲染容器的 3D 模型 (renderContainerMesh)。
 * - 創建背景的點陣網格紋理。
 * - 管理渲染迴圈 (animate)。
 * 這個模組只專注於渲染，不直接操作 UI DOM 元素。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { currentContainer } from './containerState.js';
import { createDoorMeshVisuals } from './containerPhysics.js'; // Import the shared door visual creation function

// 預覽場景的變數
let scene, camera, renderer, controls, containerMesh;

/**
 * 初始化 3D 預覽場景
 * @param {HTMLCanvasElement} previewCanvas - 用於渲染的 Canvas 元素
 */
export function initPreviewScene(previewCanvas) {
    console.log("initPreviewScene called. Setting up scene, camera, renderer.");
    scene = new THREE.Scene();
    scene.background = createDotGridTexture();

    // Camera
    camera = new THREE.PerspectiveCamera(50, previewCanvas.clientWidth / previewCanvas.clientHeight, 0.1, 1000);
    camera.position.set(150, 180, 250);
    camera.lookAt(0, 0, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    scene.add(directionalLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
    renderer.setSize(previewCanvas.clientWidth, previewCanvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 100;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI / 2;

    // Initial container
    renderContainerMesh();
}

/**
 * 根據 currentContainer 狀態渲染容器網格模型
 */
export function renderContainerMesh() {
    if (!scene) return;
    console.log("renderContainerMesh called");

    if (containerMesh) {
        scene.remove(containerMesh);
        console.log("Existing containerMesh removed.");
    }

    containerMesh = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
        color: 0xAAAAAA,
        transparent: true,
        opacity: 0.5,
        roughness: 0.3,
        metalness: 0.2
    });
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });

    const { shape, dimensions } = currentContainer;

    if (shape === 'l-shape') {
        const { mainWidth, mainHeight, mainDepth, extWidth, extHeight, extDepth } = dimensions;

        // Main box
        const mainGeom = new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth);
        const mainMesh = new THREE.Mesh(mainGeom, material);
        const mainEdges = new THREE.LineSegments(new THREE.EdgesGeometry(mainGeom), lineMaterial);
        containerMesh.add(mainMesh, mainEdges);

        // Extension box
        const extGeom = new THREE.BoxGeometry(extWidth, extHeight, extDepth);
        const extMesh = new THREE.Mesh(extGeom, material);
        extMesh.position.set(
            mainWidth / 2 - extWidth / 2,
            0,
            -mainDepth / 2 - extDepth / 2
        );
        const extEdges = new THREE.LineSegments(new THREE.EdgesGeometry(extGeom), lineMaterial);
        extEdges.position.copy(extMesh.position);
        containerMesh.add(extMesh, extEdges);

    } else {
        const { width, height, depth } = dimensions;
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
        containerMesh.add(mesh, edges);
    }

    // ----- after body meshes added (but BEFORE doors) -----
    const bodyBox = new THREE.Box3().setFromObject(containerMesh);
    // 把本體底部移到 y=0（只根據 bodyBox）
    containerMesh.position.y -= bodyBox.min.y;

    // 現在加入門（door 的座標要以 container 原點或 body 中心計算）
    addDoorVisuals();

    // ----- 完成後，如果要水平置中（XZ），重新計算 full box 並只修正 X,Z -----
    const fullBox = new THREE.Box3().setFromObject(containerMesh);
    const center = fullBox.getCenter(new THREE.Vector3());
    // 只移動 X 和 Z，保留 Y（避免再次改變貼地）
    containerMesh.position.x -= center.x;
    containerMesh.position.z -= center.z;

    scene.add(containerMesh);
    console.log("New containerMesh added to scene:", containerMesh);

    if (controls) controls.update();
}

/**
 * 在容器模型上添加門的視覺標記
 */
function addDoorVisuals() {
    const { doors, dimensions, shape } = currentContainer;
    console.log("Doors from state in addDoorVisuals (preview):", doors);

    doors.forEach(doorConfig => {
        const doorMesh = createDoorMeshVisuals(doorConfig, dimensions, shape);
        if (doorMesh) {
            containerMesh.add(doorMesh);
        }
    });
}

/**
 * 創建點陣網格背景紋理
 * @returns {THREE.CanvasTexture} 紋理對象
 */
function createDotGridTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const size = 32;
    const dotRadius = 1;
    const dotColor = 'rgba(0, 0, 0, 0.2)';

    canvas.width = size;
    canvas.height = size;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, size, size);

    context.fillStyle = dotColor;
    context.beginPath();
    context.arc(size / 2, size / 2, dotRadius, 0, 2 * Math.PI, false);
    context.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100);

    return texture;
}

let animationFrameId = null;

/**
 * 啟動渲染迴圈
 */
export function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

/**
 * 停止渲染迴圈
 */
export function stopAnimate() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/**
 * 返回渲染器實例
 */
export function getRenderer() {
    return renderer;
}
