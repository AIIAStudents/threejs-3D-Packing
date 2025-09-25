import * as THREE from 'three';
import { currentContainer, updateCurrentContainer, DOOR_SIZES, DOOR_FACES } from './containerState.js';
import { initPreviewScene, renderContainerMesh, animate, stopAnimate, getRenderer } from './containerScene.js';

// --- DOM 元素 --- //
let modal, previewCanvas, containerControlsContent, submitConfirmation, discardConfirmation;

/**
 * 初始化 UI 模組，獲取必要的 DOM 元素引用。
 */
function initDOMElements() {
    modal = document.getElementById('container-modal');
    previewCanvas = document.getElementById('container-canvas');
    containerControlsContent = document.getElementById('container-controls-content');
    submitConfirmation = document.getElementById('submit-confirmation');
    discardConfirmation = document.getElementById('discard-confirmation');
}

/**
 * 顯示彈出視窗並初始化 3D 預覽
 */
export function showModal() {
    if (!modal) initDOMElements();
    modal.style.display = 'flex';
    
    if (!getRenderer()) {
        initPreviewScene(previewCanvas); // 初始化3D預覽
    }
    renderContainerMesh();       // 更新容器
    showContainerControls();     // 顯示形狀控制面板
    animate();                   // 啟動動畫
}

/**
 * 隱藏彈出視窗並停止動畫
 */
export function hideModal() {
    if (!modal) return;
    modal.style.display = 'none';
    stopAnimate(); // 停止動畫
}

/**
 * 顯示容器形狀選擇的控制面板
 */
export function showContainerControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex'; // 確保面板可見
    const { shape } = currentContainer;
    containerControlsContent.innerHTML = `
        <h3>Container Shape</h3>
        <div class="form-check">
            <input type="radio" name="container-shape" value="cube" ${shape === 'cube' ? 'checked' : ''}> <label>Cube</label>
        </div>
        <div class="form-check">
            <input type="radio" name="container-shape" value="l-shape" ${shape === 'l-shape' ? 'checked' : ''}> <label>L-Shape</label>
        </div>
    `;

    containerControlsContent.querySelectorAll('input[name="container-shape"]').forEach(radio => {
        radio.addEventListener('change', e => {
            const newShape = e.target.value;
            let newDimensions;
            if (newShape === 'cube') {
                newDimensions = { width: 120, height: 120, depth: 120 };
            } else if (newShape === 'l-shape') {
                newDimensions = { mainWidth: 80, mainHeight: 120, mainDepth: 80, extWidth: 40, extHeight: 120, extDepth: 40 };
            }
            updateCurrentContainer({ shape: newShape, dimensions: newDimensions, doors: [] }); // Reset doors on shape change
            renderContainerMesh();
        });
    });
}

/**
 * 更新並顯示底部面積
 */
function updateAreaDisplay() {
    const { shape, dimensions } = currentContainer;
    let area = 0;
    if (shape === 'cube') {
        const { width, depth } = dimensions;
        area = (width || 0) * (depth || 0);
    } else if (shape === 'l-shape') {
        const { mainWidth, mainDepth, extWidth, extDepth } = dimensions;
        area = ((mainWidth || 0) * (mainDepth || 0)) + ((extWidth || 0) * (extDepth || 0));
    }
    
    const areaDisplay = document.getElementById('container-base-area');
    if (areaDisplay) {
        // 假設 1 單位 = 1 公分，面積單位為平方公分，轉換為平方公尺 (1 m² = 10000 cm²)
        areaDisplay.textContent = `${(area / 10000).toFixed(2)} m²`;
    }
}

/**
 * 顯示容器尺寸輸入的控制面板
 */
export function showSizeControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex'; // 確保面板可見
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
            <div class="input-group"><label>主寬度:</label><input type="number" id="container-main-width" value="${mainWidth}" min="1"></div>
            <div class="input-group"><label>主高度:</label><input type="number" id="container-main-height" value="${mainHeight}" min="1"></div>
            <div class="input-group"><label>主深度:</label><input type="number" id="container-main-depth" value="${mainDepth}" min="1"></div>
            <h4>Extension Part</h4>
            <div class="input-group"><label>延伸寬度:</label><input type="number" id="container-ext-width" value="${extWidth}" min="1"></div>
            <div class="input-group"><label>延伸高度:</label><input type="number" id="container-ext-height" value="${extHeight}" min="1"></div>
            <div class="input-group"><label>延伸深度:</label><input type="number" id="container-ext-depth" value="${extDepth}" min="1"></div>
        `;
    }

    htmlContent += `
        <div class="info-group" style="margin-top: 20px;">
            <h4>底部面積 (Base Area):</h4>
            <p id="container-base-area"></p> 
        </div>
    `;

    containerControlsContent.innerHTML = htmlContent;
    updateAreaDisplay(); // 初始計算
    addSizeInputListeners(shape);
}

/**
 * 為尺寸輸入框添加事件監聽
 * @param {string} shape - 當前容器形狀
 */
function addSizeInputListeners(shape) {
    const updateAll = (newDims) => {
        updateCurrentContainer({ dimensions: { ...currentContainer.dimensions, ...newDims } });
        renderContainerMesh();
        updateAreaDisplay();
    };

    if (shape === 'cube') {
        document.getElementById('container-width').addEventListener('input', e => { updateAll({ width: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-height').addEventListener('input', e => { updateAll({ height: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-depth').addEventListener('input', e => { updateAll({ depth: parseFloat(e.target.value) || 1 }) });
    } else if (shape === 'l-shape') {
        document.getElementById('container-main-width').addEventListener('input', e => { updateAll({ mainWidth: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-main-height').addEventListener('input', e => { updateAll({ mainHeight: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-main-depth').addEventListener('input', e => { updateAll({ mainDepth: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-ext-width').addEventListener('input', e => { updateAll({ extWidth: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-ext-height').addEventListener('input', e => { updateAll({ extHeight: parseFloat(e.target.value) || 1 }) });
        document.getElementById('container-ext-depth').addEventListener('input', e => { updateAll({ extDepth: parseFloat(e.target.value) || 1 }) });
    }
}

/**
 * 顯示門設定的控制面板
 */
export function showDoorControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex'; // 確保面板可見
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
                <div class="form-switch"><label>啟用</label><input type="checkbox" class="door-enabled" data-index="${index}" ${door.enabled ? 'checked' : ''}></div>
                <div class="input-group"><label>表面:</label><select class="door-face" data-index="${index}">${faceOptions}</select></div>
                <div class="input-group"><label>類型:</label><select class="door-type" data-index="${index}">${doorTypeOptions}</select></div>
                <div class="input-group"><label>位置:</label><input type="range" class="door-pos" data-index="${index}" value="${door.position.x}" min="-100" max="100" step="1"></div>
            </div>
        `;
    }).join('');

    containerControlsContent.innerHTML = `
        <h3>門設定 (Door Settings)</h3>
        <div id="doors-list">${doorsHtml}</div>
        <button id="add-door-btn">新增門 (Add Door)</button>
    `;

    addDoorControlListeners();
}

/**
 * 為門設定面板的控制項添加事件監聽
 */
function addDoorControlListeners() {
    document.getElementById('add-door-btn').addEventListener('click', () => {
        const newDoor = {
            id: THREE.MathUtils.generateUUID(),
            face: DOOR_FACES[currentContainer.shape][0].value,
            type: 'human',
            enabled: true,
            position: { x: 0, y: 0, z: 0 } // Add y position
        };
        updateCurrentContainer({ doors: [...currentContainer.doors, newDoor] });
        showDoorControls(); // Re-render controls to show new door
        renderContainerMesh(); // Update 3D preview
    });

    document.querySelectorAll('.remove-door-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const updatedDoors = currentContainer.doors.filter((_, i) => i !== index);
            updateCurrentContainer({ doors: updatedDoors });
            showDoorControls(); // Re-render controls
            renderContainerMesh(); // Update 3D preview
        });
    });

    document.querySelectorAll('.door-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        item.querySelector('.door-enabled').addEventListener('change', (e) => {
            const updatedDoors = [...currentContainer.doors];
            updatedDoors[index].enabled = e.target.checked;
            updateCurrentContainer({ doors: updatedDoors });
            renderContainerMesh();
        });
        item.querySelector('.door-face').addEventListener('change', (e) => {
            const updatedDoors = [...currentContainer.doors];
            updatedDoors[index].face = e.target.value;
            updateCurrentContainer({ doors: updatedDoors });
            renderContainerMesh();
        });
        item.querySelector('.door-type').addEventListener('change', (e) => {
            const updatedDoors = [...currentContainer.doors];
            updatedDoors[index].type = e.target.value;
            updateCurrentContainer({ doors: updatedDoors });
            renderContainerMesh();
        });
        item.querySelector('.door-pos').addEventListener('input', (e) => {
            const updatedDoors = [...currentContainer.doors];
            updatedDoors[index].position.x = parseFloat(e.target.value);
            updateCurrentContainer({ doors: updatedDoors });
            renderContainerMesh();
        });
    });
}

/**
 * 處理提交容器設定的邏輯
 */
export async function handleSubmit() {
    console.log('Submitting container configuration:', currentContainer);
    try {
        const response = await fetch('http://127.0.0.1:8889/save_container_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        if (submitConfirmation) submitConfirmation.style.display = 'none';
        hideModal();

    } catch (error) {
        console.error('Error saving container configuration:', error);
        alert(`儲存容器設定時發生錯誤: ${error.message}`);
    }
}

/**
 * 處理捨棄編輯的邏輯
 */
export function handleDiscard() {
    console.log('Edits discarded');
    // 恢復預設容器
    const defaultContainerState = {
        shape: 'cube',
        dimensions: { width: 120, height: 120, depth: 120 },
        doors: [] 
    };
    updateCurrentContainer(defaultContainerState);
    alert('編輯已捨棄，恢復預設容器。');
    if (discardConfirmation) discardConfirmation.style.display = 'none';
    hideModal();
}