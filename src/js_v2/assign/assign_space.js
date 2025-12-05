// assign_space.js

const AssignSpacePage = {
    // --- State ---
    state: {
        zones: [],
        groups: [],
        draggedGroupId: null,
    },

    // --- DOM Elements ---
    elements: {},

    // --- API Configuration ---
    API_BASE_URL: "http://127.0.0.1:8888",

    // --- Initialization ---
    init() {
        if (this.isInitialized) return;
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
        this.elements.nextButton = document.getElementById('assign-next-step-btn');
        this.elements.prevButton = document.getElementById('assign-prev-step-btn');
    },

    addEventListeners() {
        // Make the main groups list a drop target to allow un-assigning
        this.elements.groupsColumn.addEventListener('dragover', this.handleDragOver.bind(this));
        this.elements.groupsColumn.addEventListener('drop', this.handleUnassignDrop.bind(this));
        
        // Next step validation
        this.elements.nextButton.addEventListener('click', this.validateAssignments.bind(this));
        
        // Previous step navigation
        this.elements.prevButton.addEventListener('click', () => {
             const cutContainerTrigger = document.querySelector('.sidebar-section[data-target="view-cut-container"]');
             if (cutContainerTrigger) cutContainerTrigger.click();
        });
    },

    // --- Data Fetching and Rendering ---
    async fetchDataAndRender() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/assignment-data`);
            if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            this.state.zones = data.zones;
            this.state.groups = data.groups;

            this.render();
        } catch (error) {
            console.error("Failed to fetch initial data:", error);
            this.elements.zonesList.innerHTML = `<div class="zone-card-placeholder"><p style="color: red;">Error: Could not load data from server. Is the API server running?</p></div>`;
            this.elements.groupsList.innerHTML = "";
        }
    },

    render() {
        // Clear existing content
        this.elements.zonesList.innerHTML = '';
        this.elements.groupsList.innerHTML = '';

        // Render zones
        this.state.zones.forEach(zone => {
            const zoneCard = this.createZoneCard(zone);
            this.elements.zonesList.appendChild(zoneCard);
        });

        // Render groups
        const assignedGroups = new Set();
        this.state.groups.forEach(group => {
            if (group.assigned_to_zone_id !== null) {
                assignedGroups.add(group.id);
                const groupCard = this.createGroupCard(group);
                const zoneCard = this.elements.zonesList.querySelector(`[data-zone-id="${group.assigned_to_zone_id}"]`);
                zoneCard?.querySelector('.assigned-groups-container').appendChild(groupCard);
            }
        });
        
        this.state.groups.forEach(group => {
             if (!assignedGroups.has(group.id)) {
                const groupCard = this.createGroupCard(group);
                this.elements.groupsList.appendChild(groupCard);
            }
        });
    },
    
    createZoneCard(zone) {
        const card = document.createElement('div');
        card.className = 'zone-card';
        card.dataset.zoneId = zone.id; // Use the unique ID from cutting_jobs
        card.innerHTML = `
            <div class="zone-title">${zone.zone_name || `Zone ID: ${zone.id}`}</div>
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
        card.textContent = group.name;
        card.draggable = true;
        card.addEventListener('dragstart', this.handleDragStart.bind(this));
        card.addEventListener('dragend', this.handleDragEnd.bind(this));
        return card;
    },

    // --- Drag and Drop Handlers ---
    handleDragStart(e) {
        this.state.draggedGroupId = e.target.dataset.groupId;
        e.target.classList.add('dragging');
        this.elements.groupsColumn.classList.add('dragging-from');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.state.draggedGroupId);
    },

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.elements.groupsColumn.classList.remove('dragging-from');
        this.state.draggedGroupId = null;
    },

    handleDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        
        const targetZone = e.target.closest('.zone-card');
        if(targetZone) {
            targetZone.classList.add('drag-over');
        }
    },
    
    handleDragLeave(e) {
        const targetZone = e.target.closest('.zone-card');
        if(targetZone) {
            targetZone.classList.remove('drag-over');
        }
    },

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetZone = e.target.closest('.zone-card');
        if (!targetZone) return;
        
        targetZone.classList.remove('drag-over');
        const groupId = e.dataTransfer.getData('text/plain');
        const zoneId = targetZone.dataset.zoneId;

        // Move the DOM element
        const draggedCard = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
        if (draggedCard) {
            targetZone.querySelector('.assigned-groups-container').appendChild(draggedCard);
            // Update DB
            this.updateAssignmentInDB(parseInt(groupId), parseInt(zoneId));
        }
    },

    handleUnassignDrop(e) {
        e.preventDefault();
        const groupId = e.dataTransfer.getData('text/plain');
        const draggedCard = document.querySelector(`.group-card[data-group-id="${groupId}"]`);
        if (draggedCard && e.target.closest('.assignment-column') === this.elements.groupsColumn) {
            this.elements.groupsList.appendChild(draggedCard);
            // Update DB to unassign
            this.unassignInDB(parseInt(groupId));
        }
    },

    // --- API Communication ---
    async updateAssignmentInDB(groupId, zoneId) {
        console.log(`Assigning Group ${groupId} to Zone ${zoneId}`);
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_id: groupId, zone_id: zoneId }),
            });
            if (!response.ok) throw new Error('Failed to save assignment.');
            const result = await response.json();
            console.log('Assignment saved:', result);
        } catch (error) {
            console.error('Error saving assignment:', error);
            // Optional: Move card back to original position on error
        }
    },
    
    async unassignInDB(groupId) {
        console.log(`Unassigning Group ${groupId}`);
        try {
             const response = await fetch(`${this.API_BASE_URL}/api/assignments/unassign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_id: groupId }),
            });
            if (!response.ok) throw new Error('Failed to unassign.');
            const result = await response.json();
            console.log('Unassignment successful:', result);
        } catch(error) {
            console.error('Error unassigning:', error);
        }
    },

    // --- Validation ---
    validateAssignments() {
        // Clear previous warnings
        this.elements.groupsColumn.classList.remove('validation-failed');
        document.querySelectorAll('.group-card.unassigned-warning').forEach(card => {
            card.classList.remove('unassigned-warning');
        });

        const unassignedGroups = this.elements.groupsList.querySelectorAll('.group-card');

        if (unassignedGroups.length > 0) {
            alert("有群組尚未被分配到任何空間！");
            this.elements.groupsColumn.classList.add('validation-failed');
            unassignedGroups.forEach(card => card.classList.add('unassigned-warning'));
            return false;
        }

        console.log("Validation passed. All groups assigned. Proceeding to next step...");
        // Placeholder for next step navigation
        alert("所有群組都已成功分配！");
        // Example: document.querySelector('[data-target="view-pack-objects"]').click();
        return true;
    },
};

// --- Initialization Logic ---
// Listen for the custom event dispatched by the main loader
document.addEventListener("viewChanged", (e) => {
    if (e.detail.newViewId === 'view-assign-space') { // This ID will be set in index_v2.html
        AssignSpacePage.init();
    }
});
