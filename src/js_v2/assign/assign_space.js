/* assign_space.js - Drag-and-drop space assignment with database save */

export const AssignSpacePage = {
  API_BASE: 'http://127.0.0.1:8888/api',

  state: {
    groups: [],
    zones: [],
    assignments: {}, // zone_id -> array of group_ids
    draggedGroupId: null
  },

  async init() {
    console.log('Initializing AssignSpacePage...');

    this.zonesList = document.getElementById('zones-list');
    this.groupsPool = document.getElementById('groups-pool');
    this.saveBtn = document.getElementById('save-changes-btn');
    this.nextBtn = document.getElementById('next-step-btn');

    if (!this.zonesList || !this.groupsPool) {
      console.error('Required DOM elements not found');
      return;
    }

    // Event listeners for buttons
    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());
    this.nextBtn?.addEventListener('click', () => this.handleNextStep());

    // Load data
    await this.loadGroups();
    await this.loadZones();

    this.render();
  },

  async loadGroups() {
    try {
      const response = await fetch(`${this.API_BASE}/groups`);
      if (response.ok) {
        this.state.groups = await response.json();
        console.log('Loaded groups:', this.state.groups);
      } else {
        throw new Error('Failed to load groups');
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      // Fallback to mock data
      this.state.groups = [
        { id: 1, name: '群組 A', color: '#667eea' },
        { id: 2, name: '群組 B', color: '#764ba2' }
      ];
    }
  },

  async loadZones() {
    try {
      const response = await fetch(`${this.API_BASE}/zones`);
      if (response.ok) {
        this.state.zones = await response.json();
        console.log('Loaded zones:', this.state.zones);

        // Initialize assignments for each zone
        this.state.zones.forEach(zone => {
          if (!this.state.assignments[zone.id]) {
            this.state.assignments[zone.id] = [];
          }
        });
      } else {
        throw new Error('Failed to load zones');
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      // Show empty state
      this.state.zones = [];
    }
  },

  render() {
    this.renderZones();
    this.renderGroups();
  },

  renderZones() {
    if (this.state.zones.length === 0) {
      this.zonesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">尚無切割區域</div>
          <div class="empty-state-hint">請先完成「切割容器」步驟</div>
        </div>
      `;
      return;
    }

    this.zonesList.innerHTML = '';

    this.state.zones.forEach(zone => {
      const zoneCard = document.createElement('div');
      zoneCard.className = 'zone-card';
      zoneCard.dataset.zoneId = zone.id;

      // Calculate stats
      const assignedGroups = this.state.assignments[zone.id] || [];
      const totalVolume = zone.length * zone.width * zone.height;

      // Build assigned groups HTML
      let assignedHTML = '';
      assignedGroups.forEach(groupId => {
        const group = this.state.groups.find(g => g.id == groupId);
        if (group) {
          assignedHTML += `
            <div class="assigned-group">
              <span>${group.name}</span>
              <span class="remove-btn" data-group-id="${groupId}" data-zone-id="${zone.id}">×</span>
            </div>
          `;
        }
      });

      zoneCard.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-title">區域 ${zone.label}</div>
          <div class="zone-stats">
            <div class="zone-stat">
              <span>📏</span>
              <span>${zone.length} × ${zone.width} × ${zone.height}</span>
            </div>
            <div class="zone-stat">
              <span>📦</span>
              <span>體積: ${totalVolume.toLocaleString()}</span>
            </div>
            <div class="zone-stat">
              <span>👥</span>
              <span>已分配: ${assignedGroups.length}</span>
            </div>
          </div>
        </div>
        <div class="zone-content" data-zone-id="${zone.id}">
          ${assignedHTML}
        </div>
      `;

      // Drag and drop events
      const zoneContent = zoneCard.querySelector('.zone-content');
      zoneContent.addEventListener('dragover', (e) => this.handleDragOver(e, zone.id));
      zoneContent.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      zoneContent.addEventListener('drop', (e) => this.handleDrop(e, zone.id));

      // Remove button events
      zoneCard.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const groupId = parseInt(e.target.dataset.groupId);
          const zoneId = parseInt(e.target.dataset.zoneId);
          this.unassignGroup(groupId, zoneId);
        });
      });

      this.zonesList.appendChild(zoneCard);
    });
  },

  renderGroups() {
    if (this.state.groups.length === 0) {
      this.groupsPool.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">尚無群組</div>
          <div class="empty-state-hint">請先完成「新增群組」步驟</div>
        </div>
      `;
      return;
    }

    this.groupsPool.innerHTML = '';

    this.state.groups.forEach(group => {
      const isAssigned = this.isGroupAssigned(group.id);

      const groupCard = document.createElement('div');
      groupCard.className = `group-card ${isAssigned ? 'assigned' : ''}`;
      groupCard.draggable = !isAssigned;
      groupCard.dataset.groupId = group.id;

      // Count items in this group (would need API call in real implementation)
      const itemCount = '?'; // Placeholder

      groupCard.innerHTML = `
        <div class="group-name">${group.name}</div>
        <div class="group-info">
          <span>📦 物件數: ${itemCount}</span>
          ${isAssigned ? '<span>✓ 已分配</span>' : '<span>← 拖曳分配</span>'}
        </div>
      `;

      if (!isAssigned) {
        groupCard.addEventListener('dragstart', (e) => this.handleDragStart(e, group.id));
        groupCard.addEventListener('dragend', (e) => this.handleDragEnd(e));
      }

      this.groupsPool.appendChild(groupCard);
    });
  },

  // Drag and Drop Handlers
  handleDragStart(e, groupId) {
    this.state.draggedGroupId = groupId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', groupId);
  },

  handleDragEnd(e) {
    e.target.classList.remove('dragging');
  },

  handleDragOver(e, zoneId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const zoneCard = e.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.add('drag-over');
    }
  },

  handleDragLeave(e) {
    const zoneCard = e.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.remove('drag-over');
    }
  },

  handleDrop(e, zoneId) {
    e.preventDefault();
    const zoneCard = e.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.remove('drag-over');
    }

    const groupId = parseInt(e.dataTransfer.getData('text/plain'));
    if (!groupId || this.isGroupAssigned(groupId)) {
      return;
    }

    // Add to assignments
    if (!this.state.assignments[zoneId]) {
      this.state.assignments[zoneId] = [];
    }
    this.state.assignments[zoneId].push(groupId);

    console.log('Assigned group', groupId, 'to zone', zoneId);
    this.render();
  },

  unassignGroup(groupId, zoneId) {
    if (this.state.assignments[zoneId]) {
      this.state.assignments[zoneId] = this.state.assignments[zoneId].filter(id => id !== groupId);
      console.log('Unassigned group', groupId, 'from zone', zoneId);
      this.render();
    }
  },

  isGroupAssigned(groupId) {
    for (const zoneId in this.state.assignments) {
      if (this.state.assignments[zoneId].includes(groupId)) {
        return true;
      }
    }
    return false;
  },

  // Save and Navigation
  async handleSaveChanges() {
    try {
      console.log('Saving assignments:', this.state.assignments);

      const response = await fetch(`${this.API_BASE}/zone-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: this.state.assignments })
      });

      if (!response.ok) {
        throw new Error('Failed to save assignments');
      }

      const result = await response.json();
      console.log('Save result:', result);

      // Show Success Modal
      const modal = document.getElementById('success-modal');
      const successTitle = modal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (modal && okBtn) {
        successTitle.textContent = '更新成功';
        modal.classList.add('active');

        const handleOk = () => {
          modal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('✓ 分配已儲存成功！');
      }

    } catch (error) {
      console.error('Error saving assignments:', error);
      alert('❌ 儲存失敗：' + error.message);
    }
  },

  async handleNextStep() {
    // Just navigate to next step, don't save
    window.location.hash = '/src/html/assign_sequence.html';
  }
};
