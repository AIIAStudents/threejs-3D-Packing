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

    if (this.itemsContainer) {
      this.itemsContainer.style.display = 'flex';
      this.itemsContainer.style.flexDirection = 'row';
      this.itemsContainer.style.flexWrap = 'wrap';
      this.itemsContainer.style.alignContent = 'flex-start';
      this.itemsContainer.style.gap = '15px';
      this.itemsContainer.style.padding = '10px';
      this.itemsContainer.style.overflowY = 'auto';
    }

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
      this.zoneSelect.innerHTML = '<option value="">Failed to load zones</option>';
    }
  },

  renderZoneSelector() {
    const zoneOptions = assignSequenceService.buildZoneSelectorState(this.zones);
    this.zoneSelect.innerHTML = '<option value="">Select a zone...</option>' +
      zoneOptions.map((zone) => `<option value="${zone.value}">${zone.label}</option>`).join('');
  },

  async onZoneChange() {
    this.currentZoneId = this.zoneSelect.value;

    if (!this.currentZoneId) {
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>Select a zone to view its sequence.</p></div>';
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
      this.itemsContainer.innerHTML = '<div class="empty-state"><p>No items are assigned to this zone.</p></div>';
      this.itemCount.textContent = '0 items';
      return;
    }

    this.itemCount.textContent = `${sequenceViewState.itemCount} items`;

    this.itemsContainer.innerHTML = sequenceViewState.itemCards.map((item) => `
      <div class="sortable-item"
           draggable="true"
           data-item-id="${item.id}"
           data-group-id="${item.groupId}"
           data-index="${item.orderLabel - 1}"
           style="
             width: calc(25% - 12px);
             min-width: 220px;
             height: 80px;
             border-left: 5px solid ${item.groupColor};
             display: flex;
             flex-direction: row;
             align-items: center;
             padding: 10px;
             box-sizing: border-box;
           ">
        <span class="drag-handle" style="margin-right: 10px;">::</span>
        <div class="item-order" style="margin-right: 15px;">${item.orderLabel}</div>
        <div class="item-details" style="flex: 1; overflow: hidden;">
          <div class="item-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.itemId}</div>
          <div class="item-dims" style="font-size: 0.8rem;">L x W x H: ${item.dimensionText}</div>
          <div class="item-group" style="font-size: 0.8rem;">
            <span class="group-dot" style="background-color: ${item.groupColor}; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px;"></span>
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
