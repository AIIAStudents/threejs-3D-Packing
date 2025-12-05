// This script is loaded as a module, so it runs in strict mode.

const CutContainerPage = {
    state: {
        containerConfig: null, // Will hold full config from localStorage
        zones: [],
        isEditing: false,
        selectedZoneId: null,
        draggingState: {
            isDragging: false,
            mode: null, // 'draw', 'move', 'resize', 'rotate'
            startX: 0,
            startY: 0,
            activeHandle: null, // 'tl', 'tr', 'bl', 'br', 'rotate'
        },
    },

    elements: {},
    isInitialized: false, // Prevent re-adding global listeners

    init() {
        this.bindDOM();
        this.loadContainerConfig();
        this.resizeCanvas();
        // Only add listeners once
        if (!this.isInitialized) {
            this.addEventListeners();
            this.isInitialized = true;
        }
        this.syncUI();
        this.redraw();
        console.log("Cut Container Page Initialized");
    },
    
    bindDOM() {
        this.elements.canvas = document.getElementById('cut-canvas');
        if (!this.elements.canvas) return;
        this.elements.ctx = this.elements.canvas.getContext('2d');
        this.elements.editToggleBtn = document.getElementById('edit-toggle-btn');
        this.elements.zoneTableBody = document.querySelector('#zone-table tbody');
        this.elements.btnPrevStep = document.getElementById('btn-prev-step');
        this.elements.btnFinish = document.getElementById('btn-finish');
    },

    addEventListeners() {
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        this.elements.editToggleBtn.addEventListener('click', () => this.toggleEditMode());

        this.elements.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.elements.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.elements.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.elements.canvas.addEventListener('mouseout', (e) => this.onMouseUp(e)); // End drag if mouse leaves canvas

        this.elements.btnPrevStep.addEventListener('click', () => {
            const defineContainerTrigger = document.querySelector('.sidebar-section[data-target="view-space-size"]');
            if (defineContainerTrigger) {
                defineContainerTrigger.click(); // SPA navigation
            } else {
                window.history.back(); // Fallback for standalone mode
            }
        });

        this.elements.btnFinish.addEventListener('click', () => {
            this.saveZones();
            alert('切割完成，區域已儲存！');
            console.log("Finish button clicked. Zones saved.");
        });
    },

    loadContainerConfig() {
        const configStr = localStorage.getItem('containerConfig');
        if (configStr) {
            this.state.containerConfig = JSON.parse(configStr);
            console.log("Loaded container config:", this.state.containerConfig);

            // Handle zones
            if (this.state.containerConfig.zones && this.state.containerConfig.zones.length > 0) {
                this.state.zones = this.state.containerConfig.zones;
            } else {
                 const bbox = this.getContainerBoundingBox();
                 this.state.zones = [{
                    id: 1,
                    x: bbox.width / 2,
                    y: bbox.height / 2,
                    width: bbox.width,
                    height: bbox.height,
                    rotation: 0,
                }];
            }
            if (this.state.zones.length > 0) {
                this.state.selectedZoneId = this.state.zones[0].id;
            }
        } else {
            // Fallback if no config is in local storage
            this.state.containerConfig = { shape: 'rect', widthX: 5800, depthZ: 2300, rotationY: 0, position: {x:0, y:0, z:0}};
            console.warn("No containerConfig found in localStorage. Using default rect.");
        }
    },

    saveZones() {
        // Now, when saving zones, we retrieve the full config, update its zones property, and save it back
        const configStr = localStorage.getItem('containerConfig');
        const config = configStr ? JSON.parse(configStr) : this.state.containerConfig || {};
        config.zones = this.state.zones;
        localStorage.setItem('containerConfig', JSON.stringify(config));
    },

    toggleEditMode() {
        this.state.isEditing = !this.state.isEditing;
        if (!this.state.isEditing) {
            this.state.selectedZoneId = null;
        } else if (this.state.zones.length > 0 && this.state.selectedZoneId === null) {
            this.state.selectedZoneId = this.state.zones[0].id;
        }
        this.syncUI();
        this.redraw();
    },

    // NEW helper function to get overall dimensions for coordinate scaling
    getContainerBoundingBox() {
        const config = this.state.containerConfig;
        if (!config) return { width: 100, height: 100 };

        switch (config.shape) {
            case 'u_shape':
                return { width: config.outerWidthX, height: config.outerDepthZ };
            case 't_shape':
                // The bounding box for a T-shape is its widest and tallest part
                return { width: config.crossWidthX, height: config.stemDepthZ };
            case 'rect':
            default:
                return { width: config.widthX, height: config.depthZ };
        }
    },

    worldToCanvas(worldX, worldY) {
        const { canvas } = this.elements;
        const bbox = this.getContainerBoundingBox();
        if (!canvas) return { x: 0, y: 0 };
        const scaleX = canvas.width / bbox.width;
        const scaleY = canvas.height / bbox.height;
        const scale = Math.min(scaleX, scaleY) * 0.95; // 0.95 scale to add some padding
        const offsetX = (canvas.width - bbox.width * scale) / 2;
        const offsetY = (canvas.height - bbox.height * scale) / 2;
        return { x: worldX * scale + offsetX, y: worldY * scale + offsetY };
    },

    canvasToWorld(canvasX, canvasY) {
        const { canvas } = this.elements;
        const bbox = this.getContainerBoundingBox();
        if (!canvas) return { x: 0, y: 0 };
        const scaleX = canvas.width / bbox.width;
        const scaleY = canvas.height / bbox.height;
        const scale = Math.min(scaleX, scaleY) * 0.95;
        const offsetX = (canvas.width - bbox.width * scale) / 2;
        const offsetY = (canvas.height - bbox.height * scale) / 2;
        return { x: (canvasX - offsetX) / scale, y: (canvasY - offsetY) / scale };
    },
    
    onMouseDown(e) {
        if (!this.state.isEditing) return;
        const { x: worldX, y: worldY } = this.canvasToWorld(e.offsetX, e.offsetY);
        const { draggingState } = this.state;
        draggingState.startX = worldX;
        draggingState.startY = worldY;
        draggingState.isDragging = true;

        const selectedZone = this.state.zones.find(z => z.id === this.state.selectedZoneId);
        if (selectedZone) {
            const handleHit = this.hitTestHandles(selectedZone, worldX, worldY);
            if (handleHit) {
                draggingState.mode = handleHit === 'rotate' ? 'rotate' : 'resize';
                draggingState.activeHandle = handleHit;
                return;
            }
        }
        
        const clickedZone = this.hitTestRectangle(worldX, worldY);
        if (clickedZone) {
            draggingState.mode = 'move';
            this.state.selectedZoneId = clickedZone.id;
        } else {
            draggingState.mode = 'draw';
            this.state.selectedZoneId = null;
        }
        this.syncUI();
        this.redraw();
    },

    onMouseMove(e) {
        const { draggingState, isEditing, selectedZoneId, zones } = this.state;
        if (!draggingState.isDragging || !isEditing) return;

        const { x: worldX, y: worldY } = this.canvasToWorld(e.offsetX, e.offsetY);
        const selectedZone = zones.find(z => z.id === selectedZoneId);

        switch (draggingState.mode) {
            case 'draw':
                this.redraw();
                const start = this.worldToCanvas(draggingState.startX, draggingState.startY);
                this.elements.ctx.strokeStyle = 'rgba(233, 30, 99, 0.8)';
                this.elements.ctx.lineWidth = 2;
                this.elements.ctx.strokeRect(start.x, start.y, e.offsetX - start.x, e.offsetY - start.y);
                break;
            case 'move':
                if (!selectedZone) return;
                selectedZone.x += worldX - draggingState.startX;
                selectedZone.y += worldY - draggingState.startY;
                draggingState.startX = worldX;
                draggingState.startY = worldY;
                this.redraw();
                break;
            case 'resize':
                if (!selectedZone) return;
                this.resizeZone(selectedZone, draggingState.activeHandle, worldX, worldY);
                this.redraw();
                break;
            case 'rotate':
                if (!selectedZone) return;
                const dx = worldX - selectedZone.x;
                const dy = worldY - selectedZone.y;
                selectedZone.rotation = Math.atan2(dy, dx) - Math.PI / 2;
                this.redraw();
                break;
        }
    },

    onMouseUp(e) {
        const { draggingState } = this.state;
        if (!draggingState.isDragging || !this.state.isEditing) return;

        if (draggingState.mode === 'draw') {
            const { x: endX, y: endY } = this.canvasToWorld(e.offsetX, e.offsetY);
            const { startX, startY } = draggingState;
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);

            if (width > 10 && height > 10) {
                const newZone = {
                    id: Date.now(),
                    x: Math.min(startX, endX) + width / 2,
                    y: Math.min(startY, endY) + height / 2,
                    width, height, rotation: 0,
                };
                this.state.zones.push(newZone);
                this.state.selectedZoneId = newZone.id;
            }
        }
        
        draggingState.isDragging = false;
        draggingState.mode = null;
        draggingState.activeHandle = null;

        this.syncUI();
        this.redraw();
    },

    hitTestRectangle(worldX, worldY) {
        for (let i = this.state.zones.length - 1; i >= 0; i--) {
            const zone = this.state.zones[i];
            const dx = worldX - zone.x;
            const dy = worldY - zone.y;
            const localX = dx * Math.cos(-zone.rotation) - dy * Math.sin(-zone.rotation);
            const localY = dx * Math.sin(-zone.rotation) + dy * Math.cos(-zone.rotation);
            if (Math.abs(localX) < zone.width / 2 && Math.abs(localY) < zone.height / 2) {
                return zone;
            }
        }
        return null;
    },

    hitTestHandles(zone, worldX, worldY) {
        const handles = this.getHandlePositions(zone);
        const handleRadius = 8;
        const worldMouse = this.worldToCanvas(worldX, worldY);

        for (const handleName in handles) {
            const handlePos = handles[handleName];
            const dx = worldMouse.x - handlePos.x;
            const dy = worldMouse.y - handlePos.y;
            if (dx * dx + dy * dy < handleRadius * handleRadius) {
                return handleName;
            }
        }
        return null;
    },
    
    resizeZone(zone, handle, worldMouseX, worldMouseY) {
        const c = Math.cos(zone.rotation);
        const s = Math.sin(zone.rotation);
        const localMouseX = c * (worldMouseX - zone.x) + s * (worldMouseY - zone.y);
        const localMouseY = -s * (worldMouseX - zone.x) + c * (worldMouseY - zone.y);

        let localOppositeX, localOppositeY;
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;

        switch (handle) {
            case 'tl': localOppositeX = halfW; localOppositeY = halfH; break;
            case 'tr': localOppositeX = -halfW; localOppositeY = halfH; break;
            case 'bl': localOppositeX = halfW; localOppositeY = -halfH; break;
            case 'br': localOppositeX = -halfW; localOppositeY = -halfH; break;
            default: return;
        }

        const newWidth = Math.max(1, Math.abs(localMouseX - localOppositeX));
        const newHeight = Math.max(1, Math.abs(localMouseY - localOppositeY));
        const newLocalCenterX = (localMouseX + localOppositeX) / 2;
        const newLocalCenterY = (localMouseY + localOppositeY) / 2;

        zone.x += c * newLocalCenterX - s * newLocalCenterY;
        zone.y += s * newLocalCenterX + c * newLocalCenterY;
        zone.width = newWidth;
        zone.height = newHeight;
    },

    resizeCanvas() {
        if (!this.elements.canvas) return;
        const wrapper = this.elements.canvas.parentElement;
        this.elements.canvas.width = wrapper.clientWidth;
        this.elements.canvas.height = wrapper.clientHeight;
        this.redraw();
    },

    redraw() {
        if (!this.elements.ctx || !this.elements.canvas) return;
        const { ctx, canvas } = this.elements;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawContainer();
        this.state.zones.forEach(zone => {
            const isSelected = zone.id === this.state.selectedZoneId;
            this.drawZone(zone, isSelected);
            if (this.state.isEditing && isSelected) {
                this.drawHandles(zone);
            }
        });
    },

    // --- Container Drawing Logic ---

    drawContainer() {
        const { ctx } = this.elements;
        const config = this.state.containerConfig;
        if (!config) return;

        ctx.save();
        ctx.strokeStyle = '#888'; // Make container outline darker
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]); // Dashed line for the container

        switch (config.shape) {
            case 'u_shape':
                this.drawUShapeContainer(ctx, config);
                break;
            case 't_shape':
                this.drawTShapeContainer(ctx, config);
                break;
            case 'rect':
            default:
                this.drawRectContainer(ctx, config);
                break;
        }

        ctx.restore();
    },

    drawRectContainer(ctx, config) {
        const { widthX, depthZ } = config;
        const start = this.worldToCanvas(0, 0);
        // Use the config dimensions for drawing, not the bounding box
        const end = this.worldToCanvas(widthX, depthZ);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    },

    drawUShapeContainer(ctx, config) {
        const { outerWidthX: ow, outerDepthZ: od, gapWidthX: gw, gapDepthZ: gd } = config;

        // The path is drawn relative to the top-left corner of its bounding box.
        const points = [
            { x: 0, y: 0 },
            { x: ow, y: 0 },
            { x: ow, y: od },
            { x: (ow + gw) / 2, y: od },
            { x: (ow + gw) / 2, y: od - gd },
            { x: (ow - gw) / 2, y: od - gd },
            { x: (ow - gw) / 2, y: od },
            { x: 0, y: od },
        ];

        ctx.beginPath();
        const firstPoint = this.worldToCanvas(points[0].x, points[0].y);
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < points.length; i++) {
            const p = this.worldToCanvas(points[i].x, points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
    },
    
    drawTShapeContainer(ctx, config) {
        const { stemWidthX: sw, stemDepthZ: sd, crossWidthX: cw, crossDepthZ: cd, crossOffsetZ: co } = config;

        // Center the T-shape within its bounding box (cw x sd)
        const offsetX = (cw - sw) / 2;

        const crossZStart = sd - cd + co;
        const crossZEnd = sd + co;

        const points = [
            { x: offsetX, y: 0 },
            { x: offsetX + sw, y: 0 },
            { x: offsetX + sw, y: crossZStart },
            { x: cw, y: crossZStart },
            { x: cw, y: crossZEnd },
            { x: 0, y: crossZEnd },
            { x: 0, y: crossZStart },
            { x: offsetX, y: crossZStart },
        ];

        ctx.beginPath();
        const firstPoint = this.worldToCanvas(points[0].x, points[0].y);
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < points.length; i++) {
            const p = this.worldToCanvas(points[i].x, points[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
    },

    drawZone(zone, isSelected) {
        const { ctx } = this.elements;
        const center = this.worldToCanvas(zone.x, zone.y);
        const scale = (this.worldToCanvas(1, 1).x - this.worldToCanvas(0, 0).x);
        const canvasWidth = zone.width * scale;
        const canvasHeight = zone.height * scale;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(zone.rotation);
        ctx.strokeStyle = isSelected ? '#e91e63' : '#333';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.fillStyle = isSelected ? 'rgba(233, 30, 99, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        ctx.strokeRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        ctx.restore();
    },

    getHandlePositions(zone) {
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;
        const corners = {
            tl: { x: -halfW, y: -halfH }, tr: { x: halfW, y: -halfH },
            bl: { x: -halfW, y: halfH },  br: { x: halfW, y: halfH },
            rotate: { x: 0, y: -halfH - 25 / ((this.worldToCanvas(1,1).x - this.worldToCanvas(0,0).x)) }
        };
        const c = Math.cos(zone.rotation);
        const s = Math.sin(zone.rotation);
        const canvasHandles = {};
        for (const name in corners) {
            const rotatedX = corners[name].x * c - corners[name].y * s;
            const rotatedY = corners[name].x * s + corners[name].y * c;
            canvasHandles[name] = this.worldToCanvas(zone.x + rotatedX, zone.y + rotatedY);
        }
        return canvasHandles;
    },

    drawHandles(zone) {
        const { ctx } = this.elements;
        const handles = this.getHandlePositions(zone);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#e91e63';
        ctx.lineWidth = 2;
        for (const name in handles) {
            ctx.beginPath();
            ctx.arc(handles[name].x, handles[name].y, name === 'rotate' ? 7 : 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    },

    syncUI() {
        this.updateEditButton();
        this.updateZoneTable();
    },

    updateEditButton() {
        if(this.elements.editToggleBtn) {
            this.elements.editToggleBtn.classList.toggle('active', this.state.isEditing);
        }
    },
    
    updateZoneTable() {
        if (!this.elements.zoneTableBody) return;
        this.elements.zoneTableBody.innerHTML = '';
        this.state.zones.forEach(zone => {
            const row = this.elements.zoneTableBody.insertRow();
            row.dataset.zoneId = zone.id;
            row.style.backgroundColor = zone.id === this.state.selectedZoneId ? '#fff0f5' : '';
            
            row.innerHTML = `
                <td>${zone.id}</td>
                <td><input type="number" data-prop="x" value="${zone.x.toFixed(0)}"></td>
                <td><input type="number" data-prop="y" value="${zone.y.toFixed(0)}"></td>
                <td><input type="number" data-prop="width" value="${zone.width.toFixed(0)}"></td>
                <td><input type="number" data-prop="height" value="${zone.height.toFixed(0)}"></td>
                <td><input type="number" data-prop="rotation" value="${(zone.rotation * 180 / Math.PI).toFixed(1)}"></td>
                <td><button class="action-btn btn-delete"><img src="./src/assets/temp_element/close.png"></button></td>
            `;

            row.addEventListener('click', () => {
                if (this.state.isEditing) {
                    this.state.selectedZoneId = zone.id;
                    this.syncUI();
                    this.redraw();
                }
            });

            row.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.state.zones = this.state.zones.filter(z => z.id !== zone.id);
                if (this.state.selectedZoneId === zone.id) this.state.selectedZoneId = null;
                this.syncUI();
                this.redraw();
            });

            row.querySelectorAll('input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const prop = e.target.dataset.prop;
                    let value = parseFloat(e.target.value);
                    if (prop === 'rotation') value = value * Math.PI / 180;
                    if (!isNaN(value)) {
                        zone[prop] = value;
                    }
                    this.redraw();
                    this.syncUI();
                });
            });
        });
    },
};

// --- Initialization Logic ---
if (typeof window !== 'undefined') {
    let initializedByEvent = false;

    // Mode 1: Listen for SPA view change event
    document.addEventListener("viewChanged", (e) => {
        if (e.detail.newViewId === 'view-cut-container') {
            console.log("Initializing cut_container.js via 'viewChanged' event.");
            CutContainerPage.init();
            initializedByEvent = true;
        }
    });

    // Mode 2: Fallback for direct HTML file load
    document.addEventListener('DOMContentLoaded', () => {
        if (initializedByEvent) return;
        if (document.getElementById('cut-canvas')) {
            console.log("Initializing cut_container.js directly (standalone mode).");
            CutContainerPage.init();
        }
    });
}