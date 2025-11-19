import * as THREE from 'three';
import { currentContainer, updateCurrentContainer, DOOR_SIZES, DOOR_FACES } from './containerState.js';
import { initPreviewScene, renderContainerMesh, animate, stopAnimate, getRenderer } from './containerScene.js';

// --- DOM 元素 --- //
let modal, previewCanvas, containerControlsContent, submitConfirmation, discardConfirmation;

/**
 * 正規化 config 物件，確保所有欄位存在且型別正確
 */
function normalizeConfig(cfg) {
    if (!cfg) return null;
    const shape = cfg.shape ?? 'cube';
    const d = cfg.dimensions ?? {};
    const width  = Number(d.width  ?? d.outerWidth  ?? 160);
    const depth  = Number(d.depth  ?? d.outerDepth  ?? 160);
    const height = Number(d.height ?? 120);
    const outerWidth  = Number(d.outerWidth  ?? width);
    const outerDepth  = Number(d.outerDepth  ?? depth);
    const notchWidth  = shape === 'l-shape'
        ? (Number(d.notchWidth) || 60)   // 0、NaN 都會 fallback 到 60
        : 0;
    const notchDepth  = shape === 'l-shape'
        ? (Number(d.notchWidth) || 60)   // 0、NaN 都會 fallback 到 60
        : 0;
    return {
        shape,
        dimensions: { width, depth, height, outerWidth, outerDepth, notchWidth, notchDepth },
        doors: cfg.doors ?? []
    };
}

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
    
    const safeConfig = normalizeConfig(currentContainer);
    updateCurrentContainer(safeConfig);
    console.log('[UI-CONFIG] showModal init config:', safeConfig);

    if (!getRenderer()) {
        initPreviewScene(previewCanvas);
    }
    renderContainerMesh(safeConfig);
    showContainerControls();
    animate();
}

/**
 * 隱藏彈出視窗並停止動畫
 */
export function hideModal() {
    if (!modal) return;
    modal.style.display = 'none';
    stopAnimate();
}

/**
 * 顯示容器形狀選擇的控制面板
 */
export function showContainerControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex';
    const { shape } = currentContainer;
    containerControlsContent.innerHTML = `
        <h3>Container Shape</h3>
        <div class="form-check">
            <input type="radio" id="shape-cube" name="container-shape" value="cube" ${shape === 'cube' ? 'checked' : ''}> <label for="shape-cube">Cube</label>
        </div>
        <div class="form-check">
            <input type="radio" id="shape-lshape" name="container-shape" value="l-shape" ${shape === 'l-shape' ? 'checked' : ''}> <label for="shape-lshape">L-Shape</label>
        </div>
    `;

    document.querySelectorAll('input[name="container-shape"]').forEach(radio => {
        radio.addEventListener('change', e => {
            if (!e.target.checked) return;
            const newConfig = normalizeConfig({ ...currentContainer, shape: e.target.value, doors: [] }); // Reset doors on shape change
            updateCurrentContainer(newConfig);
            console.log(`[UI-CONFIG] shape -> ${e.target.value}:`, newConfig);
            renderContainerMesh(newConfig);
        });
    });
}

/**
 * 顯示容器尺寸輸入的控制面板
 */
export function showSizeControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex';
    const { shape, dimensions } = currentContainer;

    let htmlContent = `<h3>Container Dimensions</h3>`;

    if (shape === 'cube') {
        htmlContent += `
            <div class="input-group"><label for="dim-width">Width:</label><input type="number" id="dim-width" value="${dimensions.width}"></div>
            <div class="input-group"><label for="dim-height">Height:</label><input type="number" id="dim-height" value="${dimensions.height}"></div>
            <div class="input-group"><label for="dim-depth">Depth:</label><input type="number" id="dim-depth" value="${dimensions.depth}"></div>
        `;
    } else if (shape === 'l-shape') {
        htmlContent += `
            <h4>Outer Dimensions</h4>
            <div class="input-group"><label for="dim-outerWidth">Outer Width:</label><input type="number" id="dim-outerWidth" value="${dimensions.outerWidth}"></div>
            <div class="input-group"><label for="dim-outerDepth">Outer Depth:</label><input type="number" id="dim-outerDepth" value="${dimensions.outerDepth}"></div>
            <div class="input-group"><label for="dim-height">Height:</label><input type="number" id="dim-height" value="${dimensions.height}"></div>
            <h4>Notch Dimensions</h4>
            <div class="input-group"><label for="dim-notchWidth">Notch Width:</label><input type="number" id="dim-notchWidth" value="${dimensions.notchWidth}"></div>
            <div class="input-group"><label for="dim-notchDepth">Notch Depth:</label><input type="number" id="dim-notchDepth" value="${dimensions.notchDepth}"></div>
        `;
    }

    containerControlsContent.innerHTML = htmlContent;
    addSizeInputListeners();
}

/**
 * 為所有尺寸輸入框添加事件監聽
 */
function addSizeInputListeners() {
    const dimIds = ['width', 'depth', 'height', 'outerWidth', 'outerDepth', 'notchWidth', 'notchDepth'];
    dimIds.forEach(id => {
        const el = document.getElementById(`dim-${id}`);
        if (!el) return;
        el.addEventListener('input', () => {
            const newDimensions = { ...currentContainer.dimensions, [id]: Number(el.value) };
            const newConfig = normalizeConfig({ ...currentContainer, dimensions: newDimensions });
            updateCurrentContainer(newConfig);
            console.log(`[UI-CONFIG] dim ${id} ->`, el.value);
            renderContainerMesh(newConfig);
        });
    });
}

/**
 * 顯示門設定的控制面板
 */
export function showDoorControls() {
    if (!containerControlsContent) return;
    document.getElementById('container-controls').style.display = 'flex';
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
                <div class="form-switch"><label>啟用</label><input type="checkbox" class="door-enabled" ${door.enabled ? 'checked' : ''}></div>
                <div class="input-group"><label>表面:</label><select class="door-face">${faceOptions}</select></div>
                <div class="input-group"><label>類型:</label><select class="door-type">${doorTypeOptions}</select></div>
                <div class="input-group"><label>位置:</label><input type="range" class="door-pos" value="${door.position.x}" min="-100" max="100" step="1"></div>
            </div>
        `;
    }).join('');

    containerControlsContent.innerHTML = `<h3>門設定</h3><div id="doors-list">${doorsHtml}</div><button id="add-door-btn">新增門</button>`;
    addDoorControlListeners();
}

/**
 * 為門設定面板的控制項添加事件監聽 (RESTORED)
 */
function addDoorControlListeners() {
    document.getElementById('add-door-btn').addEventListener('click', () => {
        const newDoor = {
            id: THREE.MathUtils.generateUUID(),
            face: (DOOR_FACES[currentContainer.shape] || [{}])[0].value,
            type: 'human',
            enabled: true,
            position: { x: 0, y: 0, z: 0 }
        };
        updateCurrentContainer({ doors: [...currentContainer.doors, newDoor] });
        showDoorControls();
        renderContainerMesh(currentContainer);
    });

    document.querySelectorAll('.remove-door-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const updatedDoors = currentContainer.doors.filter((_, i) => i !== index);
            updateCurrentContainer({ doors: updatedDoors });
            showDoorControls();
            renderContainerMesh(currentContainer);
        });
    });

    document.querySelectorAll('.door-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        const door = currentContainer.doors[index];
        if (!door) return;

        const updateDoor = (props) => {
            const updatedDoors = [...currentContainer.doors];
            updatedDoors[index] = { ...updatedDoors[index], ...props };
            updateCurrentContainer({ doors: updatedDoors });
            renderContainerMesh(currentContainer);
        };

        item.querySelector('.door-enabled').addEventListener('change', (e) => updateDoor({ enabled: e.target.checked }));
        item.querySelector('.door-face').addEventListener('change', (e) => updateDoor({ face: e.target.value }));
        item.querySelector('.door-type').addEventListener('change', (e) => updateDoor({ type: e.target.value }));
        item.querySelector('.door-pos').addEventListener('input', (e) => updateDoor({ position: { ...door.position, x: parseFloat(e.target.value) } }));
    });
}

export function getContainerConfigAndHideModal() {
    const finalConfig = normalizeConfig(currentContainer);
    console.log('[UI-CONFIG] apply config:', finalConfig);
    window.dispatchEvent(new CustomEvent('containerChanged', { detail: finalConfig }));
    if (submitConfirmation) submitConfirmation.style.display = 'none';
    hideModal();
    return finalConfig;
}

export function handleDiscard() {
    console.log('Edits discarded');
    const defaultContainerState = { shape: 'cube', dimensions: { width: 120, height: 120, depth: 120 }, doors: [] };
    updateCurrentContainer(defaultContainerState);
    if (discardConfirmation) discardConfirmation.style.display = 'none';
    hideModal();
}