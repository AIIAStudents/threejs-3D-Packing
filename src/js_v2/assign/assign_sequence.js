/*
    File: assign_sequence.js
    Description: Logic for the item reordering page, connected to the backend API.
*/

export const AssignSequencePage = {
    // --- STATE ---
    state: {
        // Data passed from previous view or fetched from API
        spaces: [],
        masterGroups: [],
        masterItems: [],
        assignments: {}, // Format: { zoneId: [groupId1, ...], ... }

        // View-specific state
        currentSpaceId: null,
        selectedItemId: null,
        draggedItemId: null,
        items: [], // The list of items currently being displayed and ordered
        initialItemsSnapshot: [],
        isOrderDirty: false,
    },

    // --- CONSTANTS ---
    API_BASE_URL: "http://127.0.0.1:8888",

    // --- DOM ELEMENTS ---
    elements: {
        spaceSelect: null,
        itemsBoard: null,
        executeBtn: null,
        moveUpBtn: null,
        moveDownBtn: null,
        cancelAllBtn: null,
        confirmAllBtn: null,
        toolbarColumn: null,
    },

    // --- INITIALIZATION ---
    async init() {
        this.bindDOM();
        this.addEventListeners();
        await this.loadDataFromSessionOrApi(); // Load all necessary data
        this.populateSpacesDropdown(); // Then populate the dropdown
    },

    bindDOM() {
        this.elements.spaceSelect = document.getElementById('space-select');
        this.elements.itemsBoard = document.getElementById('items-board');
        this.elements.executeBtn = document.getElementById('execute-btn');
        this.elements.moveUpBtn = document.getElementById('move-up-btn');
        this.elements.moveDownBtn = document.getElementById('move-down-btn');
        this.elements.cancelAllBtn = document.getElementById('cancel-all-btn');
        this.elements.confirmAllBtn = document.getElementById('confirm-all-btn');
        this.elements.toolbarColumn = document.querySelector('.toolbar-column');
    },

    addEventListeners() {
        this.elements.spaceSelect.addEventListener('change', (e) => this.onSpaceSelected(e.target.value));
        this.elements.executeBtn.addEventListener('click', () => this.handleExecute());
        this.elements.moveUpBtn.addEventListener('click', () => this.handleMove('up'));
        this.elements.moveDownBtn.addEventListener('click', () => this.handleMove('down'));
        this.elements.cancelAllBtn.addEventListener('click', () => this.handleCancel());
        this.elements.confirmAllBtn.addEventListener('click', () => this.handleConfirm());
        this.elements.itemsBoard.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.itemsBoard.addEventListener('drop', (e) => this.handleDrop(e));
    },

    // --- DATA LOADING ---
    async loadDataFromSessionOrApi() {
        const sessionSpaces = sessionStorage.getItem('assignedZones');
        const sessionAssignments = sessionStorage.getItem('spaceAssignments');
        const sessionItems = sessionStorage.getItem('masterItems');
        const sessionGroups = sessionStorage.getItem('masterGroups');

        if (sessionSpaces && sessionAssignments && sessionItems && sessionGroups) {
            console.log("Loading all data from sessionStorage.");
            this.state.spaces = JSON.parse(sessionSpaces);
            this.state.assignments = JSON.parse(sessionAssignments);
            this.state.masterItems = JSON.parse(sessionItems);
            this.state.masterGroups = JSON.parse(sessionGroups);
            
            // Clean up sessionStorage after use
            sessionStorage.removeItem('assignedZones');
            sessionStorage.removeItem('spaceAssignments');
            sessionStorage.removeItem('masterItems');
            sessionStorage.removeItem('masterGroups');
        } else {
            console.log("Fetching all data from API as fallback.");
            try {
                const response = await fetch(`${this.API_BASE_URL}/api/assignment-data`);
                if (!response.ok) throw new Error(`API error: ${response.statusText}`);
                const data = await response.json();
                
                this.state.masterItems = data.items || [];
                this.state.masterGroups = data.groups || [];
                
                // Reconstruct spaces and assignments from the API data
                this.state.spaces = (data.zones || []).filter(z => z.assigned_group_ids && z.assigned_group_ids.length > 0);
                this.state.assignments = {};
                (data.zones || []).forEach(zone => {
                    this.state.assignments[zone.id] = zone.assigned_group_ids ? String(zone.assigned_group_ids).split(',').map(Number) : [];
                });

            } catch (error) {
                console.error("Failed to load data from API:", error);
                this.elements.spaceSelect.innerHTML = '<option value="" disabled>載入資料失敗</option>';
            }
        }
    },

    populateSpacesDropdown() {
        const select = this.elements.spaceSelect;
        select.innerHTML = '';

        if (!this.state.spaces || this.state.spaces.length === 0) {
            select.innerHTML = '<option value="" disabled selected>目前沒有已分配的空間</option>';
            this.onSpaceSelected(null); // Ensure board is cleared
            return;
        }

        select.innerHTML = '<option value="">請選擇一個空間...</option>';
        this.state.spaces.forEach(space => {
            const option = document.createElement('option');
            option.value = space.id;
            option.textContent = `空間 ${space.label}`;
            select.appendChild(option);
        });
    },

    onSpaceSelected(spaceId) {
        this.state.currentSpaceId = spaceId ? parseInt(spaceId, 10) : null;
        this.state.selectedItemId = null; // Reset selection

        if (this.state.currentSpaceId) {
            this.elements.toolbarColumn.classList.add('visible');
            
            const assignedGroupIds = new Set(this.state.assignments[this.state.currentSpaceId] || []);
            const itemsForSpace = this.state.masterItems.filter(item => assignedGroupIds.has(item.group_id));
            
            this.state.items = itemsForSpace.sort((a, b) => (a.item_order ?? Infinity) - (b.item_order ?? Infinity));
            this.state.initialItemsSnapshot = JSON.parse(JSON.stringify(this.state.items));
            this.state.isOrderDirty = false;
        } else {
            this.elements.toolbarColumn.classList.remove('visible');
            this.state.items = [];
            this.state.initialItemsSnapshot = [];
        }
        
        this.renderItemsBoard();
    },

    // --- RENDERING ---
    renderItemsBoard() {
        const board = this.elements.itemsBoard;
        board.innerHTML = '';

        if (!this.state.currentSpaceId) {
            board.innerHTML = `<div class="item-board-placeholder"><p>請先選擇一個空間以載入物件。</p></div>`;
            return;
        }
        if (this.state.items.length === 0) {
            board.innerHTML = `<div class="item-board-placeholder"><p>此空間沒有已分配的物件。</p></div>`;
            return;
        }

        const groupColorMap = new Map();
        let colorIndex = 1;

        this.state.items.forEach(item => {
            const groupInfo = this.state.masterGroups.find(g => g.id === item.group_id) || { name: '未知群組' };
            
            if (!groupColorMap.has(item.group_id)) {
                groupColorMap.set(item.group_id, `group-color-${colorIndex}`);
                colorIndex = (colorIndex % 5) + 1;
            }

            const card = document.createElement('div');
            card.className = `item-card ${groupColorMap.get(item.group_id)}`;
            if (item.id === this.state.selectedItemId) {
                card.classList.add('selected');
            }
            card.dataset.itemId = item.id;
            card.draggable = true;

            card.innerHTML = `
                <div class="item-card-details">
                    <span class="item-card-title">${groupInfo.name} - 編號 ${item.id}</span>
                    <span class="item-dimensions">(${item.length} x ${item.width} x ${item.height})</span>
                    <span class="item-note">備註：${item.note || '—'}</span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                this.state.selectedItemId = item.id;
                this.renderItemsBoard();
            });
            card.addEventListener('dragstart', (e) => this.handleDragStart(e, item.id));
            card.addEventListener('dragend', (e) => this.handleDragEnd(e));

            board.appendChild(card);
        });
    },

    // --- EVENT HANDLERS (Unchanged from previous step, can be collapsed in thought) ---
    handleDragStart(e, itemId) {
        this.state.draggedItemId = itemId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', itemId); 
        setTimeout(() => e.target.classList.add('dragging'), 0);
    },
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.state.draggedItemId = null;
    },
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    },
    handleDrop(e) {
        e.preventDefault();
        const draggedId = this.state.draggedItemId;
        if (draggedId === null) return;
        const targetCard = e.target.closest('.item-card');
        const items = this.state.items;
        const draggedIndex = items.findIndex(item => item.id === draggedId);
        if(draggedIndex === -1) return;
        const draggedItem = items[draggedIndex];
        items.splice(draggedIndex, 1);
        if (targetCard) {
            const targetId = parseInt(targetCard.dataset.itemId);
            const targetIndex = items.findIndex(item => item.id === targetId);
            items.splice(targetIndex, 0, draggedItem);
        } else {
            items.push(draggedItem);
        }
        this.state.isOrderDirty = true;
        this.renderItemsBoard();
    },
    handleMove(direction) {
        const { items, selectedItemId } = this.state;
        if (selectedItemId === null) {
            alert('請先點選一個物件。');
            return;
        }
        const index = items.findIndex(item => item.id === selectedItemId);
        if (index === -1) return;
        if (direction === 'up' && index > 0) {
            [items[index - 1], items[index]] = [items[index], items[index - 1]];
        } else if (direction === 'down' && index < items.length - 1) {
            [items[index], items[index + 1]] = [items[index + 1], items[index]];
        } else {
            return;
        }
        this.state.isOrderDirty = true;
        this.renderItemsBoard();
    },
    handleCancel() {
        if (!this.state.isOrderDirty) {
            alert('順序未變更。');
            return;
        }
        if (confirm('您確定要取消所有順序變更嗎？')) {
            this.state.items = JSON.parse(JSON.stringify(this.state.initialItemsSnapshot));
            this.state.isOrderDirty = false;
            this.state.selectedItemId = null;
            alert('已恢復原本順序。');
            this.renderItemsBoard();
        }
    },
    async handleConfirm() {
        if (!this.state.isOrderDirty) {
            alert('順序未變更，無需儲存。');
            return;
        }
        this.state.items.forEach((item, index) => item.order = index + 1);
        const payload = {
            sequence: this.state.items.map(item => ({
                item_id: item.id,
                order: item.order
            }))
        };
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sequence/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || '儲存順序時發生 API 錯誤。');
            }
            this.state.initialItemsSnapshot = JSON.parse(JSON.stringify(this.state.items));
            this.state.isOrderDirty = false;
            alert('順序已成功儲存！');
            this.renderItemsBoard();
        } catch (error) {
            console.error('Failed to save sequence:', error);
            alert(`儲存失敗: ${error.message}`);
        }
    },
    handleExecute() {
        if (this.state.isOrderDirty) {
            if (confirm("您有尚未儲存的順序變更，確定要直接執行嗎？")) {
                window.location.href = './view.html';
            }
        } else if (!this.state.currentSpaceId) {
             alert('請先選擇一個空間。');
        } else {
            window.location.href = './view.html';
        }
    }
};