// This script is loaded as a module, so it runs in strict mode.

const API_BASE_URL = 'http://localhost:8888';

export const CutContainerPage = {
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
    this.elements.btnNextStep = document.getElementById('btn-next-step');
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
        alert('✓ 切割工作已成功儲存！');
      } catch (error) {
        alert(`❌ 儲存失敗：${error.message}`);
        console.error("Failed to save cutting job to DB:", error);
      }
    });

    this.elements.btnNextStep.addEventListener('click', () => {
      // Just navigate, no save
      window.location.hash = '/src/html/assign_space.html';
    });
  },

  async fetchData() {
    // Try to load from localStorage first
    const storedConfig = localStorage.getItem('containerConfig');
    if (storedConfig) {
      try {
        this.state.containerConfig = JSON.parse(storedConfig);
        console.log('Loaded container config from localStorage:', this.state.containerConfig);
      } catch (e) {
        console.warn('Failed to parse stored config:', e);
      }
    }

    // Start with empty zones for clean canvas
    this.state.zones = [];
    this.state.groups = [];
    this.state.items = [];
    this.state.assignments = {};
    this.state.selectedZoneId = null;

    // Try to load zones from API if available
    try {
      const zonesResponse = await fetch(`${API_BASE_URL}/api/zones`);
      if (zonesResponse.ok) {
        const zonesData = await zonesResponse.json();
        if (zonesData && zonesData.length > 0) {
          this.state.zones = zonesData.map((z, index) => ({
            db_length: z.length,
            db_width: z.width,
            db_height: z.height,
            width: z.length,
            height: z.width,
            depth: z.height,
            x: z.x || 0,
            y: z.y || 0,
            rotation: z.rotation || 0,
            id: z.id,
            label: z.label || (index + 1).toString(),
          }));
        }
      }
    } catch (error) {
      console.log('No saved zones found, starting with clean canvas');
    }

    // Load groups and items
    try {
      const groupsResponse = await fetch(`${API_BASE_URL}/api/groups`);
      if (groupsResponse.ok) {
        this.state.groups = await groupsResponse.json();
      }

      const itemsResponse = await fetch(`${API_BASE_URL}/api/items`);
      if (itemsResponse.ok) {
        this.state.items = await itemsResponse.json();
      }
    } catch (error) {
      console.log('Could not load groups/items:', error);
    }

    this.resizeCanvas();
    this.syncUI();
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
    if (!this.state.containerConfig || this.state.zones.length === 0) {
      throw new Error("沒有容器設定或區域資料可儲存。");
    }
    const payload = {
      container: this.state.containerConfig,
      zones: this.state.zones.map(zone => ({
        label: zone.label,
        length: zone.width,
        width: zone.height,
        height: zone.depth,
        x: zone.x,
        y: zone.y,
        rotation: zone.rotation
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
      if (zone.id === this.state.selectedZoneId) card.classList.add('selected');
      card.dataset.zoneId = zone.id;
      const totalVolume = zone.width * zone.height * zone.depth;
      const assignedGroupIds = this.state.assignments[zone.id] || [];
      const usedVolume = assignedGroupIds.reduce((sum, groupId) => {
        const group = this.state.groups.find(g => g.id === groupId);
        return sum + (group ? group.totalVolume : 0);
      }, 0);
      const utilization = totalVolume > 0 ? (usedVolume / totalVolume) * 100 : 0;
      let assignedGroupsHtml = assignedGroupIds.length > 0 ? assignedGroupIds.map(groupId => {
        const group = this.state.groups.find(g => g.id === groupId);
        return `<span class="group-tag">${group ? group.name : `ID: ${groupId}`}</span>`;
      }).join(' ') : '<span class="no-groups-text">尚無</span>';
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
                </div>`;
      card.addEventListener('click', () => {
        if (this.state.isEditing) {
          this.state.selectedZoneId = zone.id;
          this.syncUI(); this.redraw();
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
    let dims;
    switch (config.shape) {
      case 'u_shape':
        dims = { width: config.outerWidthX, height: config.outerDepthZ };
        break;
      case 't_shape':
        dims = { width: config.crossWidthX, height: config.stemDepthZ };
        break;
      case 'rect':
      default:
        dims = { width: config.widthX, height: config.depthZ };
        break;
    }
    return dims;
  },

  worldToCanvas(worldX, worldY) {
    const { canvas } = this.elements;
    const bbox = this.getContainerBoundingBox();
    if (!canvas) return { x: 0, y: 0 };
    const scaleX = canvas.width / bbox.width;
    const scaleY = canvas.height / bbox.height;
    const scale = Math.min(scaleX, scaleY) * 0.95;
    const offsetX = (canvas.width - bbox.width * scale) / 2;
    const offsetY = (canvas.height - bbox.height * scale) / 2;

    if (worldX === 0 && worldY === 0) {
      console.log('[DEBUG-W2C] BBox:', bbox, 'Canvas Size:', { w: canvas.width, h: canvas.height }, 'Scale:', scale);
    }

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

  hitTestRectangle(worldX, worldY) {
    for (let i = this.state.zones.length - 1; i >= 0; i--) {
      const zone = this.state.zones[i];
      const dx = worldX - zone.x;
      const dy = worldY - zone.y;
      const localX = dx * Math.cos(-zone.rotation) - dy * Math.sin(-zone.rotation);
      const localY = dx * Math.sin(-zone.rotation) + dy * Math.cos(-zone.rotation);
      if (Math.abs(localX) < zone.width / 2 && Math.abs(localY) < zone.height / 2) return zone;
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
      if (dx * dx + dy * dy < handleRadius * handleRadius) return handleName;
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

    // Draw grid background
    this.drawGrid();

    // Draw container outline
    this.drawContainer();

    // Draw zones
    this.state.zones.forEach(zone => {
      const isSelected = zone.id === this.state.selectedZoneId;
      this.drawZone(zone, isSelected);
      if (this.state.isEditing && isSelected) {
        this.drawHandles(zone);
      }
    });
  },

  drawGrid() {
    const { ctx, canvas } = this.elements;
    if (!ctx || !canvas) return;

    ctx.save();
    ctx.strokeStyle = '#E8DCC8';
    ctx.lineWidth = 1;

    const gridSize = 50; // pixels

    // Draw vertical lines
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.restore();
  },

  drawContainer() {
    const { ctx } = this.elements;
    const config = this.state.containerConfig;
    if (!config) {
      console.warn('No container config found');
      return;
    }
    ctx.save();
    ctx.strokeStyle = '#A67C52';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);  // Solid line
    ctx.fillStyle = 'rgba(166, 124, 82, 0.05)';

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
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  },

  drawUShapeContainer(ctx, config) {
    const { outerWidthX: ow, outerDepthZ: od, gapWidthX: gw, gapDepthZ: gd } = config;
    console.log('[DEBUG-USHAPE] Dims:', { ow, od, gw, gd });
    const points = [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: od }, { x: (ow + gw) / 2, y: od }, { x: (ow + gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od - gd }, { x: (ow - gw) / 2, y: od }, { x: 0, y: od },];
    ctx.beginPath();
    const firstPoint = this.worldToCanvas(points[0].x, points[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.worldToCanvas(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },

  drawTShapeContainer(ctx, config) {
    const { stemWidthX: sw, stemDepthZ: sd, crossWidthX: cw, crossDepthZ: cd, crossOffsetZ: co } = config;

    // 計算偏移量與交叉區域位置
    const offsetX = (cw - sw) / 2;  // 莖部在 X 軸的偏移（置中）
    const crossZStart = co;         // 交叉部分開始的 Z 位置
    const crossZEnd = co + cd;      // 交叉部分結束的 Z 位置

    console.log('[DEBUG-TSHAPE] Dims:', { sw, sd, cw, cd, co, offsetX, crossZStart, crossZEnd });

    // T型輪廓點（順時針繪製完整 T 型）
    const points = [
      // 從莖部左上開始
      { x: offsetX, y: 0 },                    // 1. 莖部左上
      { x: offsetX + sw, y: 0 },               // 2. 莖部右上
      { x: offsetX + sw, y: crossZStart },     // 3. 莖部右側到交叉開始
      { x: cw, y: crossZStart },               // 4. 交叉右上
      { x: cw, y: crossZEnd },                 // 5. 交叉右下
      { x: offsetX + sw, y: crossZEnd },       // 6. 回到莖部右側
      { x: offsetX + sw, y: sd },              // 7. 莖部右下（完整深度）
      { x: offsetX, y: sd },                   // 8. 莖部左下（完整深度）
      { x: offsetX, y: crossZEnd },            // 9. 回到莖部左側
      { x: 0, y: crossZEnd },                  // 10. 交叉左下
      { x: 0, y: crossZStart },                // 11. 交叉左上
      { x: offsetX, y: crossZStart },          // 12. 回到莖部左側
    ];

    ctx.beginPath();
    const firstPoint = this.worldToCanvas(points[0].x, points[0].y);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.worldToCanvas(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
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
