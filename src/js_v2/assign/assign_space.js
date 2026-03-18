/* assign_space.js - Enhanced allocation with capacity checking */

import { assignSpaceService } from '../../frontend/contexts/allocation/application/assign-space-service.js';

function getZoneTag(status) {
  if (status === 'error') {
    return { label: 'High', color: '#ef4444' };
  }

  if (status === 'warning') {
    return { label: 'Medium', color: '#eab308' };
  }

  return { label: 'Low', color: '#22c55e' };
}

export const AssignSpacePage = {
  state: {
    groups: [],
    regions: [],
    allocations: [],
    items: [],
    draggedGroupId: null,
    validationResult: null,
    efficiencyFactor: 0.85,
    assignments: {}
  },

  async init() {
    console.log('Initializing AssignSpacePage...');

    this.zonesList = document.getElementById('zones-list');
    this.groupsPool = document.getElementById('groups-pool');
    this.saveBtn = document.getElementById('save-changes-btn');
    this.nextBtn = document.getElementById('next-step-btn');
    this.allocationModal = document.getElementById('allocation-modal');
    this.allocationForm = document.getElementById('allocation-form');
    this.allocationModeSelect = document.getElementById('allocation-mode');
    this.percentageInput = document.getElementById('percentage-input');
    this.priorityInput = document.getElementById('priority-input');

    if (!this.zonesList || !this.groupsPool) {
      console.error('Required DOM elements not found');
      return;
    }

    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());
    this.nextBtn?.addEventListener('click', () => this.handleNextStep());
    this.setupModalListeners();

    await this.loadAssignmentDataFromServer();
    this.render();

    window.AssignSpace = this;
  },

  async loadAssignmentDataFromServer() {
    const initialState = await assignSpaceService.loadInitialState();
    this.state.groups = initialState.groups;
    this.state.regions = initialState.regions;
    this.state.items = initialState.items;
    this.state.assignments = initialState.assignments;
  },

  render() {
    this.renderZones();
    this.renderGroups();
  },

  renderZones() {
    if (!this.state.regions || this.state.regions.length === 0) {
      this.zonesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">[]</div>
          <div class="empty-state-text">No regions available</div>
          <div class="empty-state-hint">Define or cut container space before assigning groups.</div>
        </div>
      `;
      return;
    }

    this.zonesList.innerHTML = '';

    this.state.regions.forEach((region) => {
      const zoneCard = document.createElement('div');
      zoneCard.className = 'zone-card';
      zoneCard.dataset.zoneId = region.id;

      const assignedGroups = this.state.assignments?.[region.id] || [];
      const usageSnapshot = assignSpaceService.getRegionUsageSnapshot(
        region,
        assignedGroups,
        this.state.items
      );
      const zoneTag = getZoneTag(usageSnapshot.status);

      zoneCard.style.border = `2px solid ${zoneTag.color}`;

      let assignedHTML = '';
      assignedGroups.forEach((assignment) => {
        const groupId = typeof assignment === 'object' ? assignment.id : assignment;
        const group = this.state.groups.find((entry) => entry.id == groupId);
        if (!group) {
          return;
        }

        const mode = typeof assignment === 'object' ? assignment.mode : 'shared';
        const value = typeof assignment === 'object' ? assignment.value : null;
        const modeLabels = {
          shared: 'Shared',
          exclusive: 'Exclusive',
          percentage: 'Percentage',
          priority_queue: 'Priority'
        };

        const valueInput = mode === 'percentage'
          ? `<input type="number" class="percent-input" data-group-id="${groupId}" data-zone-id="${region.id}" value="${value ?? 50}" min="1" max="100" style="width: 70px; text-align: right;" /> %`
          : mode === 'priority_queue'
            ? `<input type="number" class="priority-input" data-group-id="${groupId}" data-zone-id="${region.id}" value="${value ?? 1}" min="1" style="width: 70px; text-align: right;" />`
            : '';

        assignedHTML += `
          <div class="assigned-group">
            <span>${group.name} (${modeLabels[mode] || mode})</span>
            <span>${valueInput}</span>
            <span class="remove-btn" data-group-id="${groupId}" data-zone-id="${region.id}" style="margin-left: 10px; cursor: pointer; color: #ef4444; font-weight: bold;">x</span>
          </div>
        `;
      });

      zoneCard.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-title">
            ${region.name || region.label || `Zone ${region.id}`}
            <span style="background: ${zoneTag.color}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 8px;">
              ${zoneTag.label} (${usageSnapshot.utilization.toFixed(1)}%)
            </span>
          </div>
          <div class="zone-stats">
            <div class="zone-stat">
              <span>Area</span>
              <span>${usageSnapshot.areaM2.toFixed(2)} m2</span>
            </div>
            <div class="zone-stat">
              <span>Volume</span>
              <span>${usageSnapshot.volumeM3.toFixed(2)} m3</span>
            </div>
            <div class="zone-stat">
              <span>Groups</span>
              <span>${assignedGroups.length}</span>
            </div>
          </div>
        </div>
        <div class="zone-content" data-zone-id="${region.id}" style="display: flex; flex-direction: column; gap: 8px;">
          ${assignedHTML || '<div class="empty-hint">Drop a group here to create an allocation.</div>'}
        </div>
      `;

      const zoneContent = zoneCard.querySelector('.zone-content');
      zoneContent.addEventListener('dragover', (event) => this.handleDragOver(event, region.id));
      zoneContent.addEventListener('dragleave', (event) => this.handleDragLeave(event));
      zoneContent.addEventListener('drop', (event) => this.handleDrop(event, region.id));

      zoneCard.querySelectorAll('.remove-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
          const groupId = parseInt(event.target.dataset.groupId, 10);
          const zoneId = event.target.dataset.zoneId;
          this.unassignGroup(groupId, zoneId);
        });
      });

      zoneCard.querySelectorAll('.percent-input, .priority-input').forEach((input) => {
        input.addEventListener('change', (event) => {
          const groupId = parseInt(event.target.dataset.groupId, 10);
          const zoneId = event.target.dataset.zoneId;
          const newValue = parseFloat(event.target.value);
          const assignment = this.state.assignments[zoneId]?.find((entry) => (entry.id || entry) === groupId);

          if (assignment && typeof assignment === 'object') {
            this.state.assignments = assignSpaceService.updateAssignmentValue(
              this.state.assignments,
              zoneId,
              groupId,
              newValue
            );
            console.log(`Updated group ${groupId} value to ${newValue}`);
            this.render();
          }
        });
      });

      this.zonesList.appendChild(zoneCard);
    });
  },

  renderGroups() {
    if (this.state.groups.length === 0) {
      this.groupsPool.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">[]</div>
          <div class="empty-state-text">No groups found</div>
          <div class="empty-state-hint">Create groups before assigning space.</div>
        </div>
      `;
      return;
    }

    this.groupsPool.innerHTML = '';

    this.state.groups.forEach((group) => {
      const isAssigned = this.isGroupAssigned(group.id);

      const groupCard = document.createElement('div');
      groupCard.className = `group-card ${isAssigned ? 'assigned' : ''}`;
      groupCard.draggable = !isAssigned;
      groupCard.dataset.groupId = group.id;

      groupCard.innerHTML = `
        <div class="group-name">${group.name}</div>
        <div class="group-info">
          <span>Items: ?</span>
          ${isAssigned ? '<span>Already assigned</span>' : '<span>Ready to assign</span>'}
        </div>
      `;

      if (!isAssigned) {
        groupCard.addEventListener('dragstart', (event) => this.handleDragStart(event, group.id));
        groupCard.addEventListener('dragend', (event) => this.handleDragEnd(event));
      }

      this.groupsPool.appendChild(groupCard);
    });
  },

  handleDragStart(event, groupId) {
    this.state.draggedGroupId = groupId;
    event.target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', groupId);
  },

  handleDragEnd(event) {
    event.target.classList.remove('dragging');
  },

  handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const zoneCard = event.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.add('drag-over');
    }
  },

  handleDragLeave(event) {
    const zoneCard = event.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.remove('drag-over');
    }
  },

  handleDrop(event, regionId) {
    event.preventDefault();
    const zoneCard = event.currentTarget.closest('.zone-card');
    if (zoneCard) {
      zoneCard.classList.remove('drag-over');
    }

    const groupId = parseInt(event.dataTransfer.getData('text/plain'), 10);
    if (!groupId || this.isGroupAssigned(groupId)) {
      return;
    }

    this.openAllocationModal(groupId, regionId);
  },

  setupModalListeners() {
    this.allocationModeSelect?.addEventListener('change', (event) => {
      this.handleModeChange(event.target.value);
    });

    this.allocationForm?.addEventListener('submit', (event) => {
      this.submitAllocation(event);
    });

    this.allocationModal?.addEventListener('click', (event) => {
      if (event.target === this.allocationModal) {
        this.closeAllocationModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.allocationModal?.classList.contains('active')) {
        this.closeAllocationModal();
      }
    });
  },

  openAllocationModal(groupId, regionId) {
    this.pendingAllocation = { groupId, regionId };

    const group = this.state.groups.find((entry) => entry.id == groupId);
    const region = this.state.regions.find((entry) => entry.id == regionId);

    if (!group || !region) {
      console.error('Group or region not found');
      return;
    }

    console.log(`[AssignSpace] Opening allocation modal for group ${group.name} to region ${region.name || region.id}`);

    this.allocationForm?.reset();
    this.handleModeChange('shared');
    this.allocationModal?.classList.add('active');
  },

  closeAllocationModal() {
    this.allocationModal?.classList.remove('active');
    this.pendingAllocation = null;
    this.allocationForm?.reset();
  },

  handleModeChange() {
    if (this.percentageInput) {
      this.percentageInput.style.display = 'none';

      const percentInput = document.getElementById('allocation-percentage');
      if (percentInput && !percentInput.dataset.listenerAdded) {
        percentInput.addEventListener('input', () => this.updateCapacityPreview());
        percentInput.dataset.listenerAdded = 'true';
      }
    }

    if (this.priorityInput) {
      this.priorityInput.style.display = 'none';
    }

    this.updateCapacityPreview();
  },

  updateCapacityPreview() {
    if (!this.pendingAllocation) {
      return;
    }

    const { groupId, regionId } = this.pendingAllocation;
    const mode = this.allocationModeSelect?.value || 'shared';
    const percentageValue = document.getElementById('allocation-percentage')?.value;
    const { regionResult } = assignSpaceService.buildPreviewValidation({
      assignments: this.state.assignments,
      regions: this.state.regions,
      groups: this.state.groups,
      groupId,
      regionId,
      mode,
      percentageValue,
      efficiencyFactor: this.state.efficiencyFactor
    });

    const previewDiv = document.getElementById('capacity-preview');
    const previewContent = document.getElementById('capacity-preview-content');

    if (!previewDiv || !previewContent) {
      return;
    }

    if (!regionResult || regionResult.status === 'ok') {
      previewDiv.style.display = 'none';
      return;
    }

    previewDiv.style.display = 'block';
    previewDiv.className = 'capacity-preview';

    if (regionResult.status === 'error') {
      previewDiv.classList.add('preview-error');
    } else if (regionResult.status === 'warning') {
      previewDiv.classList.add('preview-warning');
    }

    const statusIcon = regionResult.status === 'error' ? '!' : 'i';
    previewContent.innerHTML = `
      <div style="display: flex; align-items: start; gap: 8px;">
        <span style="font-size: 1.2rem;">${statusIcon}</span>
        <div>
          ${regionResult.messages.map((message) => `<div>- ${message}</div>`).join('')}
        </div>
      </div>
    `;
  },

  submitAllocation(event) {
    event.preventDefault();

    if (!this.pendingAllocation) {
      console.error('No pending allocation');
      return;
    }

    const { groupId, regionId } = this.pendingAllocation;
    const formData = new FormData(this.allocationForm);
    const mode = formData.get('mode');
    const percentage = formData.get('percentage');
    const priority = formData.get('priority');
    const notes = formData.get('notes');
    const { validation, summary } = assignSpaceService.validateNewAssignment({
      assignments: this.state.assignments,
      regions: this.state.regions,
      groups: this.state.groups,
      groupId,
      regionId,
      mode,
      percentage,
      priority,
      notes,
      efficiencyFactor: this.state.efficiencyFactor
    });

    console.log('[AssignSpace] Validation result:', validation);

    if (validation.status === 'error') {
      let errorMessage = 'Allocation failed:\n\n';

      (summary?.details || []).forEach((detail) => {
        if (detail.status === 'error') {
          errorMessage += `- ${detail.messages.join('\n- ')}\n`;
        }
      });

      alert(errorMessage);
      return;
    }

    if (validation.status === 'warning') {
      console.warn('[AssignSpace] Capacity warning:', validation);
    }

    const allocationResult = assignSpaceService.addAssignment(this.state.assignments, {
      regionId,
      groupId,
      mode
    });

    if (!allocationResult.added) {
      alert('This group is already assigned to the selected region.');
      this.closeAllocationModal();
      return;
    }

    this.state.assignments = allocationResult.assignments;
    this.state.validationResult = validation;

    console.log(`[AssignSpace] Allocated group ${groupId} to region ${regionId} with mode ${mode}`);

    this.closeAllocationModal();
    this.render();
  },

  rebalancePercentages(regionId, fixedGroupId = null, fixedValue = null) {
    this.state.assignments = assignSpaceService.updateAssignmentValue(
      this.state.assignments,
      regionId,
      fixedGroupId,
      fixedValue
    );
  },

  unassignGroup(groupId, zoneId) {
    if (this.state.assignments[zoneId]) {
      this.state.assignments = assignSpaceService.removeAssignment(
        this.state.assignments,
        zoneId,
        groupId
      );
      console.log('Unassigned group', groupId, 'from zone', zoneId);
      this.render();
    }
  },

  removeAllocation(allocationId) {
    console.log('Remove allocation:', allocationId);
  },

  isGroupAssigned(groupId) {
    return assignSpaceService.isGroupAssigned(this.state.assignments, groupId);
  },

  async handleSaveChanges() {
    console.log('Saving assignments:', this.state.assignments);

    const saveResult = await assignSpaceService.saveAssignments(this.state.assignments);
    const isSuccessFromAPI = saveResult.savedToApi;
    const modal = document.getElementById('success-modal');
    const successTitle = modal?.querySelector('.modal-title');
    const okBtn = document.getElementById('btn-modal-ok');

    if (modal && okBtn && successTitle) {
      successTitle.textContent = isSuccessFromAPI ? 'Saved successfully' : 'Saved locally only';
      modal.classList.add('active');

      const handleOk = () => {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', handleOk);
      };

      okBtn.addEventListener('click', handleOk);
    } else {
      alert(isSuccessFromAPI ? 'Assignments saved successfully.' : 'Assignments saved locally only.');
    }
  },

  async handleNextStep() {
    window.location.hash = '/assign-sequence';
  }
};
