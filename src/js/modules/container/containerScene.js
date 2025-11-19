/**
 * containerScene.js
 * 
 * This module handles all Three.js logic related to the 3D preview scene.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { currentContainer } from './containerState.js';
import { buildContainerMeshWithOutline } from '../../utils/geometryUtils.js';
import { createDoorMeshVisuals } from './containerPhysics.js'; // RESTORED IMPORT

// Preview scene variables
let scene, camera, renderer, controls, previewContainerGroup;

/**
 * Initializes the 3D preview scene.
 * @param {HTMLCanvasElement} previewCanvas - The canvas element for rendering.
 */
export function initPreviewScene(previewCanvas) {
    console.log("initPreviewScene called. Setting up scene, camera, renderer.");
    scene = new THREE.Scene();
    scene.background = createDotGridTexture();

    // Camera
    camera = new THREE.PerspectiveCamera(50, previewCanvas.clientWidth / previewCanvas.clientHeight, 0.1, 2000);
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
    controls.maxDistance = 800;
    controls.maxPolarAngle = Math.PI / 2;

    // Initial container render
    renderContainerMesh(currentContainer);
}

/**
 * Renders the container mesh based on the provided configuration.
 * @param {object} config - The container configuration.
 */
export function renderContainerMesh(config) {
    if (!scene) return;
    console.log('[PREVIEW-SCENE] renderContainerMesh called');

    if (previewContainerGroup) {
        previewContainerGroup.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        scene.remove(previewContainerGroup);
    }

    // Defensive check for config
    if (!config || !config.shape) {
        console.warn('[PREVIEW-SCENE] config missing; using fallback cube.');
        config = { shape: 'cube', dimensions: { width:160, depth:160, height:120 }, doors: [] };
    }

    const { shape, dimensions } = config;

    try {
        const { group } = buildContainerMeshWithOutline(shape, dimensions, { opacity: 0.2 });
        previewContainerGroup = group;
        
        // Add door visuals to the container group
        addDoorVisuals(previewContainerGroup, config);

        // Center the group and align its bottom to y=0
        const box = new THREE.Box3().setFromObject(previewContainerGroup);
        const center = box.getCenter(new THREE.Vector3());
        previewContainerGroup.position.x -= center.x;
        previewContainerGroup.position.y -= box.min.y;
        previewContainerGroup.position.z -= center.z;

        scene.add(previewContainerGroup);
        console.log('[PREVIEW-SCENE] New preview container added to scene:', group.type);
    } catch (e) {
        console.error('[PREVIEW-SCENE] Failed to build preview container:', e);
    }

    if (controls) controls.update();
}

/**
 * Adds door visuals to the container model.
 * @param {THREE.Group} containerGroup The container group to add doors to.
 * @param {object} containerConfig The configuration for the container.
 */
function addDoorVisuals(containerGroup, containerConfig) {
    const { doors, dimensions, shape } = containerConfig;
    if (!doors) return;

    doors.forEach(doorConfig => {
        const doorMesh = createDoorMeshVisuals(doorConfig, dimensions, shape);
        if (doorMesh) {
            containerGroup.add(doorMesh);
        }
    });
}

/**
 * Creates a dot grid background texture.
 * @returns {THREE.CanvasTexture}
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
 * Starts the rendering loop.
 */
export function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

/**
 * Stops the rendering loop.
 */
export function stopAnimate() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/**
 * Returns the renderer instance.
 */
export function getRenderer() {
    return renderer;
}
