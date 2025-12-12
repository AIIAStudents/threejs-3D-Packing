/**
 * @typedef {object} Group
 * @property {number} id
 * @property {string} name
 * @property {string} note
 */

/**
 * @typedef {object} Item
 * @property {number} id
 * @property {string} name
 * @property {number} length
 * @property {number} width
 * @property {number} height
 * @property {number} quantity
 * @property {string} note
 * @property {number} group_id
 * @property {boolean} [isDirty] - Optional flag to track changes
 */

// --- 全域變數與常數 ---
const API_BASE_URL = 'http://localhost:8888';
/** @type {Group[]} */
let groups = [];
/** @type {Item[]} */
let currentItems = [];
let isInitialized = false;
/** @type {number | null} */
let editingItemId = null; // Track which item row is in edit mode

// --- DOM 節點參考 ---
let groupSelector;
let itemDisplayContainer;
let itemEmptyState;
let itemTableContainer;
let itemTableBody;
let addItemModal;
let addItemModalForm;
let modalConfirmBtn;
let openModalBtns;
let closeModalBtns;
let saveAllBtn;

/**
 * 初始化函式
 */
export async function init() {
    if (isInitialized) return;
    console.log('[add_inventory.js] init() function called.');

    // 1. 綁定 DOM 元素
    groupSelector = document.getElementById('group-selector');
    itemDisplayContainer = document.getElementById('item-display-container');
    itemEmptyState = document.getElementById('item-empty-state');
    itemTableContainer = document.getElementById('item-table-container');
    itemTableBody = document.getElementById('item-table-body');
    addItemModal = document.getElementById('add-item-modal');
    addItemModalForm = document.getElementById('add-item-modal-form');
    modalConfirmBtn = document.getElementById('modal-confirm-add-btn');
    saveAllBtn = document.getElementById('save-all-btn');
    openModalBtns = document.querySelectorAll('[data-action="open-add-modal"]');
    closeModalBtns = document.querySelectorAll('[data-action="close-add-modal"]');
    
    const requiredElements = [groupSelector, itemDisplayContainer, itemEmptyState, itemTableContainer, itemTableBody, addItemModal, addItemModalForm, modalConfirmBtn, saveAllBtn];
    if (requiredElements.some(el => !el) || openModalBtns.length === 0 || closeModalBtns.length === 0) {
        console.error('[add_inventory.js] One or more required DOM elements are missing.');
        return;
    }

    // 2. 載入群組到下拉選單
    await loadGroupsIntoSelector();

    // 3. 綁定事件監聽器
    bindEvents();

    isInitialized = true;
    console.log('[add_inventory.js] "物件規格" 頁面初始化完成。');
}

/**
 * 從後端 API 獲取群組列表，並填充到下拉選單中
 */
async function loadGroupsIntoSelector() {
    if (!groupSelector) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/groups/`);
        if (!response.ok) throw new Error(`Failed to fetch groups: ${response.statusText}`);
        groups = await response.json();
        groupSelector.innerHTML = '<option value="">-- 請選擇一個群組 --</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = String(group.id);
            option.textContent = group.name || `(無名稱的群組 ${group.id})`;
            groupSelector.appendChild(option);
        });
    } catch (error) {
        console.error('[add_inventory.js] 無法載入群組列表:', error);
        groupSelector.innerHTML = '<option value="">無法載入群組</option>';
    }
}

/**
 * 綁定所有事件監聽器
 */
function bindEvents() {
    groupSelector?.addEventListener('change', handleGroupSelectionChange);
    
    openModalBtns.forEach(btn => btn.addEventListener('click', openAddItemModal));
    closeModalBtns.forEach(btn => btn.addEventListener('click', closeAddItemModal));
    addItemModal?.addEventListener('click', (e) => {
        if (e.target === addItemModal) {
            closeAddItemModal();
        }
    });

    modalConfirmBtn?.addEventListener('click', handleModalConfirm);
    saveAllBtn?.addEventListener('click', handleSaveAllChanges);

    itemTableContainer?.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.dataset.action) return;
        const id = Number(target.dataset.id);
        if (target.dataset.action === 'delete') {
            handleDeleteItem(id);
        } else if (target.dataset.action === 'edit-note') {
            handleEditNote(id);
        }
    });

    itemTableContainer?.addEventListener('input', handleTableInput);
}

/**
 * 處理群組下拉選單的變更事件
 */
async function handleGroupSelectionChange() {
    if (currentItems.some(item => item.isDirty)) {
        if (!confirm('您有未儲存的變更，確定要切換群組嗎？所有未儲存的變更將會遺失。')) {
            groupSelector.value = currentItems[0]?.group_id || '';
            return;
        }
    }
    editingItemId = null;
    
    const groupId = groupSelector?.value;
    if (!groupId) {
        itemDisplayContainer?.classList.add('hidden');
        currentItems = [];
        return;
    }
    itemDisplayContainer?.classList.remove('hidden');
    await loadItemsForGroup(Number(groupId));
}

/**
 * 根據 group ID 從 API 載入物件列表
 * @param {number} groupId
 */
async function loadItemsForGroup(groupId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/items/?group_id=${groupId}`);
        if (!response.ok) throw new Error(`Failed to fetch items: ${response.statusText}`);
        currentItems = await response.json();
        renderItemsView();
    } catch (error) {
        console.error(`[add_inventory.js] 無法為群組 ${groupId} 載入物件:`, error);
        currentItems = [];
        renderItemsView();
    }
}

/**
 * 根據 currentItems 陣列的內容，決定顯示空狀態還是表格，並渲染內容
 */
function renderItemsView() {
    if (!itemTableBody || !itemEmptyState || !itemTableContainer) return;
    const tableHeaderBtn = document.querySelector('.card-header .btn[data-action="open-add-modal"]');

    if (currentItems.length === 0) {
        itemEmptyState.classList.remove('hidden');
        itemTableContainer.classList.add('hidden');
        tableHeaderBtn?.classList.add('hidden');
    } else {
        itemEmptyState.classList.add('hidden');
        itemTableContainer.classList.remove('hidden');
        tableHeaderBtn?.classList.remove('hidden');
        
        itemTableBody.innerHTML = '';
        currentItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.dataset.itemId = item.id;
            if (item.isDirty) {
                tr.classList.add('row-dirty');
            }

            const isEditing = item.id === editingItemId;

            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.length}</td>
                <td>${item.width}</td>
                <td>${item.height}</td>
                <td class="note-cell">
                    ${isEditing 
                        ? `<input type="text" class="form-control form-control-sm" name="note" value="${item.note || ''}">` 
                        : `<span class="note-text">${item.note || ''}</span>`
                    }
                </td>
                <td class="actions-cell">
                    <div class="action-buttons-wrapper">
                        <button class="btn btn-secondary btn-sm" data-action="edit-note" data-id="${item.id}" ${isEditing ? 'disabled' : ''}>編輯</button>
                        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${item.id}">刪除</button>
                    </div>
                </td>
            `;
            itemTableBody.appendChild(tr);
        });
    }
}

/**
 * 打開新增物件的 Modal
 */
function openAddItemModal() {
    if (!addItemModal) return;
    addItemModal.classList.remove('hidden');
}

/**
 * 關閉新增物件的 Modal 並重置表單
 */
function closeAddItemModal() {
    if (!addItemModal || !addItemModalForm) return;
    addItemModal.classList.add('hidden');
    addItemModalForm.reset();
}

/**
 * 處理 Modal 確認按鈕的點擊事件
 */
async function handleModalConfirm() {
    if (!addItemModalForm || !groupSelector) return;

    const groupId = groupSelector.value;
    if (!groupId) {
        alert('內部錯誤：找不到群組 ID。');
        return;
    }

    const originalQuantity = parseInt(document.getElementById('modal-item-quantity').value, 10);
    const baseItemData = {
        name: '',
        length: parseFloat(document.getElementById('modal-item-length').value),
        width: parseFloat(document.getElementById('modal-item-width').value),
        height: parseFloat(document.getElementById('modal-item-height').value),
        note: '',
        group_id: Number(groupId),
        quantity: 1,
    };

    if (isNaN(baseItemData.length) || baseItemData.length <= 0 ||
        isNaN(baseItemData.width) || baseItemData.width <= 0 ||
        isNaN(baseItemData.height) || baseItemData.height <= 0 ||
        isNaN(originalQuantity) || originalQuantity <= 0) {
        alert('長、寬、高與數量為必填欄位，且必須是正數。');
        return;
    }

    try {
        modalConfirmBtn.disabled = true;
        const creationPromises = [];
        for (let i = 0; i < originalQuantity; i++) {
            const promise = fetch(`${API_BASE_URL}/api/v2/items/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(baseItemData),
            }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP error! status: ${res.status}`)));
            creationPromises.push(promise);
        }
        const newItems = await Promise.all(creationPromises);
        currentItems.push(...newItems);
        renderItemsView();
        closeAddItemModal();
    } catch (error) {
        console.error('[add_inventory.js] 無法新增物件:', error);
        alert('新增物件失敗，請檢查主控台以獲取更多資訊。');
    } finally {
        modalConfirmBtn.disabled = false;
    }
}

/**
 * 處理刪除物件的邏輯
 * @param {number} itemId
 */
async function handleDeleteItem(itemId) {
    if (!confirm(`您確定要刪除編號為 ${itemId} 的物件嗎？`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/items/${itemId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        currentItems = currentItems.filter(item => item.id !== itemId);
        renderItemsView();
    } catch (error) {
        console.error(`[add_inventory.js] 無法刪除物件 ${itemId}:`, error);
        alert('刪除物件失敗，請檢查主控台以獲取更多資訊。');
    }
}

/**
 * 處理點擊「編輯備註」按鈕的事件，進入單行編輯模式
 * @param {number} itemId
 */
function handleEditNote(itemId) {
    editingItemId = itemId;
    renderItemsView();
    const input = itemTableBody.querySelector(`tr[data-item-id="${itemId}"] .note-cell input`);
    input?.focus();
}

/**
 * 處理表格內輸入事件，更新本地資料並標記為 dirty
 * @param {Event} e
 */
function handleTableInput(e) {
    if (!(e.target instanceof HTMLInputElement)) return;
    const target = e.target;
    const row = target.closest('tr');
    if (!row) return;

    const itemId = Number(row.dataset.itemId);
    const fieldName = target.name;
    const value = target.value;

    const itemToUpdate = currentItems.find(i => i.id === itemId);
    if (itemToUpdate && (itemToUpdate[fieldName] !== value)) {
        itemToUpdate[fieldName] = value;
        itemToUpdate.isDirty = true;
        row.classList.add('row-dirty'); // Immediately add visual feedback
    }
}

/**
 * 儲存所有標記為 'dirty' 的變更
 */
async function handleSaveAllChanges() {
    editingItemId = null; // 退出所有編輯模式
    renderItemsView(); // 重新渲染以移除所有 input 框

    const dirtyItems = currentItems.filter(item => item.isDirty);
    if (dirtyItems.length === 0) {
        alert('沒有偵測到任何變更。');
        return;
    }

    saveAllBtn.disabled = true;
    saveAllBtn.textContent = '儲存中...';

    const savePromises = dirtyItems.map(item => {
        return fetch(`${API_BASE_URL}/api/v2/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: item.note }), // Currently only supports note
        }).then(response => {
            if (!response.ok) return Promise.reject(new Error(`Failed to save item ${item.id}`));
            return response.json();
        });
    });

    try {
        const updatedItems = await Promise.all(savePromises);
        
        // 更新本地資料並清除 dirty 標記
        updatedItems.forEach(updatedItem => {
            const index = currentItems.findIndex(i => i.id === updatedItem.id);
            if (index !== -1) {
                currentItems[index] = { ...currentItems[index], ...updatedItem, isDirty: false };
            }
        });
        
        alert('所有變更已成功儲存！');

    } catch (error) {
        console.error('[add_inventory.js] 儲存變更失敗:', error);
        alert('部分或全部變更儲存失敗，請檢查主控台獲取詳細資訊。');
    } finally {
        saveAllBtn.disabled = false;
        saveAllBtn.textContent = '儲存全部變更';
        renderItemsView(); // 重新渲染以移除 dirty 狀態的視覺回饋
    }
}
