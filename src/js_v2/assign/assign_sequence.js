export const AssignSequencePage = {
  API_BASE: 'http://127.0.0.1:8888/api',
  zones: [],
  items: [],
  groups: [],
  currentZoneId: null,
  draggedItemIndex: null,

  async init() {
    console.log('AssignSequencePage init');

    this.zoneSelect = document.getElementById('zone-select');
    this.itemsContainer = document.getElementById('items-container');
    this.itemCount = document.getElementById('item-count');
    this.btnExecutePacking = document.getElementById('btn-execute-packing');
    this.btnPrev = document.getElementById('btn-prev');

    if (!this.zoneSelect) return;

    // Event listeners
    this.zoneSelect.addEventListener('change', () => this.onZoneChange());
    this.btnExecutePacking?.addEventListener('click', () => this.executePacking());
    this.btnPrev?.addEventListener('click', () => this.goBack());

    await this.loadData();
  },

  async loadData() {
    try {
      // Load zones
      const zonesResponse = await fetch(`${this.API_BASE}/zones`);
      this.zones = await zonesResponse.json();

      // Load zone assignments
      const assignmentsResponse = await fetch(`${this.API_BASE}/zone-assignments`);
      const assignments = await assignmentsResponse.json();

      // Load groups
      const groupsResponse = await fetch(`${this.API_BASE}/groups`);
      this.groups = await groupsResponse.json();

      // Load items
      const itemsResponse = await fetch(`${this.API_BASE}/items`);
      this.items = await itemsResponse.json();

      // Build zone selector
      this.renderZoneSelector(assignments);

    } catch (error) {
      console.error('Failed to load data:', error);
      this.zoneSelect.innerHTML = '<option value="">載入失敗</option>';
    }
  },

  renderZoneSelector(assignments) {
    // Find zones that have groups assigned
    const assignedZones = this.zones.filter(zone => {
      return assignments.some(a => a.zone_id === zone.id);
    });

    if (assignedZones.length === 0) {
      this.zoneSelect.innerHTML = '<option value="">尚無已分配的空間</option>';
      return;
    }

    this.zoneSelect.innerHTML = '<option value="">請選擇空間...</option>' +
      assignedZones.map(zone =>
        `<option value="${zone.id}">空間 ${zone.label}</option>`
      ).join('');
  },

  async onZoneChange() {
    this.currentZoneId = parseInt(this.zoneSelect.value);

    if (!this.currentZoneId) {
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>請選擇上方的空間以編輯物件順序</p></div>';
      return;
    }

    await this.loadZoneItems();
  },

  async loadZoneItems() {
    try {
      // Get groups assigned to this zone
      const assignmentsResponse = await fetch(`${this.API_BASE}/zone-assignments`);
      const assignments = await assignmentsResponse.json();

      const zoneAssignments = assignments.filter(a => a.zone_id === this.currentZoneId);
      const groupIds = zoneAssignments.map(a => a.group_id);

      // Get items from those groups
      const zoneItems = this.items
        .filter(item => groupIds.includes(item.group_id))
        .sort((a, b) => (a.item_order || 0) - (b.item_order || 0));

      this.renderItems(zoneItems);

    } catch (error) {
      console.error('Failed to load zone items:', error);
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>載入失敗</p></div>';
    }
  },

  renderItems(items) {
    if (items.length === 0) {
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>此空間尚無物件</p></div>';
      this.itemCount.textContent = '0 個物件';
      return;
    }

    this.itemCount.textContent = `${items.length} 個物件`;

    this.itemsContainer.innerHTML = items.map((item, index) => {
      const group = this.groups.find(g => g.id === item.group_id);
      return `
                <div class="sortable-item" 
                     draggable="true" 
                     data-item-id="${item.id}"
                     data-index="${index}">
                    <span class="drag-handle">☰</span>
                    <div class="item-order">${index + 1}</div>
                    <div class="item-details">
                        <div class="item-name">${item.item_id}</div>
                        <div class="item-dims">L: ${item.length} × W: ${item.width} × H: ${item.height}</div>
                        <div class="item-group">群組: ${group ? group.name : 'N/A'}</div>
                    </div>
                </div>
            `;
    }).join('');

    // Add drag-drop event listeners
    this.attachDragListeners();
  },

  attachDragListeners() {
    const items = this.itemsContainer.querySelectorAll('.sortable-item');

    items.forEach(item => {
      item.addEventListener('dragstart', (e) => this.onDragStart(e));
      item.addEventListener('dragover', (e) => this.onDragOver(e));
      item.addEventListener('drop', (e) => this.onDrop(e));
      item.addEventListener('dragend', (e) => this.onDragEnd(e));
    });
  },

  onDragStart(e) {
    const item = e.currentTarget;
    this.draggedItemIndex = parseInt(item.dataset.index);
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.innerHTML);
  },

  onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const afterElement = this.getDragAfterElement(e.clientY);
    const draggingItem = document.querySelector('.dragging');

    if (afterElement == null) {
      this.itemsContainer.appendChild(draggingItem);
    } else {
      this.itemsContainer.insertBefore(draggingItem, afterElement);
    }
  },

  onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
  },

  onDragEnd(e) {
    const item = e.currentTarget;
    item.classList.remove('dragging');

    // Update order in UI and save
    this.updateItemOrder();
  },

  getDragAfterElement(y) {
    const draggableElements = [...this.itemsContainer.querySelectorAll('.sortable-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  },

  async updateItemOrder() {
    const sortedItems = [...this.itemsContainer.querySelectorAll('.sortable-item')];
    const updates = sortedItems.map((item, index) => ({
      id: parseInt(item.dataset.itemId),
      item_order: index
    }));

    // Update UI immediately
    sortedItems.forEach((item, index) => {
      const orderBadge = item.querySelector('.item-order');
      if (orderBadge) orderBadge.textContent = index + 1;
      item.dataset.index = index;
    });

    // Save to database
    try {
      const response = await fetch(`${this.API_BASE}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates })
      });

      if (!response.ok) {
        throw new Error('Failed to save order');
      }

      console.log('Item order saved successfully');

    } catch (error) {
      console.error('Failed to save order:', error);
      alert('儲存順序失敗，請重試');
    }
  },

  async executePacking() {
    if (!confirm('確定要執行打包嗎？這將根據目前的順序進行最佳化計算。')) {
      return;
    }

    try {
      const response = await fetch(`${this.API_BASE}/sequence/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Packing execution failed');
      }

      const result = await response.json();
      alert('打包完成！');

      // Navigate to results view
      window.dispatchEvent(new CustomEvent('route-change', {
        detail: { path: '/src/html/view_final.html' }
      }));

    } catch (error) {
      console.error('Packing execution error:', error);
      alert('打包執行失敗: ' + error.message);
    }
  },

  goBack() {
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { path: '/src/html/assign_space.html' }
    }));
  }
};
