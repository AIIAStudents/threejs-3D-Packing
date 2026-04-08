import { assignSpaceService } from '../../frontend/contexts/allocation/application/assign-space-service.js';

const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 560;
const MIN_SCALE = 0.78;
const MAX_SCALE = 2.6;
const ZOOM_STEP = 1.14;
const WHEEL_ZOOM_SENSITIVITY = 0.0016;
const LINE_DELTA_PX = 16;

const COPY = {
  defaultTip: [
    '從右側群組池拖曳群組卡片到左側空間畫布完成配置。',
    '綠色代表可放置，黃色代表可放置但需注意，紅色代表不可放置。',
    '在畫布上用滾輪可平移視角，按住 Ctrl 或 Cmd 再滾輪可縮放。',
    '已分配群組可重新拖曳到其他空間，或拖回群組池上方取消配置。'
  ],
  fit: {
    none: '尚未選擇群組',
    blocked: '不可放置',
    warning: '需人工確認',
    ok: '可配置'
  },
  health: {
    ok: '正常',
    warning: '需檢查',
    error: '有衝突'
  },
  dropState: {
    origin: '目前位置',
    blocked: '不可放置',
    warn: '需確認',
    allowed: '可放置'
  },
  mode: {
    shared: '共用配置',
    exclusive: '獨占配置',
    percentage: '比例配置',
    priority_queue: '優先佇列'
  },
  intent: {
    quick_pick: '快取優先',
    balanced: '平衡配置',
    reserve: '保留區'
  },
  profile: {
    fast_pick: '高頻 / 快取型',
    balanced: '平衡型',
    compact: '精簡 / 緊湊型',
    bulk: '大量 / 體積型'
  },
  tags: {
    fast_pick: '高頻 / 快取型',
    balanced: '平衡型',
    compact: '精簡 / 緊湊型',
    bulk: '大量 / 體積型',
    high_access_demand: '高可達需求',
    bulky_volume: '偏大區塊'
  }
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function regionCode(region) {
  const source = String(region.label || region.name || region.id || '');
  const digits = source.match(/\d+/);
  return digits ? digits[0].padStart(2, '0') : String(region.id ?? '--');
}

function regionName(region) {
  return region.name || region.label || `儲位區 ${regionCode(region)}`;
}

function fitLabel(fit) {
  if (!fit) return { text: COPY.fit.none, className: '' };
  if (fit.status === 'error') return { text: `${COPY.fit.blocked} ${fit.score}`, className: 'is-error' };
  if (fit.status === 'warning') return { text: `${COPY.fit.warning} ${fit.score}`, className: 'is-warning' };
  return { text: `${COPY.fit.ok} ${fit.score}`, className: 'is-ok' };
}

function healthLabel(status) {
  if (status === 'error') return { text: COPY.health.error, className: 'is-error' };
  if (status === 'warning') return { text: COPY.health.warning, className: 'is-warning' };
  return { text: COPY.health.ok, className: 'is-ok' };
}

function buildMapRect(rect, bounds, width, height) {
  return {
    x: ((rect.xMin - bounds.xMin) / bounds.width) * width,
    y: ((rect.yMin - bounds.yMin) / bounds.height) * height,
    width: ((rect.xMax - rect.xMin) / bounds.width) * width,
    height: ((rect.yMax - rect.yMin) / bounds.height) * height
  };
}

function summarizeDropState(dropState) {
  if (!dropState) return { label: '', className: '' };
  if (dropState.kind === 'origin') return { label: COPY.dropState.origin, className: 'is-origin' };
  if (dropState.kind === 'blocked') return { label: COPY.dropState.blocked, className: 'is-blocked' };
  if (dropState.kind === 'warn') return { label: COPY.dropState.warn, className: 'is-warn' };
  if (dropState.kind === 'allowed') return { label: COPY.dropState.allowed, className: 'is-allowed' };
  return { label: '', className: '' };
}

function getSpaceIntentLabel(intent) {
  return COPY.intent[intent] || intent || '未設定';
}

function getProfileLabel(profileKey, fallback = '') {
  return COPY.profile[profileKey] || fallback || profileKey || '未分類';
}

function getTagLabel(tag) {
  return COPY.tags[tag] || tag;
}

function buildSuccessMessage(region, group, currentRegionId) {
  if (currentRegionId && String(currentRegionId) !== String(region.id)) {
    return `已將 ${group.name} 重新配置到 ${regionName(region)}。`;
  }
  return `已將 ${group.name} 配置到 ${regionName(region)}。`;
}

function getRegionUsageText(region) {
  const utilization = Number(region.usage?.projectedUtilization || 0).toFixed(1);
  const area = Number(region.metrics?.area_m2 || 0).toFixed(2);
  return `${area} 平方公尺 / 使用率 ${utilization}%`;
}

function getActiveRegionId(state) {
  return state.hoveredRegionId || state.selectedRegionId;
}

function getAssignmentGroupId(assignment) {
  return typeof assignment === 'object' ? assignment.id : assignment;
}

function normalizeWheelDelta(event, viewportHeight) {
  let deltaX = Number(event.deltaX || 0);
  let deltaY = Number(event.deltaY || 0);

  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    deltaX *= LINE_DELTA_PX;
    deltaY *= LINE_DELTA_PX;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    const pageUnit = viewportHeight || CANVAS_HEIGHT;
    deltaX *= pageUnit;
    deltaY *= pageUnit;
  }

  return { deltaX, deltaY };
}

function getViewportScaleLabel(scale) {
  return `${Math.round(scale * 100)}%`;
}

function createViewportState() {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    initialized: false,
    isPanning: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0
  };
}

export const AssignSpacePage = {
  state: {
    groups: [],
    regions: [],
    items: [],
    assignments: {},
    spacePolicies: {},
    constraintZones: [],
    selectedRegionId: null,
    selectedGroupId: null,
    hoveredRegionId: null,
    hoveredGroupId: null,
    draggedGroupId: null,
    draggedSourceRegionId: null,
    feedback: null,
    groupListScrollTop: 0,
    isExpandedMapOpen: false,
    viewport: createViewportState(),
    expandedViewport: createViewportState()
  },

  async init() {
    this.mapCanvas = document.getElementById('space-map');
    this.groupsPool = document.getElementById('groups-pool');
    this.policyPanel = document.getElementById('space-policy-panel');
    this.feedbackPanel = document.getElementById('workflow-feedback');
    this.saveBtn = document.getElementById('save-changes-btn');
    this.nextBtn = document.getElementById('next-step-btn');
    this.expandedMapModal = document.getElementById('expanded-map-modal');
    this.expandedMapRoot = document.getElementById('space-map-expanded');
    this.expandedMapCloseBtn = document.getElementById('expanded-map-close');

    if (!this.mapCanvas || !this.groupsPool || !this.policyPanel) {
      return;
    }

    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());
    this.nextBtn?.addEventListener('click', () => this.handleNextStep());
    this.expandedMapCloseBtn?.addEventListener('click', () => this.closeExpandedMap());
    this.expandedMapModal?.addEventListener('click', (event) => {
      if (event.target === this.expandedMapModal) {
        this.closeExpandedMap();
      }
    });

    this.boundWindowPointerMove = (event) => this.handleViewportPointerMove(event);
    this.boundWindowPointerUp = (event) => this.handleViewportPointerUp(event);
    this.boundWindowResize = () => this.handleViewportResize();
    this.boundWindowKeydown = (event) => {
      if (event.key === 'Escape' && this.state.isExpandedMapOpen) {
        this.closeExpandedMap();
      }
    };
    window.addEventListener('pointermove', this.boundWindowPointerMove);
    window.addEventListener('pointerup', this.boundWindowPointerUp);
    window.addEventListener('pointercancel', this.boundWindowPointerUp);
    window.addEventListener('resize', this.boundWindowResize);
    window.addEventListener('keydown', this.boundWindowKeydown);

    await this.loadData();
    if (!this.state.selectedRegionId && this.state.regions.length) {
      this.state.selectedRegionId = this.state.regions[0].id;
    }

    this.render();
    window.requestAnimationFrame(() => this.ensureViewportInitialized('main'));
    window.AssignSpace = this;
  },

  async loadData() {
    const initialState = await assignSpaceService.loadInitialState();
    this.state.groups = initialState.groups || [];
    this.state.regions = initialState.regions || [];
    this.state.items = initialState.items || [];
    this.state.assignments = initialState.assignments || {};
    this.state.spacePolicies = initialState.spacePolicies || {};
    this.state.constraintZones = initialState.constraintZones || [];
  },

  getWorkspace() {
    return assignSpaceService.buildWorkspaceState({
      regions: this.state.regions,
      groups: this.state.groups,
      items: this.state.items,
      assignments: this.state.assignments,
      spacePolicies: this.state.spacePolicies,
      constraintZones: this.state.constraintZones,
      selectedGroupId: this.getActiveGroupId()
    });
  },

  getActiveGroupId() {
    return this.state.draggedGroupId || this.state.selectedGroupId;
  },

  getGroupLabel(group) {
    return group.name || `群組 ${group.id}`;
  },

  getGroupProfileLabel(group) {
    return getProfileLabel(group.profileKey, group.profileLabel);
  },

  getGroupTags(group = {}) {
    return (group.tags || []).map((tag) => getTagLabel(tag));
  },

  findAssignedRegionId(groupId, assignments = this.state.assignments) {
    for (const [regionId, regionAssignments] of Object.entries(assignments || {})) {
      const found = (regionAssignments || []).some((assignment) => {
        return String(getAssignmentGroupId(assignment)) === String(groupId);
      });
      if (found) {
        return regionId;
      }
    }
    return null;
  },

  getDragContext(workspace) {
    const activeGroupId = this.getActiveGroupId();
    if (!activeGroupId) return null;

    const group = workspace.groups.find((entry) => String(entry.id) === String(activeGroupId));
    if (!group) return null;

    return {
      group,
      currentRegionId: this.findAssignedRegionId(group.id),
      isDragging: Boolean(this.state.draggedGroupId)
    };
  },

  getRegionDropState(region, dragContext) {
    if (!dragContext) {
      return null;
    }

    if (String(dragContext.currentRegionId || '') === String(region.id)) {
      return {
        kind: 'origin',
        evaluation: null,
        message: `${this.getGroupLabel(dragContext.group)} 目前已配置在這個空間。`
      };
    }

    const evaluation = assignSpaceService.validateAssignmentAttempt({
      region,
      group: dragContext.group,
      assignments: this.state.assignments,
      items: this.state.items
    });

    if (evaluation.status === 'error') {
      return {
        kind: 'blocked',
        evaluation,
        message: evaluation.conflicts[0] || '這個空間無法接收目前群組。'
      };
    }

    if (evaluation.warnings.length) {
      return {
        kind: 'warn',
        evaluation,
        message: evaluation.warnings[0]
      };
    }

    return {
      kind: 'allowed',
      evaluation,
      message: evaluation.reasons[0] || '放開滑鼠即可完成配置。'
    };
  },

  getViewportState(target = 'main') {
    return target === 'expanded' ? this.state.expandedViewport : this.state.viewport;
  },

  setViewportState(target = 'main', nextViewport) {
    if (target === 'expanded') {
      this.state.expandedViewport = nextViewport;
      return;
    }
    this.state.viewport = nextViewport;
  },

  getViewportElements(target = 'main') {
    if (target === 'expanded') {
      return {
        canvasElement: this.expandedMapCanvasElement,
        transformElement: this.expandedMapTransformElement,
        scaleValueElement: this.expandedScaleValueElement
      };
    }

    return {
      canvasElement: this.mapCanvasElement,
      transformElement: this.mapTransformElement,
      scaleValueElement: this.scaleValueElement
    };
  },

  getMapViewportMetrics(target = 'main') {
    const { canvasElement } = this.getViewportElements(target);
    if (!canvasElement) {
      return {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT
      };
    }

    return {
      width: canvasElement.clientWidth || CANVAS_WIDTH,
      height: canvasElement.clientHeight || CANVAS_HEIGHT
    };
  },

  getFitScale(metrics = this.getMapViewportMetrics()) {
    const scale = Math.min(metrics.width / CANVAS_WIDTH, metrics.height / CANVAS_HEIGHT);
    return Math.min(1.18, Math.max(MIN_SCALE, scale || 1));
  },

  clampViewport(scale, translateX, translateY, target = 'main') {
    const metrics = this.getMapViewportMetrics(target);
    const scaledWidth = CANVAS_WIDTH * scale;
    const scaledHeight = CANVAS_HEIGHT * scale;

    let nextX = translateX;
    let nextY = translateY;

    if (scaledWidth <= metrics.width) {
      nextX = (metrics.width - scaledWidth) / 2;
    } else {
      nextX = Math.min(0, Math.max(metrics.width - scaledWidth, translateX));
    }

    if (scaledHeight <= metrics.height) {
      nextY = (metrics.height - scaledHeight) / 2;
    } else {
      nextY = Math.min(0, Math.max(metrics.height - scaledHeight, translateY));
    }

    return {
      scale,
      translateX: nextX,
      translateY: nextY
    };
  },

  applyViewportTransform(target = 'main') {
    const { transformElement, canvasElement, scaleValueElement } = this.getViewportElements(target);
    if (!transformElement) return;

    const { scale, translateX, translateY, isPanning } = this.getViewportState(target);
    transformElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    canvasElement?.classList.toggle('is-panning', Boolean(isPanning));
    if (scaleValueElement) {
      scaleValueElement.textContent = getViewportScaleLabel(scale);
    }
  },

  ensureViewportInitialized(target = 'main', { force = false } = {}) {
    const current = this.getViewportState(target);
    if (current.initialized && !force) {
      this.applyViewportTransform(target);
      return;
    }

    const scale = this.getFitScale(this.getMapViewportMetrics(target));
    const clamped = this.clampViewport(scale, 0, 0, target);
    this.setViewportState(target, {
      ...current,
      ...clamped,
      initialized: true
    });
    this.applyViewportTransform(target);
  },

  setViewport(scale, translateX, translateY, target = 'main') {
    const current = this.getViewportState(target);
    const clamped = this.clampViewport(scale, translateX, translateY, target);
    this.setViewportState(target, {
      ...current,
      ...clamped,
      initialized: true
    });
    this.applyViewportTransform(target);
  },

  resetViewport(target = 'main') {
    const current = this.getViewportState(target);
    const scale = this.getFitScale(this.getMapViewportMetrics(target));
    const clamped = this.clampViewport(scale, 0, 0, target);
    this.setViewportState(target, {
      ...current,
      ...clamped,
      initialized: true,
      isPanning: false,
      pointerId: null
    });
    this.applyViewportTransform(target);
  },

  zoomViewport(nextScale, anchorClientPoint = null, target = 'main') {
    const current = this.getViewportState(target);
    const metrics = this.getMapViewportMetrics(target);
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));

    const { canvasElement } = this.getViewportElements(target);
    const rect = canvasElement?.getBoundingClientRect();
    const anchorX = rect && anchorClientPoint ? anchorClientPoint.x - rect.left : metrics.width / 2;
    const anchorY = rect && anchorClientPoint ? anchorClientPoint.y - rect.top : metrics.height / 2;

    const worldX = (anchorX - current.translateX) / current.scale;
    const worldY = (anchorY - current.translateY) / current.scale;
    const nextTranslateX = anchorX - (worldX * clampedScale);
    const nextTranslateY = anchorY - (worldY * clampedScale);

    this.setViewport(clampedScale, nextTranslateX, nextTranslateY, target);
  },

  panViewport(deltaX, deltaY, target = 'main') {
    const current = this.getViewportState(target);
    this.setViewport(current.scale, current.translateX + deltaX, current.translateY + deltaY, target);
  },

  handleViewportResize() {
    ['main', 'expanded'].forEach((target) => {
      const { canvasElement } = this.getViewportElements(target);
      if (!canvasElement) return;

      const current = this.getViewportState(target);
      if (!current.initialized || target === 'expanded') {
        this.ensureViewportInitialized(target, { force: true });
        return;
      }

      const clamped = this.clampViewport(current.scale, current.translateX, current.translateY, target);
      this.setViewportState(target, {
        ...current,
        ...clamped
      });
      this.applyViewportTransform(target);
    });
  },

  handleMapWheel(event, target = 'main') {
    const { canvasElement } = this.getViewportElements(target);
    if (!canvasElement) return;

    event.preventDefault();
    event.stopPropagation();

    const metrics = this.getMapViewportMetrics(target);
    const { deltaX, deltaY } = normalizeWheelDelta(event, metrics.height);

    if (event.ctrlKey || event.metaKey) {
      const direction = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
      this.zoomViewport(this.getViewportState(target).scale * direction, {
        x: event.clientX,
        y: event.clientY
      }, target);
      return;
    }

    const panX = event.shiftKey ? -deltaY : -deltaX;
    const panY = event.shiftKey ? 0 : -deltaY;
    this.panViewport(panX, panY, target);
  },

  handleViewportPointerDown(event, target = 'main') {
    if (event.button !== 0) return;
    if (event.target.closest('[data-region-id]') || event.target.closest('[data-view-action]')) return;

    const current = this.getViewportState(target);
    const nextViewport = {
      ...current,
      isPanning: true,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: current.translateX,
      originY: current.translateY
    };
    this.setViewportState(target, nextViewport);

    this.getViewportElements(target).canvasElement?.setPointerCapture?.(event.pointerId);
    this.applyViewportTransform(target);
    event.preventDefault();
  },

  handleViewportPointerMove(event) {
    const target = this.state.expandedViewport.isPanning ? 'expanded' : 'main';
    const viewport = this.getViewportState(target);
    if (!viewport.isPanning || viewport.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - viewport.startClientX;
    const deltaY = event.clientY - viewport.startClientY;
    this.setViewport(viewport.scale, viewport.originX + deltaX, viewport.originY + deltaY, target);
  },

  handleViewportPointerUp(event) {
    ['expanded', 'main'].forEach((target) => {
      const viewport = this.getViewportState(target);
      if (!viewport.isPanning || viewport.pointerId !== event.pointerId) return;

      this.getViewportElements(target).canvasElement?.releasePointerCapture?.(event.pointerId);
      this.setViewportState(target, {
        ...viewport,
        isPanning: false,
        pointerId: null
      });
      this.applyViewportTransform(target);
    });
  },

  handleMapViewAction(action, target = 'main') {
    if (action === 'zoom-in') {
      this.zoomViewport(this.getViewportState(target).scale * ZOOM_STEP, null, target);
      return;
    }

    if (action === 'zoom-out') {
      this.zoomViewport(this.getViewportState(target).scale / ZOOM_STEP, null, target);
      return;
    }

    this.resetViewport(target);
  },

  clearDragState({ render = true } = {}) {
    this.state.draggedGroupId = null;
    this.state.draggedSourceRegionId = null;
    this.state.hoveredRegionId = null;

    if (!render) {
      this.updatePoolDropzoneState();
    }

    if (render) {
      this.render();
    }
  },

  render({ surfacesOnly = false } = {}) {
    const workspace = this.getWorkspace();
    this.renderFeedback();
    this.renderMap(workspace);
    if (!surfacesOnly) {
      this.renderGroups(workspace);
    }
    this.renderPolicyPanel(workspace);
  },

  renderSurfacePanels() {
    this.render({ surfacesOnly: true });
  },

  renderFeedback() {
    if (!this.feedbackPanel) return;

    if (!this.state.feedback) {
      this.feedbackPanel.innerHTML = `
        <div class="workflow-tip">
          ${COPY.defaultTip.map((line) => `<div>${escapeHTML(line)}</div>`).join('')}
        </div>
      `;
      return;
    }

    const feedback = this.state.feedback;
    this.feedbackPanel.innerHTML = `
      <div class="workflow-message ${feedback.type}">
        <div class="workflow-message-title">${escapeHTML(feedback.title)}</div>
        ${(feedback.messages || []).map((message) => `<div>${escapeHTML(message)}</div>`).join('')}
      </div>
    `;
  },

  captureGroupListScroll() {
    const list = this.groupsPool?.querySelector('.group-pool-list');
    if (!list) return this.state.groupListScrollTop || 0;
    this.state.groupListScrollTop = list.scrollTop;
    return this.state.groupListScrollTop;
  },

  restoreGroupListScroll(scrollTop = this.state.groupListScrollTop || 0) {
    const list = this.groupsPool?.querySelector('.group-pool-list');
    if (!list) return;

    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = Math.min(scrollTop, maxScroll);
  },

  openExpandedMap() {
    if (!this.expandedMapModal || !this.expandedMapRoot) return;

    const frame = this.mapCanvas?.querySelector('.space-map-frame');
    if (!frame) return;

    this.state.isExpandedMapOpen = true;
    this.state.expandedViewport = createViewportState();
    this.expandedMapRoot.innerHTML = frame.outerHTML;
    this.expandedMapModal.classList.add('active');
    this.expandedMapModal.setAttribute('aria-hidden', 'false');

    this.expandedMapRoot.querySelector('[data-view-action="open-expanded-view"]')?.remove();
    this.expandedMapCanvasElement = this.expandedMapRoot.querySelector('[data-role="map-canvas"]');
    this.expandedMapTransformElement = this.expandedMapRoot.querySelector('[data-role="map-transform"]');
    this.expandedScaleValueElement = this.expandedMapRoot.querySelector('[data-role="scale-value"]');

    this.expandedMapRoot.querySelectorAll('[data-view-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        this.handleMapViewAction(event.currentTarget.getAttribute('data-view-action'), 'expanded');
      });
    });

    this.expandedMapCanvasElement?.addEventListener('wheel', (event) => this.handleMapWheel(event, 'expanded'), { passive: false });
    this.expandedMapCanvasElement?.addEventListener('pointerdown', (event) => this.handleViewportPointerDown(event, 'expanded'));

    if (this.expandedMapFitInterval) {
      window.clearInterval(this.expandedMapFitInterval);
    }
    let fitAttempts = 0;
    this.expandedMapFitInterval = window.setInterval(() => {
      fitAttempts += 1;
      const metrics = this.getMapViewportMetrics('expanded');
      if ((metrics.width > CANVAS_WIDTH || metrics.height > CANVAS_HEIGHT) || fitAttempts >= 20) {
        this.ensureViewportInitialized('expanded', { force: true });
        window.clearInterval(this.expandedMapFitInterval);
        this.expandedMapFitInterval = null;
      }
    }, 50);
  },

  closeExpandedMap() {
    if (!this.expandedMapModal) return;

    this.state.isExpandedMapOpen = false;
    this.expandedMapModal.classList.remove('active');
    this.expandedMapModal.setAttribute('aria-hidden', 'true');
    if (this.expandedMapRoot) {
      this.expandedMapRoot.innerHTML = '';
    }
    this.expandedMapCanvasElement = null;
    this.expandedMapTransformElement = null;
    this.expandedScaleValueElement = null;
    if (this.expandedMapFitInterval) {
      window.clearInterval(this.expandedMapFitInterval);
      this.expandedMapFitInterval = null;
    }
    this.state.expandedViewport = createViewportState();
  },

  renderMap(workspace) {
    const bounds = workspace.layoutContext.bounds;
    const mainAisles = (this.state.constraintZones || []).filter((zone) => zone?.subtype === 'main_aisle');
    const activeRegion = workspace.regions.find((region) => String(region.id) === String(getActiveRegionId(this.state)));
    const dragContext = this.getDragContext(workspace);

    const aisleMarkup = mainAisles.map((zone) => {
      const rect = zone.geometry_2d?.rect
        ? {
            xMin: zone.geometry_2d.rect.x_min_mm,
            xMax: zone.geometry_2d.rect.x_max_mm,
            yMin: zone.geometry_2d.rect.z_min_mm,
            yMax: zone.geometry_2d.rect.z_max_mm
          }
        : {
            xMin: zone.x - zone.width / 2,
            xMax: zone.x + zone.width / 2,
            yMin: zone.y - zone.height / 2,
            yMax: zone.y + zone.height / 2
          };
      const scaled = buildMapRect(rect, bounds, CANVAS_WIDTH, CANVAS_HEIGHT);
      return `<rect class="space-map-aisle" x="${scaled.x}" y="${scaled.y}" width="${scaled.width}" height="${scaled.height}" rx="14"></rect>`;
    }).join('');

    const regionMarkup = workspace.regions.map((region) => {
      const scaled = buildMapRect(region.spatial.rect, bounds, CANVAS_WIDTH, CANVAS_HEIGHT);
      const assignedGroups = this.state.assignments?.[region.id] || [];
      const isSelected = String(region.id) === String(this.state.selectedRegionId);
      const isHovered = String(region.id) === String(this.state.hoveredRegionId);
      const isHighlightedByGroup = Boolean(
        this.state.hoveredGroupId &&
        String(this.findAssignedRegionId(this.state.hoveredGroupId)) === String(region.id)
      );
      const isFocused = isSelected || isHovered || isHighlightedByGroup;
      const dropState = this.getRegionDropState(region, dragContext);
      const dropSummary = summarizeDropState(dropState);
      const fit = fitLabel(region.fit);
      const centerX = scaled.x + scaled.width / 2;
      const centerY = scaled.y + scaled.height / 2;
      const showInlineDetail = isFocused || scaled.height >= 68;
      const topLabelY = Math.max(scaled.y + 18, 24);

      const classes = [
        'space-map-region',
        isSelected ? 'is-selected' : '',
        isHovered || isHighlightedByGroup ? 'is-hovered' : '',
        assignedGroups.length ? 'is-assigned' : '',
        region.policyHealth.status === 'error' ? 'has-conflict' : '',
        dropState?.kind === 'allowed' ? 'is-drop-allowed' : '',
        dropState?.kind === 'warn' ? 'is-drop-warn' : '',
        dropState?.kind === 'blocked' ? 'is-drop-blocked' : '',
        dropState?.kind === 'origin' ? 'is-drop-origin' : ''
      ].filter(Boolean).join(' ');

      return `
        <g data-region-id="${region.id}">
          <rect class="${classes}" x="${scaled.x}" y="${scaled.y}" width="${scaled.width}" height="${scaled.height}" rx="18"></rect>
          <text class="space-map-code" x="${centerX}" y="${centerY + (showInlineDetail ? -6 : 5)}">${escapeHTML(regionCode(region))}</text>
          ${showInlineDetail ? `<text class="space-map-detail" x="${centerX}" y="${centerY + 18}">${escapeHTML(region.spatial.positionLabel)}</text>` : ''}
          ${assignedGroups.length ? `<text class="space-map-assigned-count" x="${centerX}" y="${centerY + 36}">已配置 ${assignedGroups.length} 組</text>` : ''}
          ${dropSummary.label ? `<text class="space-map-drop ${dropSummary.className}" x="${centerX}" y="${topLabelY}">${escapeHTML(dropSummary.label)}</text>` : ''}
          ${!dropSummary.label && this.getActiveGroupId() && isFocused ? `<text class="space-map-fit ${fit.className}" x="${centerX}" y="${topLabelY}">${escapeHTML(fit.text)}</text>` : ''}
        </g>
      `;
    }).join('');

    const entranceX = ((workspace.layoutContext.entrance.x - bounds.xMin) / bounds.width) * CANVAS_WIDTH;
    const entranceY = ((workspace.layoutContext.entrance.y - bounds.yMin) / bounds.height) * CANVAS_HEIGHT;
    const activeAssignedGroups = activeRegion
      ? (this.state.assignments?.[activeRegion.id] || [])
        .map((assignment) => workspace.groupProfilesById.get(String(getAssignmentGroupId(assignment))))
        .filter(Boolean)
      : [];
    const activeAdvice = activeRegion && dragContext
      ? this.getRegionDropState(activeRegion, dragContext)?.message
      : '將游標移到空間上可查看規則，拖曳群組時可直接預覽可放置狀態。';

    this.mapCanvas.innerHTML = `
      <div class="space-map-frame">
        <div class="space-map-meta">
          <div>
            <div class="space-map-title">空間位置總覽</div>
            <div class="space-map-subtitle">
              這是本頁唯一的主要配置畫布。直接在這裡查看位置語意、主走道、入口、已分配狀態與拖曳適配結果。
            </div>
          </div>
          <div class="space-map-actions">
            <div class="space-map-control-note">滾輪平移 / Ctrl + 滾輪縮放 / 拖曳空白處平移</div>
            <div class="space-map-tool-buttons">
              <button class="space-map-tool-btn" type="button" data-view-action="zoom-out" title="縮小畫布">－</button>
              <button class="space-map-tool-btn" type="button" data-view-action="reset-view" title="重設視角">重設</button>
              <button class="space-map-tool-btn" type="button" data-view-action="zoom-in" title="放大畫布">＋</button>
              <button class="space-map-tool-btn" type="button" data-view-action="open-expanded-view" title="放大檢視規劃畫布">⤢</button>
            </div>
          </div>
        </div>

        <div class="space-map-legend">
          <span><i class="legend-swatch aisle"></i>主走道</span>
          <span><i class="legend-swatch region"></i>可分配區域</span>
          <span><i class="legend-swatch selected"></i>焦點空間</span>
        </div>

        <div class="space-map-guides">
          <span class="space-guide-chip">上排區域</span>
          <span class="space-guide-chip is-aisle">主走道</span>
          <span class="space-guide-chip">下排區域</span>
          <span class="space-guide-chip is-entry">入口位於下方中央</span>
        </div>

        <div class="space-map-canvas" data-role="map-canvas">
          <div
            class="space-map-transform"
            data-role="map-transform"
            style="width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;"
          >
            <svg viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" class="space-map-svg" aria-label="空間位置總覽畫布">
              <rect class="space-map-boundary" x="4" y="4" width="${CANVAS_WIDTH - 8}" height="${CANVAS_HEIGHT - 8}" rx="24"></rect>
              ${aisleMarkup}
              ${regionMarkup}
              <g class="space-map-entrance">
                <circle cx="${entranceX}" cy="${entranceY - 12}" r="9"></circle>
              </g>
            </svg>
          </div>

          <div class="space-map-overlay">
            <div class="space-map-scale-chip">
              縮放
              <strong data-role="scale-value">${getViewportScaleLabel(this.state.viewport.scale)}</strong>
            </div>
            <div class="space-map-pan-hint">拖曳空白區可移動畫布</div>
          </div>
        </div>

        <div class="space-map-focus-card ${activeRegion ? '' : 'is-empty'}">
          ${activeRegion ? `
            <div class="space-map-focus-head">
              <div>
                <div class="space-map-focus-code">儲位區 ${escapeHTML(regionCode(activeRegion))}</div>
                <div class="space-map-focus-name">${escapeHTML(regionName(activeRegion))}</div>
              </div>
              <div class="space-map-focus-meta">
                <span>${escapeHTML(activeRegion.spatial.positionLabel)}</span>
                <span>${escapeHTML(getRegionUsageText(activeRegion))}</span>
                <span>${escapeHTML(getSpaceIntentLabel(activeRegion.spacePolicy.slottingIntent))}</span>
              </div>
            </div>
            <div class="space-map-focus-tags">
              ${activeRegion.spatial.semanticTags.slice(0, 5).map((tag) => `<span class="semantic-tag">${escapeHTML(tag)}</span>`).join('')}
              ${assignSpaceService.buildPolicySummary(activeRegion.spacePolicy).map((tag) => `<span class="policy-tag">${escapeHTML(tag)}</span>`).join('')}
            </div>
            <div class="space-map-focus-groups">
              ${activeAssignedGroups.length
                ? activeAssignedGroups.map((group) => `<span class="group-tag">${escapeHTML(this.getGroupLabel(group))}</span>`).join('')
                : '<span class="group-tag">尚未配置群組</span>'}
            </div>
            <div class="space-map-focus-detail">${escapeHTML(activeAdvice)}</div>
          ` : `
            <div class="space-map-focus-empty">
              請選取或滑過空間區塊，即可查看規則、位置語意與已分配群組。
            </div>
          `}
        </div>
      </div>
    `;

    this.mapCanvasElement = this.mapCanvas.querySelector('[data-role="map-canvas"]');
    this.mapTransformElement = this.mapCanvas.querySelector('[data-role="map-transform"]');
    this.scaleValueElement = this.mapCanvas.querySelector('[data-role="scale-value"]');

    this.mapCanvas.querySelectorAll('[data-region-id]').forEach((node) => {
      const regionId = node.getAttribute('data-region-id');
      node.addEventListener('mouseenter', () => this.setHoveredRegion(regionId));
      node.addEventListener('mouseleave', () => this.setHoveredRegion(null));
      node.addEventListener('click', () => this.selectRegion(regionId));
      node.addEventListener('dragenter', (event) => this.handleRegionDragEnter(event, regionId));
      node.addEventListener('dragover', (event) => this.handleRegionDragOver(event, regionId));
      node.addEventListener('dragleave', () => this.setHoveredRegion(null));
      node.addEventListener('drop', (event) => this.handleRegionDrop(event, regionId));
    });

    this.mapCanvas.querySelectorAll('[data-view-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.getAttribute('data-view-action');
        if (action === 'open-expanded-view') {
          this.openExpandedMap();
          return;
        }
        this.handleMapViewAction(action, 'main');
      });
    });

    this.mapCanvasElement?.addEventListener('wheel', (event) => this.handleMapWheel(event, 'main'), { passive: false });
    this.mapCanvasElement?.addEventListener('pointerdown', (event) => this.handleViewportPointerDown(event, 'main'));

    this.applyViewportTransform('main');
    if (!this.state.viewport.initialized) {
      window.requestAnimationFrame(() => this.ensureViewportInitialized('main'));
    }
  },

  renderGroups(workspace) {
    const preservedScrollTop = this.captureGroupListScroll();
    if (!workspace.groups.length) {
      this.groupsPool.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">目前沒有可分配群組</div>
          <div class="empty-state-hint">請先建立或載入群組，再進行空間配置。</div>
        </div>
      `;
      this.state.groupListScrollTop = 0;
      return;
    }

    const unassignedCount = workspace.groups.filter((group) => !assignSpaceService.isGroupAssigned(this.state.assignments, group.id)).length;
    const assignedCount = workspace.groups.length - unassignedCount;
    const hasAssignedDrag = Boolean(this.state.draggedGroupId && this.findAssignedRegionId(this.state.draggedGroupId));

    this.groupsPool.innerHTML = `
      <div class="group-pool-toolbar">
        <div>
          <div class="group-pool-summary">待分配 ${unassignedCount} 組 / 已配置 ${assignedCount} 組</div>
          <div class="group-pool-hint">
            整張卡片都可直接抓取拖曳；清單支援完整捲動，拖到上方區塊可取消既有配置。
          </div>
        </div>
      </div>

      <div class="group-pool-dropzone ${hasAssignedDrag ? 'is-active' : ''}" data-unassign-dropzone="true">
        ${hasAssignedDrag ? '放開即可取消目前群組的空間配置' : '將已配置群組拖回此處，可移除目前的空間配置'}
      </div>

      <div class="group-pool-list" role="list">
        ${workspace.groups.map((group) => {
          const assignedRegionId = this.findAssignedRegionId(group.id);
          const assignedRegion = workspace.regions.find((region) => String(region.id) === String(assignedRegionId));
          const assigned = Boolean(assignedRegionId);
          const selected = String(group.id) === String(this.state.selectedGroupId);

          return `
            <article
              class="group-card ${assigned ? 'assigned' : ''} ${selected ? 'is-selected' : ''}"
              data-group-id="${group.id}"
              data-region-id="${assignedRegionId || ''}"
              draggable="true"
              role="listitem"
            >
              <div class="group-card-head">
                <span class="group-drag-grip" aria-hidden="true">⋮⋮</span>
                <div>
                  <h4 class="group-name">${escapeHTML(this.getGroupLabel(group))}</h4>
                  <div class="group-profile-line">
                    <span class="group-profile">${escapeHTML(this.getGroupProfileLabel(group))}</span>
                    ${this.getGroupTags(group).map((tag) => `<span class="group-tag">${escapeHTML(tag)}</span>`).join('')}
                  </div>
                </div>
                <span class="group-status ${assigned ? 'assigned' : 'ready'}">${assigned ? '已配置' : '可拖曳'}</span>
              </div>

              <div class="group-metrics">
                <span>${group.itemCount} 件物件</span>
                <span>${group.totalVolumeM3.toFixed(2)} 立方公尺</span>
                <span>${assignedRegion ? `儲位區 ${regionCode(assignedRegion)}` : '尚未配置'}</span>
              </div>

              <div class="group-card-actions">
                <button class="btn btn-secondary group-action-btn" type="button" data-action="toggle-select" data-group-id="${group.id}">
                  ${selected ? '取消選取' : '選取'}
                </button>
                ${assignedRegion ? `<button class="btn btn-secondary group-action-btn" type="button" data-action="focus-region" data-group-id="${group.id}" data-region-id="${assignedRegion.id}">定位空間</button>` : ''}
                ${assignedRegion ? `<button class="btn btn-secondary group-action-btn" type="button" data-action="unassign" data-group-id="${group.id}" data-region-id="${assignedRegion.id}">取消配置</button>` : (this.state.selectedRegionId ? `<button class="btn btn-primary group-action-btn" type="button" data-action="assign-selected-region" data-group-id="${group.id}">配置到目前空間</button>` : '')}
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    const poolDropzone = this.groupsPool.querySelector('[data-unassign-dropzone="true"]');
    poolDropzone?.addEventListener('dragover', (event) => this.handlePoolDragOver(event));
    poolDropzone?.addEventListener('drop', (event) => this.handlePoolDrop(event));
    this.updatePoolDropzoneState();

    this.groupsPool.querySelectorAll('.group-card').forEach((card) => {
      const groupId = card.getAttribute('data-group-id');

      card.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        this.state.selectedGroupId = String(this.state.selectedGroupId) === String(groupId) ? null : groupId;
        this.render();
      });

      card.addEventListener('mouseenter', () => this.handleGroupHover(groupId, true));
      card.addEventListener('mouseleave', () => this.handleGroupHover(groupId, false));
      card.addEventListener('dragstart', (event) => this.handleGroupDragStart(event));
      card.addEventListener('dragend', () => this.handleGroupDragEnd());
    });

    this.groupsPool.querySelectorAll('.group-action-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        const groupId = event.currentTarget.getAttribute('data-group-id');
        const regionId = event.currentTarget.getAttribute('data-region-id');
        const action = event.currentTarget.getAttribute('data-action');

        if (action === 'toggle-select') {
          this.state.selectedGroupId = String(this.state.selectedGroupId) === String(groupId) ? null : groupId;
          this.render();
          return;
        }

        if (action === 'focus-region') {
          this.state.selectedGroupId = groupId;
          this.selectRegion(regionId);
          return;
        }

        if (action === 'unassign') {
          this.unassignGroup(groupId, regionId);
          return;
        }

        if (action === 'assign-selected-region') {
          this.state.selectedGroupId = groupId;
          this.moveGroupToRegion(groupId, this.state.selectedRegionId);
        }
      });
    });

    const list = this.groupsPool.querySelector('.group-pool-list');
    list?.addEventListener('scroll', () => {
      this.state.groupListScrollTop = list.scrollTop;
    }, { passive: true });
    window.requestAnimationFrame(() => this.restoreGroupListScroll(preservedScrollTop));
  },

  renderPolicyPanel(workspace) {
    const region = workspace.regions.find((entry) => String(entry.id) === String(this.state.selectedRegionId));
    if (!region) {
      this.policyPanel.innerHTML = `
        <div class="policy-empty">
          <div class="policy-empty-title">請先選取空間</div>
          <div class="policy-empty-copy">在左側畫布上點選空間後，即可查看並調整此空間主導的配置規則。</div>
        </div>
      `;
      return;
    }

    const dragContext = this.getDragContext(workspace);
    const activeGroup = dragContext?.group || workspace.selectedGroup;
    const groupContext = activeGroup
      ? {
          group: activeGroup,
          currentRegionId: this.findAssignedRegionId(activeGroup.id),
          isDragging: Boolean(this.state.draggedGroupId)
        }
      : null;
    const dropState = groupContext ? this.getRegionDropState(region, groupContext) : null;
    const fit = dropState?.evaluation || region.fit;
    const fitInfo = fitLabel(fit);
    const allowed = new Set(region.spacePolicy.allowedGroupProfiles);
    const health = healthLabel(region.policyHealth.status);
    const activeAdvice = dropState?.message || '先選取群組或直接拖曳群組，即可即時預覽這個空間的相容性。';

    this.policyPanel.innerHTML = `
      <div class="policy-panel-shell">
        <div class="policy-head">
          <div>
            <div class="policy-kicker">空間主導規則</div>
            <h3 class="policy-title">${escapeHTML(regionName(region))}</h3>
            <div class="policy-position-line">
              <span>儲位區 ${escapeHTML(regionCode(region))}</span>
              <span>${escapeHTML(region.spatial.positionLabel)}</span>
              <span>${escapeHTML(getSpaceIntentLabel(region.spacePolicy.slottingIntent))}</span>
            </div>
          </div>
          <span class="policy-health ${health.className}">${escapeHTML(health.text)}</span>
        </div>

        <div class="policy-tag-row">
          ${region.spatial.semanticTags.map((tag) => `<span class="semantic-tag">${escapeHTML(tag)}</span>`).join('')}
        </div>

        <div class="policy-form-grid">
          <label class="policy-field">
            <span>配置模式</span>
            <select id="policy-mode">
              <option value="shared" ${region.spacePolicy.mode === 'shared' ? 'selected' : ''}>${COPY.mode.shared}</option>
              <option value="exclusive" ${region.spacePolicy.mode === 'exclusive' ? 'selected' : ''}>${COPY.mode.exclusive}</option>
              <option value="percentage" ${region.spacePolicy.mode === 'percentage' ? 'selected' : ''}>${COPY.mode.percentage}</option>
              <option value="priority_queue" ${region.spacePolicy.mode === 'priority_queue' ? 'selected' : ''}>${COPY.mode.priority_queue}</option>
            </select>
          </label>
          <label class="policy-field">
            <span>可容納群組上限</span>
            <input id="policy-max-groups" type="number" min="1" max="12" value="${region.spacePolicy.maxGroups}">
          </label>
          <label class="policy-field">
            <span>最大使用率 (%)</span>
            <input id="policy-max-utilization" type="number" min="35" max="100" value="${region.spacePolicy.maxUtilizationPercent}">
          </label>
          <label class="policy-field">
            <span>空間用途傾向</span>
            <select id="policy-slotting-intent">
              <option value="quick_pick" ${region.spacePolicy.slottingIntent === 'quick_pick' ? 'selected' : ''}>${COPY.intent.quick_pick}</option>
              <option value="balanced" ${region.spacePolicy.slottingIntent === 'balanced' ? 'selected' : ''}>${COPY.intent.balanced}</option>
              <option value="reserve" ${region.spacePolicy.slottingIntent === 'reserve' ? 'selected' : ''}>${COPY.intent.reserve}</option>
            </select>
          </label>
        </div>

        <div class="policy-allow-list">
          <div class="policy-field-label">允許的群組輪廓</div>
          <label><input type="checkbox" data-profile="fast_pick" ${allowed.has('fast_pick') ? 'checked' : ''}> ${COPY.profile.fast_pick}</label>
          <label><input type="checkbox" data-profile="balanced" ${allowed.has('balanced') ? 'checked' : ''}> ${COPY.profile.balanced}</label>
          <label><input type="checkbox" data-profile="compact" ${allowed.has('compact') ? 'checked' : ''}> ${COPY.profile.compact}</label>
          <label><input type="checkbox" data-profile="bulk" ${allowed.has('bulk') ? 'checked' : ''}> ${COPY.profile.bulk}</label>
        </div>

        <label class="policy-field policy-notes">
          <span>空間備註</span>
          <textarea id="policy-notes" rows="3" placeholder="說明此空間的注意事項、限制或操作規則">${escapeHTML(region.spacePolicy.notes || '')}</textarea>
        </label>

        <div class="policy-fit-box ${fit?.status || ''}">
          <div class="policy-fit-title">${activeGroup ? `${escapeHTML(this.getGroupLabel(activeGroup))} 即時適配預覽` : '即時適配預覽'}</div>
          ${activeGroup ? `
            <div class="policy-fit-score ${fitInfo.className}">${escapeHTML(fitInfo.text)}</div>
            <div class="policy-fit-reason">${escapeHTML(activeAdvice)}</div>
            <button id="assign-selected-group-btn" class="btn btn-primary" type="button">將此群組配置到目前空間</button>
          ` : `
            <div class="policy-fit-reason">${escapeHTML(activeAdvice)}</div>
          `}
        </div>

        ${region.policyHealth.messages.length ? `
          <div class="policy-warning-box ${region.policyHealth.status}">
            ${region.policyHealth.messages.map((message) => `<div>${escapeHTML(message)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    this.policyPanel.querySelector('#policy-mode')?.addEventListener('change', (event) => this.updatePolicy({ mode: event.currentTarget.value }));
    this.policyPanel.querySelector('#policy-max-groups')?.addEventListener('change', (event) => this.updatePolicy({ maxGroups: Number(event.currentTarget.value) }));
    this.policyPanel.querySelector('#policy-max-utilization')?.addEventListener('change', (event) => this.updatePolicy({ maxUtilizationPercent: Number(event.currentTarget.value) }));
    this.policyPanel.querySelector('#policy-slotting-intent')?.addEventListener('change', (event) => this.updatePolicy({ slottingIntent: event.currentTarget.value }));
    this.policyPanel.querySelector('#policy-notes')?.addEventListener('change', (event) => this.updatePolicy({ notes: event.currentTarget.value }));
    this.policyPanel.querySelectorAll('[data-profile]').forEach((input) => {
      input.addEventListener('change', () => {
        const checked = [...this.policyPanel.querySelectorAll('[data-profile]:checked')].map((node) => node.getAttribute('data-profile'));
        this.updatePolicy({ allowedGroupProfiles: checked.length ? checked : ['balanced'] });
      });
    });
    this.policyPanel.querySelector('#assign-selected-group-btn')?.addEventListener('click', () => this.moveGroupToRegion(this.getActiveGroupId(), region.id));
  },

  updatePolicy(patch) {
    const workspace = this.getWorkspace();
    const region = workspace.regions.find((entry) => String(entry.id) === String(this.state.selectedRegionId));
    if (!region) return;

    const result = assignSpaceService.updateSpacePolicy(this.state.spacePolicies, this.state.assignments, region, patch);
    this.state.spacePolicies = result.spacePolicies;
    this.state.assignments = result.assignments;
    this.state.feedback = {
      type: 'info',
      title: '已更新空間規則',
      messages: ['目前選取空間的規則已更新，相關配置狀態也已同步。']
    };
    this.render();
  },

  selectRegion(regionId) {
    this.state.selectedRegionId = regionId;
    this.renderSurfacePanels();
  },

  setHoveredRegion(regionId) {
    if (String(this.state.hoveredRegionId || '') === String(regionId || '')) return;
    this.state.hoveredRegionId = regionId;
    this.renderSurfacePanels();
  },

  handleGroupHover(groupId, entering) {
    const regionId = entering ? this.findAssignedRegionId(groupId) : null;
    const nextHoveredGroupId = entering ? groupId : null;

    if (
      String(this.state.hoveredGroupId || '') === String(nextHoveredGroupId || '') &&
      String(this.state.hoveredRegionId || '') === String(regionId || '')
    ) {
      return;
    }

    this.state.hoveredGroupId = nextHoveredGroupId;
    if (!this.state.draggedGroupId) {
      this.state.hoveredRegionId = regionId;
    }
    this.renderSurfacePanels();
  },

  handleGroupDragStart(event) {
    const groupId = event.currentTarget.getAttribute('data-group-id');
    const sourceRegionId = event.currentTarget.getAttribute('data-region-id') || this.findAssignedRegionId(groupId);

    this.state.selectedGroupId = groupId;
    this.state.draggedGroupId = groupId;
    this.state.draggedSourceRegionId = sourceRegionId || null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(groupId));
    this.updatePoolDropzoneState();

    window.requestAnimationFrame(() => {
      if (this.state.draggedGroupId) {
        this.renderSurfacePanels();
      }
    });
  },

  handleGroupDragEnd() {
    this.clearDragState();
  },

  handleRegionDragEnter(event, regionId) {
    event.preventDefault();
    if (String(this.state.hoveredRegionId || '') !== String(regionId)) {
      this.state.hoveredRegionId = regionId;
      this.renderSurfacePanels();
    }
  },

  handleRegionDragOver(event, regionId) {
    event.preventDefault();
    const workspace = this.getWorkspace();
    const region = workspace.regions.find((entry) => String(entry.id) === String(regionId));
    const dragContext = this.getDragContext(workspace);
    const dropState = region ? this.getRegionDropState(region, dragContext) : null;
    event.dataTransfer.dropEffect = dropState?.kind === 'blocked' ? 'none' : 'move';

    if (String(this.state.hoveredRegionId || '') !== String(regionId)) {
      this.state.hoveredRegionId = regionId;
      this.renderSurfacePanels();
    }
  },

  handleRegionDrop(event, regionId) {
    event.preventDefault();
    const groupId = event.dataTransfer.getData('text/plain') || this.state.draggedGroupId;
    this.moveGroupToRegion(groupId, regionId);
  },

  handlePoolDragOver(event) {
    event.preventDefault();
    const groupId = event.dataTransfer.getData('text/plain') || this.state.draggedGroupId;
    const regionId = this.findAssignedRegionId(groupId);
    event.dataTransfer.dropEffect = regionId ? 'move' : 'none';
  },

  handlePoolDrop(event) {
    event.preventDefault();
    const groupId = event.dataTransfer.getData('text/plain') || this.state.draggedGroupId;
    const regionId = this.findAssignedRegionId(groupId);

    if (!regionId) {
      this.state.feedback = {
        type: 'warning',
        title: '目前沒有可取消的配置',
        messages: ['這個群組目前已在待分配群組池中。']
      };
      this.clearDragState({ render: false });
      this.render();
      return;
    }

    this.unassignGroup(groupId, regionId);
  },

  moveGroupToRegion(groupId, regionId) {
    if (!groupId) {
      this.state.feedback = {
        type: 'warning',
        title: '請先選取群組',
        messages: ['先從右側群組池選取或拖曳一個群組，再放到空間中。']
      };
      this.render();
      return;
    }

    const workspace = this.getWorkspace();
    const region = workspace.regions.find((entry) => String(entry.id) === String(regionId));
    const group = workspace.groups.find((entry) => String(entry.id) === String(groupId));
    if (!region || !group) {
      this.clearDragState();
      return;
    }

    const currentRegionId = this.findAssignedRegionId(group.id);
    if (String(currentRegionId || '') === String(region.id)) {
      this.state.selectedRegionId = region.id;
      this.state.feedback = {
        type: 'info',
        title: '群組已在此空間',
        messages: [`${this.getGroupLabel(group)} 目前已配置在 ${regionName(region)}。`]
      };
      this.clearDragState({ render: false });
      this.render();
      return;
    }

    const evaluation = assignSpaceService.validateAssignmentAttempt({
      region,
      group,
      assignments: this.state.assignments,
      items: this.state.items
    });

    if (evaluation.status === 'error') {
      this.state.selectedGroupId = group.id;
      this.state.selectedRegionId = region.id;
      this.state.feedback = {
        type: 'error',
        title: '配置被阻擋',
        messages: evaluation.conflicts
      };
      this.clearDragState({ render: false });
      this.render();
      return;
    }

    let nextAssignments = this.state.assignments;
    if (currentRegionId) {
      nextAssignments = assignSpaceService.removeAssignment(nextAssignments, currentRegionId, Number(group.id));
    }

    const allocationResult = assignSpaceService.assignGroup(nextAssignments, { region, group });
    if (!allocationResult.added) {
      this.state.feedback = {
        type: 'warning',
        title: '配置未套用',
        messages: ['目標空間沒有成功接收這個群組，請重新確認規則與狀態。']
      };
      this.clearDragState({ render: false });
      this.render();
      return;
    }

    this.state.assignments = allocationResult.assignments;
    this.state.selectedGroupId = group.id;
    this.state.selectedRegionId = region.id;
    this.state.feedback = {
      type: evaluation.warnings.length ? 'warning' : 'success',
      title: evaluation.warnings.length ? '已配置，但需確認' : '配置完成',
      messages: evaluation.warnings.length ? evaluation.warnings : [buildSuccessMessage(region, group, currentRegionId)]
    };
    this.clearDragState({ render: false });
    this.render();
  },

  unassignGroup(groupId, regionId) {
    const resolvedRegionId = regionId || this.findAssignedRegionId(groupId);
    if (!resolvedRegionId) {
      this.clearDragState({ render: false });
      this.render();
      return;
    }

    this.state.assignments = assignSpaceService.removeAssignment(this.state.assignments, resolvedRegionId, Number(groupId));
    this.state.feedback = {
      type: 'info',
      title: '群組已移回待分配池',
      messages: ['已取消空間配置，這個群組現在可以重新拖曳到其他空間。']
    };
    this.clearDragState({ render: false });
    this.render();
  },

  async handleSaveChanges() {
    const saveResult = await assignSpaceService.saveWorkspace({
      assignments: this.state.assignments,
      spacePolicies: this.state.spacePolicies
    });

    const modal = document.getElementById('success-modal');
    const successTitle = modal?.querySelector('.modal-title');
    const okBtn = document.getElementById('btn-modal-ok');

    if (modal && successTitle && okBtn) {
      successTitle.textContent = saveResult.savedToApi ? '儲存成功' : '已先儲存到本機';
      modal.classList.add('active');
      const onOk = () => {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
      };
      okBtn.addEventListener('click', onOk);
    }

    this.state.feedback = {
      type: saveResult.savedToApi ? 'success' : 'warning',
      title: saveResult.savedToApi ? '已儲存配置' : '僅完成本機儲存',
      messages: saveResult.savedToApi
        ? ['群組配置與空間規則都已成功儲存。']
        : ['API 儲存失敗，已先保留最新狀態於本機。']
    };
    this.render();
  },

  handleNextStep() {
    window.location.hash = '/assign-sequence';
  },

  updatePoolDropzoneState() {
    const dropzone = this.groupsPool?.querySelector('[data-unassign-dropzone="true"]');
    if (!dropzone) return;

    const hasAssignedDrag = Boolean(this.state.draggedGroupId && this.findAssignedRegionId(this.state.draggedGroupId));
    dropzone.classList.toggle('is-active', hasAssignedDrag);
    dropzone.textContent = hasAssignedDrag
      ? '放開即可取消目前群組的空間配置'
      : '將已配置群組拖回此處，可移除目前的空間配置';
  }
};
