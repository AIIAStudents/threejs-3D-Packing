export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:4173';
export const API_URL = process.env.API_URL || 'http://127.0.0.1:8888';

export async function apiJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`API ${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function createGroupWithItems({
  name,
  description = '',
  items = []
}) {
  const group = await apiJson('/api/v2/groups/', {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });

  if (items.length > 0) {
    await apiJson('/api/v2/items/bulk', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map((item) => ({
          ...item,
          group_id: group.id
        }))
      })
    });
  }

  const createdItems = await apiJson(`/api/v2/items/?group_id=${group.id}`);
  return {
    group,
    items: createdItems
  };
}

export async function seedCuttingJob({
  containerConfig = {
    mode: 'mm',
    template: 'custom',
    shape: 'rect',
    widthX: 4000,
    depthZ: 3000,
    heightY: 2500
  },
  zones = [
    {
      label: 'Smoke Zone A',
      length: 4000,
      width: 3000,
      height: 2500,
      x: 0,
      y: 0,
      rotation: 0
    }
  ]
} = {}) {
  await apiJson('/api/v2/containers/', {
    method: 'POST',
    body: JSON.stringify(containerConfig)
  });

  await apiJson('/api/v2/cutting/jobs', {
    method: 'POST',
    body: JSON.stringify({
      container: containerConfig,
      zones
    })
  });

  const assignmentData = await apiJson('/api/assignment-data');
  return {
    containerConfig,
    assignmentData,
    zoneIds: (assignmentData?.zones || []).map((zone) => zone.id)
  };
}

export async function saveAssignments(assignments) {
  return apiJson('/api/assignments', {
    method: 'POST',
    body: JSON.stringify(assignments)
  });
}

export async function saveSequenceForItems(items = []) {
  return apiJson('/api/sequence/save', {
    method: 'POST',
    body: JSON.stringify({
      sequence: items.map((item, index) => ({
        item_id: item.id,
        order: index
      }))
    })
  });
}

export async function executePacking() {
  return apiJson('/api/sequence/execute', {
    method: 'POST'
  });
}

export async function seedSmokeData() {
  const groupSeed = await createGroupWithItems({
    name: `Smoke Group ${Date.now()}`,
    description: 'Phase 5 smoke test seed',
    items: [
      { item_id: 'SMOKE-ITEM-1', length: 500, width: 400, height: 300 },
      { item_id: 'SMOKE-ITEM-2', length: 600, width: 350, height: 250 },
      { item_id: 'SMOKE-ITEM-3', length: 450, width: 300, height: 200 }
    ]
  });

  const cuttingSeed = await seedCuttingJob();
  const zoneId = cuttingSeed.assignmentData?.zones?.[0]?.id;
  if (!zoneId) {
    throw new Error('Smoke seed could not find any zone after cutting job creation');
  }

  await saveAssignments([
    {
      zone_id: zoneId,
      group_id: groupSeed.group.id
    }
  ]);

  await saveSequenceForItems(groupSeed.items);
  await executePacking();

  const latestResult = await apiJson('/api/sequence/latest-result');
  return {
    containerConfig: cuttingSeed.containerConfig,
    groupId: groupSeed.group.id,
    group: groupSeed.group,
    items: groupSeed.items,
    zoneId,
    latestResult
  };
}
