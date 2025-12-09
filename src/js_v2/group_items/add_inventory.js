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
 */

// --- 全域變數與常數 ---
const API_BASE_URL = 'http://localhost:8888';
/** @type {Group[]} */
let groups = [];
/** @type {Item[]} */
let currentItems = [];
let isInitialized = false;

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
    openModalBtns = document.querySelectorAll('[data-action="open-add-modal"]');
    closeModalBtns = document.querySelectorAll('[data-action="close-add-modal"]');
    
    const requiredElements = [groupSelector, itemDisplayContainer, itemEmptyState, itemTableContainer, itemTableBody, addItemModal, addItemModalForm, modalConfirmBtn];
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
            closeAddItemModal(); // 點擊背景遮罩時關閉
        }
    });

    modalConfirmBtn?.addEventListener('click', handleModalConfirm);

    itemTableContainer?.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        const action = target.dataset.action;
        const id = Number(target.dataset.id);

        switch (action) {
            case 'delete':
                handleDeleteItem(id);
                break;
            case 'edit-note':
                handleEditNote(id);
                break;
            case 'save-note':
                handleSaveNote(id);
                break;
            case 'cancel-edit-note':
                handleCancelEditNote();
                break;
        }
    });
}

/**
 * 處理群組下拉選單的變更事件
 */
async function handleGroupSelectionChange() {
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
    const tableHeaderBtn = document.querySelector('.card-header .btn');

    // 如果有任何項目處於編輯模式，先取消以避免UI錯亂
    const isEditing = document.querySelector('.note-cell input');
    if (isEditing) {
        // 簡單地重新渲染會自動取消所有編輯狀態
    }

    if (currentItems.length === 0) {
        itemEmptyState.classList.remove('hidden');
        itemTableContainer.classList.add('hidden');
        tableHeaderBtn?.classList.add('hidden');
    } else {
        itemEmptyState.classList.add('hidden');
        itemTableContainer.classList.remove('hidden');
        tableHeaderBtn?.classList.remove('hidden');
        
        itemTableBody.innerHTML = '';
        currentItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.itemId = item.id;
            tr.innerHTML = `
                <td>${item.id}</td>
                <td>${item.length}</td>
                <td>${item.width}</td>
                <td>${item.height}</td>
                <td class="note-cell">
                    <span class="note-text">${item.note || ''}</span>
                </td>
                <td class="actions-cell">
                    <div class="action-buttons-wrapper">
                        <button class="btn btn-secondary btn-sm" data-action="edit-note" data-id="${item.id}">編輯</button>
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
        name: '', // 暫時設定為空字串，因為 modal 中沒有這個欄位
        length: parseFloat(document.getElementById('modal-item-length').value),
        width: parseFloat(document.getElementById('modal-item-width').value),
        height: parseFloat(document.getElementById('modal-item-height').value),
        note: '', // 暫時設定為空字串，因為 modal 中沒有這個欄位
        group_id: Number(groupId),
        quantity: 1, // 強制設定數量為 1，因為我們要建立多個獨立物件
    };

    if (isNaN(baseItemData.length) || baseItemData.length <= 0 ||
        isNaN(baseItemData.width) || baseItemData.width <= 0 ||
        isNaN(baseItemData.height) || baseItemData.height <= 0 ||
        isNaN(originalQuantity) || originalQuantity <= 0) {
        alert('長、寬、高與數量為必填欄位，且必須是正數。');
        return;
    }

    try {
        modalConfirmBtn.disabled = true; // 防止重複點擊

        const creationPromises = [];
        for (let i = 0; i < originalQuantity; i++) {
            const promise = fetch(`${API_BASE_URL}/api/v2/items/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(baseItemData),
            }).then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            });
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
        modalConfirmBtn.disabled = false; // 恢復按鈕
    }
}

/**
 * 處理刪除物件的邏輯
 * @param {number} itemId
 */
async function handleDeleteItem(itemId) {
    if (!confirm(`您確定要刪除編號為 ${itemId} 的物件嗎？`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/items/${itemId}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        currentItems = currentItems.filter(item => item.id !== itemId);
        renderItemsView();
    } catch (error) {
        console.error(`[add_inventory.js] 無法刪除物件 ${itemId}:`, error);
        alert('刪除物件失敗，請檢查主控台以獲取更多資訊。');
    }
}

/**
 * 處理點擊「編輯備註」按鈕的事件
 * @param {number} itemId
 */
function handleEditNote(itemId) {
    // 先重新渲染，確保只有一個項目處於編輯狀態
    renderItemsView();

    const item = currentItems.find(i => i.id === itemId);
    if (!item) return;

    const row = itemTableBody.querySelector(`tr[data-item-id="${itemId}"]`);
    const noteCell = row?.querySelector('.note-cell');
    const actionCell = row?.querySelector('.actions-cell');

    if (!noteCell || !actionCell) return;

    noteCell.innerHTML = `
        <input type="text" class="form-control form-control-sm" value="${item.note || ''}">
    `;

    actionCell.innerHTML = `
        <button class="btn btn-success btn-sm" data-action="save-note" data-id="${itemId}">儲存</button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-edit-note" data-id="${itemId}">取消</button>
    `;
    
    // 自動聚焦到輸入框
    noteCell.querySelector('input')?.focus();
}

/**
 * 處理儲存備註的邏輯
 * @param {number} itemId
 */
async function handleSaveNote(itemId) {
    const row = itemTableBody.querySelector(`tr[data-item-id="${itemId}"]`);
    const input = row?.querySelector('.note-cell input');
    if (!input) return;

    const newNote = input.value;
    const itemIndex = currentItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;

    const originalNote = currentItems[itemIndex].note;
    
    // 樂觀更新 (Optimistic Update)
    currentItems[itemIndex].note = newNote;
    renderItemsView(); // 立即重新渲染以退出編輯模式

    try {
        const response = await fetch(`${API_BASE_URL}/api/v2/items/${itemId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ note: newNote }),
        });

        if (!response.ok) {
            throw new Error(`伺服器錯誤: ${response.status}`);
        }
        
        // 如果成功，可以選擇性地用伺服器返回的資料完全更新項目
        const updatedItem = await response.json();
        currentItems[itemIndex] = updatedItem;
        
    } catch (error) {
        console.error(`[add_inventory.js] 無法儲存備註 ${itemId}:`, error);
        alert('儲存備註失敗！');
        
        // 如果更新失敗，則恢復到原始值
        currentItems[itemIndex].note = originalNote;
    } finally {
        // 無論成功或失敗，都再次渲染以確保UI同步
        renderItemsView();
    }
}

/**
 * 取消編輯備註
 */
function handleCancelEditNote() {
    renderItemsView(); // 重新渲染即可恢復原狀
}
