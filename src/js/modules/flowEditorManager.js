import { showExclusiveUI } from './uiManager.js';
import SpacePlanningManager from './spacePlanningManager.js'; // Import SpacePlanningManager
import * as api from '../utils/agentAPI.js';
import { toCanonical } from '../utils/statusUtils.js';
import { addObject, updateObjectAppearanceByState, removeObjectById } from './objectManager/objectManager.js';
import { openControlWeightEditor } from './controlWeightManager.js';

class FlowEditor {
    constructor(packingManager, groupManager) {
        this.packingManager = packingManager;
        this.groupManager = groupManager;
        this.editorElement = document.getElementById('group-flow-editor');
        this.canvasElement = document.getElementById('group-flow-canvas');
        this.controlsElement = document.getElementById('group-flow-controls');
        this.historyPanel = document.getElementById('history-panel');
        this.deleteDialog = document.getElementById('delete-group-dialog');
        this.binElement = document.getElementById('bin-btn');

        this.groups = [];
        this.originalGroups = [];
        this.deletedHistory = [];
        this.isPlanningMode = false;
        this.draggedNode = null;
        this.groupToDelete = null;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        document.getElementById('close-flow-editor-btn').addEventListener('click', () => this.handleClose());
        document.getElementById('planning-btn').addEventListener('click', () => this.togglePlanningMode());
        document.getElementById('history-btn').addEventListener('click', () => this.showHistory());
        this.binElement.addEventListener('dragover', (e) => this._handleDragOverBin(e));
        this.binElement.addEventListener('dragleave', (e) => this._handleDragLeaveBin(e));
        this.binElement.addEventListener('drop', (e) => this._handleDropOnBin(e));
        document.getElementById('close-history-panel').addEventListener('click', () => this.historyPanel.style.display = 'none');
        document.getElementById('confirm-delete-yes').addEventListener('click', () => this.confirmDelete());
        document.getElementById('confirm-delete-no').addEventListener('click', () => {
            this.deleteDialog.style.display = 'none';
            this.groupToDelete = null;
        });
    }

    async show() {
        showExclusiveUI('group-flow-editor');
        try {
            this.groups = await api.getGroups();
            this.originalGroups = JSON.parse(JSON.stringify(this.groups));
            this.render();
        } catch (error) {
            console.error("Failed to fetch groups for flow editor:", error);
        }
    }

    hide() {
        showExclusiveUI(null);
        if (this.isPlanningMode) {
            this.togglePlanningMode();
        }
        this.originalGroups = [];
    }

    handleClose() {
        if (confirm("確定捨棄變更?")) {
            this.groups = JSON.parse(JSON.stringify(this.originalGroups));
            this.hide();
        }
    }

    render() {
        this.canvasElement.innerHTML = '';
        if (this.groups.length === 0) return;

        const nodeWidth = 150;
        const nodeHeight = 60;
        const horizontalSpacing = 100;
        const totalWidth = (this.groups.length * nodeWidth) + ((this.groups.length - 1) * horizontalSpacing);
        const startX = (this.canvasElement.clientWidth - totalWidth) / 2;
        const startY = this.canvasElement.clientHeight / 2 - (nodeHeight / 2);

        let previousNodeElement = null;

        this.groups.forEach((group, index) => {
            const nodeElement = document.createElement('div');
            nodeElement.className = 'flow-node';
            nodeElement.textContent = group.name;
            nodeElement.dataset.groupId = group.id;
            nodeElement.style.left = `${startX + index * (nodeWidth + horizontalSpacing)}px`;
            nodeElement.style.top = `${startY}px`;
            
            if (this.isPlanningMode) {
                nodeElement.draggable = true;
                nodeElement.addEventListener('dragstart', (e) => this._handleDragStart(e, nodeElement));
                nodeElement.addEventListener('dragend', () => this._handleDragEnd(nodeElement));
                nodeElement.addEventListener('dragover', (e) => this._handleDragOver(e, nodeElement));
                nodeElement.addEventListener('drop', (e) => this._handleDrop(e, nodeElement));
            }

            this.canvasElement.appendChild(nodeElement);

            if (previousNodeElement) {
                this.drawArrow(previousNodeElement, nodeElement);
            }
            previousNodeElement = nodeElement;
        });
    }

    drawArrow(startNode, endNode) {
        const startRect = startNode.getBoundingClientRect();
        const endRect = endNode.getBoundingClientRect();
        const canvasRect = this.canvasElement.getBoundingClientRect();

        const startX = startRect.right - canvasRect.left;
        const startY = startRect.top - canvasRect.top + startRect.height / 2;
        const endX = endRect.left - canvasRect.left;
        
        const length = endX - startX;

        const arrow = document.createElement('div');
        arrow.className = 'flow-arrow';
        arrow.style.left = `${startX}px`;
        arrow.style.top = `${startY}px`;
        arrow.style.width = `${length}px`;
        
        this.canvasElement.appendChild(arrow);
    }

    togglePlanningMode() {
        this.isPlanningMode = !this.isPlanningMode;
        document.getElementById('planning-btn').classList.toggle('planning-mode', this.isPlanningMode);
        document.getElementById('bin-btn').classList.toggle('bin-active', this.isPlanningMode);
        this.render();
    }

    _handleDragStart(e, nodeElement) {
        if (!this.isPlanningMode) return;
        this.draggedNode = nodeElement;
        e.dataTransfer.setData('text/plain', nodeElement.dataset.groupId);
        setTimeout(() => nodeElement.classList.add('dragging'), 0);
    }

    _handleDragEnd(nodeElement) {
        if (!this.isPlanningMode) return;
        nodeElement.classList.remove('dragging');
        this.draggedNode = null;
    }

    _handleDragOver(e, targetNode) {
        if (!this.isPlanningMode || !this.draggedNode || this.draggedNode === targetNode) return;
        e.preventDefault();
    }

    _handleDrop(e, targetNode) {
        if (!this.isPlanningMode || !this.draggedNode || this.draggedNode === targetNode) return;
        e.preventDefault();
        
        const draggedId = parseInt(this.draggedNode.dataset.groupId, 10);
        const targetId = parseInt(targetNode.dataset.groupId, 10);

        const draggedIndex = this.groups.findIndex(g => g.id === draggedId);
        const targetIndex = this.groups.findIndex(g => g.id === targetId);

        const [draggedGroup] = this.groups.splice(draggedIndex, 1);
        this.groups.splice(targetIndex, 0, draggedGroup);

        this.render();
    }

    _handleDragOverBin(e) {
        if (!this.isPlanningMode || !this.draggedNode) return;
        e.preventDefault();
        this.binElement.style.transform = 'scale(1.2)';
    }

    _handleDragLeaveBin(e) {
        this.binElement.style.transform = 'scale(1)';
    }

    _handleDropOnBin(e) {
        if (!this.isPlanningMode || !this.draggedNode) return;
        e.preventDefault();
        this.binElement.style.transform = 'scale(1)';
        const groupId = parseInt(this.draggedNode.dataset.groupId, 10);
        this.groupToDelete = this.groups.find(g => g.id === groupId);
        
        if (this.groupToDelete) {
            this.deleteDialog.querySelector('p').textContent = `確定要刪除群組 "${this.groupToDelete.name}"?`;
            this.deleteDialog.style.display = 'block';
        }
    }

    async confirmDelete() {
        if (!this.groupToDelete) return;
        const groupIdToDelete = this.groupToDelete.id;

        try {
            await this.groupManager.deleteGroup(groupIdToDelete);
            this.groups = this.groups.filter(g => g.id !== groupIdToDelete);
            this.render();
        } catch (error) {
            console.error(`[FlowEditor] Call to groupManager.deleteGroup failed.`, error);
        } finally {
            this.deleteDialog.style.display = 'none';
            this.groupToDelete = null;
        }
    }

    async executePacking() {
        // Check if the new Space Planning flow is active and has valid allocations
        if (SpacePlanningManager.state.isActive && SpacePlanningManager.state.zoneGroupMapping.size > 0) {
            console.log("Executing zoned packing based on user plan.");
            // Hide the current flow editor before starting the new packing execution
            this.hide();
            await SpacePlanningManager.executePacking();
            SpacePlanningManager.reset(); // Reset state for next use
        } else {
            // Fallback to the original batch packing logic
            console.log("Executing legacy batch packing.");
            const orderedGroupIds = this.groups.map(g => g.id);
            console.log("Executing packing with order:", orderedGroupIds);
            try {
                await this.packingManager.executeBatchPacking();
                this.hide();
            } catch (error) {
                console.error("Failed to execute batch packing:", error);
                alert("執行批次打包失敗!");
            }
        }
    }

    showHistory() {
        const historyContent = this.historyPanel.querySelector('#history-content');
        historyContent.innerHTML = '';

        if (this.deletedHistory.length === 0) {
            historyContent.innerHTML = '<p>目前沒有任何歷史紀錄</p>';
        } else {
            this.deletedHistory.forEach(group => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                const groupName = document.createElement('span');
                groupName.textContent = group.name;
                historyItem.appendChild(groupName);
                const restoreBtn = document.createElement('button');
                restoreBtn.textContent = '還原';
                restoreBtn.className = 'restore-btn';
                restoreBtn.onclick = () => this.restoreGroup(group.id);
                historyItem.appendChild(restoreBtn);
                historyContent.appendChild(historyItem);
            });
        }
        this.historyPanel.style.display = 'block';
    }

    restoreGroup(groupId) {
        const groupToRestore = this.deletedHistory.find(g => g.id === groupId);
        if (!groupToRestore) return;
        this.groups.push(groupToRestore);
        this.deletedHistory = this.deletedHistory.filter(g => g.id !== groupId);
        this.render();
        this.showHistory();
    }
}

export class GroupManager {
  constructor(scene, objectManager) {
    this.scene = scene;
    this.objectManager = objectManager;
    this.groups = [];
    this.activeGroupId = null;
    this.activeContextMenu = null;
    this._setupEventListeners();
  }

  async init() {
    try {
      console.log("🔄 Initializing GroupManager...");
      this.groups = await api.getGroups();
      this.renderList();
      if (this.groups.length > 0 && !this.activeGroupId) {
        this.selectGroup(this.groups[0].id);
      }
      console.log(`✅ GroupManager initialized.`);
    } catch (error) {
      console.error("❌ Failed to initialize GroupManager:", error);
    }
  }

  getAllGroups() {
    return this.groups;
  }

  _setupEventListeners() {
    document.getElementById('add-group-btn').addEventListener('click', () => this.promptForNewGroup());
    document.addEventListener('click', (e) => {
      if (this.activeContextMenu && !this.activeContextMenu.contains(e.target)) {
        this._closeActiveContextMenu();
      }
    });
    document.addEventListener('itemsChanged', () => {
      console.log('Event "itemsChanged" received. Re-initializing GroupManager to refresh list.');
      this.init();
    });
  }

  _closeActiveContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.style.display = 'none';
      this.activeContextMenu = null;
    }
  }

  showContextMenu(event, dropdownContent) {
    event.stopPropagation();
    this._closeActiveContextMenu();
    if (dropdownContent.parentNode !== document.body) {
        document.body.appendChild(dropdownContent);
    }
    this.activeContextMenu = dropdownContent;
    dropdownContent.style.visibility = 'hidden';
    dropdownContent.style.display = 'block';
    const menuRect = dropdownContent.getBoundingClientRect();
    const menuBtn = event.currentTarget;
    const btnRect = menuBtn.getBoundingClientRect();
    let top = btnRect.bottom;
    let left = btnRect.left;
    if (top + menuRect.height > window.innerHeight) top = btnRect.top - menuRect.height;
    if (left + menuRect.width > window.innerWidth) left = btnRect.right - menuRect.width;
    if (top < 0) top = 5;
    if (left < 0) left = 5;
    dropdownContent.style.position = 'fixed';
    dropdownContent.style.top = `${top}px`;
    dropdownContent.style.left = `${left}px`;
    dropdownContent.style.visibility = 'visible';
  }

  handleMenuAction(event, group, groupHeader, item, groupId) {
    const actionElement = event.target.closest('a[data-action]');
    if (!actionElement) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionElement.dataset.action;
    this._closeActiveContextMenu();
    switch (action) {
        case 'rename-group':
            groupHeader.querySelector('.group-name').dispatchEvent(new MouseEvent('dblclick'));
            break;
        case 'delete-group':
            if (confirm(`Are you sure you want to delete group "${group.name}"?`)) {
                this.deleteGroup(group.id);
            }
            break;
        case 'control-weight':
            openControlWeightEditor(group.id);
            break;
        case 'edit-item':
            this.openItemEditModal(item, groupId, { trigger: event.currentTarget });
            break;
        case 'delete-item':
            if (confirm(`Are you sure you want to delete item "${item.name}"?`)) {
                this.deleteItem(item.id, groupId);
            }
            break;
    }
  }

  async promptForNewGroup() {
    const groupName = prompt('請輸入新的群組名稱:', `Group ${this.groups.length + 1}`);
    if (groupName && groupName.trim() !== '') {
      try {
        const newGroupData = { name: groupName.trim() };
        await api.createGroup(newGroupData);
        document.dispatchEvent(new CustomEvent('itemsChanged'));
        this.showToast('群組已成功建立！', 'success');
      } catch (error) {
        console.error("❌ Failed to create group:", error);
        this.showToast(`建立群組失敗: ${error.message}`, 'error');
      }
    }
  }

  selectGroup(groupId) {
    if (this.activeGroupId === groupId) return;
    this.activeGroupId = groupId;
    console.log(`GROUP_SELECTED: ${groupId}`);
    const event = new CustomEvent('groupSelected', { detail: { groupId } });
    document.dispatchEvent(event);
    document.querySelectorAll('.group-header').forEach(header => header.classList.remove('active'));
    const activeHeader = document.querySelector(`.group-item[data-id='${groupId}'] .group-header`);
    if (activeHeader) activeHeader.classList.add('active');
  }

  renderList() {
    const listElement = document.getElementById('objects-list');
    listElement.innerHTML = '';
    this.groups.forEach(group => {
      const groupElement = this._createGroupElement(group);
      listElement.appendChild(groupElement);
    });
  }

  _createGroupElement(group) {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.dataset.id = group.id;
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    const groupNameSpan = document.createElement('span');
    groupNameSpan.className = 'group-name';
    groupNameSpan.textContent = group.name;
    groupHeader.appendChild(groupNameSpan);
    groupNameSpan.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = group.name;
      input.className = 'group-name-edit-input';
      groupNameSpan.replaceWith(input);
      input.focus();
      let committed = false;
      const commit = async (apply = true) => {
        if (committed) return;
        committed = true;
        const newName = input.value.trim();
        if (input.parentNode) input.parentNode.replaceChild(groupNameSpan, input);
        groupNameSpan.textContent = newName || group.name;
        if (apply && newName && newName !== group.name) {
          await this.updateGroupName(group.id, newName);
        }
      };
      input.addEventListener('blur', () => commit(true), { once: true });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      });
    });
    if (group.items && group.items.length > 0) {
        const expandCollapseIcon = document.createElement('i');
        expandCollapseIcon.className = 'fas fa-chevron-right expand-collapse-icon';
        groupHeader.insertBefore(expandCollapseIcon, groupNameSpan);
    }
    const menuBtn = document.createElement('button');
    menuBtn.className = 'kebab';
    menuBtn.innerHTML = '⋮';
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'dropdown-content';
    dropdownContent.addEventListener('click', (e) => this.handleMenuAction(e, group, groupHeader));
    const renameAction = document.createElement('a');
    renameAction.href = '#';
    renameAction.textContent = '修改名稱';
    renameAction.dataset.action = 'rename-group';
    const deleteAction = document.createElement('a');
    deleteAction.href = '#';
    deleteAction.textContent = '刪除群組';
    deleteAction.dataset.action = 'delete-group';
    const controlWeightAction = document.createElement('a');
    controlWeightAction.href = '#';
    controlWeightAction.textContent = '控制權重';
    controlWeightAction.dataset.action = 'control-weight';
    dropdownContent.appendChild(renameAction);
    dropdownContent.appendChild(deleteAction);
    dropdownContent.appendChild(controlWeightAction);
    dropdown.appendChild(menuBtn);
    groupHeader.appendChild(dropdown);
    menuBtn.addEventListener('click', (e) => this.showContextMenu(e, dropdownContent));
    if (group.packingTime) {
        const time = new Date(group.packingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeSpan = document.createElement('span');
        timeSpan.className = 'packing-time';
        timeSpan.textContent = time;
        groupHeader.appendChild(timeSpan);
    }
    if (group.id === this.activeGroupId) groupHeader.classList.add('active');
    const itemsList = document.createElement('div');
    itemsList.className = 'group-items-list collapsed';
    if (group.items && group.items.length > 0) {
        group.items.forEach(item => {
            const itemElement = this._createItemElement(item, group.id);
            itemsList.appendChild(itemElement);
        });
    }
    groupItem.appendChild(groupHeader);
    groupItem.appendChild(itemsList);
    groupHeader.addEventListener('click', (e) => {
        if (!e.target.closest('.kebab, .dropdown-content')) {
            this.selectGroup(group.id);
            const icon = groupHeader.querySelector('.expand-collapse-icon');
            if (icon) {
                itemsList.classList.toggle('collapsed');
                icon.classList.toggle('fa-chevron-right');
                icon.classList.toggle('fa-chevron-down');
            }
        }
    });
    groupItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        groupItem.style.backgroundColor = '#4a4a4a';
    });
    groupItem.addEventListener('dragleave', () => groupItem.style.backgroundColor = '');
    groupItem.addEventListener('drop', async (e) => {
        e.preventDefault();
        groupItem.style.backgroundColor = '';
        const itemTypeId = e.dataTransfer.getData('text/plain');
        const groupId = group.id;
        const tempId = `temp-${Date.now()}`;
        const newItem = { id: tempId, item_type_id: parseInt(itemTypeId, 10), name: `Adding Item...`, status: 'pending' };
        if (!group.items) group.items = [];
        group.items.push(newItem);
        this.renderList();
        const itemData = { item_type_id: parseInt(itemTypeId, 10), group_id: groupId };
        await this.addItemToGroup(groupId, itemData, tempId);
    });
    return groupItem;
  }

  async updateGroupName(groupId, newName) {
    try {
        const updatedGroup = await api.updateGroup(groupId, { name: newName });
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            group.name = updatedGroup.name;
            this.renderList();
            this.showToast('群組名稱已成功更新！', 'success');
        }
    } catch (error) {
        console.error(`❌ Failed to update group name for group ${groupId}:`, error);
        this.showToast(`更新群組名稱失敗: ${error.message}`, 'error');
    }
  }

  async deleteGroup(groupId) {
    try {
        const itemsToDelete = await api.getGroupItems(groupId);
        itemsToDelete.forEach(item => removeObjectById(this.scene, item.id));
        await api.deleteGroup(groupId);
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.renderList();
        this.showToast('群組已成功刪除！', 'success');
    } catch (error) {
        console.error(`❌ Failed to delete group ${groupId}:`, error);
        this.showToast(`刪除群組失敗: ${error.message}`, 'error');
        throw error;
    }
  }

  _createItemElement(item, groupId) {
    const itemElement = document.createElement('div');
    itemElement.className = `object-item status-${toCanonical(item.status)}`;
    itemElement.dataset.id = item.id;
    const itemName = document.createElement('span');
    itemName.className = 'object-name';
    itemName.textContent = item.name || `Item ${item.id}`;
    itemElement.appendChild(itemName);
    const menuBtn = document.createElement('button');
    menuBtn.className = 'kebab';
    menuBtn.innerHTML = '⋮';
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'dropdown-content';
    dropdownContent.addEventListener('click', (e) => this.handleMenuAction(e, null, null, item, groupId));
    const editAction = document.createElement('a');
    editAction.href = '#';
    editAction.textContent = '編輯物件屬性';
    editAction.dataset.action = 'edit-item';
    const deleteAction = document.createElement('a');
    deleteAction.href = '#';
    deleteAction.textContent = '刪除物件';
    deleteAction.dataset.action = 'delete-item';
    dropdownContent.appendChild(editAction);
    dropdownContent.appendChild(deleteAction);
    dropdown.appendChild(menuBtn);
    itemElement.appendChild(dropdown);
    menuBtn.addEventListener('click', (e) => this.showContextMenu(e, dropdownContent));
    return itemElement;
  }

  openItemEditModal(item, groupId, options = {}) {
    const modal = document.getElementById('item-edit-modal');
    if (!modal) {
        console.error('Item Edit Modal not found in DOM!');
        return;
    }
    showExclusiveUI('item-edit-modal', { trigger: options.trigger });
    const nameInput = document.getElementById('item-name-input');
    nameInput.value = item.name || '';
    const widthInput = document.getElementById('item-width-input');
    const heightInput = document.getElementById('item-height-input');
    const depthInput = document.getElementById('item-depth-input');
    const widthValueSpan = document.getElementById('item-width-value');
    const heightValueSpan = document.getElementById('item-height-value');
    const depthValueSpan = document.getElementById('item-depth-value');
    const dims = item.dimensions ?? {};
    widthInput.value = dims.width ?? item.width ?? 15;
    heightInput.value = dims.height ?? item.height ?? 15;
    depthInput.value = dims.depth ?? item.depth ?? 15;
    widthValueSpan.textContent = widthInput.value;
    heightValueSpan.textContent = heightInput.value;
    depthValueSpan.textContent = depthInput.value;
    const updateSliderValue = (input, span) => { span.textContent = parseFloat(input.value).toFixed(1); };
    const widthChangeListener = () => updateSliderValue(widthInput, widthValueSpan);
    const heightChangeListener = () => updateSliderValue(heightInput, heightValueSpan);
    const depthChangeListener = () => updateSliderValue(depthInput, depthValueSpan);
    widthInput.addEventListener('input', widthChangeListener);
    heightInput.addEventListener('input', heightChangeListener);
    depthInput.addEventListener('input', depthChangeListener);
    const statusButtons = modal.querySelectorAll('.status-btn');
    statusButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.status === toCanonical(item.status)));
    const statusClickHandler = (e) => {
        statusButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
    };
    statusButtons.forEach(btn => btn.addEventListener('click', statusClickHandler));
    const saveBtn = document.getElementById('save-item-btn');
    const cancelBtn = document.getElementById('cancel-edit-item-btn');
    const saveHandler = async () => {
        const selectedStatusEl = modal.querySelector('.status-btn.active');
        const rawStatus = selectedStatusEl ? selectedStatusEl.dataset.status : 'pending';
        const itemData = { name: nameInput.value, width: parseFloat(widthInput.value), height: parseFloat(heightInput.value), depth: parseFloat(depthInput.value), status: toCanonical(rawStatus) };
        try {
            await api.updateInventoryItem(item.id, itemData);
            document.dispatchEvent(new CustomEvent('itemsChanged', { detail: { updated: [item.id] } }));
            this.showToast('物件屬性已成功更新！', 'success');
        } catch (error) {
            console.error(`❌ Failed to update item data for item ${item.id}:`, error);
            this.showToast(`更新物件失敗: ${error.message}`, 'error');
        } finally {
            closeModal();
        }
    };
    const closeModal = () => {
        showExclusiveUI(null);
        saveBtn.removeEventListener('click', saveHandler);
        cancelBtn.removeEventListener('click', closeModal);
        widthInput.removeEventListener('input', widthChangeListener);
        heightInput.removeEventListener('input', heightChangeListener);
        depthInput.removeEventListener('input', depthChangeListener);
        statusButtons.forEach(btn => btn.removeEventListener('click', statusClickHandler));
    };
    saveBtn.addEventListener('click', saveHandler);
    cancelBtn.addEventListener('click', closeModal);
  }

  async deleteItem(itemId, groupId) {
    try {
        await api.deleteItem(itemId);
        document.dispatchEvent(new CustomEvent('itemsChanged', { detail: { deleted: [itemId] } }));
        this.showToast('物件已成功刪除！', 'success');
    } catch (error) {
        console.error(`❌ Failed to delete item ${itemId}:`, error);
        this.showToast(`刪除物件失敗: ${error.message}`, 'error');
    }
  }

  async updateItemStatus(itemId, newStatus, groupId) {
    try {
        if (typeof itemId === 'undefined') {
            console.error('updateItemStatus called with undefined itemId.');
            return;
        }
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            const item = group.items.find(i => i.id === itemId);
            if (item) {
                item.status = newStatus;
                this.renderList();
                const event = new CustomEvent('itemStatusChanged', { detail: { itemId, status: newStatus } });
                document.dispatchEvent(event);
                updateObjectAppearanceByState(this.scene, this.objectManager.getSceneObjects().find(o => o.userData.id === itemId));
            }
        }
    } catch (error) {
        console.error(`❌ Failed to update status for item ${itemId}:`, error);
    }
  }

  async updateItemData(itemId, itemData, groupId) {
    try {
        await api.updateInventoryItem(itemId, itemData);
        document.dispatchEvent(new CustomEvent('itemsChanged', { detail: { updated: [itemId] } }));
        this.showToast('物件尺寸已成功更新！', 'success');
    } catch (error) {
        console.error(`❌ Failed to update dimensions for item ${itemId}:`, error);
        this.showToast(`更新物件尺寸失敗: ${error.message}`, 'error');
    }
  }

  async addItemToGroup(groupId, itemData, tempId) {
      try {
          const addedItem = await api.addInventoryItem(itemData);
          if (!addedItem.type) addedItem.type = "cube";
          const group = this.groups.find(g => g.id === groupId);
          if (group) {
              const itemIndex = group.items.findIndex(i => i.id === tempId);
              if (itemIndex !== -1) group.items[itemIndex] = addedItem;
              this.renderList();
              const allGroups = await api.getGroups();
              addObject(this.scene, addedItem, allGroups);
              this.showToast('物件已成功新增！', 'success');
          }
      } catch (error) {
          console.error(`❌ Failed to add item to group ${groupId}:`, error);
          this.showToast(`新增物件到群組失敗: ${error.message}`, 'error');
      }
  }

  showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

export function initFlowEditor(sceneRefs, packingManager, groupManager) {
    const flowEditor = new FlowEditor(packingManager, groupManager);
    console.log("Flow Editor (Group Manager & Flow UI) initialized.");
}