import * as THREE from 'three';
import { showExclusiveUI } from './uiManager.js';
import * as api from '../utils/agentAPI.js';
import { getContainer, getContainerDimensions, getContainerOrigin, getContainerShape } from './container/containerManager.js';
import { createZonePhysicsWalls, clearZonePhysicsWalls } from '../utils/zone_physics.js';
import { showPackingControls } from './uiControls.js';
import { log, LOG_VERBOSE } from '../utils/logger.js';

/**
 * 本地實現的 countBy，避免引入 lodash 依賴
 * @param {Array} collection
 * @param {string|Function} iteratee
 * @returns {Object}
 */
function _countBy(collection, iteratee) {
  return collection.reduce((acc, value) => {
    const key = typeof iteratee === 'function' ? iteratee(value) : value[iteratee];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

const SpacePlanningManager = {
  
  state: {
    isActive: false,
    isDragging: false,
    currentMode: 'IDLE',
    containerShape: 'default',
    containerDimensions: null,
    containerOrigin: { x: 0, y: 0, z: 0 },
    containerPixelBounds: null,
    pixelScale: { sx: 1, sz: 1 },
    definedZones: [],
    tempZone: null,
    availableGroups: [],
    zoneGroupMapping: new Map(),
    isPackingInProgress: false,
  },

  _boundHandlers: {},
  scene: null,
  ui: {},

  init(options) {
    const { scene, groupManager } = options;
    if (this.state.isActive) return;
    console.log("[SPM] Init called");

    if (!this.bindUIElements()) {
      alert("空間規劃介面缺少必要的 DOM 元素，請檢查 HTML 結構與 ID。");
      return;
    }
    this.scene = scene;
    this.groupManager = groupManager;

    this.state.containerDimensions = getContainerDimensions();
    this.state.containerOrigin = getContainerOrigin();
    this.state.containerShape = getContainerShape();
    this.state.isActive = true;
    this.state.currentMode = 'IDLE';
    this.state.definedZones = [];
    this.state.zoneGroupMapping = new Map();

    showExclusiveUI('space-planning-view');
    this.setupCanvas();
    this.addEventListeners();
    this.redrawAll();
    this.updateUI();
  },

  bindUIElements() {
    this.ui = {
        planningContainer: document.getElementById('space-planning-view'),
        canvas: document.getElementById('top-down-canvas'),
        ctx: document.getElementById('top-down-canvas')?.getContext('2d'),
        editButton: document.getElementById('btn-edit'),
        checkButton: document.getElementById('btn-check'),
        closeButton: document.getElementById('btn-close'),
        nextButton: document.getElementById('btn-next'),
        closePlanningBtn: document.getElementById('close-space-planning-btn'),
        assignmentView: {
            container: document.getElementById('assignment-view-container'),
            zoneList: document.getElementById('zone-list'),
            groupList: document.getElementById('group-list'),
        },
        groupFlowControls: document.getElementById('group-flow-controls'),
        packingExecuteBtn: document.getElementById('play-btn'),
    };
    const required = Object.entries(this.ui).filter(([_, v]) => v !== null && typeof v !== 'object');
    const missing = required.filter(([_, v]) => !v);
    if (missing.length > 0) {
      console.error('[SpacePlanning] Missing critical UI elements:', missing.map(([k]) => k));
      return false;
    }
    return true;
  },

  setupCanvas() {
    if (!this.ui.canvas) return;
    this.ui.canvas.width  = this.ui.planningContainer.clientWidth;
    this.ui.canvas.height = this.ui.planningContainer.clientHeight;
  },

  addEventListeners() {
    this.resetEventListeners();
    this._boundHandlers = {
      toggleEditMode: this.toggleEditMode.bind(this),
      confirmZone: this.confirmZone.bind(this),
      cancelEdit: this.cancelEdit.bind(this),
      enterNextStage: this.enterNextStage.bind(this),
      reset: this.reset.bind(this),
      onDragStart: this.onDragStart.bind(this),
      onDrag: this.onDrag.bind(this),
      onDragEnd: this.onDragEnd.bind(this),
      handleKeyDown: this.handleKeyDown.bind(this),
      executePacking: this.executePacking.bind(this),
    };
    this.ui.editButton.addEventListener('click', this._boundHandlers.toggleEditMode);
    this.ui.checkButton.addEventListener('click', this._boundHandlers.confirmZone);
    this.ui.closeButton.addEventListener('click', this._boundHandlers.cancelEdit);
    this.ui.nextButton.addEventListener('click', this._boundHandlers.enterNextStage);
    this.ui.closePlanningBtn.addEventListener('click', this._boundHandlers.reset);
    this.ui.canvas.addEventListener('mousedown', this._boundHandlers.onDragStart);
    this.ui.canvas.addEventListener('mousemove', this._boundHandlers.onDrag);
    this.ui.canvas.addEventListener('mouseup', this._boundHandlers.onDragEnd);
    document.addEventListener('keydown', this._boundHandlers.handleKeyDown);
    this.ui.packingExecuteBtn.addEventListener('click', this._boundHandlers.executePacking);
  },

  resetEventListeners() {
    if (!this._boundHandlers || Object.keys(this._boundHandlers).length === 0) return;
    this.ui.editButton?.removeEventListener('click', this._boundHandlers.toggleEditMode);
    this.ui.checkButton?.removeEventListener('click', this._boundHandlers.confirmZone);
    this.ui.closeButton?.removeEventListener('click', this._boundHandlers.cancelEdit);
    this.ui.nextButton?.removeEventListener('click', this._boundHandlers.enterNextStage);
    this.ui.closePlanningBtn?.removeEventListener('click', this._boundHandlers.reset);
    this.ui.canvas?.removeEventListener('mousedown', this._boundHandlers.onDragStart);
    this.ui.canvas?.removeEventListener('mousemove', this._boundHandlers.onDrag);
    this.ui.canvas?.removeEventListener('mouseup', this._boundHandlers.onDragEnd);
    document.removeEventListener('keydown', this._boundHandlers.handleKeyDown);
    this.ui.packingExecuteBtn?.removeEventListener('click', this._boundHandlers.executePacking);
    this._boundHandlers = {};
  },

  updateUI() {
    if (!this.ui.planningContainer || !this.state.isActive) return;
    const isAssigning = this.state.currentMode === 'ASSIGNING_GROUPS';
    const isEditing = this.state.currentMode === 'EDITING_SPACE';
    this.ui.canvas.style.display = isAssigning ? 'none' : 'block';
    this.ui.assignmentView.container.style.display = isAssigning ? 'flex' : 'none';
    this.ui.checkButton.style.display = isEditing ? 'block' : 'none';
    this.ui.closeButton.style.display = isEditing ? 'block' : 'none';
    this.ui.editButton.style.display = isAssigning ? 'none' : 'block';
    this.ui.nextButton.style.display = isAssigning ? 'none' : 'block';
    this.ui.editButton.classList.toggle('active', isEditing);
    this.ui.nextButton.disabled = this.state.definedZones.length === 0;
    if (this.ui.groupFlowControls) {
      this.ui.groupFlowControls.style.display = isAssigning ? 'flex' : 'none';
    }
  },

  handleKeyDown(e) {
    if (this.state.isActive && this.state.currentMode === 'EDITING_SPACE' && e.key === 'Escape') {
      this.state.tempZone = null;
      this.redrawAll();
    }
  },

  toggleEditMode() {
    this.state.currentMode = this.state.currentMode === 'EDITING_SPACE' ? 'IDLE' : 'EDITING_SPACE';
    console.log('[SPM] Mode toggled to:', this.state.currentMode);
    this.updateUI();
  },

  confirmZone() {
    if (!this.state.tempZone) return;
    const worldBounds = this._mapPixelToWorld(this.state.tempZone);
    if (!worldBounds || !this._validateZone(worldBounds)) {
      alert('Invalid Zone: Zone is outside of the container bounds or overlaps with another zone.');
      return;
    }
    const newZone = { id: `A${this.state.definedZones.length}`, pixelBounds: { ...this.state.tempZone }, worldBounds };
    this.state.definedZones.push(newZone);
    this.state.tempZone = null;
    this.redrawAll();
    this.updateUI();
  },

  cancelEdit() {
    this.state.tempZone = null;
    this.state.currentMode = 'IDLE';
    this.redrawAll();
    this.updateUI();
  },

  async enterNextStage() {
    if (this.state.definedZones.length === 0) return;
    this.visualizeZones3D(this.state.definedZones);
    this.state.currentMode = 'ASSIGNING_GROUPS';
    this.updateUI();
    this.populateAssignmentLists();
  },

  applyPackingResult(result, trace_id) {
    const t_start = performance.now();
    if (!result || !Array.isArray(result.packed_objects)) {
      log('ERROR', 'SpacePlanning', trace_id, '套用打包結果失敗，格式無效', { result });
      return;
    }
  
    const stats = result.statistics || {};
    log('INFO', 'SpacePlanning', trace_id, '收到打包結果，開始套用', {
        packed: stats.packed_objects ?? 0,
        unpacked: stats.unpacked_objects ?? 0,
        utilization: stats.volume_utilization ?? 'N/A',
        partitions: result.partitions?.length ?? 0
    });
  
    let applied_count = 0;
    let skipped_count = 0;
  
    for (const obj of result.packed_objects) {
      const { uuid, position, rotation } = obj;
      if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
        log('WARN', 'SpacePlanning', trace_id, '物件位置無效，已跳過', { uuid, position });
        skipped_count++;
        continue;
      }
      if (window.objectManager?.updateItemPlacement) {
          window.objectManager.updateItemPlacement(uuid, position, rotation);
          applied_count++;
      } else {
          log('WARN', 'SpacePlanning', trace_id, '找不到objectManager.updateItemPlacement', { uuid });
          skipped_count++;
      }
    }
  
    if (LOG_VERBOSE) {
      log('INFO', 'ObjectManager', trace_id, '更新物件位置', {
          updated: applied_count,
          skipped: skipped_count
      });
    }
  
    if (applied_count > 0) {
      document.dispatchEvent(new CustomEvent('sceneNeedsRender', { detail: { trace_id } }));
      showPackingControls();
    }
    const duration_ms = performance.now() - t_start;
    log('INFO', 'SpacePlanning', trace_id, '打包結果套用完畢', { duration_ms: duration_ms.toFixed(2) });
  },

  async executePacking() {
    if (this.state.isPackingInProgress) return;
    this.state.isPackingInProgress = true;
    
    const trace_id = crypto.randomUUID();
    const t_start_total = performance.now();
    log('INFO', 'SpacePlanning', trace_id, '開始執行打包流程');

    try {
        const allItems = [];
        const allGroupIds = new Set();
        this.state.zoneGroupMapping.forEach(ids => ids.forEach(id => allGroupIds.add(id)));
        
        const itemArrays = await Promise.all(Array.from(allGroupIds).map(gid => api.getGroupItems(gid)));
        itemArrays.forEach(items => allItems.push(...items));
        
        const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());

        if (uniqueItems.length === 0) {
            alert("所選群組內沒有物品，無法執行打包。");
            log('WARN', 'SpacePlanning', trace_id, '打包中止，沒有物品');
            return;
        }

        const zonesPayload = this.state.definedZones.map(z => ({
            id: z.id,
            world_bounds: z.worldBounds,
            group_ids: this.state.zoneGroupMapping.get(z.id) || []
        }));

        const payload = {
          container_size: this.state.containerDimensions,
          container_origin: this.state.containerOrigin,
          zones: zonesPayload,
          objects: uniqueItems.map(it => ({
            uuid: String(it.id ?? it.uuid ?? crypto.randomUUID()),
            group_id: String(it.group_id ?? it.groupId ?? 'G1'),
            dimensions: {
              width:  it.width  ?? it.dimensions?.width  ?? it.dims?.x ?? 10,
              height: it.height ?? it.dimensions?.height ?? it.dims?.y ?? 10,
              depth:  it.depth  ?? it.dimensions?.depth  ?? it.dims?.z ?? 10,
            },
            weight:    Number(it.weight ?? 0),
            confirmed: Boolean(it.confirmed ?? (it.status === 'confirmed')),
          })),
        };

        if (LOG_VERBOSE) {
            const groupCounts = _countBy(payload.objects, 'group_id');
            const statusCounts = _countBy(payload.objects, 'confirmed');
            log('INFO', 'SpacePlanning', trace_id, '準備送出打包請求', {
                '物件總數': payload.objects.length,
                '群組分布': groupCounts,
                '狀態分布': {
                    'confirmed': statusCounts['true'] || 0,
                    'unconfirmed': statusCounts['false'] || 0,
                },
                '容器尺寸': payload.container_size,
                '區域數量': payload.zones.length,
            });
        }
        
        const url = `${api.PACK_BASE_URL}/api/pack_objects`;
        const result = await api.postJSON(url, payload, trace_id);

        if (result?.success && result.packed_objects) {
            this.applyPackingResult(result, trace_id);
        } else {
            log('ERROR', 'SpacePlanning', trace_id, '打包API回傳失敗或無結果', { message: result.message || '未知錯誤' });
            alert(`打包失敗: ${result.message || '未知錯誤'}`);
        }

    } catch (error) {
        log('ERROR', 'SpacePlanning', trace_id, '執行打包時發生例外', {
            error_type: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3)
        });
    } finally {
        this.state.isPackingInProgress = false;
        const duration_ms = performance.now() - t_start_total;
        log('INFO', 'SpacePlanning', trace_id, '打包全流程結束', { total_duration_ms: duration_ms.toFixed(2) });
        this.reset(); // Close the UI
    }
  },

  populateAssignmentLists() {
    if (!this.ui.assignmentView.container) return;
    const availableGroups = this.groupManager.getAllGroups();
    this.ui.assignmentView.zoneList.innerHTML = '<h3>空間區域 (Zones)</h3>';
    this.ui.assignmentView.groupList.innerHTML = '<h3>群組 (Groups)</h3>';
    this.state.definedZones.forEach(zone => {
      const zoneEl = document.createElement('div');
      zoneEl.className = 'list-item zone-list-item';
      zoneEl.dataset.zoneId = zone.id;
      zoneEl.innerHTML = `<span>${zone.id}</span><div class="assigned-groups"></div>`;
      this.ui.assignmentView.zoneList.appendChild(zoneEl);
    });
    availableGroups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'list-item group-list-item';
      groupEl.draggable = true;
      groupEl.dataset.groupId = group.id;
      groupEl.textContent = group.name;
      this.ui.assignmentView.groupList.appendChild(groupEl);
    });
    this.addDragAndDropHandlers();
  },
  
  addDragAndDropHandlers() {
      const groups = this.ui.assignmentView.groupList.querySelectorAll('.group-list-item');
      const zones = this.ui.assignmentView.zoneList.querySelectorAll('.zone-list-item');
      groups.forEach(group => group.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', group.dataset.groupId)));
      zones.forEach(zone => {
          zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drop-target-hover'); });
          zone.addEventListener('dragleave', () => zone.classList.remove('drop-target-hover'));
          zone.addEventListener('drop', e => {
              e.preventDefault();
              zone.classList.remove('drop-target-hover');
              const groupId = e.dataTransfer.getData('text/plain');
              const zoneId = zone.dataset.zoneId;
              const mapping = this.state.zoneGroupMapping.get(zoneId) || [];
              if (!mapping.includes(groupId)) {
                  mapping.push(groupId);
                  this.state.zoneGroupMapping.set(zoneId, mapping);
              }
              const groupEl = this.ui.assignmentView.groupList.querySelector(`[data-group-id='${groupId}']`);
              if (groupEl) groupEl.style.display = 'none';
              const assignedContainer = zone.querySelector('.assigned-groups');
              const assignedEl = document.createElement('div');
              assignedEl.className = 'assigned-group-tag';
              assignedEl.textContent = groupEl.textContent;
              assignedContainer.appendChild(assignedEl);
          });
      });
  },

  onDragStart(e) {
    if (this.state.currentMode !== 'EDITING_SPACE') return;
    this.state.isDragging = true;
    const rect = this.ui.canvas.getBoundingClientRect();
    const SNAP_STEP = 6;
    const startX = Math.round((e.clientX - rect.left) / SNAP_STEP) * SNAP_STEP;
    const startY = Math.round((e.clientY - rect.top) / SNAP_STEP) * SNAP_STEP;
    this.state.tempZone = { x: startX, y: startY, w: 0, h: 0, startX: startX, startY: startY };
  },

  onDrag(e) {
    if (!this.state.isDragging || !this.state.tempZone) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const SNAP_STEP = 6;
    const currentX = Math.round((e.clientX - rect.left) / SNAP_STEP) * SNAP_STEP;
    const currentY = Math.round((e.clientY - rect.top) / SNAP_STEP) * SNAP_STEP;
    this.state.tempZone.x = Math.min(currentX, this.state.tempZone.startX);
    this.state.tempZone.y = Math.min(currentY, this.state.tempZone.startY);
    this.state.tempZone.w = Math.abs(currentX - this.state.tempZone.startX);
    this.state.tempZone.h = Math.abs(currentY - this.state.tempZone.startY);
    this.redrawAll();
  },

  onDragEnd() {
    if (this.state.currentMode !== 'EDITING_SPACE') return;
    this.state.isDragging = false;
  },

  redrawAll(isError = false) {
    if (!this.ui.ctx) return;
    this.ui.ctx.clearRect(0, 0, this.ui.canvas.width, this.ui.canvas.height);
    this.drawContainerOutline();
    this.drawDefinedZones();
    this.drawTempZone(isError);
  },

  drawContainerOutline() {
    
    const dims = this.state.containerDimensions;
    console.log('[DEBUG] containerShape =', this.state.containerShape, 'dims =', dims);
    if (!dims) return;
    const margin = 40;
    const canvasWidth = this.ui.canvas.width - margin * 2;
    const canvasHeight = this.ui.canvas.height - margin * 2;
    const outerWidth = dims.outerWidth || dims.width;
    const outerDepth = dims.outerDepth || dims.depth;

    const scale = Math.min(canvasWidth / outerWidth, canvasHeight / outerDepth);
    const pixelW = outerWidth * scale;
    const pixelH = outerDepth * scale;
    
    const sx = scale;
    const sz = scale;

    const startX = (this.ui.canvas.width - pixelW) / 2;
    const startY = (this.ui.canvas.height - pixelH) / 2;
    this.state.containerPixelBounds = { x: startX, y: startY, w: pixelW, h: pixelH };
    this.state.pixelScale = { sx, sz };
    console.log('Drawing outline with scale:', scale, 'and bounds:', this.state.containerPixelBounds);
    
    this.ui.ctx.strokeStyle = '#666';
    this.ui.ctx.lineWidth = 2;
    this.ui.ctx.beginPath();

    this.ui.ctx.fillStyle = '#333';
    this.ui.ctx.font = '14px Arial';
    this.ui.ctx.textAlign = 'center';
    const shapeName = this.state.containerShape === 'l-shape' ? 'L-Shape' : 'Rectangular';
    console.log('[SPM] Drawing L-shape outline with dims:', dims);
    this.ui.ctx.fillText(`Shape: ${shapeName}`, this.ui.canvas.width / 2, startY - 10);

    // 修正：使用更嚴格的檢查，並移除臨時補丁，因為 notch 尺寸現在應該從 userData 正確傳入
    const hasNotch = this.state.containerShape === 'l-shape' &&
                     typeof dims.notchWidth === 'number' && dims.notchWidth > 0 &&
                     typeof dims.notchDepth === 'number' && dims.notchDepth > 0;

    if (hasNotch) {
        const p0 = { x: startX, y: startY };
        const p1 = { x: startX + pixelW, y: startY };
        const p2 = { x: startX + pixelW, y: startY + (dims.notchDepth * sz) };
        const p3 = { x: startX + (dims.notchWidth * sx), y: startY + (dims.notchDepth * sz) };
        const p4 = { x: startX + (dims.notchWidth * sx), y: startY + pixelH };
        const p5 = { x: startX, y: startY + pixelH };
        this.ui.ctx.moveTo(p0.x, p0.y);
        this.ui.ctx.lineTo(p1.x, p1.y);
        this.ui.ctx.lineTo(p2.x, p2.y);
        this.ui.ctx.lineTo(p3.x, p3.y);
        this.ui.ctx.lineTo(p4.x, p4.y);
        this.ui.ctx.lineTo(p5.x, p5.y);
        this.ui.ctx.closePath();
    } else {
        this.ui.ctx.rect(startX, startY, pixelW, pixelH);
    }
    this.ui.ctx.stroke();
  },

  _mapPixelToWorld(pixelRect) {
    const container = getContainer();
    if (!container || !this.state.containerPixelBounds || !this.state.pixelScale) return null;

    const cPixel = this.state.containerPixelBounds;
    const dims = this.state.containerDimensions;
    const { sx, sz } = this.state.pixelScale;

    // Map pixel rect to container's LOCAL 2D coordinates (origin at top-left)
    const localX = (pixelRect.x - cPixel.x) / sx;
    const localZ = (pixelRect.y - cPixel.y) / sz;
    const localWidth = pixelRect.w / sx;
    const localDepth = pixelRect.h / sz;

    // Convert from container's top-left-based local coords to its center-based local coords
    const localCenterX = localX - (dims.width / 2);
    const localCenterZ = localZ - (dims.depth / 2);

    // Create a zone box in LOCAL space (relative to container's center)
    const zoneBoxLocal = new THREE.Box3(
        new THREE.Vector3(localCenterX, -dims.height / 2, localCenterZ),
        new THREE.Vector3(localCenterX + localWidth, dims.height / 2, localCenterZ + localDepth)
    );

    // Transform the local zone box into WORLD space
    const zoneBoxWorld = zoneBoxLocal.clone().applyMatrix4(container.matrixWorld);

    // Get container's world AABB for clamping
    container.updateWorldMatrix(true, false);
    const containerAABB = new THREE.Box3().setFromObject(container);

    // Clamp the world-space zone box to the container's world AABB
    zoneBoxWorld.min.x = Math.max(zoneBoxWorld.min.x, containerAABB.min.x);
    zoneBoxWorld.min.z = Math.max(zoneBoxWorld.min.z, containerAABB.min.z);
    zoneBoxWorld.max.x = Math.min(zoneBoxWorld.max.x, containerAABB.max.x);
    zoneBoxWorld.max.z = Math.min(zoneBoxWorld.max.z, containerAABB.max.z);
    zoneBoxWorld.min.y = Math.max(zoneBoxWorld.min.y, containerAABB.min.y);
    zoneBoxWorld.max.y = Math.max(zoneBoxWorld.max.y, containerAABB.max.y);

    const clampedSize = zoneBoxWorld.getSize(new THREE.Vector3());

    if (clampedSize.x <= 0 || clampedSize.z <= 0) {
        console.warn("Zone validation failed: Clamped zone has zero width or depth.");
        return null;
    }

    const worldBounds = {
        x: zoneBoxWorld.min.x,
        y: zoneBoxWorld.min.y,
        z: zoneBoxWorld.min.z,
        width: clampedSize.x,
        height: clampedSize.y,
        depth: clampedSize.z,
    };

    console.log('[SPM] mapped pixel → world bounds:', worldBounds, '(clamped)');
    return worldBounds;
  },

  drawDefinedZones() {
    this.state.definedZones.forEach(zone => {
      this.ui.ctx.fillStyle = 'rgba(128, 128, 128, 0.25)';
      this.ui.ctx.strokeStyle = '#666666';
      this.ui.ctx.lineWidth = 1.25;
      this.ui.ctx.fillRect(zone.pixelBounds.x, zone.pixelBounds.y, zone.pixelBounds.w, zone.pixelBounds.h);
      this.ui.ctx.strokeRect(zone.pixelBounds.x, zone.pixelBounds.y, zone.pixelBounds.w, zone.pixelBounds.h);
      this.ui.ctx.fillStyle = '#333';
      this.ui.ctx.font = '16px Arial';
      this.ui.ctx.fillText(zone.id, zone.pixelBounds.x + 5, zone.pixelBounds.y + 20);
    });
  },

  drawTempZone(isError = false) {
    if (!this.state.tempZone) return;
    this.ui.ctx.fillStyle = isError ? 'rgba(255, 0, 0, 0.4)' : 'rgba(128, 128, 128, 0.25)';
    this.ui.ctx.strokeStyle = isError ? '#FF0000' : '#666666';
    this.ui.ctx.lineWidth = isError ? 2 : 1.25;
    this.ui.ctx.fillRect(this.state.tempZone.x, this.state.tempZone.y, this.state.tempZone.w, this.state.tempZone.h);
    this.ui.ctx.strokeRect(this.state.tempZone.x, this.state.tempZone.y, this.state.tempZone.w, this.state.tempZone.h);
  },

  _validateZone(worldBounds) {
      if (!worldBounds) return false;
      // Primary validation now happens in _mapPixelToWorld which returns null on failure.
      return worldBounds.width > 0 && worldBounds.depth > 0;
  },

  visualizeZones3D(zones, color = 0x888888) {
    if (!this.scene) return;
    
    const oldGroup = this.scene.getObjectByName('partitionGroup'); // Use new name
    if (oldGroup) this.scene.remove(oldGroup);

    clearZonePhysicsWalls();

    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'partitionGroup'; // Use new name

    zones.forEach(z => {
      const { x, y, z: zz, width, height, depth } = z.worldBounds;
      const geo = new THREE.BoxGeometry(width, height, depth);
      const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.25, depthWrite: true });
      const mesh = new THREE.Mesh(geo, mat);
      
      mesh.position.set(x + width / 2, y + height / 2, zz + depth / 2);
      zoneGroup.add(mesh);

      createZonePhysicsWalls(z);
    });

    this.scene.add(zoneGroup);
    console.log(`Visualized ${zones.length} zones in 3D scene.`);
  },

  reset() {
    this.resetEventListeners();
    if (this.scene) {
        const oldGroup = this.scene.getObjectByName('__zoneVisualization');
        if (oldGroup) this.scene.remove(oldGroup);
    }
    clearZonePhysicsWalls();

    this.state.isActive = false;
    this.state.isPackingInProgress = false;
    this.state.currentMode = 'IDLE';
    this.state.definedZones = [];
    this.state.tempZone = null;
    showExclusiveUI(null);
  }
};

window.SpacePlanningManager = SpacePlanningManager;
export default SpacePlanningManager;
