// assign_space.js

const AssignSpacePage = {
    state: {
        container: null,
        job: null,
        zones: [],
        groups: [],
        items: [],
        assignments: {}, // Format: { zoneId: [groupId1, groupId2], ... }
        draggedGroupId: null,
    },
    elements: {},
    isInitialized: false,
    API_BASE_URL: "http://127.0.0.1:8888",

    init() {
        if (this.isInitialized && this.elements.zonesList) {
            this.fetchDataAndRender(); // Re-fetch data if view is revisited
            return;
        }
        console.log("AssignSpacePage: Initializing...");
        this.bindDOM();
        this.addEventListeners();
        this.fetchDataAndRender();
        this.isInitialized = true;
    },

    bindDOM() {
        this.elements.zonesList = document.getElementById('zones-list');
        this.elements.groupsList = document.getElementById('groups-list');
        this.elements.groupsColumn = document.getElementById('groups-column');
        this.elements.finishButton = document.getElementById('assign-finish-btn'); // Renamed
        this.elements.prevButton = document.getElementById('assign-prev-step-btn');
        this.elements.nextSequenceButton = document.getElementById('assign-next-sequence-btn'); // New button
    },

    addEventListeners() {
        // Add listener to the main groups container to handle unassigning
        this.elements.groupsColumn.addEventListener('dragover', this.handleDragOver.bind(this));
        this.elements.groupsColumn.addEventListener('drop', this.handleUnassignDrop.bind(this));
        
        this.elements.finishButton.addEventListener('click', this.saveAssignments.bind(this)); // Calls saveAssignments which now includes navigation
        
        this.elements.prevButton.addEventListener('click', () => {
             const cutContainerTrigger = document.querySelector('.sidebar-section[data-target="view-cut-container"]');
             if (cutContainerTrigger) cutContainerTrigger.click();
        });

        this.elements.nextSequenceButton.addEventListener('click', this.navigateToAssignSequence.bind(this)); // New button, direct navigation
    },

    async fetchDataAndRender() {
        try {
            // First, get group and item data from the API
            const response = await fetch(`${this.API_BASE_URL}/api/assignment-data`);
            if (!response.ok) throw new Error(`API request failed: ${response.status}`);
            const apiData = await response.json();
            if (apiData.error) throw new Error(apiData.error);

            this.state.groups = apiData.groups;
            this.state.items = apiData.items;

            // Second, try to get the most recent zone data from localStorage
            const localContainerConfigStr = localStorage.getItem('containerConfig');
            const localContainerConfig = localContainerConfigStr ? JSON.parse(localContainerConfigStr) : null;

            // Use zones from localStorage if they exist, otherwise fallback to API data
            if (localContainerConfig && localContainerConfig.zones) {
                console.log("Mapping zones from localStorage for assign_space view.");
                this.state.zones = localContainerConfig.zones.map(zone => ({
                    // Explicitly map properties to what assign_space expects
                    id: zone.id,
                    label: zone.label,
                    length: zone.width,  // Map canvas width to 3D length
                    width: zone.height, // Map canvas height to 3D width
                    height: zone.depth, // Map canvas depth to 3D height
                    assigned_group_ids: zone.assigned_group_ids 
                }));
                this.state.container = localContainerConfig;
            } else {
                // Fallback to API data if localStorage is not available
                this.state.zones = apiData.zones;
                this.state.container = apiData.container;
            }
            
            this.state.job = apiData.job; // Job data probably still relevant from API

            // Initialize assignments state
            this.state.assignments = {};
            this.state.zones.forEach(zone => {
                // Check for existing assignments from API data if available on the zone object
                const apiZone = apiData.zones.find(z => z.id === zone.id);
                const assignedGroupIdsStr = apiZone?.assigned_group_ids || zone.assigned_group_ids; // Prefer API if available

                this.state.assignments[zone.id] = [];
                if (assignedGroupIdsStr) {
                    const groupIds = String(assignedGroupIdsStr).split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                    this.state.assignments[zone.id] = groupIds;
                }
            });

            this.render();
        } catch (error) {
            console.error("Failed to fetch initial data:", error);
            if(this.elements.zonesList) this.elements.zonesList.innerHTML = `<div class="card-placeholder"><p style="color: red;">錯誤：無法載入資料。</p></div>`;
        }
    },
    
    calculateGroupVolumes() {
        const groupVolumes = {};
        this.state.groups.forEach(g => { groupVolumes[g.id] = 0; });
        this.state.items.forEach(item => {
            if (groupVolumes.hasOwnProperty(item.group_id)) {
                // Each item row has its own dimensions, quantity is handled by having multiple rows
                groupVolumes[item.group_id] += item.length * item.width * item.height;
            }
        });
        this.state.groups.forEach(group => {
            group.totalVolume = groupVolumes[group.id] || 0;
        });
    },

    render() {
        if (!this.elements.zonesList || !this.elements.groupsList) return;
        this.calculateGroupVolumes();
        this.elements.zonesList.innerHTML = '';
        this.elements.groupsList.innerHTML = '';

        const assignedGroupIds = new Set(Object.values(this.state.assignments).flat());

        // Render zones and the groups assigned to them
        this.state.zones.forEach(zone => {
            const zoneCard = this.createZoneCard(zone);
            const assignedGroups = this.state.assignments[zone.id] || [];
            assignedGroups.forEach(groupId => {
                const group = this.state.groups.find(g => g.id === groupId);
                if (group) {
                    const groupCard = this.createGroupCard(group);
                    zoneCard.querySelector('.assigned-groups-container').appendChild(groupCard);
                }
            });
            this.elements.zonesList.appendChild(zoneCard);
            this.updateUtilization(zone.id);
        });

        // Render unassigned groups in the right-hand column
        this.state.groups.forEach(group => {
            if (!assignedGroupIds.has(group.id)) {
                const groupCard = this.createGroupCard(group);
                this.elements.groupsList.appendChild(groupCard);
            }
        });
    },
    
    createZoneCard(zone) {
        const card = document.createElement('div');
        card.className = 'zone-card';
        card.dataset.zoneId = zone.id;
        console.log('[DEBUG] Creating card for zone:', zone);
        const zoneVolume = zone.length * zone.width * zone.height;

        card.innerHTML = `
            <div class="zone-header">
                <span class="zone-label">區域 ${zone.label}</span>
            </div>
            <div class="zone-body">
                <div class="zone-utilization">
                    <span class="utilization-label">空間利用率:</span>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: 0%;"></div>
                        <span class="progress-text">0%</span>
                    </div>
                </div>
                <div class="zone-volume-info">總體積: ${zoneVolume.toFixed(0)} / 已用: 0</div>
            </div>
            <div class="assigned-groups-container"></div>
        `;
        card.addEventListener('dragover', this.handleDragOver.bind(this));
        card.addEventListener('dragleave', this.handleDragLeave.bind(this));
        card.addEventListener('drop', this.handleDrop.bind(this));
        return card;
    },

    createGroupCard(group) {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.dataset.groupId = group.id;
        card.draggable = true;
        
        card.innerHTML = `
            <div class="group-card-header">${group.name}</div>
            <div class="group-card-body">
                <span class="group-volume-label">預估體積:</span>
                <span class="group-volume-value">${group.totalVolume.toFixed(0)}</span>
            </div>
        `;
        card.addEventListener('dragstart', this.handleDragStart.bind(this));
        card.addEventListener('dragend', this.handleDragEnd.bind(this));
        return card;
    },

    // --- Drag and Drop Handlers ---
    handleDragStart(e) {
        this.state.draggedGroupId = parseInt(e.target.dataset.groupId, 10);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.state.draggedGroupId);
    },

    handleDragEnd(e) {
        if(e.target) e.target.classList.remove('dragging');
        this.state.draggedGroupId = null;
    },

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetZone = e.target.closest('.zone-card');
        if(targetZone) targetZone.classList.add('drag-over');
    },
    
    handleDragLeave(e) {
        const targetZone = e.target.closest('.zone-card');
        if(targetZone) targetZone.classList.remove('drag-over');
    },

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const targetZoneCard = e.target.closest('.zone-card');
        if (!targetZoneCard) return;
        targetZoneCard.classList.remove('drag-over');
        
        const zoneId = parseInt(targetZoneCard.dataset.zoneId, 10);
        const groupId = this.state.draggedGroupId;

        if (!zoneId || !groupId) return;

        this.unassignGroup(groupId); // Remove from previous assignment
        this.state.assignments[zoneId].push(groupId); // Add to new assignment
        this.render(); // Re-render the UI
    },

    handleUnassignDrop(e) {
        e.preventDefault();
        const groupId = this.state.draggedGroupId;
        if (!groupId) return;
        // Check if the drop happened on a valid unassignment area
        if (e.target.id === 'groups-list' || e.target.id === 'groups-column') {
            this.unassignGroup(groupId);
            this.render();
        }
    },
    
    unassignGroup(groupId) {
        for (const zoneId in this.state.assignments) {
            const index = this.state.assignments[zoneId].indexOf(groupId);
            if (index > -1) {
                this.state.assignments[zoneId].splice(index, 1);
                return;
            }
        }
    },

    updateUtilization(zoneId) {
        const zone = this.state.zones.find(z => z.id === zoneId);
        const zoneCard = this.elements.zonesList.querySelector(`.zone-card[data-zone-id="${zoneId}"]`);
        if (!zone || !zoneCard) return;

        const zoneVolume = zone.length * zone.width * zone.height;
        const assignedGroupIds = this.state.assignments[zoneId] || [];
        
        const usedVolume = assignedGroupIds.reduce((sum, groupId) => {
            const group = this.state.groups.find(g => g.id === groupId);
            return sum + (group ? group.totalVolume : 0);
        }, 0);

        const utilization = zoneVolume > 0 ? (usedVolume / zoneVolume) * 100 : 0;
        
        const progressBar = zoneCard.querySelector('.progress-bar');
        const progressText = zoneCard.querySelector('.progress-text');
        const volumeInfo = zoneCard.querySelector('.zone-volume-info');

        if(progressBar) progressBar.style.width = `${Math.min(utilization, 100)}%`;
        if(progressText) progressText.textContent = `${utilization.toFixed(1)}%`;
        if(volumeInfo) volumeInfo.textContent = `總體積: ${zoneVolume.toFixed(0)} / 已用: ${usedVolume.toFixed(0)}`;
        
        if (utilization > 100) {
            if(progressBar) progressBar.classList.add('over-capacity');
        } else {
            if(progressBar) progressBar.classList.remove('over-capacity');
        }
    },
    
    async saveAssignments() {
        const payload = [];
        const assignedZoneIds = new Set();

        for (const zoneId in this.state.assignments) {
            if (this.state.assignments[zoneId].length > 0) {
                assignedZoneIds.add(parseInt(zoneId));
            }
            for (const groupId of this.state.assignments[zoneId]) {
                payload.push({ zone_id: parseInt(zoneId), group_id: groupId });
            }
        }
        
        try {
            console.log("Saving assignments to backend:", payload);
            const response = await fetch(`${this.API_BASE_URL}/api/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({details: "無法儲存"}));
                throw new Error(errorData.details);
            }
            const result = await response.json();
            console.log("Save successful:", result);
            alert("分配結果已成功儲存！");

            // Find the full zone objects that were assigned groups
            const assignedZones = this.state.zones.filter(zone => assignedZoneIds.has(zone.id));
            
            // Pass all necessary data to the next view via sessionStorage
            sessionStorage.setItem('assignedZones', JSON.stringify(assignedZones));
            sessionStorage.setItem('spaceAssignments', JSON.stringify(this.state.assignments));
            sessionStorage.setItem('masterItems', JSON.stringify(this.state.items));
            sessionStorage.setItem('masterGroups', JSON.stringify(this.state.groups));

            this.navigateToAssignSequence(); // Call the new navigation function
        } catch (error) {
            console.error("Failed to save assignments:", error);
            alert(`儲存失敗: ${error.message}`);
        }
    },

    navigateToAssignSequence() {
        const assignSequenceTrigger = document.querySelector('.sidebar-section[data-target="view-space-pack"]');
        if (assignSequenceTrigger) {
            assignSequenceTrigger.click();
        } else {
            console.error('Could not find sidebar trigger for view-space-pack');
            alert('無法自動導向下一步，請手動點擊側邊欄。');
        }
    },
};

// --- Initialization Logic ---
document.addEventListener("viewChanged", (e) => {
    if (e.detail.newViewId === 'view-assign-space') {
        AssignSpacePage.init();
    }
});