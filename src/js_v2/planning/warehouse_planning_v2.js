import { normalizePlanningIntent } from '../../frontend/contexts/planning-v2/domain/planning-intent.js';
import { buildPlanningIntentFromAnswers } from '../../frontend/contexts/planning-v2/domain/requirement-parser.js';
import { warehousePlanningV2Service } from '../../frontend/contexts/planning-v2/application/warehouse-planning-v2-service.js?v=10';
import { planningV2Orchestrator } from '../../frontend/contexts/planning-v2/application/planning-v2-orchestrator.js?v=5';
import { clearConversationHistory } from '../../frontend/contexts/planning-v2/domain/nlu-router.js?v=4';
import { getFootprintOutlinePoints, normalizeWarehouseContainerConfig } from '../../frontend/contexts/space-design/domain/warehouse-layout-planner.js';
import { ThreeViewer } from '../view/three_viewer.js';

const SIZE_PRESETS = {
  small: { length: 8000, width: 4000, height: 3500, entry: 1500 },
  medium: { length: 12000, width: 6000, height: 4500, entry: 1800 },
  large: { length: 18000, width: 9000, height: 6000, entry: 2400 }
};

const USE_CASES = {
  balanced: { layout: 'balanced', pick: 'manual', ship: 'medium', load: false, s: 0.4, p: 0.4, safe: 0.2 },
  storage: { layout: 'high_density', pick: 'batch', ship: 'medium', load: false, s: 0.55, p: 0.25, safe: 0.2 },
  picking: { layout: 'high_efficiency', pick: 'wave', ship: 'high', load: false, s: 0.25, p: 0.55, safe: 0.2 },
  shipping: { layout: 'balanced', pick: 'manual', ship: 'high', load: true, s: 0.26, p: 0.48, safe: 0.26 }
};

const ENTRY_SIDE = { north: '北側', south: '南側', east: '東側', west: '西側' };
const HANDLING = { manual: '人工', pallet_jack: '拖板車', forklift: '叉車', mixed: '混合' };
const GOODS = { carton: '紙箱 / 箱件', pallet: '棧板', mixed: '混合' };
const LAYOUT = { balanced: '平衡', high_density: '高密度', high_efficiency: '高效率', conservative: '高安全' };
const SEMANTIC_ZONE_STYLES = {
  storage_zone: { fill: 'rgba(52, 113, 255, 0.72)', stroke: 'rgba(141, 181, 255, 0.86)', label: '儲位區', badgeFill: 'rgba(52, 113, 255, 0.92)' },
  fast_moving_zone: { fill: 'rgba(99, 202, 161, 0.14)', stroke: 'rgba(120, 230, 188, 0.96)', label: '高頻區', badgeFill: 'rgba(99, 202, 161, 0.96)' },
  main_aisle: { fill: 'rgba(68, 211, 198, 0.86)', stroke: 'rgba(158, 244, 228, 0.92)', label: '主走道', badgeFill: 'rgba(68, 211, 198, 0.96)' },
  secondary_aisle: { fill: 'rgba(144, 190, 255, 0.62)', stroke: 'rgba(196, 218, 255, 0.84)', label: '次走道', badgeFill: 'rgba(144, 190, 255, 0.92)' },
  shipping_buffer: { fill: 'rgba(250, 181, 77, 0.58)', stroke: 'rgba(255, 211, 136, 0.98)', label: '出貨緩衝區', badgeFill: 'rgba(250, 181, 77, 0.98)' },
  safety_buffer: { fill: 'rgba(240, 201, 138, 0.36)', stroke: 'rgba(255, 226, 173, 0.76)', label: '緩衝 / 安全區', badgeFill: 'rgba(240, 201, 138, 0.96)' },
  unknown: { fill: 'rgba(181, 199, 221, 0.52)', stroke: 'rgba(214, 226, 241, 0.84)', label: '其他區域', badgeFill: 'rgba(181, 199, 221, 0.96)' }
};

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function num(value, fallback = null) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function metric(value, suffix = '') {
  return `${Math.round(Number(value) || 0)}${suffix}`;
}

function pad(index) {
  return String(index).padStart(2, '0');
}

function buildConfig(intent) {
  const normalized = normalizePlanningIntent(intent);
  const dims = normalized.warehouse.dimensions;
  if (!dims.length_mm || !dims.width_mm) return null;
  const directives = normalized.planning_preferences.semantic_directives || {};
  let primary = normalized.operation_profile.handling_mode === 'forklift' ? 3200 : 1800;
  let secondary = normalized.operation_profile.handling_mode === 'forklift' ? 1800 : 1200;
  if (directives.main_aisle_mode === 'narrow') {
    primary = Math.max(1400, primary - 500);
    secondary = Math.max(900, secondary - 300);
  }
  if (directives.main_aisle_mode === 'wide') {
    primary += 500;
    secondary += 300;
  }
  return normalizeWarehouseContainerConfig({
    shape: normalized.warehouse.shape === 'rectangle' ? 'rect' : normalized.warehouse.shape,
    widthX: dims.length_mm,
    depthZ: dims.width_mm,
    heightY: dims.height_mm || 3600,
    l_notch_width: normalized.warehouse.shape_params.l_notch_width_mm,
    l_notch_depth: normalized.warehouse.shape_params.l_notch_depth_mm,
    l_open_corner: normalized.warehouse.shape_params.l_open_corner,
    t_stem_width: normalized.warehouse.shape_params.t_stem_width_mm,
    t_head_depth: normalized.warehouse.shape_params.t_head_depth_mm,
    t_opening_direction: normalized.warehouse.shape_params.t_opening_direction,
    u_opening_width: normalized.warehouse.shape_params.u_opening_width_mm,
    u_opening_depth: normalized.warehouse.shape_params.u_opening_depth_mm,
    u_opening_direction: normalized.warehouse.shape_params.u_opening_direction,
    planning: {
      primaryAisleWidth: primary,
      secondaryAisleWidth: secondary,
      safetyBuffer: (normalized.warehouse.safety_zones || []).length ? 420 : 280
    }
  });
}

function zoneLabels(zones = []) {
  const labels = new Map();
  let storage = 0;
  let main = 0;
  let aisle = 0;
  let safety = 0;
  zones.forEach((zone) => {
    if (!zone?.id) return;
    let label = zone.label || zone.name || zone.id;
    const rect = zone.geometry_2d?.rect;
    const width = rect ? Math.max(0, rect.x_max_mm - rect.x_min_mm) : 0;
    const depth = rect ? Math.max(0, rect.z_max_mm - rect.z_min_mm) : 0;
    const primary = zone.type === 'usable' && width >= 1800 && depth >= 1800 && width * depth >= 4000000;
    if (zone.metadata?.preserveLabel) {
      labels.set(zone.id, label);
      return;
    }
    if (primary) label = `儲位區 ${pad(++storage)}`;
    else if (zone.type === 'usable') label = '作業區';
    else if (zone.zoneCategory === 'accessible_path' && zone.subtype === 'main_aisle') label = `主走道 ${++main}`;
    else if (zone.zoneCategory === 'accessible_path') label = `次走道 ${++aisle}`;
    else if (zone.zoneCategory === 'safety_buffer') label = `緩衝區 ${++safety}`;
    labels.set(zone.id, label);
  });
  return labels;
}

function shortLabel(label) {
  if (!label) return '';
  if (label.startsWith('儲位區')) return label.replace('儲位區 ', '儲位 ').replace('（加大）', ' 加大').slice(0, 10);
  if (label.includes('出貨緩衝區')) return '出貨緩衝';
  if (label.includes('高頻儲位區')) return '高頻區';
  return label.length > 8 ? `${label.slice(0, 8)}…` : label;
}

function semanticZoneKind(zone) {
  if (zone.zoneCategory === 'accessible_path') return zone.subtype === 'main_aisle' ? 'main_aisle' : 'secondary_aisle';
  if (zone.zoneCategory === 'safety_buffer') return zone.subtype === 'shipping_buffer' ? 'shipping_buffer' : 'safety_buffer';
  if (zone.metadata?.preferredNearEntry) return 'fast_moving_zone';
  if (zone.type === 'usable') return 'storage_zone';
  return 'unknown';
}

function zoneStyle(zone) {
  return SEMANTIC_ZONE_STYLES[semanticZoneKind(zone)] || SEMANTIC_ZONE_STYLES.unknown;
}

function listCard(title, items, emptyText) {
  const filtered = (items || []).filter(Boolean);
  return `<article class="planning-v2-wizard-summary-card"><h5>${escapeHtml(title)}</h5>${filtered.length ? `<ul>${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : `<p>${escapeHtml(emptyText)}</p>`}</article>`;
}

export const WarehousePlanningV2Page = {
  init() {
    if (this.initialized) this.destroy();
    const initial = warehousePlanningV2Service.loadInitialState();
    this.state = {
      draft: normalizePlanningIntent(initial.draft),
      parsed: null,
      result: initial.latestResult || null,
      lastMessage: null,
      lastEvent: null,
      flowMode: { code: 'idle', label: '等待輸入' },
      viewer: null,
      layers: { storage: true, aisles: true, safety: true },
      wizardStep: 0
    };
    this.bind();
    this.fill(this.state.draft);
    this.render();
    clearConversationHistory();
    this.initialized = true;
  },

  destroy() {
    this.closePreview();
    this.closeWizard();
    this.initialized = false;
  },
  bind() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: document.querySelector('.planning-v2-page'),
      prompt: $('planning-v2-prompt'),
      parse: $('planning-v2-parse-btn'),
      randomStart: $('planning-v2-random-start-btn'),
      generate: $('planning-v2-generate-btn'),
      regenerate: $('planning-v2-regenerate-btn'),
      save: $('planning-v2-save-btn'),
      preview: $('planning-v2-preview-3d'),
      status: $('planning-v2-status'),
      tabs: $('planning-v2-candidate-tabs'),
      canvas: $('planning-v2-canvas'),
      legend: $('planning-v2-canvas-legend'),
      compare: $('planning-v2-compare'),
      pillRow: $('planning-v2-wizard-pill-row'),
      hint: $('planning-v2-wizard-hint'),
      flowMode: $('planning-v2-flow-mode'),
      flowNote: $('planning-v2-flow-note'),
      wizardOpen: $('planning-v2-open-wizard'),
      wizardModal: $('planning-v2-wizard-modal'),
      wizardClose: $('planning-v2-wizard-close'),
      wizardSteps: $('planning-v2-wizard-steps'),
      wizardBody: document.querySelector('.planning-v2-wizard-body'),
      wizardPanels: Array.from(document.querySelectorAll('[data-step-panel]')),
      wizardPrev: $('planning-v2-wizard-prev'),
      wizardNext: $('planning-v2-wizard-next'),
      wizardSubmit: $('planning-v2-wizard-submit'),
      wizardSummary: $('planning-v2-wizard-summary'),
      previewModal: $('planning-v2-preview-modal'),
      previewClose: $('planning-v2-preview-close'),
      previewScene: $('planning-v2-preview-scene'),
      previewLegend: $('planning-v2-preview-legend'),
      previewZoneList: $('planning-v2-preview-zone-list'),
      zoneCount: $('quick-storage-zone-count'),
      aisleCount: $('quick-aisle-count'),
      preset: $('space-size-preset'),
      entrySide: $('entry-side'),
      useCase: $('qa-use-case'),
      handling: $('handling-mode'),
      goods: $('goods-type'),
      layout: $('preferred-layout-style'),
      loading: $('loading-area-required'),
      nearEntry: $('keep-fast-moving-near-entry'),
      reserve: $('reserve-expansion-area'),
      length: $('length-mm'),
      width: $('width-mm'),
      height: $('height-mm'),
      shape: $('shape'),
      entryWidth: $('entry-width-mm'),
      picking: $('picking-mode'),
      shipping: $('shipping-frequency'),
      rack: $('rack-mode'),
      sku: $('sku-density'),
      turning: $('turning-space-required'),
      zoning: $('zoning-required'),
      escape: $('escape-route-required'),
      fire: $('fire-lane-required'),
      stackable: $('stackable'),
      fragile: $('fragile'),
      cold: $('special-zone-cold'),
      hazardous: $('special-zone-hazardous'),
      heavy: $('special-zone-heavy'),
      objectiveStorage: $('objective-storage-density'),
      objectivePicking: $('objective-picking-efficiency'),
      objectiveSafety: $('objective-safety-margin'),
      lPanel: $('shape-params-l'),
      tPanel: $('shape-params-t'),
      uPanel: $('shape-params-u'),
      lWidth: $('l-notch-width-mm'),
      lDepth: $('l-notch-depth-mm'),
      lCorner: $('l-open-corner'),
      tWidth: $('t-stem-width-mm'),
      tDepth: $('t-head-depth-mm'),
      tDirection: $('t-opening-direction'),
      uWidth: $('u-opening-width-mm'),
      uDepth: $('u-opening-depth-mm'),
      uDirection: $('u-opening-direction'),
      layerStorage: $('layer-storage'),
      layerAisles: $('layer-aisles'),
      layerSafety: $('layer-safety'),
      presetBalanced: $('planning-v2-preset-conservative'),
      presetDensity: $('planning-v2-preset-density'),
      presetEfficiency: $('planning-v2-preset-efficiency')
    };

    this.el.parse?.addEventListener('click', () => this.handleParse());
    this.el.randomStart?.addEventListener('click', () => this.handleRecommendedStart());
    this.el.prompt?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.handleParse();
      }
    });
    this.el.generate?.addEventListener('click', () => this.handleGenerate());
    this.el.regenerate?.addEventListener('click', () => this.handleGenerate());
    this.el.save?.addEventListener('click', () => { this.syncDraft(); this.el.status.textContent = '草稿已儲存。'; this.renderWizardPills(); });
    this.el.preview?.addEventListener('click', () => this.openPreview());
    this.el.previewClose?.addEventListener('click', () => this.closePreview());

    this.el.wizardOpen?.addEventListener('click', () => this.openWizard());
    this.el.wizardClose?.addEventListener('click', () => this.closeWizard());
    this.el.wizardPrev?.addEventListener('click', () => this.goWizardStep(this.state.wizardStep - 1));
    this.el.wizardNext?.addEventListener('click', () => this.goWizardStep(this.state.wizardStep + 1));
    this.el.wizardSubmit?.addEventListener('click', () => this.applyWizard());
    this.el.wizardModal?.addEventListener('click', (event) => { if (event.target === this.el.wizardModal) this.closeWizard(); });
    this.el.previewModal?.addEventListener('click', (event) => { if (event.target === this.el.previewModal) this.closePreview(); });
    this.el.wizardSteps?.querySelectorAll('[data-step-target]').forEach((button) => button.addEventListener('click', () => this.goWizardStep(Number(button.dataset.stepTarget || 0))));

    this.el.presetBalanced?.addEventListener('click', () => { this.el.layout.value = 'conservative'; this.syncDraft(); this.handleGenerate(['balanced']); });
    this.el.presetDensity?.addEventListener('click', () => { this.el.layout.value = 'high_density'; this.syncDraft(); this.handleGenerate(['high_density']); });
    this.el.presetEfficiency?.addEventListener('click', () => { this.el.layout.value = 'high_efficiency'; this.syncDraft(); this.handleGenerate(['high_efficiency']); });

    this.el.preset?.addEventListener('change', () => { this.applyPreset(this.el.preset.value); this.syncDraft(); this.renderWizardSummary(); this.renderWizardPills(); });
    this.el.useCase?.addEventListener('change', () => { this.applyUseCase(); this.syncDraft(); this.renderWizardSummary(); this.renderWizardPills(); });

    ['layerStorage', 'layerAisles', 'layerSafety'].forEach((key) => {
      this.el[key]?.addEventListener('change', () => {
        this.state.layers = {
          storage: !!this.el.layerStorage.checked,
          aisles: !!this.el.layerAisles.checked,
          safety: !!this.el.layerSafety.checked
        };
        this.renderCanvas();
      });
    });

    this.el.root?.querySelectorAll('input, select, textarea').forEach((field) => {
      if (field === this.el.prompt) return;
      const handler = () => {
        if (field === this.el.shape) this.toggleShape();
        this.syncDraft();
        this.renderWizardSummary();
        this.renderWizardPills();
      };
      field.addEventListener('change', handler);
      if (field.tagName === 'TEXTAREA' || field.type === 'number') field.addEventListener('input', handler);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closePreview();
        this.closeWizard();
      }
    });
  },

  applyPreset(preset) {
    const next = SIZE_PRESETS[preset];
    if (!next) return;
    this.el.length.value = next.length;
    this.el.width.value = next.width;
    this.el.height.value = next.height;
    if (!this.el.entryWidth.value) this.el.entryWidth.value = next.entry;
  },

  applyUseCase() {
    const next = USE_CASES[this.el.useCase.value];
    if (!next) return;
    this.el.layout.value = next.layout;
    this.el.picking.value = next.pick;
    this.el.shipping.value = next.ship;
    this.el.loading.checked = next.load;
    this.el.objectiveStorage.value = next.s;
    this.el.objectivePicking.value = next.p;
    this.el.objectiveSafety.value = next.safe;
  },

  toggleShape() {
    const shape = this.el.shape.value;
    this.el.lPanel.hidden = shape !== 'l_shape';
    this.el.tPanel.hidden = shape !== 't_shape';
    this.el.uPanel.hidden = shape !== 'u_shape';
  },
  fill(intent) {
    const data = normalizePlanningIntent(intent);
    const dims = data.warehouse.dimensions;
    const entrance = data.warehouse.entrances?.[0] || {};
    this.el.prompt.value = data.natural_language_prompt || '';
    this.el.preset.value = dims.length_mm >= 15000 || dims.width_mm >= 8000 ? 'large' : (dims.length_mm && dims.length_mm <= 9000 ? 'small' : 'medium');
    this.el.zoneCount.value = data.planning_preferences.quick_targets.storage_zone_count || '';
    this.el.aisleCount.value = data.planning_preferences.quick_targets.aisle_count || '';
    this.el.entrySide.value = entrance.side || 'south';
    this.el.handling.value = data.operation_profile.handling_mode || 'manual';
    this.el.goods.value = data.storage_profile.goods_type || 'carton';
    this.el.layout.value = data.planning_preferences.preferred_layout_style || 'balanced';
    this.el.loading.checked = !!data.operation_profile.loading_area_required;
    this.el.nearEntry.checked = data.planning_preferences.keep_fast_moving_near_entry !== false;
    this.el.reserve.checked = !!data.planning_preferences.reserve_expansion_area;
    this.el.length.value = dims.length_mm || '';
    this.el.width.value = dims.width_mm || '';
    this.el.height.value = dims.height_mm || '';
    this.el.shape.value = data.warehouse.shape || 'rectangle';
    this.el.entryWidth.value = entrance.width_mm || '';
    this.el.picking.value = data.operation_profile.picking_mode || 'manual';
    this.el.shipping.value = data.operation_profile.shipping_frequency || 'medium';
    this.el.rack.value = data.storage_profile.rack_mode || 'shelf';
    this.el.sku.value = data.storage_profile.sku_density || 'medium';
    this.el.turning.checked = !!data.operation_profile.turning_space_required;
    this.el.zoning.value = data.operation_profile.zoning_required === false ? 'false' : 'true';
    this.el.escape.checked = (data.warehouse.safety_zones || []).some((zone) => zone.type === 'escape_route');
    this.el.fire.checked = (data.warehouse.safety_zones || []).some((zone) => zone.type === 'fire_lane');
    this.el.stackable.checked = data.storage_profile.stackable !== false;
    this.el.fragile.checked = !!data.storage_profile.fragile;
    this.el.cold.checked = (data.storage_profile.special_zones || []).includes('cold_storage');
    this.el.hazardous.checked = (data.storage_profile.special_zones || []).includes('hazardous');
    this.el.heavy.checked = (data.storage_profile.special_zones || []).includes('heavy_goods');
    this.el.objectiveStorage.value = data.planning_preferences.objective.storage_density || 0.4;
    this.el.objectivePicking.value = data.planning_preferences.objective.picking_efficiency || 0.4;
    this.el.objectiveSafety.value = data.planning_preferences.objective.safety_margin || 0.2;
    this.el.lWidth.value = data.warehouse.shape_params.l_notch_width_mm || '';
    this.el.lDepth.value = data.warehouse.shape_params.l_notch_depth_mm || '';
    this.el.lCorner.value = data.warehouse.shape_params.l_open_corner || 'north_east';
    this.el.tWidth.value = data.warehouse.shape_params.t_stem_width_mm || '';
    this.el.tDepth.value = data.warehouse.shape_params.t_head_depth_mm || '';
    this.el.tDirection.value = data.warehouse.shape_params.t_opening_direction || 'north';
    this.el.uWidth.value = data.warehouse.shape_params.u_opening_width_mm || '';
    this.el.uDepth.value = data.warehouse.shape_params.u_opening_depth_mm || '';
    this.el.uDirection.value = data.warehouse.shape_params.u_opening_direction || 'north';
    this.toggleShape();
    this.applyPreset(this.el.preset.value);
    this.renderWizardSummary();
    this.renderWizardPills();
  },

  answers() {
    return {
      naturalLanguagePrompt: this.el.prompt.value.trim(),
      quickStorageZoneCount: this.el.zoneCount.value || null,
      quickAisleCount: this.el.aisleCount.value || null,
      lengthMm: this.el.length.value || null,
      widthMm: this.el.width.value || null,
      heightMm: this.el.height.value || null,
      shape: this.el.shape.value || 'rectangle',
      entrySide: this.el.entrySide.value || 'south',
      entryWidthMm: this.el.entryWidth.value || null,
      handlingMode: this.el.handling.value || 'manual',
      pickingMode: this.el.picking.value || 'manual',
      shippingFrequency: this.el.shipping.value || 'medium',
      zoningRequired: this.el.zoning.value !== 'false',
      loadingAreaRequired: !!this.el.loading.checked,
      turningSpaceRequired: !!this.el.turning.checked,
      goodsType: this.el.goods.value || 'carton',
      rackMode: this.el.rack.value || 'shelf',
      stackable: !!this.el.stackable.checked,
      fragile: !!this.el.fragile.checked,
      skuDensity: this.el.sku.value || 'medium',
      specialZoneCold: !!this.el.cold.checked,
      specialZoneHazardous: !!this.el.hazardous.checked,
      specialZoneHeavy: !!this.el.heavy.checked,
      objectiveStorageDensity: this.el.objectiveStorage.value || 0.4,
      objectivePickingEfficiency: this.el.objectivePicking.value || 0.4,
      objectiveSafetyMargin: this.el.objectiveSafety.value || 0.2,
      keepFastMovingNearEntry: !!this.el.nearEntry.checked,
      reserveExpansionArea: !!this.el.reserve.checked,
      preferredLayoutStyle: this.el.layout.value || 'balanced',
      zoningStrategy: 'auto',
      escapeRouteRequired: !!this.el.escape.checked,
      fireLaneRequired: !!this.el.fire.checked,
      lNotchWidthMm: this.el.lWidth.value || null,
      lNotchDepthMm: this.el.lDepth.value || null,
      lOpenCorner: this.el.lCorner.value || 'north_east',
      tStemWidthMm: this.el.tWidth.value || null,
      tHeadDepthMm: this.el.tDepth.value || null,
      tOpeningDirection: this.el.tDirection.value || 'north',
      uOpeningWidthMm: this.el.uWidth.value || null,
      uOpeningDepthMm: this.el.uDepth.value || null,
      uOpeningDirection: this.el.uDirection.value || 'north'
    };
  },

  syncDraft() {
    const a = this.answers();
    const domainDraft = buildPlanningIntentFromAnswers(a);
    domainDraft.warehouse.shape_params = {
      l_notch_width_mm: num(a.lNotchWidthMm),
      l_notch_depth_mm: num(a.lNotchDepthMm),
      l_open_corner: a.lOpenCorner,
      t_stem_width_mm: num(a.tStemWidthMm),
      t_head_depth_mm: num(a.tHeadDepthMm),
      t_opening_direction: a.tOpeningDirection,
      u_opening_width_mm: num(a.uOpeningWidthMm),
      u_opening_depth_mm: num(a.uOpeningDepthMm),
      u_opening_direction: a.uOpeningDirection
    };
    this.state.draft = planningV2Orchestrator.saveDraft(domainDraft);
  },
  openWizard() {
    this.syncDraft();
    this.state.wizardStep = 0;
    this.renderWizard();
    if (this.el?.wizardBody) this.el.wizardBody.scrollTop = 0;
    this.el.wizardModal.hidden = false;
  },

  closeWizard() {
    if (this.el?.wizardModal) this.el.wizardModal.hidden = true;
  },

  goWizardStep(step) {
    const next = Math.max(0, Math.min(6, step));
    this.state.wizardStep = next;
    this.renderWizard();
    if (this.el?.wizardBody) this.el.wizardBody.scrollTop = 0;
  },

  renderWizard() {
    this.renderWizardSummary();
    this.el.wizardPanels.forEach((panel, index) => {
      panel.hidden = index !== this.state.wizardStep;
    });
    this.el.wizardSteps?.querySelectorAll('[data-step-target]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.stepTarget || 0) === this.state.wizardStep);
    });
    this.el.wizardPrev.hidden = this.state.wizardStep === 0;
    this.el.wizardNext.hidden = this.state.wizardStep === this.el.wizardPanels.length - 1;
    this.el.wizardSubmit.hidden = this.state.wizardStep !== this.el.wizardPanels.length - 1;
  },

  renderWizardSummary() {
    if (!this.el.wizardSummary) return;
    const a = this.answers();
    const intent = buildPlanningIntentFromAnswers(a);
    const dims = intent.warehouse.dimensions;
    const entrance = intent.warehouse.entrances?.[0] || { side: 'south' };
    const quickTargets = intent.planning_preferences.quick_targets || {};
    this.el.wizardSummary.innerHTML = [
      listCard('\u7A7A\u9593\u6982\u6CC1', [`\u7A7A\u9593\u9810\u8A2D\uFF1A${dims.length_mm && dims.width_mm ? `${dims.length_mm} x ${dims.width_mm} mm` : '\u4F7F\u7528\u9810\u8A2D\u7A7A\u9593'}`, quickTargets.storage_zone_count ? `\u76EE\u6A19\u5132\u4F4D\u5340\uFF1A${quickTargets.storage_zone_count}` : null], '\u5C1A\u672A\u8A2D\u5B9A'),
      listCard('\u5165\u53E3\u8207\u52D5\u7DDA', [`\u5165\u53E3\u5074\uFF1A${ENTRY_SIDE[entrance.side] || entrance.side}`, quickTargets.aisle_count ? `\u76EE\u6A19\u8D70\u9053\uFF1A${quickTargets.aisle_count}` : null], '\u5C1A\u672A\u8A2D\u5B9A'),
      listCard('\u8CA8\u7269\u8207\u8A2D\u5099', [`\u8CA8\u7269\u985E\u578B\uFF1A${GOODS[intent.storage_profile.goods_type] || intent.storage_profile.goods_type}`, `\u5132\u4F4D\u8A2D\u5099\uFF1A${this.el.rack?.selectedOptions?.[0]?.textContent || intent.storage_profile.rack_mode || ''}`], '\u5C1A\u672A\u8A2D\u5B9A'),
      listCard('\u4F7F\u7528\u65B9\u5F0F', [`\u7528\u9014\uFF1A${this.el.useCase?.selectedOptions?.[0]?.textContent || ''}`, `\u642C\u904B\u65B9\u5F0F\uFF1A${HANDLING[intent.operation_profile.handling_mode] || intent.operation_profile.handling_mode}`], '\u5C1A\u672A\u8A2D\u5B9A'),
      listCard('\u9650\u5236\u689D\u4EF6', [
        intent.operation_profile.loading_area_required ? '\u4FDD\u7559\u51FA\u8CA8 / \u66AB\u5B58\u5340' : null,
        intent.planning_preferences.keep_fast_moving_near_entry ? '\u71B1\u9580\u8CA8\u63A5\u8FD1\u5165\u53E3' : null,
        (intent.warehouse.safety_zones || []).some((zone) => zone.type === 'escape_route') ? '\u9810\u7559\u9003\u751F\u901A\u9053' : null,
        (intent.warehouse.safety_zones || []).some((zone) => zone.type === 'fire_lane') ? '\u9810\u7559\u6D88\u9632\u6DE8\u7A7A' : null,
        intent.planning_preferences.reserve_expansion_area ? '\u4FDD\u7559\u672A\u4F86\u64F4\u5145\u5340' : null
      ], '\u5C1A\u672A\u8A2D\u5B9A'),
      listCard('\u504F\u597D\u8207\u76EE\u6A19', [`\u7248\u578B\u504F\u597D\uFF1A${LAYOUT[intent.planning_preferences.preferred_layout_style] || intent.planning_preferences.preferred_layout_style}`, `\u63C0\u8CA8\u6A21\u5F0F\uFF1A${this.el.picking?.selectedOptions?.[0]?.textContent || intent.operation_profile.picking_mode || ''}`, `SKU \u5BC6\u5EA6\uFF1A${this.el.sku?.selectedOptions?.[0]?.textContent || intent.storage_profile.sku_density || ''}`], '\u5C1A\u672A\u8A2D\u5B9A')
    ].join('');
    this.state.wizardSummaryIntent = intent;
  },

  applyWizard() {
    this.syncDraft();
    this.renderWizardPills();
    this.updateDebugTrace();
    this.el.status.textContent = '規劃條件已更新，可直接理解需求或生成方案。';
    this.closeWizard();
  },

  renderWizardPills() {
    if (!this.el.pillRow) return;
    const pills = [
      this.el.zoneCount.value ? `儲位區 ${this.el.zoneCount.value}` : null,
      this.el.aisleCount.value ? `走道 ${this.el.aisleCount.value}` : null,
      ENTRY_SIDE[this.el.entrySide.value] ? `入口 ${ENTRY_SIDE[this.el.entrySide.value]}` : null,
      this.el.layout.value ? `偏好 ${LAYOUT[this.el.layout.value] || this.el.layout.value}` : null,
      this.el.loading.checked ? '出貨區' : null,
      this.el.escape.checked ? '逃生通道' : null,
      this.el.fire.checked ? '消防淨空' : null
    ].filter(Boolean);
    this.el.pillRow.innerHTML = pills.map((item) => `<span class="planning-v2-pill">${escapeHtml(item)}</span>`).join('');
    this.el.hint.textContent = pills.length ? '\u5DF2\u88DC\u9F4A\u90E8\u5206\u898F\u5283\u689D\u4EF6\uFF0C\u53EF\u96A8\u6642\u518D\u6B21\u958B\u555F\u7CBE\u9748\u8ABF\u6574\u3002' : '\u53EF\u7528\u898F\u5283\u7CBE\u9748\u9010\u6B65\u88DC\u9F4A\u7A7A\u9593\u3001\u52D5\u7DDA\u3001\u8CA8\u578B\u8207\u9650\u5236\u689D\u4EF6\u3002';
  },

  applyFlowResult(flow) {
    this.state.parsed = flow.capture?.parsedResult || null;
    this.state.draft = planningV2Orchestrator.saveDraft(flow.capture?.planningIntentMessage?.normalizedIntent || this.state.draft);
    this.state.result = flow.result || null;
    this.state.lastMessage = flow.capture?.planningIntentMessage || null;
    this.state.lastEvent = flow.uiMode?.code === 'refine'
      ? {
        ...(flow.event || {}),
        type: 'PlanRefinedEvent',
        summary: flow.event?.summary || this.state.result?.selected_candidate?.explanation?.summary?.[0] || '已根據目前方案微調'
      }
      : (flow.event || null);
    this.state.flowMode = flow.uiMode || { code: 'explicit_request', label: '明確需求解析' };
    this.fill(this.state.draft);
    this.updateDebugTrace();
    this.render();
  },

  updateDebugTrace() {
    const selected = this.state.result?.selected_candidate || null;
    globalThis.__planningV2Trace = {
      wizardPayload: this.answers(),
      summaryIntent: this.state.wizardSummaryIntent || buildPlanningIntentFromAnswers(this.answers()),
      draft: this.state.draft,
      generatorIntent: this.state.result?.planning_intent || null,
      plannerConstraints: selected?.planner_constraints || null,
      layoutIntentTrace: selected?.layout_plan?.intent_trace || null,
      projectedZones: selected?.layout_plan?.zones?.map((zone) => ({
        id: zone.id,
        label: zone.label,
        type: zone.type,
        zoneCategory: zone.zoneCategory,
        subtype: zone.subtype,
        rect: zone.geometry_2d?.rect
      })) || []
    };
  },

  renderFlowState() {
    if (this.el.flowMode) {
      this.el.flowMode.dataset.mode = this.state.flowMode?.code || 'idle';
      this.el.flowMode.textContent = this.state.flowMode?.label || '等待輸入';
    }

    if (this.el.flowNote) {
      this.el.flowNote.textContent = '系統會先整理需求，再依目前模式生成或微調方案。';
    }
  },

  async handleParse() {
    try {
      const a = this.answers();
      this.syncDraft();
      this.el.status.textContent = '正在理解需求...';
      const flow = await planningV2Orchestrator.handleSearchRequest({
        rawText: a.naturalLanguagePrompt,
        answers: a,
        source: 'search_box',
        currentPlanId: this.state.result?.selected_candidate_id || this.state.result?.selected_candidate?.id || null,
        currentIntentSnapshot: this.state.result?.planning_intent || this.state.draft,
        currentResult: this.state.result
      });
      this.applyFlowResult(flow);
    } catch (error) {
      console.error('[PlanningV2] handleParseOnly failed:', error);
      this.el.status.textContent = '理解需求失敗，請檢查輸入內容或補上基本空間資訊。';
    }
  },

  async handleRecommendedStart() {
    try {
      const a = this.answers();
      this.syncDraft();
      this.el.status.textContent = '正在產生推薦起手式...';
      const flow = await planningV2Orchestrator.handleRecommendedStart({
        rawText: a.naturalLanguagePrompt || '我沒有概念，先給我一版',
        answers: a,
        guided: true,
        currentPlanId: this.state.result?.selected_candidate_id || this.state.result?.selected_candidate?.id || null,
        currentIntentSnapshot: this.state.result?.planning_intent || this.state.draft
      });
      this.applyFlowResult(flow);
    } catch (error) {
      console.error('[PlanningV2] handleRecommendedStart failed:', error);
      this.el.status.textContent = '推薦起手式失敗，請稍後再試。';
    }
  },

  async handleGenerate(presetIds = undefined) {
    try {
      const a = this.answers();
      this.syncDraft();
      this.el.status.textContent = '正在生成方案...';
      if (presetIds?.length) {
        this.state.result = await warehousePlanningV2Service.generatePlan({ answers: a, prompt: a.naturalLanguagePrompt, presetIds });
        this.state.parsed = null;
        this.state.flowMode = { code: presetIds[0], label: `指定方案：${presetIds[0]}` };
        this.state.lastEvent = { type: 'PlanGeneratedEvent', summary: `以 ${presetIds[0]} 策略生成方案` };
        this.render();
        return;
      }
      const flow = await planningV2Orchestrator.handleSearchRequest({
        rawText: a.naturalLanguagePrompt,
        answers: a,
        source: 'search_box',
        currentPlanId: this.state.result?.selected_candidate_id || this.state.result?.selected_candidate?.id || null,
        currentIntentSnapshot: this.state.result?.planning_intent || this.state.draft,
        currentResult: this.state.result
      });
      this.applyFlowResult(flow);
    } catch (error) {
      console.error('[PlanningV2] handleGenerate failed:', error);
      this.el.status.textContent = '生成方案失敗，請確認尺寸或需求描述是否完整。';
    }
  },

  openPreview() {
    if (!this.state.result?.selected_candidate) {
      this.el.status.textContent = '請先生成方案，再開啟 3D 預覽。';
      return;
    }
    this.el.previewModal.hidden = false;
    this.renderPreviewLegend();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.el.previewScene.innerHTML = '';
      this.state.viewer = new ThreeViewer(this.el.previewScene);
      this.state.viewer.init();
      this.state.viewer.loadPackingResult(planningV2Orchestrator.buildPreviewData(this.state.result));
    }));
  },

  closePreview() {
    if (this.el?.previewModal) this.el.previewModal.hidden = true;
    if (this.state?.viewer) {
      this.state.viewer.dispose();
      this.state.viewer = null;
    }
    if (this.el?.previewScene) this.el.previewScene.innerHTML = '';
    if (this.el?.previewLegend) this.el.previewLegend.innerHTML = '';
    if (this.el?.previewZoneList) this.el.previewZoneList.innerHTML = '';
  },

  renderPreviewLegend() {
    if (!this.el.previewLegend || !this.el.previewZoneList) return;
    const items = [
      ['storage_zone', '儲位區', '主要儲位與作業空間'],
      ['main_aisle', '主走道', '主要搬運與通行動線'],
      ['secondary_aisle', '次走道', '分支走道與補充通行'],
      ['shipping_buffer', '出貨緩衝區', '出貨 / 暫存帶狀區域'],
      ['safety_buffer', '緩衝 / 安全區', '保護距離、邊界安全帶'],
      ['fast_moving_zone', '高頻區', '熱門貨或入口優先區']
    ];
    this.el.previewLegend.innerHTML = items.map(([key, title, desc]) => {
      const style = SEMANTIC_ZONE_STYLES[key];
      return `<article class="planning-v2-preview-legend-item"><span class="planning-v2-preview-swatch" style="background:${style.fill}"></span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div></article>`;
    }).join('');
    const zones = (this.state.result?.selected_candidate?.layout_plan?.zones || []).slice(0, 12);
    this.el.previewZoneList.innerHTML = zones.length
      ? zones.map((zone) => {
        const label = zone.label || zone.name || zone.id;
        const style = zoneStyle(zone);
        return `<article class="planning-v2-preview-zone-item"><span class="planning-v2-preview-swatch" style="background:${style.fill}"></span><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(style.label)}</span></div></article>`;
      }).join('')
      : '<div class="planning-v2-inline-hint">尚無可預覽的區塊資料。</div>';
  },

  render() {
    this.updateDebugTrace();
    this.renderTabs();
    this.renderCanvas();
    this.renderCompare();
    this.renderFlowState();
    this.renderStatus();
    this.renderWizardPills();
    this.renderWizard();
  },

  renderStatus() {
    if (!this.el.status) return;
    const selected = this.state.result?.selected_candidate;
    if (selected) {
      const modeLabel = this.state.flowMode?.label ? ` / ${this.state.flowMode.label}` : '';
      this.el.status.textContent = `目前方案：${selected.label}，總分 ${selected.scorecard?.total_score || 0} 分${modeLabel}`;
      return;
    }
    if (this.state.parsed?.planning_intent) {
      const missing = this.state.parsed.missing_fields?.length || 0;
      this.el.status.textContent = missing ? `需求已理解，仍有 ${missing} 項資訊可補充。` : '需求已理解，可以直接生成方案。';
      return;
    }
    this.el.status.textContent = '先輸入需求，系統會先整理規劃條件，再生成 2D 方案。';
  },
  renderTabs() {
    const candidates = this.state.result?.candidates || [];
    if (!this.el.tabs) return;
    if (!candidates.length) {
      this.el.tabs.innerHTML = '';
      return;
    }
    this.el.tabs.innerHTML = candidates.map((candidate) => `<button class="planning-v2-candidate-tab ${candidate.id === this.state.result.selected_candidate_id ? 'is-active' : ''}" data-candidate-id="${candidate.id}" type="button"><strong>${escapeHtml(candidate.label)}</strong><span>${candidate.scorecard.total_score} pts</span></button>`).join('');
    this.el.tabs.querySelectorAll('[data-candidate-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state.result = planningV2Orchestrator.selectCandidate(this.state.result, button.dataset.candidateId);
        this.render();
      });
    });
  },

  renderCanvas() {
    if (!this.el.canvas) return;
    const selected = this.state.result?.selected_candidate;
    if (!selected) {
      const config = buildConfig(this.state.draft);
      if (!config) {
        this.el.canvas.innerHTML = '<div class="planning-v2-empty">先描述需求，或按「用問答補充需求」開啟規劃精靈。當空間尺寸足夠時，這裡就會建立 2D 草圖。</div>';
        this.el.legend.innerHTML = '<div class="planning-v2-empty">生成方案後，這裡會列出主要區塊與說明。</div>';
        return;
      }
      const points = getFootprintOutlinePoints(config).map((point) => `${point.x},${point.z}`).join(' ');
      const side = this.state.draft.warehouse.entrances?.[0]?.side || 'south';
      this.el.canvas.innerHTML = `<svg viewBox="0 0 ${config.widthX} ${config.depthZ}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Quick mode draft canvas"><rect x="0" y="0" width="${config.widthX}" height="${config.depthZ}" rx="420" ry="420" fill="rgba(3, 10, 18, 0.84)" stroke="rgba(124, 183, 255, 0.22)" stroke-width="90"></rect><polygon points="${points}" fill="rgba(52, 113, 255, 0.18)" stroke="rgba(124, 179, 255, 0.92)" stroke-width="90" stroke-linejoin="round"></polygon><text x="${config.widthX / 2}" y="${Math.max(880, config.depthZ / 2)}" fill="rgba(194, 212, 232, 0.88)" font-size="420" text-anchor="middle">草圖預覽 / 入口 ${escapeHtml(ENTRY_SIDE[side] || side)}</text></svg>`;
      this.el.legend.innerHTML = listCard('目前草圖條件', [`空間尺寸：${config.widthX} x ${config.depthZ} mm`, `入口位置：${ENTRY_SIDE[side] || side}`, `搬運方式：${HANDLING[this.state.draft.operation_profile.handling_mode] || this.state.draft.operation_profile.handling_mode}`], '尚無草圖資訊');
      return;
    }

    const labels = zoneLabels(selected.layout_plan?.zones || []);
    const zones = (selected.layout_plan?.zones || [])
      .filter((zone) => (zone.type === 'usable' ? this.state.layers.storage : zone.zoneCategory === 'accessible_path' ? this.state.layers.aisles : zone.zoneCategory === 'safety_buffer' ? this.state.layers.safety : true))
      .sort((a, b) => {
        const order = { safety_buffer: 0, accessible_path: 1, storage_zone: 2 };
        const aKey = a.zoneCategory === 'accessible_path' ? 'accessible_path' : a.zoneCategory === 'safety_buffer' ? 'safety_buffer' : 'storage_zone';
        const bKey = b.zoneCategory === 'accessible_path' ? 'accessible_path' : b.zoneCategory === 'safety_buffer' ? 'safety_buffer' : 'storage_zone';
        return (order[aKey] || 9) - (order[bKey] || 9);
      });
    const placed = [];
    const externalLabels = [];
    const width = selected.container_config.widthX || 24000;
    const height = selected.container_config.depthZ || 12000;
    this.el.canvas.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="2D warehouse planning canvas"><rect x="0" y="0" width="${width}" height="${height}" rx="420" ry="420" fill="rgba(3, 10, 18, 0.84)" stroke="rgba(124, 183, 255, 0.28)" stroke-width="90"></rect>${zones.map((zone) => {
      const rect = zone.geometry_2d?.rect;
      if (!rect) return '';
      const x = rect.x_min_mm || 0;
      const y = rect.z_min_mm || 0;
      const rectWidth = (rect.x_max_mm || 0) - x;
      const rectHeight = (rect.z_max_mm || 0) - y;
      const label = labels.get(zone.id) || zone.label || zone.name || zone.id;
      const short = shortLabel(label);
      const style = zoneStyle(zone);
      const font = Math.max(220, Math.min(460, Math.min(rectWidth / Math.max(short.length, 2), rectHeight * 0.34)));
      const box = { x: x + (rectWidth / 2) - Math.max(320, short.length * font * 0.66) / 2, y: y + (rectHeight / 2) - (font * 1.6) / 2, width: Math.max(320, short.length * font * 0.66), height: font * 1.6 };
      const overlap = placed.some((entry) => !(entry.x + entry.width < box.x || box.x + box.width < entry.x || entry.y + entry.height < box.y || box.y + box.height < entry.y));
      const zoneKind = semanticZoneKind(zone);
      const requiresExternal = zoneKind === 'shipping_buffer' || (zoneKind === 'safety_buffer' && rectHeight < 1100 && rectWidth > rectHeight * 3.2);
      const show = short && rectWidth >= 1400 && rectHeight >= 1000 && !overlap && !requiresExternal;
      if (show) placed.push(box);
      const markerLabel = zone.metadata?.semanticMarker === 'fast_moving_zone' ? (zone.metadata?.semanticMarkerLabel || '高頻區') : '';
      const markerBadge = markerLabel && rectWidth >= 1400 && rectHeight >= 900
        ? `<g data-zone-marker="true"><rect x="${x + 120}" y="${y + 120}" width="${Math.min(980, Math.max(520, markerLabel.length * 118))}" height="180" rx="90" ry="90" fill="rgba(6, 16, 28, 0.82)" stroke="${style.stroke}" stroke-width="24" stroke-dasharray="90 54"></rect><text x="${x + 120 + (Math.min(980, Math.max(520, markerLabel.length * 118)) / 2)}" y="${y + 210}" fill="rgba(240,248,255,0.96)" font-size="128" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(markerLabel)}</text></g>`
        : '';
      if (requiresExternal) {
        externalLabels.push({
          label,
          short: semanticZoneKind(zone) === 'shipping_buffer' ? '出貨緩衝區' : short,
          x: x + Math.min(rectWidth - 240, Math.max(240, rectWidth * 0.5)),
          y: semanticZoneKind(zone) === 'shipping_buffer' ? Math.max(280, y - 160) : Math.max(260, y - 120),
          lineX: x + (rectWidth / 2),
          lineY: y + Math.min(rectHeight / 2, 120),
          fill: style.badgeFill || style.fill
        });
      }
      return `<g><title>${escapeHtml(label)}</title><rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${zoneKind === 'shipping_buffer' ? 92 : 72}" rx="120" ry="120"></rect>${zoneKind === 'shipping_buffer' ? `<line x1="${x + 120}" y1="${y + 80}" x2="${x + rectWidth - 120}" y2="${y + 80}" stroke="${style.stroke}" stroke-width="32" stroke-linecap="round" stroke-dasharray="160 110"></line>` : ''}${zone.metadata?.semanticMarker === 'fast_moving_zone' ? `<rect x="${x + 80}" y="${y + 80}" width="${Math.max(240, rectWidth - 160)}" height="${Math.max(220, rectHeight - 160)}" fill="transparent" stroke="${style.stroke}" stroke-width="34" stroke-dasharray="160 90" rx="96" ry="96"></rect>` : ''}${markerBadge}${show ? `<text data-zone-label="true" x="${x + (rectWidth / 2)}" y="${y + (rectHeight / 2)}" fill="rgba(240,248,255,0.92)" font-size="${Math.round(font)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="rgba(4,10,18,0.84)" stroke-width="${Math.max(24, Math.round(font * 0.12))}">${escapeHtml(short)}</text>` : ''}</g>`;
    }).join('')}${externalLabels.map((entry, index) => `<g data-zone-callout="true"><line x1="${entry.lineX}" y1="${entry.lineY}" x2="${entry.x}" y2="${entry.y}" stroke="${entry.fill}" stroke-width="28" stroke-linecap="round"></line><rect x="${entry.x - 360}" y="${entry.y - 110}" width="720" height="180" rx="90" ry="90" fill="rgba(4, 10, 18, 0.92)" stroke="${entry.fill}" stroke-width="24"></rect><text x="${entry.x}" y="${entry.y - 2}" fill="rgba(248,252,255,0.96)" font-size="128" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(entry.short)}</text></g>`).join('')}</svg>`;

    const legendZones = zones.slice().sort((a, b) => (((b.geometry_2d?.rect?.x_max_mm || 0) - (b.geometry_2d?.rect?.x_min_mm || 0)) * ((b.geometry_2d?.rect?.z_max_mm || 0) - (b.geometry_2d?.rect?.z_min_mm || 0))) - (((a.geometry_2d?.rect?.x_max_mm || 0) - (a.geometry_2d?.rect?.x_min_mm || 0)) * ((a.geometry_2d?.rect?.z_max_mm || 0) - (a.geometry_2d?.rect?.z_min_mm || 0)))).slice(0, 10);
    this.el.legend.innerHTML = legendZones.length ? legendZones.map((zone) => {
      const rect = zone.geometry_2d?.rect || {};
      const rectWidth = Math.max(0, (rect.x_max_mm || 0) - (rect.x_min_mm || 0));
      const rectDepth = Math.max(0, (rect.z_max_mm || 0) - (rect.z_min_mm || 0));
      const label = labels.get(zone.id) || zone.label || zone.name || zone.id;
      const type = zoneStyle(zone).label;
      const fill = zoneStyle(zone).fill;
      return `<article class="planning-v2-legend-item"><span class="planning-v2-legend-swatch" style="background:${fill}"></span><div class="planning-v2-legend-copy"><strong class="planning-v2-legend-title">${escapeHtml(label)}</strong><span class="planning-v2-legend-meta">${escapeHtml(type)} / ${Math.round(rectWidth)} x ${Math.round(rectDepth)} mm</span></div></article>`;
    }).join('') : '<div class="planning-v2-empty">生成方案後，這裡會列出主要區塊與說明。</div>';
  },

  renderCompare() {
    const candidates = this.state.result?.candidates || [];
    if (!this.el.compare) return;
    if (!candidates.length) {
      this.el.compare.innerHTML = '<div class="planning-v2-empty">生成方案後，這裡會比較不同候選方案。</div>';
      return;
    }
    this.el.compare.innerHTML = candidates.map((candidate) => `<article class="planning-v2-compare-item ${candidate.id === this.state.result.selected_candidate_id ? 'is-selected' : ''}" data-candidate-id="${candidate.id}" role="button" tabindex="0"><div class="planning-v2-compare-head"><strong>${escapeHtml(candidate.label)}</strong><span>${candidate.scorecard.total_score} pts</span></div><div>${escapeHtml(candidate.explanation?.summary?.[0] || '候選方案摘要')}</div><div class="planning-v2-compare-metrics"><div class="planning-v2-metric-pill">Storage ${pct(candidate.layout_plan?.metrics?.storageUtilization)}</div><div class="planning-v2-metric-pill">Access ${pct(candidate.layout_plan?.metrics?.accessibilityRatio)}</div><div class="planning-v2-metric-pill">Dead ${pct(candidate.layout_plan?.metrics?.deadCornerRatio)}</div><div class="planning-v2-metric-pill">Pick ${metric(candidate.layout_plan?.metrics?.averagePickDistanceMm, ' mm')}</div></div></article>`).join('');
    this.el.compare.querySelectorAll('[data-candidate-id]').forEach((card) => {
      const activate = () => { this.state.result = planningV2Orchestrator.selectCandidate(this.state.result, card.dataset.candidateId); this.render(); };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
    });
  }
};

export default WarehousePlanningV2Page;
