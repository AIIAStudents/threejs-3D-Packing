// This script is loaded as a module, so it runs in strict mode.

const API_BASE_URL = 'http://localhost:8888';

const CutContainerPage = {
    state: {
        containerConfig: null,
        zones: [],
        groups: [],
        items: [],
        assignments: {}, // Format: { zoneId: [groupId1, groupId2], ... }
        isEditing: false,
        selectedZoneId: null,
        draggingState: {
            isDragging: false,
            mode: null,
            startX: 0,
            startY: 0,
            activeHandle: null,
        },
    },

    elements: {},
    isInitialized: false,

    async init() {
        if (this.isInitialized) {
            await this.fetchData(); // Always refetch data when view is revisited
            return;
        }
        
        this.bindDOM();
        
        // Add listeners once during the very first initialization
        this.addEventListeners();
        this.isInitialized = true;
        
        // Fetch initial data and perform the first render
        await this.fetchData();
    },
    
    bindDOM() {
        this.elements.canvas = document.getElementById('cut-canvas');
        if (!this.elements.canvas) return;
        this.elements.ctx = this.elements.canvas.getContext('2d');
        this.elements.editToggleBtn = document.getElementById('edit-toggle-btn');
        this.elements.zoneCardContainer = document.getElementById('zone-card-container');
        this.elements.btnPrevStep = document.getElementById('btn-prev-step');
        this.elements.btnFinish = document.getElementById('btn-finish');
    },

    addEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        this.elements.editToggleBtn.addEventListener('click', () => this.toggleEditMode());
        this.elements.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.elements.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.elements.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.elements.canvas.addEventListener('mouseout', (e) => this.onMouseUp(e)); 

        this.elements.btnPrevStep.addEventListener('click', () => {
            const defineContainerTrigger = document.querySelector('.sidebar-section[data-target="view-space-size"]');
            if (defineContainerTrigger) defineContainerTrigger.click();
            else window.history.back();
        });

        this.elements.btnFinish.addEventListener('click', async () => {
            try {
                await this.saveCuttingJob();
                alert('切割工作已成功儲存到資料庫！');
                const assignSpaceTrigger = document.querySelector('.sidebar-section[data-target="view-assign-space"]');
                if (assignSpaceTrigger) assignSpaceTrigger.click();
            } catch (error) {
                alert(`儲存失敗：${error.message}`);
                console.error("Failed to save cutting job to DB:", error);
            }
        });
    },

    async fetchData() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/assignment-data`);
            if (!response.ok) throw new Error(`API request failed: ${response.status}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            this.state.containerConfig = data.container;
            
            console.log('[BEFORE FLATTEN]', JSON.parse(JSON.stringify(this.state.containerConfig)));
            if (this.state.containerConfig && this.state.containerConfig.parameters) {
                Object.assign(this.state.containerConfig, this.state.containerConfig.parameters);
            }
            console.log('[AFTER FLATTEN]', JSON.parse(JSON.stringify(this.state.containerConfig)));
            
            this.state.zones = data.zones.map((z, index) => ({
                db_length: z.length, 
                db_width: z.width,
                db_height: z.height,
                width: z.length,
                height: z.width,
                depth: z.height,
                x: z.x || (this.state.containerConfig.widthX / 2),
                y: z.y || (this.state.containerConfig.depthZ / 2),
                rotation: z.rotation || 0,
                id: z.id,
                label: z.label || (index + 1).toString(),
                assigned_group_ids: z.assigned_group_ids,
            }));

            this.state.groups = data.groups;
            this.state.items = data.items;
            
            this.state.assignments = {};
            this.state.zones.forEach(zone => {
                this.state.assignments[zone.id] = [];
                if (zone.assigned_group_ids) {
                    const groupIds = String(zone.assigned_group_ids).split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                    this.state.assignments[zone.id] = groupIds;
                }
            });
            
            if (this.state.zones.length > 0 && !this.state.selectedZoneId) {
                this.state.selectedZoneId = this.state.zones[0].id;
            }

        } catch (error) {
            console.warn("Could not fetch assignment data, falling back to localStorage for container config.", error);
            const configStr = localStorage.getItem('containerConfig');
            if (configStr) {
                this.state.containerConfig = JSON.parse(configStr);
                this.state.zones = (this.state.containerConfig.zones || []).map((z, index) => ({
                    ...z,
                    id: z.id || Date.now() + index,
                    label: z.label || (index + 1).toString(),
                }));
                 if (this.state.zones.length > 0 && !this.state.selectedZoneId) {
                    this.state.selectedZoneId = this.state.zones[0].id;
                }
            } else {
                this.state.containerConfig = { shape: 'rect', widthX: 5800, depthZ: 2300 };
            }
        } finally {
            this.calculateGroupVolumes();
            this.resizeCanvas();
            this.syncUI();
        }
    },

    calculateGroupVolumes() {
        const groupVolumes = {};
        this.state.groups.forEach(g => { groupVolumes[g.id] = 0; });
        this.state.items.forEach(item => {
            if (groupVolumes.hasOwnProperty(item.group_id)) {
                groupVolumes[item.group_id] += item.length * item.width * item.height;
            }
        });
        this.state.groups.forEach(group => {
            group.totalVolume = groupVolumes[group.id] || 0;
        });
    },

    async saveCuttingJob() {
        // ... (saveCuttingJob remains the same)
        if (!this.state.containerConfig || this.state.zones.length === 0) {
            throw new Error("沒有容器設定或區域資料可儲存。");
        }
        const payload = {
            container: this.state.containerConfig,
            zones: this.state.zones.map(zone => ({
                label: zone.label,
                length: zone.width,
                width: zone.height,
                height: zone.depth
            }))
        };
        const response = await fetch(`${API_BASE_URL}/api/v2/cutting/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ details: '無法解析錯誤訊息' }));
            throw new Error(errorData.details || `HTTP Error: ${response.status}`);
        }
        this.state.containerConfig.zones = this.state.zones;
        localStorage.setItem('containerConfig', JSON.stringify(this.state.containerConfig));
        const result = await response.json();
        console.log("API Save Response:", result);
    },

    getNextZoneLabel() {
        const existingLabels = this.state.zones.map(z => parseInt(z.label, 10)).filter(Number.isFinite);
        const maxLabel = existingLabels.length > 0 ? Math.max(...existingLabels) : 0;
        return (maxLabel + 1).toString();
    },
    
    onMouseUp(e) {
        // ... (onMouseUp remains the same)
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
                    label: this.getNextZoneLabel(),
                    x: Math.min(startX, endX) + width / 2,
                    y: Math.min(startY, endY) + height / 2,
                    width, height,
                    depth: this.state.containerConfig.heightY || 2400,
                    rotation: 0,
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

    renderZoneCards() {
        if (!this.elements.zoneCardContainer) return;
        this.elements.zoneCardContainer.innerHTML = '';
    
        this.state.zones.sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10));
    
        this.state.zones.forEach(zone => {
            const card = document.createElement('div');
            card.className = 'zone-card';
            if (zone.id === this.state.selectedZoneId) {
                card.classList.add('selected');
            }
            card.dataset.zoneId = zone.id;
    
            const totalVolume = zone.length * zone.width * zone.height;
            const assignedGroupIds = this.state.assignments[zone.id] || [];
            
            const usedVolume = assignedGroupIds.reduce((sum, groupId) => {
                const group = this.state.groups.find(g => g.id === groupId);
                return sum + (group ? group.totalVolume : 0);
            }, 0);

            const utilization = totalVolume > 0 ? (usedVolume / totalVolume) * 100 : 0;
            
            let assignedGroupsHtml = '';
            if (assignedGroupIds.length > 0) {
                assignedGroupsHtml = assignedGroupIds.map(groupId => {
                    const group = this.state.groups.find(g => g.id === groupId);
                    return `<span class="group-tag">${group ? group.name : `ID: ${groupId}`}</span>`;
                }).join(' ');
            } else {
                assignedGroupsHtml = '<span class="no-groups-text">尚無</span>';
            }

            card.innerHTML = `
                <div class="zone-card-header">
                    <span>區域 ${zone.label}</span>
                    <button class="action-btn btn-delete" title="刪除區域"><img src="./src/assets/temp_element/close.png"></button>
                </div>
                <div class="zone-card-body">
                    <p class="zone-stat">總體積: ${totalVolume.toFixed(0)} / 已用: ${usedVolume.toFixed(0)}</p>
                    <p class="zone-stat">空間利用率: ${utilization.toFixed(1)}%</p>
                    <div class="zone-groups">
                        <span>當前群組:</span>
                        <div class="group-tags-container">${assignedGroupsHtml}</div>
                    </div>
                </div>
            `;
    
            card.addEventListener('click', () => {
                if (this.state.isEditing) {
                    this.state.selectedZoneId = zone.id;
                    this.syncUI();
                    this.redraw();
                }
            });
    
            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.state.zones = this.state.zones.filter(z => z.id !== zone.id);
                this.state.zones.forEach((z, index) => { z.label = (index + 1).toString(); });
                if (this.state.selectedZoneId === zone.id) {
                    this.state.selectedZoneId = this.state.zones.length > 0 ? this.state.zones[0].id : null;
                }
                this.syncUI();
                this.redraw();
            });
    
            this.elements.zoneCardContainer.appendChild(card);
        });
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

    getContainerBoundingBox() {
        const config = this.state.containerConfig;
        if (!config) return { width: 100, height: 100 };
        return { width: config.widthX || 5800, height: config.depthZ || 2300 };
    },

    worldToCanvas(worldX, worldY) {
        // ... (worldToCanvas remains mostly the same)
        const { canvas } = this.elements;
        const bbox = this.getContainerBoundingBox();
        if (!canvas) return { x: 0, y: 0 };
        const scaleX = canvas.width / bbox.width;
        const scaleY = canvas.height / bbox.height;
        const scale = Math.min(scaleX, scaleY) * 0.95;
        const offsetX = (canvas.width - bbox.width * scale) / 2;
        const offsetY = (canvas.height - bbox.height * scale) / 2;
        return { x: worldX * scale + offsetX, y: worldY * scale + offsetY };
    },

    canvasToWorld(canvasX, canvasY) {
        // ... (canvasToWorld remains mostly the same)
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
        // ... (onMouseMove remains the same)
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

    hitTestRectangle(worldX, worldY) {
        // ... (hitTestRectangle remains the same)
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
        // ... (hitTestHandles remains the same)
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
        // ... (resizeZone remains the same)
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
        console.log('[DEBUG] Redrawing canvas with container config:', JSON.parse(JSON.stringify(this.state.containerConfig)));
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

    drawContainer() {
        const { ctx } = this.elements;
        const config = this.state.containerConfig;
        if (!config) return;
        ctx.save();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        switch (config.shape) {
            case 'u_shape': this.drawUShapeContainer(ctx, config); break;
            case 't_shape': this.drawTShapeContainer(ctx, config); break;
            case 'rect': default: this.drawRectContainer(ctx, config); break;
        }
        ctx.restore();
    },

    drawRectContainer(ctx, config) {
        const { widthX, depthZ } = config;
        const start = this.worldToCanvas(0, 0);
        const end = this.worldToCanvas(widthX, depthZ);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    },

    drawUShapeContainer(ctx, config) {
        const { outerWidthX: ow, outerDepthZ: od, gapWidthX: gw, gapDepthZ: gd } = config;
        const points = [ { x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: od }, { x: (ow + gw) / 2, y: od }, { x: (ow + gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od }, { x: 0, y: od }, ];
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
        const offsetX = (cw - sw) / 2;
        const crossZStart = sd - cd + co;
        const crossZEnd = sd + co;
        const points = [ { x: offsetX, y: 0 }, { x: offsetX + sw, y: 0 }, { x: offsetX + sw, y: crossZStart }, { x: cw, y: crossZStart }, { x: cw, y: crossZEnd }, { x: 0, y: crossZEnd }, { x: 0, y: crossZStart }, { x: offsetX, y: crossZStart }, ];
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
        // ... (drawZone remains the same)
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
        // ... (getHandlePositions remains the same)
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;
        const corners = { tl: { x: -halfW, y: -halfH }, tr: { x: halfW, y: -halfH }, bl: { x: -halfW, y: halfH },  br: { x: halfW, y: halfH }, rotate: { x: 0, y: -halfH - 25 / ((this.worldToCanvas(1,1).x - this.worldToCanvas(0,0).x)) } };
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
        // ... (drawHandles remains the same)
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
        this.renderZoneCards();
    },

    updateEditButton() {
                if(this.elements.editToggleBtn) {
                    this.elements.editToggleBtn.classList.toggle('active', this.state.isEditing);
                }
            },
        };
        
        // --- Initialization Logic ---
        if (typeof window !== 'undefined') {
            let initializedByEvent = false;
        
            // Mode 1: Listen for SPA view change event
            document.addEventListener("viewChanged", (e) => {
                if (e.detail.newViewId === 'view-cut-container') {
                    CutContainerPage.init();
                    initializedByEvent = true;
                }
            });
        
            // Mode 2: Fallback for direct HTML file load
            document.addEventListener('DOMContentLoaded', () => {
                if (initializedByEvent) return;
                if (document.getElementById('cut-canvas')) {
                    CutContainerPage.init();
                }
            });
        }