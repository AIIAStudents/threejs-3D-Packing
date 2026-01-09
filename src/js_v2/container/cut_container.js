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

                // Show Success Modal
                const modal = document.getElementById('success-modal');
                const successTitle = modal.querySelector('.modal-title');
                const okBtn = document.getElementById('btn-modal-ok');

                if (modal && okBtn) {
                    successTitle.textContent = '更新成功';
                    modal.classList.add('active');

                    // Handle OK click
                    const handleOk = () => {
                        modal.classList.remove('active');
                        okBtn.removeEventListener('click', handleOk);

                        // Proceed to next step
                        const assignSpaceTrigger = document.querySelector('.sidebar-section[data-target="view-assign-space"]');
                        if (assignSpaceTrigger) assignSpaceTrigger.click();
                    };

                    okBtn.addEventListener('click', handleOk);
                } else {
                    // Fallback
                    alert('切割工作已成功儲存到資料庫！');
                    const assignSpaceTrigger = document.querySelector('.sidebar-section[data-target="view-assign-space"]');
                    if (assignSpaceTrigger) assignSpaceTrigger.click();
                }

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
                    <button class="action-btn btn-delete" title="刪除區域">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="zone-card-body">
                    <div class="stat-row">
                        <span class="stat-label">空間利用率</span>
                        <div class="progress-bar-sm">
                            <div class="progress-fill" style="width: ${utilization}%"></div>
                        </div>
                        <span class="stat-value">${utilization.toFixed(1)}%</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">體積</span>
                        <span class="stat-value">${usedVolume.toFixed(0)} / ${totalVolume.toFixed(0)}</span>
                    </div>
                    <div class="zone-groups">
                        <span>分配群組:</span>
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

    // ... (keep toggleEditMode and others same)

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
        ctx.strokeStyle = '#FFFFFF'; // Pure White for container outline - Maximum Contrast
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 15]); // Even larger dashes for visibility
        switch (config.shape) {
            case 'u_shape': this.drawUShapeContainer(ctx, config); break;
            case 't_shape': this.drawTShapeContainer(ctx, config); break;
            case 'rect': default: this.drawRectContainer(ctx, config); break;
        }
        ctx.restore();
    },

    // ... (keep shape drawing functions same)

    drawZone(zone, isSelected) {
        const { ctx } = this.elements;
        const center = this.worldToCanvas(zone.x, zone.y);
        const scale = (this.worldToCanvas(1, 1).x - this.worldToCanvas(0, 0).x);
        const canvasWidth = zone.width * scale;
        const canvasHeight = zone.height * scale;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(zone.rotation);

        // High Visibility Colors
        if (isSelected) {
            ctx.strokeStyle = '#e91e63'; // Bright Pink
            ctx.fillStyle = 'rgba(233, 30, 99, 0.3)';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#FFFF00'; // Pure Bright Yellow
            ctx.fillStyle = 'rgba(255, 255, 0, 0.15)'; // Yellow tint
            ctx.lineWidth = 2;
        }

        ctx.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        ctx.strokeRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
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
        const points = [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: od }, { x: (ow + gw) / 2, y: od }, { x: (ow + gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od }, { x: 0, y: od },];
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
        const points = [{ x: offsetX, y: 0 }, { x: offsetX + sw, y: 0 }, { x: offsetX + sw, y: crossZStart }, { x: cw, y: crossZStart }, { x: cw, y: crossZEnd }, { x: 0, y: crossZEnd }, { x: 0, y: crossZStart }, { x: offsetX, y: crossZStart },];
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
        // Updated Zone Colors for Visibility
        if (isSelected) {
            ctx.strokeStyle = '#e91e63'; // Bright Pink
            ctx.fillStyle = 'rgba(233, 30, 99, 0.25)';
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = '#06b6d4'; // Cyan-500 for normal zones - VERY VISIBLE
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'; // Cyan tint
            ctx.lineWidth = 2;
        }

        ctx.fillRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        ctx.strokeRect(-canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
        ctx.restore();
    },

    getHandlePositions(zone) {
        // ... (getHandlePositions remains the same)
        const halfW = zone.width / 2;
        const halfH = zone.height / 2;
        const corners = { tl: { x: -halfW, y: -halfH }, tr: { x: halfW, y: -halfH }, bl: { x: -halfW, y: halfH }, br: { x: halfW, y: halfH }, rotate: { x: 0, y: -halfH - 25 / ((this.worldToCanvas(1, 1).x - this.worldToCanvas(0, 0).x)) } };
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
        if (this.elements.editToggleBtn) {
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