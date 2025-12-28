
let isInitialized = false;
let editor = null;
let closeBtn = null;
let canvas = null;
let planningBtn = null;
let arrowBtn = null;
let historyBtn = null;
let binBtn = null;

let confirmDialog = null;
let confirmYesBtn = null;
let confirmNoBtn = null;

let historyPanel = null;
let closeHistoryPanel = null;
let historyContent = null;

let isEditMode = false;
let deletedItems = [];

let sortable = null;
let objectManagerInstance = null; // To store the objectManager

import { showExclusiveUI } from './uiManager.js';
import * as api from '../utils/agentAPI.js';
// Sorting and visual updates are now decoupled from this manager
// import { sortObjects } from '../utils/sortingManager.js';
// import { updateObjectsVisualPriority } from './objectManager/objectManager.js';

/**
 * Initializes the Control Weight editor.
 */
export function initControlWeightManager(objectManager) {
    if (isInitialized) return;
    objectManagerInstance = objectManager; // Still useful to have a reference if needed later

    editor = document.getElementById('control-weight-editor');
    if (!editor) {
        console.error('Control Weight Editor not found in DOM!');
        return;
    }

    // Assign DOM elements
    closeBtn = document.getElementById('close-control-weight-editor-btn');
    canvas = document.getElementById('control-weight-canvas');
    planningBtn = document.getElementById('cw-planning-btn');
    arrowBtn = document.getElementById('cw-arrow-btn');
    historyBtn = document.getElementById('cw-history-btn');
    binBtn = document.getElementById('cw-bin-btn');
    confirmDialog = document.getElementById('cw-confirm-order-dialog');
    confirmYesBtn = document.getElementById('cw-confirm-order-yes');
    confirmNoBtn = document.getElementById('cw-confirm-order-no');
    historyPanel = document.getElementById('cw-history-panel');
    closeHistoryPanel = document.getElementById('cw-close-history-panel');
    historyContent = document.getElementById('cw-history-content');

    if (!closeBtn || !canvas || !planningBtn) {
        console.error('Failed to initialize Control Weight Manager: one or more child elements are missing.');
        return;
    }

    setupEventListeners();
    console.log("Control Weight Manager initialized.");
    isInitialized = true;
}

/**
 * Sets up all event listeners for the editor.
 */
function setupEventListeners() {
    closeBtn.addEventListener('click', closeEditor);
    planningBtn.addEventListener('click', toggleEditMode);
    historyBtn.addEventListener('click', showHistoryPanel);
    closeHistoryPanel.addEventListener('click', hideHistoryPanel);
    historyContent.addEventListener('click', handleRestoreItem);
    arrowBtn.addEventListener('click', () => { if(confirmDialog) confirmDialog.style.display = 'block'; });
    confirmNoBtn.addEventListener('click', () => { if(confirmDialog) confirmDialog.style.display = 'none'; });
    confirmYesBtn.addEventListener('click', handleConfirmOrder);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isEditMode) {
            toggleEditMode();
        }
    });

    // The sorting controls no longer trigger direct visual updates.
    // They will be used by the packing algorithm in the future.
    // document.getElementById('sort-order-select').addEventListener('change', applySortAndVisuals);
    // document.getElementById('door-direction-select').addEventListener('change', applySortAndVisuals);
    // document.getElementById('lifo-toggle').addEventListener('change', applySortAndVisuals);
}

/**
 * Opens the editor and populates it with items.
 */
export async function openControlWeightEditor(groupId) {
    // Pass the objectManager instance, though it might not be used in this function directly anymore
    initControlWeightManager(objectManagerInstance);
    console.log('openControlWeightEditor called for group ID:', groupId);
    showExclusiveUI('control-weight-editor');
    await populateItems(groupId);
}

function closeEditor() {
    showExclusiveUI(null);
    if (canvas) canvas.innerHTML = '';
    if (isEditMode) {
        toggleEditMode();
    }
}

/**
 * Redraws arrows in the grid based on the current order of cube items.
 */
function redrawArrows() {
    if (!canvas) return;
    canvas.querySelectorAll('.arrow').forEach(arrow => arrow.remove());
    const items = canvas.querySelectorAll('.cube-item');
    items.forEach((item, index) => {
        const isLastItem = index === items.length - 1;
        const isEndOfRow = (index + 1) % 3 === 0;
        if (!isLastItem && !isEndOfRow) {
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'arrow';
            arrowSpan.textContent = '→';
            item.after(arrowSpan);
        }
    });
}

/**
 * Fetches items and renders them in a flat grid structure.
 */
async function populateItems(groupId) {
    if (!canvas) return;
    canvas.innerHTML = '<p style="color: #aaa; text-align: center;">Loading items...</p>';
    try {
        const items = await api.getGroupItems(groupId);
        canvas.innerHTML = '';
        if (items.length === 0) {
            canvas.innerHTML = '<p style="color: #aaa; text-align: center;">This group has no items.</p>';
            return;
        }
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cube-item';
            itemDiv.textContent = item.name || `Item ${item.id}`;
            itemDiv.dataset.id = item.id;
            canvas.appendChild(itemDiv);
        });
        redrawArrows();
    } catch (error) {
        console.error("Failed to fetch items for Control Weight editor:", error);
        canvas.innerHTML = '<p style="color: #ff8888; text-align: center;">Failed to load items.</p>';
    }
}

/**
 * Toggles the drag-and-drop edit mode.
 */
function toggleEditMode() {
    isEditMode = !isEditMode;
    editor.classList.toggle('edit-mode', isEditMode);
    planningBtn.classList.toggle('active', isEditMode);
    if (isEditMode) {
        if (sortable) sortable.destroy();
        sortable = Sortable.create(canvas, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            filter: '.arrow',
            onEnd: () => {
                console.log('Reordered items.');
                redrawArrows();
            }
        });
    } else {
        if (sortable) {
            sortable.destroy();
            sortable = null;
        }
    }
    console.log(`Edit mode ${isEditMode ? 'activated' : 'deactivated'}.`);
}

// The applySortAndVisuals function is no longer needed as visuals are tied to state.
/*
async function applySortAndVisuals() {
    if (!objectManagerInstance) {
        console.error("ObjectManager instance not available in ControlWeightManager.");
        return;
    }
    console.log("Applying new sorting and visuals...");

    const sortOrder = document.getElementById('sort-order-select').value;
    const doorDirection = document.getElementById('door-direction-select').value;
    const lifoEnabled = document.getElementById('lifo-toggle').checked;

    const objects = objectManagerInstance.getSceneObjects();
    const sortedObjects = sortObjects(objects, { sortOrder, doorDirection, lifoEnabled });

    updateObjectsVisualPriority(objectManagerInstance.scene, sortedObjects, objectManagerInstance.allGroups);
}
*/

// --- History and Confirmation Functions --- //

function showHistoryPanel() {
    if (historyPanel) historyPanel.style.display = 'block';
    updateHistoryContent();
}

function hideHistoryPanel() {
    if (historyPanel) historyPanel.style.display = 'none';
}

function updateHistoryContent() {
    if (!historyContent) return;
    historyContent.innerHTML = '';
    if (deletedItems.length === 0) {
        historyContent.innerHTML = '<p>目前沒有任何歷史紀錄</p>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'history-list';
    deletedItems.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `<span>${item.name}</span> <button data-index="${index}" class="restore-btn">Restore</button>`;
        list.appendChild(listItem);
    });
    historyContent.appendChild(list);
}

function handleRestoreItem(e) {
    if (e.target.classList.contains('restore-btn')) {
        const index = parseInt(e.target.dataset.index, 10);
        const itemToRestore = deletedItems.splice(index, 1)[0];
        if (itemToRestore) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cube-item';
            itemDiv.textContent = itemToRestore.name;
            itemDiv.dataset.id = itemToRestore.id;
            canvas.appendChild(itemDiv);
            redrawArrows();
        }
        updateHistoryContent();
    }
}

function handleConfirmOrder() {
    const items = canvas.querySelectorAll('.cube-item');
    const newOrder = Array.from(items).map(item => ({ id: item.dataset.id, name: item.textContent }));
    console.log('Final order confirmed:', newOrder);
    alert('順序已確認！請查看控制台以獲取詳細資訊。');
    if (confirmDialog) confirmDialog.style.display = 'none';
    closeEditor();
}
