import { normalizeRegion, normalizeRegionCollection } from './usable-region-policy.js';

function generateChildName(parentName, index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letter = alphabet[index] || `${index + 1}`;
  return parentName ? `${parentName}-${letter}` : letter;
}

function buildChildRegion(parentRegion, childIndex, patch, metadata = {}) {
  const parentName = parentRegion.name || parentRegion.label;
  const depth = parentRegion.depth || 2400;

  return normalizeRegion({
    id: `${parentRegion.id}_child_${childIndex}`,
    parent_id: parentRegion.id,
    type: 'usable',
    name: generateChildName(parentName, childIndex),
    label: generateChildName(parentName, childIndex),
    depth,
    ...patch,
    metadata
  }, { defaultDepth: depth });
}

export function buildEqualSubdivision(parentRegion, { direction = 'horizontal', parts = 2, defaultDepth } = {}) {
  const region = normalizeRegion(parentRegion, { defaultDepth });
  const safeParts = Math.max(2, parseInt(parts, 10) || 2);
  const children = [];

  if (direction === 'horizontal') {
    const partHeight = region.height / safeParts;
    for (let index = 0; index < safeParts; index += 1) {
      children.push(
        buildChildRegion(
          region,
          index,
          {
            x: region.x,
            y: region.y - (region.height / 2) + (partHeight / 2) + (index * partHeight),
            width: region.width,
            height: partHeight
          },
          {
            subdivision_method: 'equal',
            subdivision_index: index,
            subdivision_total: safeParts
          }
        )
      );
    }
  } else {
    const partWidth = region.width / safeParts;
    for (let index = 0; index < safeParts; index += 1) {
      children.push(
        buildChildRegion(
          region,
          index,
          {
            x: region.x - (region.width / 2) + (partWidth / 2) + (index * partWidth),
            y: region.y,
            width: partWidth,
            height: region.height
          },
          {
            subdivision_method: 'equal',
            subdivision_index: index,
            subdivision_total: safeParts
          }
        )
      );
    }
  }

  return children;
}

export function buildRatioSubdivision(parentRegion, { direction = 'horizontal', ratio = 0.5, defaultDepth } = {}) {
  const region = normalizeRegion(parentRegion, { defaultDepth });
  const safeRatio = Math.min(0.99, Math.max(0.01, Number(ratio) || 0.5));

  if (direction === 'horizontal') {
    const height1 = region.height * safeRatio;
    const height2 = region.height * (1 - safeRatio);

    return [
      buildChildRegion(
        region,
        0,
        {
          x: region.x,
          y: region.y - (region.height / 2) + (height1 / 2),
          width: region.width,
          height: height1
        },
        {
          subdivision_method: 'ratio',
          subdivision_index: 0,
          subdivision_ratio: safeRatio
        }
      ),
      buildChildRegion(
        region,
        1,
        {
          x: region.x,
          y: region.y + (region.height / 2) - (height2 / 2),
          width: region.width,
          height: height2
        },
        {
          subdivision_method: 'ratio',
          subdivision_index: 1,
          subdivision_ratio: 1 - safeRatio
        }
      )
    ];
  }

  const width1 = region.width * safeRatio;
  const width2 = region.width * (1 - safeRatio);

  return [
    buildChildRegion(
      region,
      0,
      {
        x: region.x - (region.width / 2) + (width1 / 2),
        y: region.y,
        width: width1,
        height: region.height
      },
      {
        subdivision_method: 'ratio',
        subdivision_index: 0,
        subdivision_ratio: safeRatio
      }
    ),
    buildChildRegion(
      region,
      1,
      {
        x: region.x + (region.width / 2) - (width2 / 2),
        y: region.y,
        width: width2,
        height: region.height
      },
      {
        subdivision_method: 'ratio',
        subdivision_index: 1,
        subdivision_ratio: 1 - safeRatio
      }
    )
  ];
}

export function validateSubdivision(parentRegion, children, minRegionSize) {
  const errors = [];
  const safeParent = normalizeRegion(parentRegion);
  const safeChildren = normalizeRegionCollection(children, { defaultDepth: safeParent.depth });
  const minimumSize = Number(minRegionSize) || 0;

  for (const child of safeChildren) {
    if (child.width < minimumSize || child.height < minimumSize) {
      errors.push(`Child region is below minimum size (${minimumSize}mm)`);
      break;
    }
  }

  if (safeParent.area > 0) {
    const childrenArea = safeChildren.reduce((sum, child) => sum + child.area, 0);
    const differenceRatio = Math.abs(safeParent.area - childrenArea) / safeParent.area;
    if (differenceRatio > 0.001) {
      errors.push(`Area conservation failed (${(differenceRatio * 100).toFixed(2)}%)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    children: safeChildren
  };
}

export function findRegionById(regions = [], regionId) {
  for (const region of regions) {
    if (region.id === regionId) {
      return region;
    }

    if (region.has_subdivisions && Array.isArray(region.child_regions) && region.child_regions.length > 0) {
      const match = findRegionById(region.child_regions, regionId);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function updateRegionNode(region, regionId, updater) {
  const normalizedRegion = normalizeRegion(region, { defaultDepth: region?.depth || 2400 });
  if (normalizedRegion.id === regionId) {
    return updater(normalizedRegion);
  }

  if (!normalizedRegion.has_subdivisions || !Array.isArray(normalizedRegion.child_regions) || normalizedRegion.child_regions.length === 0) {
    return normalizedRegion;
  }

  return {
    ...normalizedRegion,
    child_regions: normalizedRegion.child_regions.map((childRegion) =>
      updateRegionNode(childRegion, regionId, updater)
    )
  };
}

export function applySubdivisionToRegions(regions = [], regionId, children = []) {
  return normalizeRegionCollection(
    regions.map((region) => updateRegionNode(region, regionId, (targetRegion) => ({
      ...targetRegion,
      has_subdivisions: true,
      subdivision_version: (targetRegion.subdivision_version || 0) + 1,
      child_regions: normalizeRegionCollection(children, { defaultDepth: targetRegion.depth })
    })))
  );
}

export function clearRegionSubdivisions(regions = [], regionId) {
  return normalizeRegionCollection(
    regions.map((region) => updateRegionNode(region, regionId, (targetRegion) => {
      const nextRegion = {
        ...targetRegion,
        has_subdivisions: false,
        child_regions: []
      };
      delete nextRegion.subdivision_version;
      return nextRegion;
    }))
  );
}

export function resetAllSubdivisions(regions = []) {
  return normalizeRegionCollection(
    regions.map((region) => {
      const nextRegion = {
        ...normalizeRegion(region, { defaultDepth: region?.depth || 2400 }),
        has_subdivisions: false,
        child_regions: []
      };
      delete nextRegion.subdivision_version;
      return nextRegion;
    })
  );
}
