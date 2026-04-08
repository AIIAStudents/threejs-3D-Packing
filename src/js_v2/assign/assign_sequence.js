import { assignSequenceService } from '../../frontend/contexts/packing/application/assign-sequence-service.js';

export const AssignSequencePage = {
  zones: [],
  items: [],
  groups: [],
  currentZoneId: null,
  draggedItemIndex: null,
  draggedGroupId: null,

  async init() {
    this.zoneSelect = document.getElementById('zone-select');
    this.itemsContainer = document.getElementById('items-container');
    this.itemCount = document.getElementById('item-count');
    this.btnExecutePacking = document.getElementById('btn-execute-packing');
    this.btnPrev = document.getElementById('btn-prev');

    if (!this.zoneSelect) {
      return;
    }

    this.zoneSelect.addEventListener('change', () => this.onZoneChange());
    this.btnExecutePacking?.addEventListener('click', () => this.executePacking());
    this.btnPrev?.addEventListener('click', () => this.goBack());

    await this.loadData();
  },

  async loadData() {
    try {
      const data = await assignSequenceService.loadData();
      this.zones = data.zones;
      this.items = data.items;
      this.groups = data.groups;
      this.renderZoneSelector();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.zoneSelect.innerHTML = '<option value="">載入區塊失敗</option>';
    }
  },

  renderZoneSelector() {
    const zoneOptions = assignSequenceService.buildZoneSelectorState(this.zones);
    this.zoneSelect.innerHTML = '<option value="">請選擇區塊...</option>' +
      zoneOptions.map((zone) => `<option value="${zone.value}">${zone.label}</option>`).join('');
  },

  async onZoneChange() {
    this.currentZoneId = this.zoneSelect.value;

    if (!this.currentZoneId) {
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>請先選擇區塊，再檢視該區塊的排序結果。</p></div>';
      return;
    }

    await this.loadZoneItems();
  },

  async loadZoneItems() {
    try {
      const sequenceViewState = assignSequenceService.buildSequenceViewState(this.currentZoneId, {
        zones: this.zones,
        items: this.items,
        groups: this.groups
      });

      console.log(`[AssignSequence] Zone ${this.currentZoneId} assigned groups:`, sequenceViewState.groupIds);
      this.renderItems(sequenceViewState);
    } catch (error) {
      console.error('Failed to load zone items:', error);
      this.itemsContainer.innerHTML = `<div class="empty-state"><p>Failed to load items: ${error.message}</p></div>`;
    }
  },

  renderItems(sequenceViewState) {
    if (sequenceViewState.itemCount === 0) {
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>此區塊目前沒有可排序的物件。</p></div>';
      this.itemCount.textContent = '0 件物件';
      return;
    }

    this.itemCount.textContent = `${sequenceViewState.itemCount} 件物件`;

    this.itemsContainer.innerHTML = sequenceViewState.itemCards.map((item) => `
      <div class="sortable-item"
           draggable="true"
           data-item-id="${item.id}"
           data-group-id="${item.groupId}"
           data-index="${item.orderLabel - 1}"
           style="border-left: 5px solid ${item.groupColor}; --group-color: ${item.groupColor};">
        <span class="drag-handle">::</span>
        <div class="item-order">${item.orderLabel}</div>
        <div class="item-details">
          <div class="item-name">${item.itemId}</div>
          <div class="item-dims">L x W x H: ${item.dimensionText}</div>
          <div class="item-group">
            <span class="group-dot"></span>
            ${item.groupName}
          </div>
        </div>
      </div>
    `).join('');

    this.attachDragListeners();
  },

  attachDragListeners() {
    const items = this.itemsContainer.querySelectorAll('.sortable-item');

    items.forEach((item) => {
      item.addEventListener('dragstart', (event) => this.onDragStart(event));
      item.addEventListener('dragover', (event) => this.onDragOver(event));
      item.addEventListener('drop', (event) => this.onDrop(event));
      item.addEventListener('dragend', (event) => this.onDragEnd(event));
    });
  },

  onDragStart(event) {
    const item = event.currentTarget;
    this.draggedItemIndex = parseInt(item.dataset.index, 10);
    this.draggedGroupId = item.dataset.groupId;
    item.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.itemId || '');
  },

  onDragOver(event) {
    event.preventDefault();
    const overItem = event.target.closest('.sortable-item');

    if (overItem && overItem.dataset.groupId !== this.draggedGroupId) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    event.dataTransfer.dropEffect = 'move';
    const afterElement = this.getDragAfterElement(event.clientY, event.clientX);
    const draggingItem = document.querySelector('.dragging');

    if (!draggingItem) {
      return;
    }

    if (afterElement == null) {
      this.itemsContainer.appendChild(draggingItem);
    } else {
      this.itemsContainer.insertBefore(draggingItem, afterElement);
    }
  },

  onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
  },

  onDragEnd(event) {
    const item = event.currentTarget;
    item.classList.remove('dragging');
    this.updateItemOrder();
  },

  getDragAfterElement(y, x) {
    const draggableElements = [
      ...this.itemsContainer.querySelectorAll(`.sortable-item:not(.dragging)[data-group-id="${this.draggedGroupId}"]`)
    ];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offsetX = x - box.left - box.width / 2;
      const offsetY = y - box.top - box.height / 2;

      if (offsetY < 0 && offsetY > closest.offsetY) {
        return { offsetY, offsetX, element: child };
      }
      if (offsetY >= 0 && offsetY < 40 && offsetX < 0 && offsetX > closest.offsetX) {
        return { offsetY, offsetX, element: child };
      }

      return closest;
    }, {
      offsetY: Number.NEGATIVE_INFINITY,
      offsetX: Number.NEGATIVE_INFINITY
    }).element;
  },

  async updateItemOrder() {
    const sortedItems = [...this.itemsContainer.querySelectorAll('.sortable-item')];
    const updates = sortedItems.map((item, index) => ({
      id: parseInt(item.dataset.itemId, 10),
      item_order: index
    }));

    sortedItems.forEach((item, index) => {
      const orderBadge = item.querySelector('.item-order');
      if (orderBadge) {
        orderBadge.textContent = index + 1;
      }
      item.dataset.index = index;
    });

    try {
      await assignSequenceService.saveItemOrder(updates);
    } catch (error) {
      console.error('Failed to save order:', error);
      alert('Failed to save item order.');
    }
  },

  async executePacking() {
    if (!confirm('Execute packing with the current item order?')) {
      return;
    }

    try {
      await assignSequenceService.executePacking();
      alert('Packing executed successfully.');
      window.location.hash = '/view-final';
    } catch (error) {
      console.error('Packing execution error:', error);
      alert(`Packing execution failed: ${error.message}`);
    }
  },

  goBack() {
    window.location.hash = '/assign-space';
  }
};
