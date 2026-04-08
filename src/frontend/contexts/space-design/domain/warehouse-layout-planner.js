const DEFAULT_GRID_SIZE_MM = 200;
const DEFAULT_TARGET_STORAGE_BAND_MM = 2400;

const DEFAULT_PLANNING = {
  primaryAisleWidth: 2400,
  secondaryAisleWidth: 1600,
  safetyBuffer: 300,
  boundaryInspectionAisleWidth: 1000,
  preserveCentralMainAisle: true,
  preserveBoundaryInspectionAisle: false,
  mainAisleAxis: 'auto',
  mainAisleOffsetRatio: 0.5,
  targetStorageBand: DEFAULT_TARGET_STORAGE_BAND_MM,
  gridSizeMm: DEFAULT_GRID_SIZE_MM,
  strategy: 'balanced',
  optimizationWeights: {
    storageUtilization: 0.32,
    aisleBalance: 0.16,
    accessibility: 0.2,
    pickingEfficiency: 0.18,
    slottingFlexibility: 0.14
  }
};

const STRATEGY_WEIGHT_MAP = {
  balanced: {
    storageUtilization: 0.32,
    aisleBalance: 0.16,
    accessibility: 0.2,
    pickingEfficiency: 0.18,
    slottingFlexibility: 0.14
  },
  storage_first: {
    storageUtilization: 0.42,
    aisleBalance: 0.14,
    accessibility: 0.16,
    pickingEfficiency: 0.12,
    slottingFlexibility: 0.16
  },
  picking_first: {
    storageUtilization: 0.22,
    aisleBalance: 0.18,
    accessibility: 0.24,
    pickingEfficiency: 0.24,
    slottingFlexibility: 0.12
  }
};

const CELL_PRIORITY = {
  outside: 0,
  storage_candidate: 1,
  dead_corner: 2,
  accessible_path: 3,
  safety_buffer: 4,
  blocked_area: 5
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeAxis(axis, widthX, depthZ) {
  if (axis === 'vertical' || axis === 'horizontal') {
    return axis;
  }

  if (axis === 'along_length') {
    return 'horizontal';
  }

  if (axis === 'along_width') {
    return 'vertical';
  }

  return widthX >= depthZ ? 'vertical' : 'horizontal';
}

function normalizeOrientation(input, fallback = 'north') {
  const value = String(input || fallback).toLowerCase();
  if (['north', 'south', 'east', 'west'].includes(value)) {
    return value;
  }
  return fallback;
}

function normalizeLShapeCorner(input, fallback = 'north_east') {
  const value = String(input || fallback).toLowerCase();
  if (['north_east', 'north_west', 'south_east', 'south_west'].includes(value)) {
    return value;
  }
  return fallback;
}

function buildPlanningWeights(planning = {}) {
  const strategy = planning.strategy || 'balanced';
  const baseWeights = STRATEGY_WEIGHT_MAP[strategy] || DEFAULT_PLANNING.optimizationWeights;
  const overrides = planning.optimizationWeights || {};

  return {
    storageUtilization: toNumber(overrides.storageUtilization, baseWeights.storageUtilization),
    aisleBalance: toNumber(overrides.aisleBalance, baseWeights.aisleBalance),
    accessibility: toNumber(overrides.accessibility, baseWeights.accessibility),
    pickingEfficiency: toNumber(overrides.pickingEfficiency, baseWeights.pickingEfficiency),
    slottingFlexibility: toNumber(overrides.slottingFlexibility, baseWeights.slottingFlexibility)
  };
}

function normalizeRect(rect) {
  return {
    x: toNumber(rect.x),
    z: toNumber(rect.z),
    width: Math.max(0, toNumber(rect.width)),
    depth: Math.max(0, toNumber(rect.depth))
  };
}

function rectContainsPoint(rect, x, z) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    z >= rect.z &&
    z <= rect.z + rect.depth
  );
}

function rectsIntersect(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.z + a.depth <= b.z ||
    b.z + b.depth <= a.z
  );
}

function buildRectZone({
  id,
  type,
  zoneCategory,
  subtype,
  rect,
  depth,
  label,
  metadata = {},
  tags = []
}) {
  const safeRect = normalizeRect(rect);
  const areaMm2 = safeRect.width * safeRect.depth;
  const depthMm = toNumber(depth, 2400);

  return {
    id,
    type,
    zoneCategory,
    subtype,
    label,
    name: label,
    x: safeRect.x + (safeRect.width / 2),
    y: safeRect.z + (safeRect.depth / 2),
    width: safeRect.width,
    height: safeRect.depth,
    depth: depthMm,
    area: round2(areaMm2 / 1000000),
    geometry_2d: {
      kind: 'rect',
      rect: {
        x_min_mm: safeRect.x,
        x_max_mm: safeRect.x + safeRect.width,
        z_min_mm: safeRect.z,
        z_max_mm: safeRect.z + safeRect.depth
      }
    },
    height_policy: {
      mode: 'inherit_container',
      y_mm: depthMm
    },
    metrics: {
      area_m2: round2(areaMm2 / 1000000),
      volume_mm3: areaMm2 * depthMm,
      max_span_x_mm: safeRect.width,
      max_span_z_mm: safeRect.depth
    },
    tags,
    metadata
  };
}

function getCandidateOffsets(baseRatio = 0.5) {
  const primaryRatio = clamp(baseRatio, 0.2, 0.8);
  return Array.from(new Set([
    round2(primaryRatio),
    round2(clamp(primaryRatio - 0.15, 0.18, 0.82)),
    round2(clamp(primaryRatio + 0.15, 0.18, 0.82)),
    0.5
  ]));
}

function buildOutlineFromConfig(config) {
  const { shape, widthX, depthZ } = config;

  if (shape === 'rect') {
    return [
      { x: 0, z: 0 },
      { x: widthX, z: 0 },
      { x: widthX, z: depthZ },
      { x: 0, z: depthZ }
    ];
  }

  if (shape === 't_shape') {
    const stemWidth = config.t_stem_width;
    const headDepth = config.t_head_depth;
    const orientation = config.t_opening_direction;

    if (orientation === 'north') {
      const stemLeft = (widthX - stemWidth) / 2;
      return [
        { x: 0, z: 0 },
        { x: widthX, z: 0 },
        { x: widthX, z: headDepth },
        { x: stemLeft + stemWidth, z: headDepth },
        { x: stemLeft + stemWidth, z: depthZ },
        { x: stemLeft, z: depthZ },
        { x: stemLeft, z: headDepth },
        { x: 0, z: headDepth }
      ];
    }

    if (orientation === 'south') {
      const stemLeft = (widthX - stemWidth) / 2;
      return [
        { x: 0, z: depthZ },
        { x: widthX, z: depthZ },
        { x: widthX, z: depthZ - headDepth },
        { x: stemLeft + stemWidth, z: depthZ - headDepth },
        { x: stemLeft + stemWidth, z: 0 },
        { x: stemLeft, z: 0 },
        { x: stemLeft, z: depthZ - headDepth },
        { x: 0, z: depthZ - headDepth }
      ];
    }

    if (orientation === 'east') {
      const stemTop = (depthZ - stemWidth) / 2;
      return [
        { x: widthX, z: 0 },
        { x: widthX, z: depthZ },
        { x: widthX - headDepth, z: depthZ },
        { x: widthX - headDepth, z: stemTop + stemWidth },
        { x: 0, z: stemTop + stemWidth },
        { x: 0, z: stemTop },
        { x: widthX - headDepth, z: stemTop },
        { x: widthX - headDepth, z: 0 }
      ];
    }

    const stemTop = (depthZ - stemWidth) / 2;
    return [
      { x: 0, z: 0 },
      { x: 0, z: depthZ },
      { x: headDepth, z: depthZ },
      { x: headDepth, z: stemTop + stemWidth },
      { x: widthX, z: stemTop + stemWidth },
      { x: widthX, z: stemTop },
      { x: headDepth, z: stemTop },
      { x: headDepth, z: 0 }
    ];
  }

  if (shape === 'l_shape') {
    const notchWidth = config.l_notch_width;
    const notchDepth = config.l_notch_depth;
    const corner = config.l_open_corner;

    if (corner === 'north_west') {
      return [
        { x: notchWidth, z: 0 },
        { x: widthX, z: 0 },
        { x: widthX, z: depthZ },
        { x: 0, z: depthZ },
        { x: 0, z: notchDepth },
        { x: notchWidth, z: notchDepth }
      ];
    }

    if (corner === 'south_west') {
      return [
        { x: 0, z: 0 },
        { x: widthX, z: 0 },
        { x: widthX, z: depthZ },
        { x: notchWidth, z: depthZ },
        { x: notchWidth, z: depthZ - notchDepth },
        { x: 0, z: depthZ - notchDepth }
      ];
    }

    if (corner === 'south_east') {
      return [
        { x: 0, z: 0 },
        { x: widthX, z: 0 },
        { x: widthX, z: depthZ - notchDepth },
        { x: widthX - notchWidth, z: depthZ - notchDepth },
        { x: widthX - notchWidth, z: depthZ },
        { x: 0, z: depthZ }
      ];
    }

    return [
      { x: 0, z: 0 },
      { x: widthX - notchWidth, z: 0 },
      { x: widthX - notchWidth, z: notchDepth },
      { x: widthX, z: notchDepth },
      { x: widthX, z: depthZ },
      { x: 0, z: depthZ }
    ];
  }

  const openingWidth = config.u_opening_width;
  const openingDepth = config.u_opening_depth;
  const orientation = config.u_opening_direction;

  if (orientation === 'north') {
    const armWidth = (widthX - openingWidth) / 2;
    return [
      { x: 0, z: 0 },
      { x: widthX, z: 0 },
      { x: widthX, z: depthZ },
      { x: widthX - armWidth, z: depthZ },
      { x: widthX - armWidth, z: openingDepth },
      { x: armWidth, z: openingDepth },
      { x: armWidth, z: depthZ },
      { x: 0, z: depthZ }
    ];
  }

  if (orientation === 'south') {
    const armWidth = (widthX - openingWidth) / 2;
    return [
      { x: 0, z: depthZ },
      { x: widthX, z: depthZ },
      { x: widthX, z: 0 },
      { x: widthX - armWidth, z: 0 },
      { x: widthX - armWidth, z: depthZ - openingDepth },
      { x: armWidth, z: depthZ - openingDepth },
      { x: armWidth, z: 0 },
      { x: 0, z: 0 }
    ];
  }

  if (orientation === 'east') {
    const armDepth = (depthZ - openingWidth) / 2;
    return [
      { x: widthX, z: 0 },
      { x: widthX, z: depthZ },
      { x: 0, z: depthZ },
      { x: 0, z: depthZ - armDepth },
      { x: widthX - openingDepth, z: depthZ - armDepth },
      { x: widthX - openingDepth, z: armDepth },
      { x: 0, z: armDepth },
      { x: 0, z: 0 }
    ];
  }

  const armDepth = (depthZ - openingWidth) / 2;
  return [
    { x: 0, z: 0 },
    { x: 0, z: depthZ },
    { x: widthX, z: depthZ },
    { x: widthX, z: depthZ - armDepth },
    { x: openingDepth, z: depthZ - armDepth },
    { x: openingDepth, z: armDepth },
    { x: widthX, z: armDepth },
    { x: widthX, z: 0 }
  ];
}

export function normalizeWarehouseContainerConfig(rawConfig = {}) {
  const shape = rawConfig.shape || 'rect';
  const widthX = Math.max(1000, toNumber(rawConfig.widthX, toNumber(rawConfig.u_outer_x, 6000)));
  const depthZ = Math.max(1000, toNumber(rawConfig.depthZ, toNumber(rawConfig.u_outer_z, 4000)));
  const heightY = Math.max(1800, toNumber(rawConfig.heightY, 2400));

  const planning = {
    ...DEFAULT_PLANNING,
    ...(rawConfig.planning || {})
  };
  planning.optimizationWeights = buildPlanningWeights(planning);
  planning.gridSizeMm = Math.max(100, toNumber(planning.gridSizeMm, DEFAULT_GRID_SIZE_MM));
  planning.targetStorageBand = Math.max(
    1200,
    toNumber(planning.targetStorageBand, DEFAULT_TARGET_STORAGE_BAND_MM)
  );
  planning.primaryAisleWidth = Math.max(1000, toNumber(planning.primaryAisleWidth, DEFAULT_PLANNING.primaryAisleWidth));
  planning.secondaryAisleWidth = Math.max(0, toNumber(planning.secondaryAisleWidth, DEFAULT_PLANNING.secondaryAisleWidth));
  planning.safetyBuffer = Math.max(0, toNumber(planning.safetyBuffer, DEFAULT_PLANNING.safetyBuffer));
  planning.boundaryInspectionAisleWidth = Math.max(
    0,
    toNumber(planning.boundaryInspectionAisleWidth, DEFAULT_PLANNING.boundaryInspectionAisleWidth)
  );
  planning.mainAisleAxis = normalizeAxis(planning.mainAisleAxis, widthX, depthZ);
  planning.mainAisleOffsetRatio = clamp(toNumber(planning.mainAisleOffsetRatio, 0.5), 0.18, 0.82);

  const normalized = {
    ...rawConfig,
    shape,
    widthX,
    depthZ,
    heightY,
    planning
  };

  if (shape === 't_shape') {
    normalized.t_opening_direction = normalizeOrientation(
      rawConfig.t_opening_direction || rawConfig.openingDirection,
      'north'
    );
    normalized.t_stem_width = clamp(
      toNumber(rawConfig.t_stem_width, rawConfig.t_bottom_x || (widthX * 0.42)),
      Math.min(widthX * 0.22, widthX - 800),
      widthX - 400
    );
    normalized.t_head_depth = clamp(
      toNumber(rawConfig.t_head_depth, rawConfig.t_top_z || (depthZ * 0.36)),
      Math.min(depthZ * 0.18, depthZ - 800),
      depthZ - 400
    );
    normalized.t_top_x = widthX;
    normalized.t_top_z = normalized.t_head_depth;
    normalized.t_bottom_x = normalized.t_stem_width;
    normalized.t_bottom_z = depthZ - normalized.t_head_depth;
    normalized.topWidthX = normalized.t_top_x;
    normalized.topDepthZ = normalized.t_top_z;
    normalized.bottomWidthX = normalized.t_bottom_x;
    normalized.bottomDepthZ = normalized.t_bottom_z;
  }

  if (shape === 'l_shape') {
    normalized.l_open_corner = normalizeLShapeCorner(rawConfig.l_open_corner, 'north_east');
    normalized.l_notch_width = clamp(
      toNumber(rawConfig.l_notch_width, widthX * 0.38),
      600,
      widthX - 600
    );
    normalized.l_notch_depth = clamp(
      toNumber(rawConfig.l_notch_depth, depthZ * 0.38),
      600,
      depthZ - 600
    );
  }

  if (shape === 'u_shape') {
    normalized.u_opening_direction = normalizeOrientation(
      rawConfig.u_opening_direction || rawConfig.openingDirection,
      'north'
    );
    const openingBasis = ['east', 'west'].includes(normalized.u_opening_direction) ? depthZ : widthX;
    const depthBasis = ['east', 'west'].includes(normalized.u_opening_direction) ? widthX : depthZ;
    normalized.u_opening_width = clamp(
      toNumber(rawConfig.u_opening_width, rawConfig.u_gap_x || (openingBasis * 0.36)),
      Math.min(openingBasis * 0.18, openingBasis - 800),
      openingBasis - 400
    );
    normalized.u_opening_depth = clamp(
      toNumber(rawConfig.u_opening_depth, rawConfig.u_gap_z || (depthBasis * 0.42)),
      Math.min(depthBasis * 0.22, depthBasis - 800),
      depthBasis - 400
    );
    normalized.u_outer_x = widthX;
    normalized.u_outer_z = depthZ;
    normalized.u_gap_x = normalized.u_opening_width;
    normalized.u_gap_z = normalized.u_opening_depth;
    normalized.outerWidthX = widthX;
    normalized.outerDepthZ = depthZ;
    normalized.gapWidthX = normalized.u_opening_width;
    normalized.gapDepthZ = normalized.u_opening_depth;
  }

  return normalized;
}

export function buildFootprintRectangles(rawConfig = {}) {
  const config = normalizeWarehouseContainerConfig(rawConfig);
  const { shape, widthX, depthZ } = config;

  if (shape === 'rect') {
    return [normalizeRect({ x: 0, z: 0, width: widthX, depth: depthZ })];
  }

  if (shape === 't_shape') {
    const stemWidth = config.t_stem_width;
    const headDepth = config.t_head_depth;
    const stemDepth = depthZ - headDepth;
    const stemLeft = (widthX - stemWidth) / 2;
    const orientation = config.t_opening_direction;

    if (orientation === 'north') {
      return [
        normalizeRect({ x: 0, z: 0, width: widthX, depth: headDepth }),
        normalizeRect({ x: stemLeft, z: headDepth, width: stemWidth, depth: stemDepth })
      ];
    }

    if (orientation === 'south') {
      return [
        normalizeRect({ x: 0, z: depthZ - headDepth, width: widthX, depth: headDepth }),
        normalizeRect({ x: stemLeft, z: 0, width: stemWidth, depth: stemDepth })
      ];
    }

    if (orientation === 'east') {
      const stemTop = (depthZ - stemWidth) / 2;
      return [
        normalizeRect({ x: widthX - headDepth, z: 0, width: headDepth, depth: depthZ }),
        normalizeRect({ x: 0, z: stemTop, width: widthX - headDepth, depth: stemWidth })
      ];
    }

    const stemTop = (depthZ - stemWidth) / 2;
    return [
      normalizeRect({ x: 0, z: 0, width: headDepth, depth: depthZ }),
      normalizeRect({ x: headDepth, z: stemTop, width: widthX - headDepth, depth: stemWidth })
    ];
  }

  if (shape === 'l_shape') {
    const notchWidth = config.l_notch_width;
    const notchDepth = config.l_notch_depth;
    const corner = config.l_open_corner;

    if (corner === 'north_west') {
      return [
        normalizeRect({ x: notchWidth, z: 0, width: widthX - notchWidth, depth: notchDepth }),
        normalizeRect({ x: 0, z: notchDepth, width: widthX, depth: depthZ - notchDepth })
      ];
    }

    if (corner === 'south_west') {
      return [
        normalizeRect({ x: 0, z: 0, width: widthX, depth: depthZ - notchDepth }),
        normalizeRect({ x: notchWidth, z: depthZ - notchDepth, width: widthX - notchWidth, depth: notchDepth })
      ];
    }

    if (corner === 'south_east') {
      return [
        normalizeRect({ x: 0, z: 0, width: widthX, depth: depthZ - notchDepth }),
        normalizeRect({ x: 0, z: depthZ - notchDepth, width: widthX - notchWidth, depth: notchDepth })
      ];
    }

    return [
      normalizeRect({ x: 0, z: 0, width: widthX - notchWidth, depth: notchDepth }),
      normalizeRect({ x: 0, z: notchDepth, width: widthX, depth: depthZ - notchDepth })
    ];
  }

  const openingWidth = config.u_opening_width;
  const openingDepth = config.u_opening_depth;
  const orientation = config.u_opening_direction;

  if (orientation === 'north') {
    const armWidth = (widthX - openingWidth) / 2;
    return [
      normalizeRect({ x: 0, z: 0, width: armWidth, depth: depthZ }),
      normalizeRect({ x: widthX - armWidth, z: 0, width: armWidth, depth: depthZ }),
      normalizeRect({ x: armWidth, z: openingDepth, width: openingWidth, depth: depthZ - openingDepth })
    ];
  }

  if (orientation === 'south') {
    const armWidth = (widthX - openingWidth) / 2;
    return [
      normalizeRect({ x: 0, z: 0, width: armWidth, depth: depthZ }),
      normalizeRect({ x: widthX - armWidth, z: 0, width: armWidth, depth: depthZ }),
      normalizeRect({ x: armWidth, z: 0, width: openingWidth, depth: depthZ - openingDepth })
    ];
  }

  if (orientation === 'east') {
    const armDepth = (depthZ - openingWidth) / 2;
    return [
      normalizeRect({ x: 0, z: 0, width: widthX, depth: armDepth }),
      normalizeRect({ x: 0, z: depthZ - armDepth, width: widthX, depth: armDepth }),
      normalizeRect({ x: 0, z: armDepth, width: widthX - openingDepth, depth: openingWidth })
    ];
  }

  const armDepth = (depthZ - openingWidth) / 2;
  return [
    normalizeRect({ x: 0, z: 0, width: widthX, depth: armDepth }),
    normalizeRect({ x: 0, z: depthZ - armDepth, width: widthX, depth: armDepth }),
    normalizeRect({ x: openingDepth, z: armDepth, width: widthX - openingDepth, depth: openingWidth })
  ];
}

export function getFootprintOutlinePoints(rawConfig = {}) {
  return buildOutlineFromConfig(normalizeWarehouseContainerConfig(rawConfig));
}

export function getContainerBounds(rawConfig = {}) {
  const config = normalizeWarehouseContainerConfig(rawConfig);
  return {
    minX: 0,
    minZ: 0,
    maxX: config.widthX,
    maxZ: config.depthZ
  };
}

export function isPointInWarehouseShape(rawConfig = {}, x, z) {
  return buildFootprintRectangles(rawConfig).some((rect) => rectContainsPoint(rect, x, z));
}

function createCell(col, row, centerX, centerZ, inside) {
  return {
    col,
    row,
    centerX,
    centerZ,
    inside,
    kind: inside ? 'storage_candidate' : 'outside',
    subtype: inside ? 'candidate' : 'outside',
    priority: inside ? CELL_PRIORITY.storage_candidate : CELL_PRIORITY.outside,
    regionId: null
  };
}

function buildGrid(rawConfig, planning) {
  const config = normalizeWarehouseContainerConfig(rawConfig);
  const gridSize = planning.gridSizeMm;
  const cols = Math.max(1, Math.ceil(config.widthX / gridSize));
  const rows = Math.max(1, Math.ceil(config.depthZ / gridSize));
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    const rowCells = [];
    for (let col = 0; col < cols; col += 1) {
      const centerX = (col * gridSize) + (gridSize / 2);
      const centerZ = (row * gridSize) + (gridSize / 2);
      rowCells.push(createCell(col, row, centerX, centerZ, isPointInWarehouseShape(config, centerX, centerZ)));
    }
    cells.push(rowCells);
  }

  return {
    config,
    cols,
    rows,
    gridSize,
    cells
  };
}

function forEachCell(grid, callback) {
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      callback(grid.cells[row][col], col, row);
    }
  }
}

function setCellKind(cell, kind, subtype) {
  const nextPriority = CELL_PRIORITY[kind] ?? 0;
  if (nextPriority < cell.priority) {
    return;
  }

  cell.kind = kind;
  cell.subtype = subtype;
  cell.priority = nextPriority;
}

function isCellInsideRect(cell, rect, gridSize) {
  const halfCell = gridSize / 2;
  const cellRect = {
    x: cell.centerX - halfCell,
    z: cell.centerZ - halfCell,
    width: gridSize,
    depth: gridSize
  };

  return rectsIntersect(cellRect, rect);
}

function paintRectangles(grid, rects, kind, subtype) {
  rects.forEach((rect) => {
    forEachCell(grid, (cell) => {
      if (!cell.inside) {
        return;
      }

      if (isCellInsideRect(cell, rect, grid.gridSize)) {
        setCellKind(cell, kind, subtype);
      }
    });
  });
}

function buildColumnRectangles(config, constraints) {
  const columns = constraints?.building?.columns || {};
  const rects = [];

  if (columns.mode === 'none') {
    return rects;
  }

  if (columns.mode === 'exception_based' && Array.isArray(columns.customColumns)) {
    columns.customColumns.forEach((column) => {
      rects.push(
        normalizeRect({
          x: toNumber(column.x) - (toNumber(column.width) / 2),
          z: toNumber(column.z) - (toNumber(column.depth) / 2),
          width: toNumber(column.width),
          depth: toNumber(column.depth)
        })
      );
    });
    return rects;
  }

  const columnWidth = Math.max(100, toNumber(columns.columnWidth, 400));
  const columnDepth = Math.max(100, toNumber(columns.columnDepth, 400));
  const spacingX = Math.max(columnWidth + 200, toNumber(columns.spacingX, 6000));
  const spacingZ = Math.max(columnDepth + 200, toNumber(columns.spacingZ, 6000));
  const wallOffset = Math.max(0, toNumber(columns.wallOffset, 500));

  for (let startX = wallOffset; startX + columnWidth <= config.widthX - wallOffset; startX += spacingX) {
    for (let startZ = wallOffset; startZ + columnDepth <= config.depthZ - wallOffset; startZ += spacingZ) {
      const centerX = startX + (columnWidth / 2);
      const centerZ = startZ + (columnDepth / 2);
      if (!isPointInWarehouseShape(config, centerX, centerZ)) {
        continue;
      }

      rects.push(normalizeRect({ x: startX, z: startZ, width: columnWidth, depth: columnDepth }));
    }
  }

  return rects;
}

function buildDistanceFromOutside(grid) {
  const distances = Array.from({ length: grid.rows }, () => Array(grid.cols).fill(Infinity));
  const queue = [];
  let queueIndex = 0;

  forEachCell(grid, (cell, col, row) => {
    if (!cell.inside) {
      distances[row][col] = 0;
      queue.push(cell);
    }
  });

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    neighbors.forEach(([dc, dr]) => {
      const nextCol = current.col + dc;
      const nextRow = current.row + dr;
      if (nextCol < 0 || nextCol >= grid.cols || nextRow < 0 || nextRow >= grid.rows) {
        return;
      }

      const nextDistance = distances[current.row][current.col] + 1;
      if (nextDistance >= distances[nextRow][nextCol]) {
        return;
      }

      distances[nextRow][nextCol] = nextDistance;
      queue.push(grid.cells[nextRow][nextCol]);
    });
  }

  return distances;
}

function buildShapeSpecificAisles(config, planning, candidate) {
  const rects = [];
  const primaryWidth = planning.primaryAisleWidth;
  const secondaryWidth = planning.secondaryAisleWidth;

  if (planning.preserveCentralMainAisle) {
    if (candidate.primaryAxis === 'vertical') {
      const mainX = clamp(
        (config.widthX * candidate.primaryRatio) - (primaryWidth / 2),
        0,
        Math.max(0, config.widthX - primaryWidth)
      );
      rects.push(normalizeRect({ x: mainX, z: 0, width: primaryWidth, depth: config.depthZ }));
    } else {
      const mainZ = clamp(
        (config.depthZ * candidate.primaryRatio) - (primaryWidth / 2),
        0,
        Math.max(0, config.depthZ - primaryWidth)
      );
      rects.push(normalizeRect({ x: 0, z: mainZ, width: config.widthX, depth: primaryWidth }));
    }
  }

  if (config.shape === 't_shape') {
    if (['north', 'south'].includes(config.t_opening_direction)) {
      const headCenterZ = config.t_opening_direction === 'north'
        ? config.t_head_depth / 2
        : config.depthZ - (config.t_head_depth / 2);
      rects.push(
        normalizeRect({
          x: 0,
          z: headCenterZ - (secondaryWidth / 2),
          width: config.widthX,
          depth: secondaryWidth
        })
      );
    } else {
      const headCenterX = config.t_opening_direction === 'east'
        ? config.widthX - (config.t_head_depth / 2)
        : config.t_head_depth / 2;
      rects.push(
        normalizeRect({
          x: headCenterX - (secondaryWidth / 2),
          z: 0,
          width: secondaryWidth,
          depth: config.depthZ
        })
      );
    }
  }

  if (config.shape === 'u_shape') {
    if (['north', 'south'].includes(config.u_opening_direction)) {
      const armWidth = (config.widthX - config.u_opening_width) / 2;
      rects.push(
        normalizeRect({ x: armWidth - (secondaryWidth / 2), z: 0, width: secondaryWidth, depth: config.depthZ }),
        normalizeRect({ x: config.widthX - armWidth - (secondaryWidth / 2), z: 0, width: secondaryWidth, depth: config.depthZ })
      );
      const connectorZ = config.u_opening_direction === 'north'
        ? config.u_opening_depth - (secondaryWidth / 2)
        : config.depthZ - config.u_opening_depth - (secondaryWidth / 2);
      rects.push(normalizeRect({ x: 0, z: connectorZ, width: config.widthX, depth: secondaryWidth }));
    } else {
      const armDepth = (config.depthZ - config.u_opening_width) / 2;
      rects.push(
        normalizeRect({ x: 0, z: armDepth - (secondaryWidth / 2), width: config.widthX, depth: secondaryWidth }),
        normalizeRect({ x: 0, z: config.depthZ - armDepth - (secondaryWidth / 2), width: config.widthX, depth: secondaryWidth })
      );
      const connectorX = config.u_opening_direction === 'east'
        ? config.widthX - config.u_opening_depth - (secondaryWidth / 2)
        : config.u_opening_depth - (secondaryWidth / 2);
      rects.push(normalizeRect({ x: connectorX, z: 0, width: secondaryWidth, depth: config.depthZ }));
    }
  }

  return rects;
}

function buildRegularSecondaryAisles(config, planning, candidate) {
  if (planning.secondaryAisleWidth <= 0) {
    return [];
  }

  const rects = [];
  const spacing = Math.max(planning.secondaryAisleWidth * 1.5, candidate.secondarySpacing);
  const stripWidth = planning.secondaryAisleWidth;
  const primaryWidth = planning.primaryAisleWidth;
  const primaryReference = candidate.primaryAxis === 'vertical'
    ? config.widthX * candidate.primaryRatio
    : config.depthZ * candidate.primaryRatio;

  if (candidate.primaryAxis === 'vertical') {
    for (let z = spacing; z < config.depthZ; z += spacing) {
      if (Math.abs(z - primaryReference) < primaryWidth) {
        continue;
      }
      rects.push(normalizeRect({ x: 0, z: z - (stripWidth / 2), width: config.widthX, depth: stripWidth }));
    }
  } else {
    for (let x = spacing; x < config.widthX; x += spacing) {
      if (Math.abs(x - primaryReference) < primaryWidth) {
        continue;
      }
      rects.push(normalizeRect({ x: x - (stripWidth / 2), z: 0, width: stripWidth, depth: config.depthZ }));
    }
  }

  return rects;
}

function collectEntryCells(grid) {
  const entries = [];
  const centerX = grid.config.widthX / 2;
  const centerZ = grid.config.depthZ;

  forEachCell(grid, (cell) => {
    if (cell.kind !== 'accessible_path') {
      return;
    }

    const touchesBoundary = (
      cell.row === 0 ||
      cell.row === grid.rows - 1 ||
      cell.col === 0 ||
      cell.col === grid.cols - 1
    );

    if (touchesBoundary) {
      entries.push(cell);
    }
  });

  if (entries.length === 0) {
    forEachCell(grid, (cell) => {
      if (cell.kind === 'accessible_path') {
        entries.push(cell);
      }
    });
  }

  entries.sort((a, b) => {
    const distA = Math.abs(a.centerX - centerX) + Math.abs(a.centerZ - centerZ);
    const distB = Math.abs(b.centerX - centerX) + Math.abs(b.centerZ - centerZ);
    return distA - distB;
  });

  return entries.slice(0, Math.max(1, Math.min(entries.length, 3)));
}

function buildPathDistances(grid, entryCells) {
  const distances = Array.from({ length: grid.rows }, () => Array(grid.cols).fill(Infinity));
  const queue = [];
  let queueIndex = 0;

  entryCells.forEach((cell) => {
    distances[cell.row][cell.col] = 0;
    queue.push(cell);
  });

  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    neighbors.forEach(([dc, dr]) => {
      const nextCol = current.col + dc;
      const nextRow = current.row + dr;
      if (nextCol < 0 || nextCol >= grid.cols || nextRow < 0 || nextRow >= grid.rows) {
        return;
      }

      const nextCell = grid.cells[nextRow][nextCol];
      if (nextCell.kind !== 'accessible_path') {
        return;
      }

      const nextDistance = distances[current.row][current.col] + 1;
      if (nextDistance >= distances[nextRow][nextCol]) {
        return;
      }

      distances[nextRow][nextCol] = nextDistance;
      queue.push(nextCell);
    });
  }

  return distances;
}

function storageNeighborsPath(grid, cell) {
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (const [dc, dr] of neighbors) {
    const nextCol = cell.col + dc;
    const nextRow = cell.row + dr;
    if (nextCol < 0 || nextCol >= grid.cols || nextRow < 0 || nextRow >= grid.rows) {
      continue;
    }

    if (grid.cells[nextRow][nextCol].kind === 'accessible_path') {
      return true;
    }
  }

  return false;
}

function classifyStorageRegions(grid) {
  const visited = new Set();
  const regions = [];
  const cellId = (row, col) => `${row}:${col}`;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  forEachCell(grid, (cell) => {
    if (cell.kind !== 'storage_candidate') {
      return;
    }

    const key = cellId(cell.row, cell.col);
    if (visited.has(key)) {
      return;
    }

    const queue = [cell];
    const component = [];
    let queueIndex = 0;
    visited.add(key);

    while (queueIndex < queue.length) {
      const current = queue[queueIndex];
      queueIndex += 1;
      component.push(current);

      neighbors.forEach(([dc, dr]) => {
        const nextCol = current.col + dc;
        const nextRow = current.row + dr;
        if (nextCol < 0 || nextCol >= grid.cols || nextRow < 0 || nextRow >= grid.rows) {
          return;
        }

        const nextCell = grid.cells[nextRow][nextCol];
        if (nextCell.kind !== 'storage_candidate') {
          return;
        }

        const nextKey = cellId(nextRow, nextCol);
        if (visited.has(nextKey)) {
          return;
        }

        visited.add(nextKey);
        queue.push(nextCell);
      });
    }

    const accessible = component.some((current) => storageNeighborsPath(grid, current));
    component.forEach((current) => {
      current.regionId = regions.length;
      current.kind = accessible ? 'storage' : 'dead_corner';
      current.subtype = accessible ? 'storage_zone' : 'dead_corner';
      current.priority = CELL_PRIORITY[accessible ? 'storage_candidate' : 'dead_corner'];
    });

    regions.push({ cells: component, accessible });
  });

  return regions;
}

function mergeCellsToRectangles(grid, predicate) {
  const spans = [];

  for (let row = 0; row < grid.rows; row += 1) {
    let col = 0;
    while (col < grid.cols) {
      const cell = grid.cells[row][col];
      if (!predicate(cell)) {
        col += 1;
        continue;
      }

      const startCol = col;
      const keyKind = cell.kind;
      const keySubtype = cell.subtype;

      while (
        col < grid.cols &&
        predicate(grid.cells[row][col]) &&
        grid.cells[row][col].kind === keyKind &&
        grid.cells[row][col].subtype === keySubtype
      ) {
        col += 1;
      }

      spans.push({
        row,
        startCol,
        endCol: col - 1,
        kind: keyKind,
        subtype: keySubtype
      });
    }
  }

  const rectangles = [];
  const consumed = new Set();

  spans.forEach((span, index) => {
    if (consumed.has(index)) {
      return;
    }

    consumed.add(index);
    let endRow = span.row;

    for (let nextIndex = index + 1; nextIndex < spans.length; nextIndex += 1) {
      const nextSpan = spans[nextIndex];
      if (
        nextSpan.row === endRow + 1 &&
        nextSpan.startCol === span.startCol &&
        nextSpan.endCol === span.endCol &&
        nextSpan.kind === span.kind &&
        nextSpan.subtype === span.subtype
      ) {
        consumed.add(nextIndex);
        endRow = nextSpan.row;
      }
    }

    rectangles.push({
      kind: span.kind,
      subtype: span.subtype,
      rect: normalizeRect({
        x: span.startCol * grid.gridSize,
        z: span.row * grid.gridSize,
        width: (span.endCol - span.startCol + 1) * grid.gridSize,
        depth: (endRow - span.row + 1) * grid.gridSize
      })
    });
  });

  return rectangles;
}

function computeMetrics(grid, pathDistances) {
  let insideCells = 0;
  let storageCells = 0;
  let aisleCells = 0;
  let safetyCells = 0;
  let blockedCells = 0;
  let deadCornerCells = 0;
  let storageTouchingPath = 0;
  let weightedPickDistance = 0;

  forEachCell(grid, (cell) => {
    if (!cell.inside) {
      return;
    }

    insideCells += 1;
    if (cell.kind === 'storage') {
      storageCells += 1;
      if (storageNeighborsPath(grid, cell)) {
        storageTouchingPath += 1;
      }
    } else if (cell.kind === 'accessible_path') {
      aisleCells += 1;
    } else if (cell.kind === 'safety_buffer') {
      safetyCells += 1;
    } else if (cell.kind === 'blocked_area') {
      blockedCells += 1;
    } else if (cell.kind === 'dead_corner') {
      deadCornerCells += 1;
    }
  });

  const cellAreaMm2 = grid.gridSize * grid.gridSize;

  forEachCell(grid, (cell) => {
    if (cell.kind !== 'storage') {
      return;
    }

    const neighborDistances = [];
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    neighbors.forEach(([dc, dr]) => {
      const nextCol = cell.col + dc;
      const nextRow = cell.row + dr;
      if (nextCol < 0 || nextCol >= grid.cols || nextRow < 0 || nextRow >= grid.rows) {
        return;
      }

      const nextCell = grid.cells[nextRow][nextCol];
      if (nextCell.kind === 'accessible_path') {
        neighborDistances.push(pathDistances[nextRow][nextCol]);
      }
    });

    if (neighborDistances.length > 0) {
      weightedPickDistance += Math.min(...neighborDistances);
    }
  });

  const insideCount = Math.max(1, insideCells);
  const storageCount = Math.max(1, storageCells + deadCornerCells);
  const averagePickDistanceCells = storageCells > 0 ? (weightedPickDistance / storageCells) : Infinity;

  return {
    totalAreaM2: round2((insideCells * cellAreaMm2) / 1000000),
    storageAreaM2: round2((storageCells * cellAreaMm2) / 1000000),
    aisleAreaM2: round2((aisleCells * cellAreaMm2) / 1000000),
    safetyAreaM2: round2((safetyCells * cellAreaMm2) / 1000000),
    blockedAreaM2: round2(((blockedCells + deadCornerCells) * cellAreaMm2) / 1000000),
    storageUtilization: storageCells / insideCount,
    aisleRatio: aisleCells / insideCount,
    accessibilityRatio: storageCells / storageCount,
    deadCornerRatio: deadCornerCells / insideCount,
    averagePickDistanceMm: Number.isFinite(averagePickDistanceCells)
      ? averagePickDistanceCells * grid.gridSize
      : grid.config.widthX + grid.config.depthZ,
    storageTouchingPathRatio: storageTouchingPath / Math.max(1, storageCells)
  };
}

function evaluateMetrics(metrics, planning, zoneCount) {
  const targetAisleRatio = planning.preserveCentralMainAisle ? 0.18 : 0.12;
  const aisleBalance = clamp(1 - (Math.abs(metrics.aisleRatio - targetAisleRatio) / Math.max(targetAisleRatio, 0.01)), 0, 1);
  const accessibility = clamp(metrics.accessibilityRatio, 0, 1);
  const deadCornerPenalty = clamp(metrics.deadCornerRatio / 0.12, 0, 1);
  const maxTravel = Math.max(1, planning.targetStorageBand * 3);
  const pickingEfficiency = clamp(1 - (metrics.averagePickDistanceMm / maxTravel), 0, 1);
  const slottingFlexibility = clamp(
    ((Math.min(zoneCount, 12) / 12) * 0.5) + (metrics.storageTouchingPathRatio * 0.5),
    0,
    1
  );

  const weights = planning.optimizationWeights;
  const weightedScore =
    (metrics.storageUtilization * weights.storageUtilization) +
    (aisleBalance * weights.aisleBalance) +
    (accessibility * weights.accessibility) +
    (pickingEfficiency * weights.pickingEfficiency) +
    (slottingFlexibility * weights.slottingFlexibility) -
    (deadCornerPenalty * 0.25);

  return {
    score: round2(weightedScore * 100),
    components: {
      storageUtilization: round2(metrics.storageUtilization),
      aisleBalance: round2(aisleBalance),
      accessibility: round2(accessibility),
      pickingEfficiency: round2(pickingEfficiency),
      slottingFlexibility: round2(slottingFlexibility),
      deadCornerPenalty: round2(deadCornerPenalty)
    }
  };
}

function summarizeCandidate(candidate, evaluation, metrics) {
  return {
    id: candidate.id,
    primaryAxis: candidate.primaryAxis,
    primaryRatio: candidate.primaryRatio,
    secondarySpacing: candidate.secondarySpacing,
    score: evaluation.score,
    metrics: {
      storageUtilization: metrics.storageUtilization,
      aisleRatio: metrics.aisleRatio,
      accessibilityRatio: metrics.accessibilityRatio,
      deadCornerRatio: metrics.deadCornerRatio
    }
  };
}

function buildZoneCollection(grid, evaluation) {
  const rectangles = mergeCellsToRectangles(
    grid,
    (cell) => ['blocked_area', 'safety_buffer', 'accessible_path', 'storage', 'dead_corner'].includes(cell.kind)
  );

  const counters = {
    blocked_area: 0,
    safety_buffer: 0,
    accessible_path: 0,
    storage: 0,
    dead_corner: 0
  };

  return rectangles.map((entry) => {
    counters[entry.kind] += 1;

    if (entry.kind === 'storage') {
      return buildRectZone({
        id: `storage_${counters.storage}`,
        type: 'usable',
        zoneCategory: 'storage_zone',
        subtype: entry.subtype,
        rect: entry.rect,
        depth: grid.config.heightY,
        label: `儲位區 ${String(counters.storage).padStart(2, '0')}`,
        tags: ['storage', 'slotting-ready'],
        metadata: {
          accessible: true,
          evaluation: {
            pickingEfficiency: evaluation.components.pickingEfficiency,
            slottingFlexibility: evaluation.components.slottingFlexibility
          }
        }
      });
    }

    if (entry.kind === 'accessible_path') {
      const subtypeLabelMap = {
        main_aisle: '主走道',
        secondary_aisle: '次走道',
        boundary_inspection: '巡檢走道'
      };
      const subtypeLabel = subtypeLabelMap[entry.subtype] || '走道';
      return buildRectZone({
        id: `aisle_${entry.subtype}_${counters.accessible_path}`,
        type: 'unusable_aisle',
        zoneCategory: 'accessible_path',
        subtype: entry.subtype,
        rect: entry.rect,
        depth: grid.config.heightY,
        label: `${subtypeLabel} ${counters.accessible_path}`,
        tags: ['path', 'picker-routing'],
        metadata: {
          accessible: true,
          aisleType: entry.subtype
        }
      });
    }

    if (entry.kind === 'safety_buffer') {
      return buildRectZone({
        id: `buffer_${counters.safety_buffer}`,
        type: 'unusable_clearance',
        zoneCategory: 'safety_buffer',
        subtype: entry.subtype,
        rect: entry.rect,
        depth: grid.config.heightY,
        label: `安全緩衝 ${counters.safety_buffer}`,
        tags: ['buffer', 'safety'],
        metadata: { reason: 'Safety buffer' }
      });
    }

    if (entry.kind === 'blocked_area') {
      return buildRectZone({
        id: `blocked_${counters.blocked_area}`,
        type: 'unusable_column',
        zoneCategory: 'blocked_area',
        subtype: entry.subtype,
        rect: entry.rect,
        depth: grid.config.heightY,
        label: `阻擋區 ${counters.blocked_area}`,
        tags: ['blocked', 'obstacle'],
        metadata: { reason: entry.subtype === 'column' ? 'Column' : 'Blocked area' }
      });
    }

    return buildRectZone({
      id: `dead_corner_${counters.dead_corner}`,
      type: 'blocked_dead_corner',
      zoneCategory: 'blocked_area',
      subtype: 'dead_corner',
      rect: entry.rect,
      depth: grid.config.heightY,
      label: `死角 ${counters.dead_corner}`,
      tags: ['blocked', 'dead-corner'],
      metadata: { reason: 'Inaccessible storage island' }
    });
  });
}

function buildCandidatePopulation(config, planning) {
  const axisOptions = planning.mainAisleAxis === 'auto'
    ? ['vertical', 'horizontal']
    : [planning.mainAisleAxis];
  const offsetOptions = getCandidateOffsets(planning.mainAisleOffsetRatio);
  const spacingBase = planning.targetStorageBand;
  const spacingOptions = Array.from(new Set([
    Math.max(1400, spacingBase),
    Math.max(1400, Math.round(spacingBase * 0.85)),
    Math.max(1400, Math.round(spacingBase * 1.15))
  ]));

  const candidates = [];
  let candidateIndex = 0;

  axisOptions.forEach((axis) => {
    offsetOptions.forEach((ratio) => {
      spacingOptions.forEach((spacing) => {
        candidates.push({
          id: `candidate_${candidateIndex}`,
          primaryAxis: axis,
          primaryRatio: ratio,
          secondarySpacing: spacing
        });
        candidateIndex += 1;
      });
    });
  });

  return candidates;
}

function mutateCandidate(candidate) {
  const delta = (Math.random() > 0.5 ? 1 : -1) * 0.07;
  const spacingDelta = (Math.random() > 0.5 ? 1 : -1) * 200;

  return {
    ...candidate,
    id: `${candidate.id}_m${Math.floor(Math.random() * 1000)}`,
    primaryAxis: Math.random() > 0.82
      ? (candidate.primaryAxis === 'vertical' ? 'horizontal' : 'vertical')
      : candidate.primaryAxis,
    primaryRatio: clamp(candidate.primaryRatio + delta, 0.18, 0.82),
    secondarySpacing: Math.max(1200, candidate.secondarySpacing + spacingDelta)
  };
}

function simulateCandidate(rawConfig, constraints, planning, candidate) {
  const grid = buildGrid(rawConfig, planning);
  const config = grid.config;
  const distancesFromOutside = buildDistanceFromOutside(grid);
  const safetySteps = Math.ceil(planning.safetyBuffer / grid.gridSize);
  const inspectionSteps = planning.preserveBoundaryInspectionAisle
    ? Math.ceil(planning.boundaryInspectionAisleWidth / grid.gridSize)
    : 0;

  paintRectangles(grid, buildColumnRectangles(config, constraints), 'blocked_area', 'column');

  forEachCell(grid, (cell, col, row) => {
    if (!cell.inside || cell.kind === 'blocked_area') {
      return;
    }

    const distanceSteps = distancesFromOutside[row][col];
    if (distanceSteps <= safetySteps) {
      setCellKind(cell, 'safety_buffer', 'safety_buffer');
      return;
    }

    if (planning.preserveBoundaryInspectionAisle && distanceSteps <= safetySteps + inspectionSteps) {
      setCellKind(cell, 'accessible_path', 'boundary_inspection');
    }
  });

  paintRectangles(grid, buildShapeSpecificAisles(config, planning, candidate), 'accessible_path', 'main_aisle');
  paintRectangles(grid, buildRegularSecondaryAisles(config, planning, candidate), 'accessible_path', 'secondary_aisle');
  classifyStorageRegions(grid);

  const entryCells = collectEntryCells(grid);
  const pathDistances = buildPathDistances(grid, entryCells);
  const metrics = computeMetrics(grid, pathDistances);
  const zoneCount = mergeCellsToRectangles(grid, (cell) => cell.kind === 'storage').length;
  const evaluation = evaluateMetrics(metrics, planning, zoneCount);

  return {
    candidate,
    grid,
    metrics,
    evaluation,
    zones: buildZoneCollection(grid, evaluation)
  };
}

function searchBestPlan(config, constraints, planning) {
  const population = buildCandidatePopulation(config, planning);
  let results = population.map((candidate) => simulateCandidate(config, constraints, planning, candidate));

  results.sort((a, b) => b.evaluation.score - a.evaluation.score);
  let elite = results.slice(0, 4);
  let best = elite[0];
  let temperature = 1;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    const nextResults = [];

    elite.forEach((entry) => {
      nextResults.push(entry);
      nextResults.push(simulateCandidate(config, constraints, planning, mutateCandidate(entry.candidate)));
    });

    nextResults.sort((a, b) => b.evaluation.score - a.evaluation.score);
    elite = nextResults.slice(0, 4);

    const challenger = elite[0];
    const accept = challenger.evaluation.score >= best.evaluation.score ||
      Math.random() < Math.exp((challenger.evaluation.score - best.evaluation.score) / Math.max(temperature, 0.05));

    if (accept) {
      best = challenger;
    }

    temperature *= 0.88;
  }

  return {
    best,
    frontier: elite.slice(0, 3).map((entry) => summarizeCandidate(entry.candidate, entry.evaluation, entry.metrics))
  };
}

export function buildWarehouseLayoutPlan(rawConfig = {}, constraints = {}) {
  const config = normalizeWarehouseContainerConfig(rawConfig);
  const planning = {
    ...config.planning,
    ...constraints?.planning
  };
  planning.optimizationWeights = buildPlanningWeights(planning);
  planning.mainAisleAxis = normalizeAxis(planning.mainAisleAxis, config.widthX, config.depthZ);

  const { best, frontier } = searchBestPlan(config, constraints, planning);

  return {
    containerConfig: config,
    planning,
    zones: best.zones,
    metrics: best.metrics,
    evaluation: best.evaluation,
    search: {
      bestCandidate: summarizeCandidate(best.candidate, best.evaluation, best.metrics),
      frontier
    }
  };
}
