
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as physics from '../utils/physics.js';

// 導出 init 給 main.js 使用
export { init as initContainerManager };

// -------------------- DOM 元素 --------------------
const changeContainerBtn = document.getElementById('change-container-btn');
const modal = document.getElementById('container-modal');
const previewCanvas = document.getElementById('container-canvas');
const controlsPanel = document.getElementById('container-controls');
const containerControlsContent = document.getElementById('container-controls-content');
const modalCloseBtn = document.getElementById('modal-close-btn');

// 功能圖示按鈕
const containerIconBtn = document.getElementById('container-icon-btn');
const sizeIconBtn = document.getElementById('size-icon-btn');
const doorIconBtn = document.getElementById('door-icon-btn');
const arrowIconBtn = document.getElementById('arrow-icon-btn');

// 確認對話框元素
const submitConfirmation = document.getElementById('submit-confirmation');
const discardConfirmation = document.getElementById('discard-confirmation');
const confirmSubmitYes = document.getElementById('confirm-submit-yes');
const confirmSubmitNo = document.getElementById('confirm-submit-no');
const confirmDiscardYes = document.getElementById('confirm-discard-yes');
const confirmDiscardNo = document.getElementById('confirm-discard-no');


// -------------------- 3D 預覽場景 --------------------
let scene, camera, renderer, controls, containerMesh;

// 當前容器狀態
let currentContainer = {
    shape: 'cube',
    dimensions: { width: 120, height: 120, depth: 120 },
    doors: [] // 多門
};

const DOOR_SIZES = {
    'human': { w: 12, h: 22 }, // 1.2m x 2.2m
    'forklift': { w: 30, h: 40 }, // 3m x 4m
    'truck': { w: 40, h: 50 } // 4m x 5m
};

// -------------------- 建立容器 --------------------
function createDefaultContainer(mainScene) {
    const { dimensions } = currentContainer;

    // 建立地板網格輔助線
    const gridHelper = new THREE.GridHelper(dimensions.width, 10, 0x888888, 0x444444);
    mainScene.add(gridHelper);

    // 建立容器線框和
    const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.y = dimensions.height / 2;

    mainScene.add(wireframe);
    console.log("Default container created in the main scene.");
    console.log("Container dimensions:", dimensions);

    // -------------------- 添加物理碰撞牆 --------------------
    const wallMaterial = new CANNON.Material('wall');
    const walls = [
        // Floor
        { quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0), position: new CANNON.Vec3(0, 0, 0) },
        // Back wall
        { quaternion: new CANNON.Quaternion(), position: new CANNON.Vec3(0, dimensions.height / 2, -dimensions.depth / 2) },
        // Front wall
        { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI, 0), position: new CANNON.Vec3(0, dimensions.height / 2, dimensions.depth / 2) },
        // Right wall
        { quaternion: new CANNON.Quaternion().setFromEuler(0, -Math.PI / 2, 0), position: new CANNON.Vec3(dimensions.width / 2, dimensions.height / 2, 0) },
        // Left wall
        { quaternion: new CANNON.Quaternion().setFromEuler(0, Math.PI / 2, 0), position: new CANNON.Vec3(-dimensions.width / 2, dimensions.height / 2, 0) }
    ];

    walls.forEach(wallData => {
        const wallBody = new CANNON.Body({
            mass: 0, // 靜態牆
            shape: new CANNON.Plane(),
            material: wallMaterial,
            position: wallData.position,
            quaternion: wallData.quaternion
        });
        physics.world.addBody(wallBody);
    });
}
// -------------------- 初始化模組 --------------------
function init(mainScene) {
    console.log("containerManager.js: init - Start");

    // -------------------- 模態框事件 --------------------
    try {
        changeContainerBtn.addEventListener('click', showModal);
        modalCloseBtn.addEventListener('click', () => discardConfirmation.style.display = 'block');
    } catch (e) { console.error("Error attaching modal event listeners:", e); }
    console.log("containerManager.js: init - After modal event listeners");

    // -------------------- 圖示按鈕事件 --------------------
    try {
        containerIconBtn.addEventListener('click', showContainerControls);
        sizeIconBtn.addEventListener('click', showSizeControls);
        doorIconBtn.addEventListener('click', showDoorControls); // New listener
        arrowIconBtn.addEventListener('click', () => submitConfirmation.style.display = 'block');
    } catch (e) { console.error("Error attaching icon button event listeners:", e); }
    console.log("containerManager.js: init - After icon button event listeners");

    // -------------------- 確認對話框事件 --------------------
    try {
        confirmSubmitNo.addEventListener('click', () => submitConfirmation.style.display = 'none');
        confirmDiscardNo.addEventListener('click', () => discardConfirmation.style.display = 'none');

        confirmSubmitYes.addEventListener('click', async () => {
            console.log('Submitting container configuration:', currentContainer);
            try {
                const response = await fetch('http://127.0.0.1:8889/save_container_config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(currentContainer),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Invalid JSON response' }));
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                console.log('Container configuration successfully saved:', data.message);
                alert('容器設定已成功儲存！');

                // 通知其他模組更新容器
                window.dispatchEvent(new CustomEvent('containerChanged', { detail: currentContainer }));

                submitConfirmation.style.display = 'none';
                hideModal();

            } catch (error) {
                console.error('Error saving container configuration:', error);
                alert(`儲存容器設定時發生錯誤: ${error.message}`);
            }
        });

        confirmDiscardYes.addEventListener('click', () => {
            console.log('Edits discarded');
            // 恢復預設容器
            currentContainer = {
                shape: 'cube',
                dimensions: { width: 120, height: 120, depth: 120 },
                doors: [] 
            };
            alert('編輯已捨棄，恢復預設容器。');
            discardConfirmation.style.display = 'none';
            hideModal();
        });
    } catch (e) { console.error("Error attaching confirmation dialog event listeners:", e); }
    console.log("containerManager.js: init - After confirmation dialog event listeners");

    createDefaultContainer(mainScene);
    console.log("containerManager.js: init - After createDefaultContainer");
}

// -------------------- 模態框顯示與隱藏 --------------------
function showModal() {
    modal.style.display = 'flex';
    if (!renderer) {
        initPreviewScene();      // 初始化3D預覽
    }   
    renderContainerMesh();       // 更新容器
    showContainerControls();     // 顯示形狀控制面板
    animate();                   // 啟動動畫
}

function hideModal() {
    modal.style.display = 'none';
    if (renderer) {              // 停止動畫
        cancelAnimationFrame(animate);
    }
}

// -------------------- 初始化預覽場景 --------------------
function initPreviewScene() {
    console.log("initPreviewScene called. Setting up scene, camera, renderer.");
    scene = new THREE.Scene();
    scene.background = createDotGridTexture();

    // Camera
    camera = new THREE.PerspectiveCamera(50, previewCanvas.clientWidth / previewCanvas.clientHeight, 0.1, 1000);
    camera.position.set(150, 180, 250);
    camera.lookAt(0, 0, 0);
    console.log("Camera position:", camera.position);

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

// -------------------- 點陣網格背景 --------------------
function createDotGridTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const size = 32; // 紋理大小
    const dotRadius = 1;
    const dotColor = 'rgba(0, 0, 0, 0.2)';

    canvas.width = size;
    canvas.height = size;

    context.fillStyle = '#FFFFFF'; // 背景色
    context.fillRect(0, 0, size, size);

    context.fillStyle = dotColor;
    context.beginPath();
    context.arc(size / 2, size / 2, dotRadius, 0, 2 * Math.PI, false);
    context.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100); // 根據場景大小調整重複次數

    return texture;
}

// -------------------- 渲染容器 --------------------
function renderContainerMesh() {
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
        
        const mainGeom = new THREE.BoxGeometry(mainWidth, mainHeight, mainDepth);
        const mainMesh = new THREE.Mesh(mainGeom, material);
        mainMesh.position.set(0, 0, 0);
        const mainEdges = new THREE.LineSegments(new THREE.EdgesGeometry(mainGeom), lineMaterial);
        mainEdges.position.copy(mainMesh.position);
        containerMesh.add(mainMesh, mainEdges);

        const extGeom = new THREE.BoxGeometry(extWidth, extHeight, extDepth);
        const extMesh = new THREE.Mesh(extGeom, material);
        const x_pos = mainWidth / 2 - extWidth / 2;
        const z_pos = -mainDepth / 2 - extDepth / 2;
        extMesh.position.set(x_pos, 0, z_pos);
        const extEdges = new THREE.LineSegments(new THREE.EdgesGeometry(extGeom), lineMaterial);
        extEdges.position.copy(extMesh.position);
        containerMesh.add(extMesh, extEdges);

        // Add doors BEFORE centering the group for easier positioning
        addDoorVisuals();

        // Center the entire L-shape group
        const box = new THREE.Box3().setFromObject(containerMesh);
        const center = box.getCenter(new THREE.Vector3());
        containerMesh.position.sub(center);

    } else { // Default to cube
        const { width, height, depth } = dimensions;
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
        containerMesh.add(mesh, edges);
        
        // Add door visualizations
        addDoorVisuals();
    }

    scene.add(containerMesh);
    console.log("New containerMesh added to scene:", containerMesh);
    controls.update();
}

// -------------------- 添加門視覺 --------------------
function addDoorVisuals() {
    const { doors, dimensions, shape } = currentContainer;

    const frontDoorMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }); // Green
    const backDoorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });  // Red
    const sideDoorMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });  // Blue

    doors.forEach(door => {
        if (!door.enabled) return;

        const doorSize = DOOR_SIZES[door.type];
        if (!doorSize) return;

        const doorGeom = new THREE.PlaneGeometry(doorSize.w, doorSize.h);
        let doorMesh;

        // Choose material based on face name
        if (door.face.includes('front')) {
            doorMesh = new THREE.Mesh(doorGeom, frontDoorMaterial);
        } else if (door.face.includes('back')) {
            doorMesh = new THREE.Mesh(doorGeom, backDoorMaterial);
        } else {
            doorMesh = new THREE.Mesh(doorGeom, sideDoorMaterial);
        }

        // Position the door
        const pos = door.position;
        const main_h = (shape === 'l-shape') ? dimensions.mainHeight : dimensions.height;
        doorMesh.position.y = -main_h / 2 + doorSize.h / 2; // Common Y position

        if (shape === 'cube') {
            const { width, height, depth } = dimensions;
            switch (door.face) {
                case 'front':
                    doorMesh.position.x = pos.x;
                    doorMesh.position.z = depth / 2 + 1;
                    break;
                case 'back':
                    doorMesh.position.x = pos.x;
                    doorMesh.position.z = -depth / 2 - 1;
                    break;
                case 'left':
                    doorMesh.rotation.y = -Math.PI / 2;
                    doorMesh.position.x = -width / 2 - 1;
                    doorMesh.position.z = pos.x; // Use x slider for z-axis positioning on sides
                    break;
                case 'right':
                    doorMesh.rotation.y = Math.PI / 2;
                    doorMesh.position.x = width / 2 + 1;
                    doorMesh.position.z = pos.x; // Use x slider for z-axis positioning on sides
                    break;
            }
        } else if (shape === 'l-shape') {
            const { mainWidth, mainHeight, mainDepth, extWidth, extDepth } = dimensions;
            const ext_x_pos = mainWidth / 2 - extWidth / 2;
            const ext_z_pos = -mainDepth / 2 - extDepth / 2;

            switch (door.face) {
                // Main Body
                case 'main_front':
                    doorMesh.position.x = pos.x;
                    doorMesh.position.z = mainDepth / 2 + 1;
                    break;
                case 'main_back':
                    doorMesh.position.x = pos.x;
                    doorMesh.position.z = -mainDepth / 2 - 1;
                    break;
                case 'main_left':
                    doorMesh.rotation.y = -Math.PI / 2;
                    doorMesh.position.x = -mainWidth / 2 - 1;
                    doorMesh.position.z = pos.x;
                    break;
                case 'main_right':
                    doorMesh.rotation.y = Math.PI / 2;
                    doorMesh.position.x = mainWidth / 2 + 1;
                    doorMesh.position.z = pos.x;
                    break;
                // Extension Body
                case 'ext_front':
                    doorMesh.position.x = ext_x_pos + pos.x;
                    doorMesh.position.z = ext_z_pos + extDepth / 2 + 1;
                    break;
                case 'ext_back':
                    doorMesh.position.x = ext_x_pos + pos.x;
                    doorMesh.position.z = ext_z_pos - extDepth / 2 - 1;
                    break;
                case 'ext_left':
                    doorMesh.rotation.y = -Math.PI / 2;
                    doorMesh.position.x = ext_x_pos - extWidth / 2 - 1;
                    doorMesh.position.z = ext_z_pos + pos.x;
                    break;
                case 'ext_right':
                    doorMesh.rotation.y = Math.PI / 2;
                    doorMesh.position.x = ext_x_pos + extWidth / 2 + 1;
                    doorMesh.position.z = ext_z_pos + pos.x;
                    break;
            }
        }
        containerMesh.add(doorMesh);
    });
}

const DOOR_FACES = {
    cube: [
        { value: 'front', label: '前門 (Front)' },
        { value: 'back', label: '後門 (Back)' },
        { value: 'left', label: '左側門 (Left)' },
        { value: 'right', label: '右側門 (Right)' },
    ],
    'l-shape': [
        { value: 'main_front', label: '主體-前門 (Main Front)' },
        { value: 'main_back', label: '主體-後門 (Main Back)' },
        { value: 'main_left', label: '主體-左側 (Main Left)' },
        { value: 'main_right', label: '主體-右側 (Main Right)' },
        { value: 'ext_front', label: '延伸-前門 (Ext Front)' },
        { value: 'ext_back', label: '延伸-後門 (Ext Back)' },
        { value: 'ext_left', label: '延伸-左側 (Ext Left)' },
        { value: 'ext_right', label: '延伸-右側 (Ext Right)' },
    ]
};

// -------------------- 顯示控制面板 --------------------
function showContainerControls() {
    const { shape } = currentContainer; // Moved to top
    console.log("showContainerControls called.");
    controlsPanel.style.display = 'flex';
    containerControlsContent.innerHTML = `
        <h3>Container Shape</h3>
        <div class="form-check">
            <input type="radio" name="container-shape" value="cube" ${shape === 'cube' ? 'checked' : ''}> <label>Cube</label>
        </div>
        <div class="form-check">
            <input type="radio" name="container-shape" value="l-shape" ${shape === 'l-shape' ? 'checked' : ''}> <label>L-Shape</label>
        </div>
    `;
    console.log("containerControlsContent.innerHTML set:", containerControlsContent.innerHTML);

    containerControlsContent.querySelectorAll('input[name="container-shape"]').forEach(radio => {
        radio.addEventListener('change', e => {
            currentContainer.shape = e.target.value;
            // Reset dimensions to default for new shape type
            if (currentContainer.shape === 'cube') {
                currentContainer.dimensions = { width: 120, height: 120, depth: 120 };
            } else if (currentContainer.shape === 'l-shape') {
                currentContainer.dimensions = { mainWidth: 80, mainHeight: 120, mainDepth: 80, extWidth: 40, extHeight: 120, extDepth: 40 };
            }
            renderContainerMesh();
        });
    });
}

function showSizeControls() {
    controlsPanel.style.display = 'flex';
    const { shape, dimensions } = currentContainer;

    let htmlContent = `<h3>Container Dimensions</h3>`;

    if (shape === 'cube') {
        const { width, height, depth } = dimensions;
        htmlContent += `
            <div class="input-group">
                <label>寬度 (Width):</label>
                <input type="number" id="container-width" value="${width}" min="1">
            </div>
            <div class="input-group">
                <label>高度 (Height):</label>
                <input type="number" id="container-height" value="${height}" min="1">
            </div>
            <div class="input-group">
                <label>深度 (Depth):</label>
                <input type="number" id="container-depth" value="${depth}" min="1">
            </div>
        `;
    } else if (shape === 'l-shape') {
        const { mainWidth, mainHeight, mainDepth, extWidth, extHeight, extDepth } = dimensions;
        htmlContent += `
            <h4>Main Part</h4>
            <div class="input-group">
                <label>主寬度 (Main Width):</label>
                <input type="number" id="container-main-width" value="${mainWidth}" min="1">
            </div>
            <div class="input-group">
                <label>主高度 (Main Height):</label>
                <input type="number" id="container-main-height" value="${mainHeight}" min="1">
            </div>
            <div class="input-group">
                <label>主深度 (Main Depth):</label>
                <input type="number" id="container-main-depth" value="${mainDepth}" min="1">
            </div>
            <h4>Extension Part</h4>
            <div class="input-group">
                <label>延伸寬度 (Ext Width):</label>
                <input type="number" id="container-ext-width" value="${extWidth}" min="1">
            </div>
            <div class="input-group">
                <label>延伸高度 (Ext Height):</label>
                <input type="number" id="container-ext-height" value="${extHeight}" min="1">
            </div>
            <div class="input-group">
                <label>延伸深度 (Ext Depth):</label>
                <input type="number" id="container-ext-depth" value="${extDepth}" min="1">
            </div>
        `;
    }

    containerControlsContent.innerHTML = htmlContent;

    // Add event listeners for dimension inputs
    if (shape === 'cube') {
        document.getElementById('container-width').addEventListener('input', e => {
            currentContainer.dimensions.width = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-height').addEventListener('input', e => {
            currentContainer.dimensions.height = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-depth').addEventListener('input', e => {
            currentContainer.dimensions.depth = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
    } else if (shape === 'l-shape') {
        document.getElementById('container-main-width').addEventListener('input', e => {
            currentContainer.dimensions.mainWidth = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-main-height').addEventListener('input', e => {
            currentContainer.dimensions.mainHeight = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-main-depth').addEventListener('input', e => {
            currentContainer.dimensions.mainDepth = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-ext-width').addEventListener('input', e => {
            currentContainer.dimensions.extWidth = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-ext-height').addEventListener('input', e => {
            currentContainer.dimensions.extHeight = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
        document.getElementById('container-ext-depth').addEventListener('input', e => {
            currentContainer.dimensions.extDepth = parseFloat(e.target.value) || 1;
            renderContainerMesh();
        });
    }
}

function showDoorControls() {
    controlsPanel.style.display = 'flex';
    const { doors, shape } = currentContainer;

    let doorsHtml = doors.map((door, index) => {
        const availableFaces = DOOR_FACES[shape] || [];
        const faceOptions = availableFaces.map(face => 
            `<option value="${face.value}" ${door.face === face.value ? 'selected' : ''}>${face.label}</option>`
        ).join('');

        const doorTypeOptions = Object.keys(DOOR_SIZES).map(type => 
            `<option value="${type}" ${door.type === type ? 'selected' : ''}>${type}</option>`
        ).join('');

        return `
            <div class="door-item" data-index="${index}">
                <hr>
                <h4>門 ${index + 1} <button class="remove-door-btn" data-index="${index}">移除</button></h4>
                <div class="form-switch">
                    <label>啟用</label>
                    <input type="checkbox" class="door-enabled" data-index="${index}" ${door.enabled ? 'checked' : ''}>
                </div>
                <div class="input-group">
                    <label>表面 (Face):</label>
                    <select class="door-face" data-index="${index}">${faceOptions}</select>
                </div>
                <div class="input-group">
                    <label>類型 (Type):</label>
                    <select class="door-type" data-index="${index}">${doorTypeOptions}</select>
                </div>
                <div class="input-group">
                    <label>位置 (Position):</label>
                    <input type="range" class="door-pos" data-index="${index}" value="${door.position.x}" min="-100" max="100" step="1">
                </div>
            </div>
        `;
    }).join('');

    containerControlsContent.innerHTML = `
        <h3>門設定 (Door Settings)</h3>
        <div id="doors-list">${doorsHtml}</div>
        <button id="add-door-btn">新增門 (Add Door)</button>
    `;

    // Event Listeners
    document.getElementById('add-door-btn').addEventListener('click', () => {
        currentContainer.doors.push({
            id: THREE.MathUtils.generateUUID(),
            face: DOOR_FACES[currentContainer.shape][0].value, // Default to first available face
            type: 'human',
            enabled: true,
            position: { x: 0, z: 0 } // Use x for horizontal, z for depth offset
        });
        showDoorControls();
        renderContainerMesh();
    });

    document.querySelectorAll('.remove-door-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentContainer.doors.splice(index, 1);
            showDoorControls();
            renderContainerMesh();
        });
    });

    document.querySelectorAll('.door-item').forEach(item => {
        const index = parseInt(item.dataset.index);

        item.querySelector('.door-enabled').addEventListener('change', (e) => {
            currentContainer.doors[index].enabled = e.target.checked;
            renderContainerMesh();
        });
        item.querySelector('.door-face').addEventListener('change', (e) => {
            currentContainer.doors[index].face = e.target.value;
            renderContainerMesh();
        });
        item.querySelector('.door-type').addEventListener('change', (e) => {
            currentContainer.doors[index].type = e.target.value;
            renderContainerMesh();
        });
        item.querySelector('.door-pos').addEventListener('input', (e) => {
            // For now, we only use one slider and map it to x.
            // A more advanced version could have two sliders (x, z) and enable/disable them based on face.
            currentContainer.doors[index].position.x = parseFloat(e.target.value);
            renderContainerMesh();
        });
    });
}

async function runPacking() {
    console.log("Starting packing process...");
    if (!containerMesh) {
        alert("容器尚未初始化。");
        return;
    }

    const { shape, dimensions, doors } = currentContainer;

    if (shape === 'l-shape') {
        alert("L型容器的自動裝箱功能仍在開發中，目前尚不支援。");
        return;
    }

    // --- Logic for CUBE shape ---

    // 1. Get container_size
    const container_size = {
        width: dimensions.width,
        height: dimensions.height,
        depth: dimensions.depth
    };

    // 2. Calculate Door Obstacles
    const initial_obstacles = [];
    const door_obstacle_depth = 1.0; // How thick the door obstacle is

    doors.forEach(door => {
        if (!door.enabled) return;
        const doorSize = DOOR_SIZES[door.type];
        if (!doorSize) return;

        const obstacle_dims = { x: 0, y: 0, z: 0 };
        const obstacle_pos = { x: 0, y: 0, z: 0 };

        // Position is relative to the center of the container
        obstacle_pos.y = -container_size.height / 2 + doorSize.h / 2;

        switch (door.face) {
            case 'front':
                obstacle_dims.x = doorSize.w;
                obstacle_dims.y = doorSize.h;
                obstacle_dims.z = door_obstacle_depth;
                obstacle_pos.x = door.position.x;
                obstacle_pos.z = container_size.depth / 2 - (door_obstacle_depth / 2);
                break;
            case 'back':
                obstacle_dims.x = doorSize.w;
                obstacle_dims.y = doorSize.h;
                obstacle_dims.z = door_obstacle_depth;
                obstacle_pos.x = door.position.x;
                obstacle_pos.z = -container_size.depth / 2 + (door_obstacle_depth / 2);
                break;
            case 'left':
                obstacle_dims.x = door_obstacle_depth;
                obstacle_dims.y = doorSize.h;
                obstacle_dims.z = doorSize.w; // z-dimension of obstacle is width of door
                obstacle_pos.x = -container_size.width / 2 + (door_obstacle_depth / 2);
                obstacle_pos.z = door.position.x; // on side faces, x-pos from slider controls z-pos
                break;
            case 'right':
                obstacle_dims.x = door_obstacle_depth;
                obstacle_dims.y = doorSize.h;
                obstacle_dims.z = doorSize.w;
                obstacle_pos.x = container_size.width / 2 - (door_obstacle_depth / 2);
                obstacle_pos.z = door.position.x;
                break;
        }
        
        initial_obstacles.push({
            uuid: `obstacle_door_${door.id || Math.random()}`,
            is_obstacle: true,
            dimensions: obstacle_dims,
            position: obstacle_pos
        });
    });

    console.log("Calculated Obstacles:", initial_obstacles);

    // 3. Get objects to pack (Placeholder)
    const objects_to_pack = [
        { uuid: 'obj1', dimensions: { x: 10, y: 20, z: 15 } },
        { uuid: 'obj2', dimensions: { x: 30, y: 10, z: 10 } },
        { uuid: 'obj3', dimensions: { x: 25, y: 25, z: 25 } },
    ];

    // 4. Make API Call
    const payload = {
        objects: objects_to_pack,
        container_size: container_size,
        initial_obstacles: initial_obstacles
    };

    try {
        const response = await fetch('http://127.0.0.1:8889/pack_objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log("Packing Result:", result);
        alert(`Packing complete! Packed ${result.packed_objects.filter(o => o.packed).length} of ${objects_to_pack.length} objects. Check console for details.`);
    } catch (error) {
        console.error("Error running packing:", error);
        alert(`Error running packing: ${error.message}`);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

export function updateMainContainer(scene) {
    // This function will be responsible for updating the container in the main scene.
    // For now, it will just log a message.
    console.log("Updating main container in the scene.");
}


