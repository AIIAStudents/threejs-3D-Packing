import * as api from '../utils/agentAPI.js';
import { addObject, updateObjectOpacity } from './objectManager/objectManager.js';
/**
 * FlowEditor 負責群組流程 UI 編輯與拖放管理
 * - 顯示群組流程節點
 * - 支援拖曳排序與刪除操作
 * - 可觸發批次打包 (packingManager)
 */
class FlowEditor {
    constructor(packingManager) { // Added packingManager
        this.packingManager = packingManager; // Stored packingManager
        this.editorElement = document.getElementById('group-flow-editor');
        this.canvasElement = document.getElementById('group-flow-canvas');
        this.controlsElement = document.getElementById('group-flow-controls');
        this.historyPanel = document.getElementById('history-panel');
        this.deleteDialog = document.getElementById('delete-group-dialog');
        this.binElement = document.getElementById('bin-btn');

        this.groups = [];
        this.originalGroups = []; // To store state on open
        this.deletedHistory = [];
        this.isPlanningMode = false;
        this.draggedNode = null;
        this.groupToDelete = null;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        document.getElementById('execute-packing-btn').addEventListener('click', () => this.show());
        document.getElementById('close-flow-editor-btn').addEventListener('click', () => this.handleClose());

        // Controls
        document.getElementById('planning-btn').addEventListener('click', () => this.togglePlanningMode());
        document.getElementById('play-btn').addEventListener('click', () => this.executePacking());
        document.getElementById('history-btn').addEventListener('click', () => this.showHistory());
        
        // Bin is a drop target
        this.binElement.addEventListener('dragover', (e) => this._handleDragOverBin(e));
        this.binElement.addEventListener('dragleave', (e) => this._handleDragLeaveBin(e));
        this.binElement.addEventListener('drop', (e) => this._handleDropOnBin(e));

        // Dialogs
        document.getElementById('close-history-panel').addEventListener('click', () => this.historyPanel.style.display = 'none');
        document.getElementById('confirm-delete-yes').addEventListener('click', () => this.confirmDelete());
        document.getElementById('confirm-delete-no').addEventListener('click', () => {
            this.deleteDialog.style.display = 'none';
            this.groupToDelete = null;
        });
    }

    async show() {
        this.editorElement.style.display = 'block';
        try {
            this.groups = await api.getGroups();
            // Store a deep copy of the original order
            this.originalGroups = JSON.parse(JSON.stringify(this.groups));
            this.render();
        } catch (error) {
            console.error("Failed to fetch groups for flow editor:", error);
        }
    }

    hide() {
        this.editorElement.style.display = 'none';
        if (this.isPlanningMode) {
            this.togglePlanningMode(); // Turn off planning mode when closing
        }
        // Clear original state
        this.originalGroups = [];
    }

    handleClose() {
        if (confirm("確定捨棄變更?")) {
            // Restore original groups
            this.groups = JSON.parse(JSON.stringify(this.originalGroups));
            this.hide();
        }
    }

    render() {
        this.canvasElement.innerHTML = ''; // Clear canvas
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
            
            // Add drag handlers if in planning mode
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
        console.log(`Planning mode: ${this.isPlanningMode}`);
        this.render(); // Re-render to apply/remove draggable attributes
    }

    // --- Drag and Drop Handlers ---

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

        // Remove dragged group and insert it before the target
        const [draggedGroup] = this.groups.splice(draggedIndex, 1);
        this.groups.splice(targetIndex, 0, draggedGroup);

        this.render(); // Re-render with the new order
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

        try {
            // No need to call API, just move to history
            // await api.deleteGroup(this.groupToDelete.id); 
            this.deletedHistory.push(this.groupToDelete); // Add to history
            this.groups = this.groups.filter(g => g.id !== this.groupToDelete.id);
            this.render();
        } catch (error) {
            console.error("Failed to delete group:", error);
            alert("刪除群組失敗!");
        } finally {
            this.deleteDialog.style.display = 'none';
            this.groupToDelete = null;
        }
    }

    async executePacking() {
        const orderedGroupIds = this.groups.map(g => g.id);
        console.log("Executing packing with order:", orderedGroupIds);
        try {
            // await api.updateGroupOrder(orderedGroupIds); // No longer needed here
            // alert("群組順序已成功儲存!"); // No longer needed here
            // this.hide(); // Hide after packing is complete, handled by packingManager
            
            // Trigger the actual batch packing process
            await this.packingManager.executeBatchPacking();
            this.hide(); // Hide the flow editor after packing is initiated
            
        } catch (error) {
            console.error("Failed to execute batch packing:", error);
            alert("執行批次打包失敗!");
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
                historyItem.className = 'history-item'; // Add a class for styling
                
                const groupName = document.createElement('span');
                groupName.textContent = group.name;
                historyItem.appendChild(groupName);

                const restoreBtn = document.createElement('button');
                restoreBtn.textContent = '還原';
                restoreBtn.className = 'restore-btn'; // Add a class for styling
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

        // Add back to main groups list
        this.groups.push(groupToRestore);

        // Remove from history
        this.deletedHistory = this.deletedHistory.filter(g => g.id !== groupId);

        // Re-render everything
        this.render();
        this.showHistory(); // Refresh history panel
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
      console.log("🔄 Initializing GroupManager, starting with empty groups...");
      this.groups = await api.getGroups();
      this.renderList();
      if (this.groups.length > 0) {
        // Automatically select the first group if available
        this.selectGroup(this.groups[0].id);
      }
      console.log(`✅ GroupManager initialized.`);
    } catch (error) {
      console.error("❌ Failed to initialize GroupManager:", error);
    }
  }

  _setupEventListeners() {
    document.getElementById('add-group-btn').addEventListener('click', () => this.promptForNewGroup());
    document.addEventListener('click', (e) => {
      if (this.activeContextMenu && !this.activeContextMenu.contains(e.target)) {
        this._closeActiveContextMenu();
      }
    });
  }

  _closeActiveContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.style.display = 'none';
      this.activeContextMenu = null;
    }
  }

  async promptForNewGroup() {
    const groupName = prompt('請輸入新的群組名稱:', `Group ${this.groups.length + 1}`);
    if (groupName && groupName.trim() !== '') {
      try {
        const newGroupData = { name: groupName.trim() };
        const groupFromServer = await api.createGroup(newGroupData);
        this.groups.push(groupFromServer);
        this.renderList();
        this.selectGroup(groupFromServer.id);
        this.showToast('群組已成功建立！', 'success');
      } catch (error) {
        console.error("❌ Failed to create group:", error);
        alert(`建立群組失敗: ${error.message}`);
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

    document.querySelectorAll('.group-header').forEach(header => {
      header.classList.remove('active');
    });
    const activeHeader = document.querySelector(`.group-item[data-id='${groupId}'] .group-header`);
    if (activeHeader) {
      activeHeader.classList.add('active');
    }
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

        const saveChanges = () => {
            const newName = input.value.trim();
            if (newName && newName !== group.name) {
                this.updateGroupName(group.id, newName);
            }
            input.replaceWith(groupNameSpan);
            groupNameSpan.textContent = newName || group.name;
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveChanges();
            } else if (e.key === 'Escape') {
                input.replaceWith(groupNameSpan);
                groupNameSpan.textContent = group.name;
            }
        });
    });

    if (group.items && group.items.length > 0) {
        const expandCollapseIcon = document.createElement('i');
        expandCollapseIcon.className = 'fas fa-chevron-right expand-collapse-icon';
        groupHeader.appendChild(expandCollapseIcon);
    }

    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.innerHTML = '⋮';
    groupHeader.appendChild(menuBtn);

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.display = 'none';

    const modifyNameBtn = document.createElement('div');
    modifyNameBtn.innerHTML = '<i class="fas fa-edit"></i> Modify Group Name';
    modifyNameBtn.addEventListener('click', () => {
        const newName = prompt('Enter new group name:', group.name);
        if (newName) {
            this.updateGroupName(group.id, newName);
        }
        contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(modifyNameBtn);

    const deleteGroupBtn = document.createElement('div');
    deleteGroupBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Group';
    deleteGroupBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete group "${group.name}"?`)) {
            this.deleteGroup(group.id);
        }
        contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(deleteGroupBtn);

    groupHeader.appendChild(contextMenu);

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeContextMenu) {
            this.activeContextMenu.style.display = 'none';
        }
        contextMenu.style.display = 'block';
        this.activeContextMenu = contextMenu;
    });


    if (group.packingTime) {
        const time = new Date(group.packingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeSpan = document.createElement('span');
        timeSpan.className = 'packing-time';
        timeSpan.textContent = time;
        groupHeader.appendChild(timeSpan);
    }

    if (group.id === this.activeGroupId) {
        groupHeader.classList.add('active');
    }

    const itemsList = document.createElement('div');
    itemsList.className = 'group-items-list';
    if (group.items && group.items.length > 0) {
        group.items.forEach(item => {
            const itemElement = this._createItemElement(item, group.id);
            itemsList.appendChild(itemElement);
        });
    } else {
        itemsList.classList.add('collapsed');
    }


    groupItem.appendChild(groupHeader);
    groupItem.appendChild(itemsList);

    groupHeader.addEventListener('click', (e) => {
        if (e.target.className !== 'menu-btn' && !e.target.closest('.context-menu')) {
            this.selectGroup(group.id);
            const itemsList = groupItem.querySelector('.group-items-list');
            itemsList.classList.toggle('collapsed');

            const icon = groupHeader.querySelector('.expand-collapse-icon');
            if (icon) {
                icon.classList.toggle('fa-chevron-right');
                icon.classList.toggle('fa-chevron-down');
            }
        }
    });

    groupItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        groupItem.style.backgroundColor = '#4a4a4a';
    });

    groupItem.addEventListener('dragleave', (e) => {
        groupItem.style.backgroundColor = '';
    });

    groupItem.addEventListener('drop', async (e) => {
        e.preventDefault();
        groupItem.style.backgroundColor = '';
        const itemTypeId = e.dataTransfer.getData('text/plain');
        const groupId = group.id;
        
        const tempId = `temp-${Date.now()}`;
        const newItem = {
            id: tempId,
            item_type_id: parseInt(itemTypeId, 10),
            name: `Adding Item...`,
            status: 'pending'
        };

        if (!group.items) {
            group.items = [];
        }
        group.items.push(newItem);
        this.renderList();

        const itemData = {
            item_type_id: parseInt(itemTypeId, 10),
            group_id: groupId
        };

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
        alert(`更新群組名稱失敗: ${error.message}`);
        this.showToast(`更新群組名稱失敗: ${error.message}`, 'error');
    }
  }

  async deleteGroup(groupId) {
    try {
        await api.deleteGroup(groupId);
        this.groups = this.groups.filter(g => g.id !== groupId);
        this.renderList();
        this.showToast('群組已成功刪除！', 'success');
    } catch (error) {
        console.error(`❌ Failed to delete group ${groupId}:`, error);
        alert(`刪除群組失敗: ${error.message}`);
        this.showToast(`刪除群組失敗: ${error.message}`, 'error');
    }
  }

  _createItemElement(item, groupId) {
    const itemElement = document.createElement('div');
    itemElement.className = `object-item status-${item.status}`;
    itemElement.dataset.id = item.id;

    const itemName = document.createElement('span');
    itemName.className = 'object-name';
    itemName.textContent = item.name || `Item ${item.id}`;
    itemElement.appendChild(itemName);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.innerHTML = '⋮';
    itemElement.appendChild(menuBtn);

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.display = 'none';

    const editItemBtn = document.createElement('div');
    editItemBtn.innerHTML = '<i class="fas fa-edit"></i> 編輯物件屬性';
    editItemBtn.addEventListener('click', () => {
        this.openItemEditModal(item, groupId);
        contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(editItemBtn);

    const deleteItemBtn = document.createElement('div');
    deleteItemBtn.innerHTML = '<i class="fas fa-trash-alt"></i> 刪除物件';
    deleteItemBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete item "${item.name}"?`)) {
            this.deleteItem(item.id, groupId);
        }
        contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(deleteItemBtn);

    itemElement.appendChild(contextMenu);

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.activeContextMenu) {
            this.activeContextMenu.style.display = 'none';
        }
        contextMenu.style.display = 'block';
        this.activeContextMenu = contextMenu;
    });

    return itemElement;
  }

  openItemEditModal(item, groupId) {
    const modal = document.getElementById('item-edit-modal');
    modal.style.display = 'block';

    const widthInput = document.getElementById('item-width-input');
    const heightInput = document.getElementById('item-height-input');
    const depthInput = document.getElementById('item-depth-input');

    const widthValueSpan = document.getElementById('item-width-value');
    const heightValueSpan = document.getElementById('item-height-value');
    const depthValueSpan = document.getElementById('item-depth-value');

    const minVal = 0.1;
    const maxVal = 10.0;
    const stepVal = 0.1;

    widthInput.min = minVal;
    widthInput.max = maxVal;
    widthInput.step = stepVal;
    heightInput.min = minVal;
    heightInput.max = maxVal;
    heightInput.step = stepVal;
    depthInput.min = minVal;
    depthInput.max = maxVal;
    depthInput.step = stepVal;

    widthInput.value = item.width || widthInput.min;
    heightInput.value = item.height || heightInput.min;
    depthInput.value = item.depth || depthInput.min;

    widthValueSpan.textContent = parseFloat(widthInput.value).toFixed(1);
    heightValueSpan.textContent = parseFloat(heightInput.value).toFixed(1);
    depthValueSpan.textContent = parseFloat(depthInput.value).toFixed(1);

    const updateSliderValue = (input, span) => {
        span.textContent = parseFloat(input.value).toFixed(1);
    };

    const widthChangeListener = () => updateSliderValue(widthInput, widthValueSpan);
    const heightChangeListener = () => updateSliderValue(heightInput, heightValueSpan);
    const depthChangeListener = () => updateSliderValue(depthInput, depthValueSpan);

    widthInput.addEventListener('input', widthChangeListener);
    heightInput.addEventListener('input', heightChangeListener);
    depthInput.addEventListener('input', depthChangeListener);

    const saveBtn = document.getElementById('save-item-btn');
    const cancelBtn = document.getElementById('cancel-edit-item-btn');

    const saveHandler = () => {
        const itemData = {
            width: parseFloat(widthInput.value),
            height: parseFloat(heightInput.value),
            depth: parseFloat(depthInput.value)
        };
        this.updateItemDimensions(item.id, itemData, groupId);
        closeModal();
    };

    const closeModal = () => {
        modal.style.display = 'none';
        saveBtn.removeEventListener('click', saveHandler);
        cancelBtn.removeEventListener('click', closeModal);
        widthInput.removeEventListener('input', widthChangeListener);
        heightInput.removeEventListener('input', heightChangeListener);
        depthInput.removeEventListener('input', depthChangeListener);
    };

    saveBtn.addEventListener('click', saveHandler);
    cancelBtn.addEventListener('click', closeModal);
  }

  async deleteItem(itemId, groupId) {
    try {
        await api.deleteItem(itemId);
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            group.items = group.items.filter(i => i.id !== itemId);
            this.renderList();
            this.showToast('物件已成功刪除！', 'success');
        }
    } catch (error) {
        console.error(`❌ Failed to delete item ${itemId}:`, error);
        alert(`刪除物件失敗: ${error.message}`);
        this.showToast(`刪除物件失敗: ${error.message}`, 'error');
    }
  }

  async updateItemStatus(itemId, newStatus, groupId) {
    try {
        if (typeof itemId === 'undefined') {
            console.error('updateItemStatus called with undefined itemId.');
            alert('無法更新狀態：物品 ID 未定義。');
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

                updateObjectOpacity(this.scene, itemId, newStatus);
            }
        }
    } catch (error) {
        console.error(`❌ Failed to update status for item ${itemId}:`, error);
        alert(`更新物件狀態失敗: ${error.message}`);
    }
  }

  async updateItemDimensions(itemId, itemData, groupId) {
    try {
        const updatedItem = await api.updateInventoryItem(itemId, itemData);
        const group = this.groups.find(g => g.id === groupId);
        if (group) {
            const itemIndex = group.items.findIndex(i => i.id === itemId);
            if (itemIndex !== -1) {
                group.items[itemIndex] = updatedItem;
            }
            this.renderList();
            this.showToast('物件尺寸已成功更新！', 'success');
        }
    } catch (error) {
        console.error(`❌ Failed to update dimensions for item ${itemId}:`, error);
        alert(`更新物件尺寸失敗: ${error.message}`);
        this.showToast(`更新物件尺寸失敗: ${error.message}`, 'error');
    }
  }

  async addItemToGroup(groupId, itemData, tempId) {
      try {
          const addedItem = await api.addInventoryItem(itemData);

          if (!addedItem.type) {
              addedItem.type = "cube";
          }

          const group = this.groups.find(g => g.id === groupId);
          if (group) {
              const itemIndex = group.items.findIndex(i => i.id === tempId);
              if (itemIndex !== -1) {
                  group.items[itemIndex] = addedItem;
              }
              this.renderList();
              // Get all groups to pass for color mapping
              const allGroups = await api.getGroups();
              addObject(this.scene, addedItem, allGroups);
              this.showToast('物件已成功新增！', 'success');
          }
      } catch (error) {
          console.error(`❌ Failed to add item to group ${groupId}:`, error);
          alert(`新增物件到群組失敗: ${error.message}`);
          this.showToast(`新增物件到群組失敗: ${error.message}`, 'error');
      }
  }

  showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      const body = document.querySelector('body');
      const newToastContainer = document.createElement('div');
      newToastContainer.id = 'toast-container';
      newToastContainer.style.position = 'fixed';
      newToastContainer.style.bottom = '20px';
      newToastContainer.style.left = '50%';
      newToastContainer.style.transform = 'translateX(-50%)';
      newToastContainer.style.zIndex = '1000';
      newToastContainer.style.display = 'flex';
      newToastContainer.style.flexDirection = 'column';
      newToastContainer.style.alignItems = 'center';
      newToastContainer.style.gap = '10px';
      body.appendChild(newToastContainer);
      toastContainer = newToastContainer;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.backgroundColor = '#333';
    toast.style.color = 'white';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease-in-out';

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
    }, 100);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
  }
}

export function initFlowEditor(sceneRefs, packingManager, groupManager) {
    
    const flowEditor = new FlowEditor(packingManager); // Passed packingManager

    console.log("Flow Editor (Group Manager & Flow UI) initialized.");
}
