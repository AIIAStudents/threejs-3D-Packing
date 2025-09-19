import { addObject, updateObject } from './objectManager/objectManager.js';
import * as api from '../utils/agentAPI.js';

/**
 * UI Manager Module
 * -----------------------
 * 此模組負責管理 3D 物件的使用者介面 (UI)，包括：
 * - 側邊欄物件清單與物件編輯面板 (Modal)
 * - 拖曳新增物件至場景
 * - 物件 hover 與點擊事件 (配合 MouseControls)
 * - 編輯物件尺寸與狀態
 * - 與後端 API 同步更新物件資料
 * - 可調整側邊欄寬度並保存至 localStorage
 * 
 * 提供 initUI(sceneRefs) 作為初始化入口。
 */

// --- DOM Elements --- //
let kebabIcon, itemEditModal, itemNameInput, itemWidthInput, itemHeightInput, itemDepthInput;
let itemWidthValue, itemHeightValue, itemDepthValue;
let statusButtons, saveItemBtn, cancelItemBtn;

// --- State --- //
let currentlyEditingObject = null;

export function initUI(sceneRefs) {
    // Query for DOM elements
    kebabIcon = document.getElementById('kebab-menu-icon');
    itemEditModal = document.getElementById('item-edit-modal');
    itemNameInput = document.getElementById('item-name-input');
    itemWidthInput = document.getElementById('item-width-input');
    itemHeightInput = document.getElementById('item-height-input');
    itemDepthInput = document.getElementById('item-depth-input');
    itemWidthValue = document.getElementById('item-width-value');
    itemHeightValue = document.getElementById('item-height-value');
    itemDepthValue = document.getElementById('item-depth-value');
    statusButtons = document.querySelectorAll('.status-btn');
    saveItemBtn = document.getElementById('save-item-btn');
    cancelItemBtn = document.getElementById('cancel-edit-item-btn');

    // --- Configure Sliders ---
    const setupSlider = (slider, min, max, step) => {
        if (slider) {
            slider.min = min;
            slider.max = max;
            slider.step = step;
        }
    };
    setupSlider(itemWidthInput, 1, 30, 1);
    setupSlider(itemHeightInput, 1, 30, 1);
    setupSlider(itemDepthInput, 1, 30, 1);

    setupEventListeners(sceneRefs);
    initResizer();
    console.log("UI Manager initialized.");
}

function setupEventListeners(sceneRefs) {
    const canvas = sceneRefs.renderer.domElement;

    // --- Drag and Drop --- //
    const draggableItem = document.querySelector('.item-icon-button');
    draggableItem.addEventListener('dragstart', (e) => {
        const itemTypeId = e.target.closest('.item-icon-button').dataset.itemTypeId;
        e.dataTransfer.setData('text/plain', itemTypeId);
    });

    canvas.addEventListener('dragover', (e) => e.preventDefault());

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const itemTypeId = e.dataTransfer.getData('text/plain');
        if (itemTypeId) {
            const newItemData = {
                name: `Cube-${Math.round(Date.now() / 1000)}`,
                id: `temp-${Date.now()}`,
                type: 'cube',
                width: 10, height: 10, depth: 10,
                status: 'pending'
            };
            addObject(sceneRefs.scene, newItemData);
        }
    });

    // --- Hover and Click Events from MouseControls --- //
    canvas.addEventListener('objecthover', updateKebabMenu);
    canvas.addEventListener('objectclick', (e) => {
        showItemEditModal(e.detail.object);
    });

    // --- Modal Buttons --- //
    saveItemBtn.addEventListener('click', saveItemChanges);
    cancelItemBtn.addEventListener('click', hideItemEditModal);

    // --- Modal Sliders --- //
    itemWidthInput.addEventListener('input', () => itemWidthValue.textContent = itemWidthInput.value);
    itemHeightInput.addEventListener('input', () => itemHeightValue.textContent = itemHeightInput.value);
    itemDepthInput.addEventListener('input', () => itemDepthValue.textContent = itemDepthInput.value);

    // --- Status Buttons --- //
    statusButtons.forEach(button => {
        button.addEventListener('click', () => {
            statusButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });
}

function updateKebabMenu(event) {
    const { object, pointerEvent } = event.detail;
    if (object) {
        kebabIcon.style.display = 'block';
        kebabIcon.style.left = `${pointerEvent.clientX + 15}px`;
        kebabIcon.style.top = `${pointerEvent.clientY - 15}px`;
    } else {
        kebabIcon.style.display = 'none';
    }
}

function showItemEditModal(object) {
    currentlyEditingObject = object;
    const data = object.userData;

    // Populate fields
    itemNameInput.value = data.name;
    itemWidthInput.value = data.width;
    itemHeightInput.value = data.height;
    itemDepthInput.value = data.depth;
    itemWidthValue.textContent = data.width;
    itemHeightValue.textContent = data.height;
    itemDepthValue.textContent = data.depth;

    // Set status button
    statusButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === data.status);
    });

    itemEditModal.style.display = 'block';
}

function hideItemEditModal() {
    itemEditModal.style.display = 'none';
    currentlyEditingObject = null;
}

async function saveItemChanges() { // Make function async
    if (!currentlyEditingObject) return;

    const newStatus = document.querySelector('.status-btn.active').dataset.status;
    const itemId = currentlyEditingObject.userData.id;

    const updatedData = {
        id: itemId, // Pass ID for backend update
        name: itemNameInput.value,
        width: parseFloat(itemWidthInput.value),
        height: parseFloat(itemHeightInput.value),
        depth: parseFloat(itemDepthInput.value),
        status: newStatus
    };

    try {
        // --- API Call to save changes to the backend ---
        await api.updateInventoryItem(itemId, updatedData);
        console.log(`✅ Item ${itemId} successfully updated in the backend.`);

        // Update the 3D object in the scene
        updateObject(currentlyEditingObject, updatedData);

        // Update the item name in the sidebar list
        const itemElement = document.querySelector(`.object-item[data-id='${itemId}']`);
        if (itemElement) {
            const nameSpan = itemElement.querySelector('.object-name');
            if (nameSpan) {
                nameSpan.textContent = `${updatedData.name} (ID: ${currentlyEditingObject.userData.item_type_id})`;
            }
        }

        hideItemEditModal();

    } catch (error) {
        console.error(`❌ Failed to save item ${itemId}:`, error);
        alert(`儲存物品失敗: ${error.message}`);
    }
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const leftSidebar = document.getElementById('left-sidebar');

    const storedWidth = localStorage.getItem('sidebarWidth');
    if (storedWidth) {
        leftSidebar.style.width = `${storedWidth}px`;
    }

    const mouseMoveHandler = (e) => {
        e.preventDefault();
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < 600) {
            leftSidebar.style.width = `${newWidth}px`;
        }
    };

    const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        localStorage.setItem('sidebarWidth', leftSidebar.style.width);
    };

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
}
