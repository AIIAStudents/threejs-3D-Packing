/* assign_space.js - Enhanced allocation with capacity checking */

import { CapacityChecker } from './capacity_checker.js';

export const AssignSpacePage = {
  API_BASE: 'http://127.0.0.1:8888/api',

  state: {
    groups: [],
    regions: [],  // Renamed from zones for clarity
    allocations: [],  // Array of allocation records (not simple object)
    draggedGroupId: null,
    validationResult: null,
    efficiencyFactor: 0.85
  },

  async init() {
    console.log('Initializing AssignSpacePage...');

    this.zonesList = document.getElementById('zones-list');
    this.groupsPool = document.getElementById('groups-pool');
    this.saveBtn = document.getElementById('save-changes-btn');
    this.nextBtn = document.getElementById('next-step-btn');

    // Modal elements
    this.allocationModal = document.getElementById('allocation-modal');
    this.allocationForm = document.getElementById('allocation-form');
    this.allocationModeSelect = document.getElementById('allocation-mode');
    this.percentageInput = document.getElementById('percentage-input');
    this.priorityInput = document.getElementById('priority-input');

    if (!this.zonesList || !this.groupsPool) {
      console.error('Required DOM elements not found');
      return;
    }

    // Event listeners for buttons
    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());
    this.nextBtn?.addEventListener('click', () => this.handleNextStep());

    // Modal event listeners
    this.setupModalListeners();

    // Load data
    await this.loadGroups();
    await this.loadZones();

    this.render();

    // Expose to window for HTML onclick handlers
    window.AssignSpace = this;
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
      // First, try to load regions with subdivisions from secondary editor
      const regionsWithSubdivisions = localStorage.getItem('usableRegionsWithSubdivisions');

      if (regionsWithSubdivisions) {
        const regions = JSON.parse(regionsWithSubdivisions);
        console.log('[AssignSpace] Loaded regions with subdivisions:', regions);

        // Flatten: use child regions if they exist, otherwise use parent
        this.state.regions = regions.flatMap(region => {
          if (region.has_subdivisions && region.child_regions && region.child_regions.length > 0) {
            console.log(`[AssignSpace] Using ${region.child_regions.length} child regions for ${region.id}`);
            return region.child_regions;
          }
          return [region];
        });

        console.log('[AssignSpace] Total allocatable regions:', this.state.regions.length);

        // Initialize assignments
        this.state.assignments = {};
        this.state.regions.forEach(region => {
          this.state.assignments[region.id] = [];
        });
        return;
      }

      // Fallback: try usableRegions (legacy)
      const storedRegions = localStorage.getItem('usableRegions');
      if (storedRegions) {
        this.state.regions = JSON.parse(storedRegions);
        console.log('[AssignSpace] Loaded regions from usableRegions:', this.state.regions);

        // Initialize assignments
        this.state.assignments = {};
        this.state.regions.forEach(region => {
          this.state.assignments[region.id] = [];
        });
        return;
      }

      // Fallback: try generatedZones
      const storedZones = localStorage.getItem('generatedZones');
      if (storedZones) {
        const allZones = JSON.parse(storedZones);
        this.state.regions = allZones.filter(zone => zone.type === 'usable');
        console.log('[AssignSpace] Loaded regions from generatedZones:', this.state.regions);

        // Initialize assignments
        this.state.assignments = {};
        this.state.regions.forEach(region => {
          this.state.assignments[region.id] = [];
        });
        return;
      }

      // No regions found
      console.warn('[AssignSpace] No regions found in localStorage');
      this.state.regions = [];
      this.state.assignments = {};

    } catch (error) {
      console.error('Error loading regions:', error);
      this.state.regions = [];
      this.state.assignments = {};
    }
  },

  render() {
    this.renderZones();
    this.renderGroups();
  },

  renderZones() {
    if (!this.state.regions || this.state.regions.length === 0) {
      this.zonesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">尚無切割區域</div>
          <div class="empty-state-hint">請先完成「空間規劃」步驟</div>
        </div>
      `;
      return;
    }

    this.zonesList.innerHTML = '';

    this.state.regions.forEach(region => {
      const zoneCard = document.createElement('div');
      zoneCard.className = 'zone-card';
      zoneCard.dataset.zoneId = region.id;

      // Calculate stats (temporary: still using assignments for compatibility)
      const assignedGroups = this.state.assignments?.[region.id] || [];

      // Use metrics if available, otherwise fallback to legacy format
      const metrics = region.metrics || {};
      const area_m2 = metrics.area_m2 || ((region.width * region.height) / 1000000);
      const volume_m3 = metrics.volume_mm3 ? (metrics.volume_mm3 / 1e9) : ((region.width * region.height * region.depth) / 1e9);

      // Build assigned groups HTML
      let assignedHTML = '';
      assignedGroups.forEach(groupId => {
        const group = this.state.groups.find(g => g.id == groupId);
        if (group) {
          assignedHTML += `
            <div class="assigned-group">
              <span>${group.name}</span>
              <span class="remove-btn" data-group-id="${groupId}" data-zone-id="${region.id}">×</span>
            </div>
          `;
        }
      });

      zoneCard.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-title">${region.name || region.label || `區域 ${region.id}`}</div>
          <div class="zone-stats">
            <div class="zone-stat">
              <span>📏</span>
              <span>${area_m2.toFixed(2)} m²</span>
            </div>
            <div class="zone-stat">
              <span>📦</span>
              <span>體積: ${volume_m3.toFixed(2)} m³</span>
            </div>
            <div class="zone-stat">
              <span>👥</span>
              <span>已分配: ${assignedGroups.length}</span>
            </div>
          </div>
        </div>
        <div class="zone-content" data-zone-id="${region.id}">
          ${assignedHTML || '<div class="empty-hint">拖曳群組到此處</div>'}
        </div>
      `;

      // Drag and drop events
      const zoneContent = zoneCard.querySelector('.zone-content');
      zoneContent.addEventListener('dragover', (e) => this.handleDragOver(e, region.id));
      zoneContent.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      zoneContent.addEventListener('drop', (e) => this.handleDrop(e, region.id));

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

  handleDrop(e, regionId) {
    e.preventDefault();
    const zoneCard = e.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.remove('drag-over');
    }

    const groupId = parseInt(e.dataTransfer.getData('text/plain'));
    if (!groupId || this.isGroupAssigned(groupId)) {
      return;
    }

    // Open allocation modal instead of direct assignment
    this.openAllocationModal(groupId, regionId);
  },

  // Modal Management
  setupModalListeners() {
    // Mode change listener
    this.allocationModeSelect?.addEventListener('change', (e) => {
      this.handleModeChange(e.target.value);
    });

    // Form submit
    this.allocationForm?.addEventListener('submit', (e) => {
      this.submitAllocation(e);
    });

    // Close on overlay click
    this.allocationModal?.addEventListener('click', (e) => {
      if (e.target === this.allocationModal) {
        this.closeAllocationModal();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.allocationModal?.classList.contains('active')) {
        this.closeAllocationModal();
      }
    });
  },

  openAllocationModal(groupId, regionId) {
    // Store pending allocation
    this.pendingAllocation = { groupId, regionId };

    // Get group and region info
    const group = this.state.groups.find(g => g.id == groupId);
    const region = this.state.regions.find(r => r.id == regionId);

    if (!group || !region) {
      console.error('Group or region not found');
      return;
    }

    console.log(`[AssignSpace] Opening allocation modal for group ${group.name} to region ${region.name || region.id}`);

    // Reset form
    this.allocationForm?.reset();
    this.handleModeChange('shared'); // Default mode

    // Show modal
    this.allocationModal?.classList.add('active');
  },

  closeAllocationModal() {
    this.allocationModal?.classList.remove('active');
    this.pendingAllocation = null;
    this.allocationForm?.reset();
  },

  handleModeChange(mode) {
    // Show/hide conditional inputs
    if (mode === 'percentage') {
      this.percentageInput.style.display = 'block';
      this.priorityInput.style.display = 'none';

      // Add input listener for real-time preview
      const percentInput = document.getElementById('allocation-percentage');
      if (percentInput && !percentInput.dataset.listenerAdded) {
        percentInput.addEventListener('input', () => this.updateCapacityPreview());
        percentInput.dataset.listenerAdded = 'true';
      }
    } else if (mode === 'priority_queue') {
      this.percentageInput.style.display = 'none';
      this.priorityInput.style.display = 'block';
    } else {
      this.percentageInput.style.display = 'none';
      this.priorityInput.style.display = 'none';
    }

    // Update preview when mode changes
    this.updateCapacityPreview();
  },

  updateCapacityPreview() {
    if (!this.pendingAllocation) return;

    const { groupId, regionId } = this.pendingAllocation;
    const mode = this.allocationModeSelect?.value || 'shared';
    const percentageValue = document.getElementById('allocation-percentage')?.value;

    // Build temp allocation
    const tempAllocation = {
      allocation_id: `preview_${Date.now()}`,
      region_id: regionId,
      group_id: groupId,
      allocation_mode: mode,
      amount: {},
      notes: ''
    };

    if (mode === 'percentage' && percentageValue) {
      tempAllocation.amount.percent_of_region = parseFloat(percentageValue) / 100;
    }

    // Build temp allocations array
    const tempAllocations = [];
    for (const rId in this.state.assignments) {
      this.state.assignments[rId].forEach(gId => {
        tempAllocations.push({
          allocation_id: `existing_${rId}_${gId}`,
          region_id: rId,
          group_id: gId,
          allocation_mode: 'shared',
          amount: {},
          notes: ''
        });
      });
    }
    tempAllocations.push(tempAllocation);

    // Run validation
    const validation = CapacityChecker.validate(
      this.state.regions,
      this.state.groups,
      tempAllocations,
      { efficiency_factor: this.state.efficiencyFactor }
    );

    // Show preview
    const previewDiv = document.getElementById('capacity-preview');
    const previewContent = document.getElementById('capacity-preview-content');

    if (!previewDiv || !previewContent) return;

    const region = this.state.regions.find(r => r.id == regionId);
    const regionResult = validation.per_region[regionId];

    if (!regionResult || regionResult.status === 'ok') {
      previewDiv.style.display = 'none';
      return;
    }

    // Show preview with status
    previewDiv.style.display = 'block';
    previewDiv.className = 'capacity-preview';

    if (regionResult.status === 'error') {
      previewDiv.classList.add('preview-error');
    } else if (regionResult.status === 'warning') {
      previewDiv.classList.add('preview-warning');
    }

    const statusIcon = regionResult.status === 'error' ? '❌' : '⚠';
    previewContent.innerHTML = `
      <div style="display: flex; align-items: start; gap: 8px;">
        <span style="font-size: 1.2rem;">${statusIcon}</span>
        <div>
          ${regionResult.messages.map(msg => `<div>• ${msg}</div>`).join('')}
        </div>
      </div>
    `;
  },

  submitAllocation(e) {
    e.preventDefault();

    if (!this.pendingAllocation) {
      console.error('No pending allocation');
      return;
    }

    const { groupId, regionId } = this.pendingAllocation;

    // Get form data
    const formData = new FormData(this.allocationForm);
    const mode = formData.get('mode');
    const percentage = formData.get('percentage');
    const priority = formData.get('priority');
    const notes = formData.get('notes');

    // Create temporary allocation for validation
    const tempAllocation = {
      allocation_id: `alloc_${Date.now()}`,
      region_id: regionId,
      group_id: groupId,
      allocation_mode: mode,
      amount: {},
      notes: notes || ''
    };

    if (mode === 'percentage' && percentage) {
      tempAllocation.amount.percent_of_region = parseFloat(percentage) / 100;
    } else if (mode === 'priority_queue' && priority) {
      tempAllocation.amount.priority = parseInt(priority);
    }

    // Build temporary allocations array for validation
    const tempAllocations = [];

    // Add existing assignments (convert to allocation format)
    for (const rId in this.state.assignments) {
      this.state.assignments[rId].forEach(gId => {
        tempAllocations.push({
          allocation_id: `existing_${rId}_${gId}`,
          region_id: rId,
          group_id: gId,
          allocation_mode: 'shared', // Assume shared for existing
          amount: {},
          notes: ''
        });
      });
    }

    // Add new allocation
    tempAllocations.push(tempAllocation);

    // Run capacity validation
    const validation = CapacityChecker.validate(
      this.state.regions,
      this.state.groups,
      tempAllocations,
      { efficiency_factor: this.state.efficiencyFactor }
    );

    console.log('[AssignSpace] Validation result:', validation);

    // Check for errors
    if (validation.status === 'error') {
      const summary = CapacityChecker.getSummary(validation);
      let errorMsg = '❌ 無法分配：\n\n';

      summary.details.forEach(detail => {
        if (detail.status === 'error') {
          errorMsg += `• ${detail.messages.join('\n• ')}\n`;
        }
      });

      alert(errorMsg);
      return; // Block allocation
    }

    // Show warning if needed
    if (validation.status === 'warning') {
      const summary = CapacityChecker.getSummary(validation);
      let warnMsg = '⚠ 警告：\n\n';

      summary.details.forEach(detail => {
        if (detail.status === 'warning') {
          warnMsg += `• ${detail.messages.join('\n• ')}\n`;
        }
      });

      warnMsg += '\n是否繼續分配？';

      if (!confirm(warnMsg)) {
        return; // User cancelled
      }
    }

    // Create allocation record (simplified - using assignments for now)
    if (!this.state.assignments[regionId]) {
      this.state.assignments[regionId] = [];
    }

    // Check if already assigned
    if (this.state.assignments[regionId].includes(groupId)) {
      alert('此群組已分配到此區域');
      this.closeAllocationModal();
      return;
    }

    // Add to assignments (temporary structure)
    this.state.assignments[regionId].push(groupId);

    console.log(`[AssignSpace] ✓ Allocated group ${groupId} to region ${regionId} with mode ${mode}`);

    // Store validation result
    this.state.validationResult = validation;

    // Close modal and refresh
    this.closeAllocationModal();
    this.render();
  },

  unassignGroup(groupId, zoneId) {
    if (this.state.assignments[zoneId]) {
      this.state.assignments[zoneId] = this.state.assignments[zoneId].filter(id => id !== groupId);
      console.log('Unassigned group', groupId, 'from zone', zoneId);
      this.render();
    }
  },

  removeAllocation(allocationId) {
    // TODO: Implement when using allocations array
    console.log('Remove allocation:', allocationId);
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
    window.location.hash = '/assign-sequence';
  }
};
