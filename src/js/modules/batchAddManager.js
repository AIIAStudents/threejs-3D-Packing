import * as api from '../utils/agentAPI.js';

// DOM Elements
const getDOMElements = () => ({
    addItemBtn: document.getElementById('add-item-btn'),
    modal: document.getElementById('add-item-modal'),
    groupSelect: document.getElementById('item-group-select'),
    createNewGroupBtn: document.getElementById('create-new-group-btn'),
    newGroupInputContainer: document.getElementById('new-group-input-container'),
    newGroupNameInput: document.getElementById('new-group-name-input'),
    confirmNewGroupBtn: document.getElementById('confirm-new-group-btn'),
    statusSelect: document.getElementById('item-status-select'),
    submitBtn: document.getElementById('submit-batch-add-btn'),
    cancelBtn: document.getElementById('cancel-batch-add-btn'),
    widthInput: document.getElementById('batch-add-width-input'),
    heightInput: document.getElementById('batch-add-height-input'),
    depthInput: document.getElementById('batch-add-depth-input'),
    quantityInput: document.getElementById('item-quantity-input'),
});

/**
 * Fetches all groups from the API and populates the select dropdown.
 */
async function populateGroupSelect() {
    const elements = getDOMElements();
    try {
        const groups = await api.getGroups();
        
        elements.groupSelect.innerHTML = '<option value="">-- 請選擇一個群組 --</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            elements.groupSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error populating groups:', error);
        alert('無法載入群組列表，請檢查後端服務是否正在運行。');
    }
}

/**
 * Shows or hides the modal.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleModal(show) {
    const { modal, newGroupInputContainer, widthInput, heightInput, depthInput, quantityInput, groupSelect } = getDOMElements();
    if (show) {
        modal.style.display = 'flex';
        populateGroupSelect();
    } else {
        modal.style.display = 'none';
        newGroupInputContainer.style.display = 'none';
        if (groupSelect) groupSelect.selectedIndex = 0;
        if (widthInput) widthInput.value = 15;
        if (heightInput) heightInput.value = 15;
        if (depthInput) depthInput.value = 15;
        if (quantityInput) quantityInput.value = 1;
    }
}

/**
 * Handles the creation of a new group from within the modal.
 */
async function handleCreateNewGroup() {
    const { newGroupNameInput } = getDOMElements();
    const name = newGroupNameInput.value.trim();
    if (!name) {
        alert('請輸入新群組的名稱。');
        return;
    }

    try {
        const newGroup = await api.createGroup({ name });
        await populateGroupSelect();
        getDOMElements().groupSelect.value = newGroup.id;
        getDOMElements().newGroupInputContainer.style.display = 'none';
        newGroupNameInput.value = '';

        // Dispatch event to notify the main group list to refresh
        document.dispatchEvent(new CustomEvent('itemsChanged'));

    } catch (error) {
        console.error('Error creating group:', error);
        alert('建立群組失敗。');
    }
}

/**
 * Handles the submission of the batch add form.
 */
async function handleSubmit() {
    const elements = getDOMElements();
    const groupId = elements.groupSelect.value;
    const itemTypeId = 3; // Hardcoded to 3 for Cube
    const quantity = parseInt(elements.quantityInput.value, 10);
    const status = elements.statusSelect.value;

    if (!groupId) {
        alert('請選擇一個群組。');
        return;
    }
    if (isNaN(quantity) || quantity <= 0) {
        alert('數量必須是正整數。');
        return;
    }

    const payload = {
        group_id: parseInt(groupId, 10),
        item_type_id: itemTypeId,
        quantity: quantity,
        status: status,
        dimensions: {
            width: parseFloat(elements.widthInput.value),
            height: parseFloat(elements.heightInput.value),
            depth: parseFloat(elements.depthInput.value),
        }
    };

    try {
        await api.addBatchItems(payload);
        alert('物件已成功新增！');
        toggleModal(false);

        // Dispatch a global event to notify that the item list has changed.
        // Other modules (like GroupManager) can listen for this and refresh themselves.
        document.dispatchEvent(new CustomEvent('itemsChanged', { detail: { groupId: payload.group_id } }));

    } catch (error) {
        console.error('Error submitting batch add:', error);
        alert(`新增物件失敗：${error.message}`);
    }
}

/**
 * Initializes all event listeners for the batch add modal.
 */
function addEventListeners() {
    const elements = getDOMElements();
    elements.addItemBtn.addEventListener('click', () => toggleModal(true));
    elements.cancelBtn.addEventListener('click', () => toggleModal(false));
    elements.createNewGroupBtn.addEventListener('click', () => {
        elements.newGroupInputContainer.style.display = 'flex';
    });
    elements.confirmNewGroupBtn.addEventListener('click', handleCreateNewGroup);
    elements.submitBtn.addEventListener('click', handleSubmit);
}

/**
 * Main initialization function for the batch add manager.
 */
export function initBatchAddManager() {
    addEventListeners();
    console.log('📦 Batch Add Manager initialized.');
}