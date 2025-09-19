import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as physics from '../utils/physics.js'; // Make sure physics is imported

/**
 * Scene Module
 * -----------------------
 * 此模組負責建立與管理 Three.js 場景的核心部分，包括：
 * - 建立場景 (Scene)、相機 (Camera) 與渲染器 (Renderer)
 * - 設置光源與輔助工具 (AxesHelper)
 * - 初始化 OrbitControls 控制器
 * - 處理視窗縮放自動調整
 * - 提供動畫迴圈 (animate) 與資源釋放 (disposeScene) 功能
 * 
 * 可與物理模組及物件管理器 (objectManager) 整合，實現互動物件同步更新。
 */
export function initScene() {
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(200, 200, 200); // Explicit camera position
    camera.lookAt(0, 0, 0); // Explicitly look at the origin

    // Renderer
    const canvas = document.querySelector('#canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(150, 250, 100);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add AxesHelper for debugging
    const axesHelper = new THREE.AxesHelper(100); // Size of the axes
    scene.add(axesHelper);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0); // Explicitly set controls target
    controls.enableDamping = true;
    controls.update(); // Update controls after setting target

    console.log("Camera position after setup:", camera.position);
    console.log("Controls target after setup:", controls.target);

    const sceneRefs = { scene, camera, renderer, controls };

    // Handle window resizing
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return sceneRefs;
}

export function animate(sceneRefs) {
    const { scene, camera, renderer, controls, objectManager } = sceneRefs;

    function loop() {
        requestAnimationFrame(loop);

        // Update physics simulation
        physics.updatePhysics();

        // Sync visual objects with physics bodies
        if (objectManager) {
            objectManager.update();
        }

        // Update controls
        controls.update();

        // Render the scene
        renderer.render(scene, camera);
    }

    loop(); // Start the animation loop
}

export function disposeScene(sceneRefs) {
    const { renderer } = sceneRefs;
    // Basic cleanup
    renderer.dispose();
    console.log("Scene disposed.");
}
