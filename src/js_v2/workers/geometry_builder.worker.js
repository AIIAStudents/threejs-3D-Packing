/*
    File: geometry_builder.worker.js
    Description: Offloads heavy InstancedMesh matrix and color calculations to a background thread.
*/

// Using a lightweight internal Matrix4 implementation to avoid importing full Three.js in worker if possible.
// However, for simplicity and correctness with Three.js logic, we can construct the 16 elements manually.
// Standard Three.js Matrix4 memory layout: column-major.

self.onmessage = function (e) {
  const { type, items, maxCount } = e.data;

  if (type === 'BUILD_GEOMETRY') {
    try {
      buildGeometry(items, maxCount);
    } catch (error) {
      console.error('[GeometryWorker] Error:', error);
      self.postMessage({ type: 'ERROR', message: error.message });
    }
  }
};

function buildGeometry(items, maxCount) {
  const count = items.length;
  // Matrix4 is 16 floats, Color is 3 floats
  const matrices = new Float32Array(count * 16);
  const colors = new Float32Array(count * 3);

  console.log(`[GeometryWorker] Processing ${count} items...`);
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    const item = items[i];

    // Validate pose data
    if (!item || !item.pose || !item.pose.min || !item.pose.max) {
      continue; // Skip invalid
    }

    const { min, max } = item.pose;

    // Dimensions
    const w = max.x - min.x;
    const h = max.y - min.y;
    const d = max.z - min.z;

    // Center Logic:
    // Three.js BoxGeometry(1,1,1) is centered at (0,0,0).
    // We want to scale it by (w, h, d).
    // Then translate it to the center of the item in world space.

    // Check if zoneOffset was passed (depends on serialization). 
    // The main thread should have already computed absolute coordinates or passed zoneOffset.
    // In our view_final.js, we computed `worldCenterX`, `worldCenterY`, `worldCenterZ` and passed that?
    // Let's check ThreeViewer logic: it calculates `worldCenterX` inside `drawItems`.
    // We need to replicate that logic or expect items to have 'worldCenter' computed.
    // To keep worker pure, let's assume `item.pose` is relative to local zero, 
    // and `item.zoneOffset` is passed if needed.

    // Actually, view_final.js constructs `allItems` list and ADDS `zoneOffset` to items.
    // So `item.pose` logic:
    // min/max are local to the zone.
    // item.zoneOffset has {x, y} which maps to X and Z world offset. (y in 2D map usually = Z in 3D).

    const localCenterX = (min.x + max.x) / 2;
    const localCenterY = (min.y + max.y) / 2;
    const localCenterZ = (min.z + max.z) / 2;

    const offsetX = item.zoneOffset ? item.zoneOffset.x : 0;
    const offsetZ = item.zoneOffset ? item.zoneOffset.y : 0; // Note: 'y' in zone definition is depth/Z in 3D

    const cx = localCenterX + offsetX;
    const cy = localCenterY;
    const cz = localCenterZ + offsetZ;

    // Matrix Composition (replaces new THREE.Matrix4().compose())
    // Translation(cx, cy, cz) * Scale(w, h, d) * Rotation(0,0,0)
    // Since rotation is identity, it's simpler.

    // Column-major Order in Array index:
    // 0  4  8  12
    // 1  5  9  13
    // 2  6  10 14
    // 3  7  11 15

    // Scale (on diagonal)
    // X axis (column 0)
    matrices[i * 16 + 0] = w;
    matrices[i * 16 + 1] = 0;
    matrices[i * 16 + 2] = 0;
    matrices[i * 16 + 3] = 0;

    // Y axis (column 1)
    matrices[i * 16 + 4] = 0;
    matrices[i * 16 + 5] = h;
    matrices[i * 16 + 6] = 0;
    matrices[i * 16 + 7] = 0;

    // Z axis (column 2)
    matrices[i * 16 + 8] = 0;
    matrices[i * 16 + 9] = 0;
    matrices[i * 16 + 10] = d;
    matrices[i * 16 + 11] = 0;

    // Position (column 3)
    matrices[i * 16 + 12] = cx;
    matrices[i * 16 + 13] = cy;
    matrices[i * 16 + 14] = cz;
    matrices[i * 16 + 15] = 1;

    // Colors
    const colorHex = getItemColor(item);
    // Convert hex string/number to internal RGB floats
    const r = ((colorHex >> 16) & 255) / 255;
    const g = ((colorHex >> 8) & 255) / 255;
    const b = (colorHex & 255) / 255;

    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  const duration = performance.now() - start;
  console.log(`[GeometryWorker] Built ${count} matrices in ${duration.toFixed(2)}ms`);

  // Transfer back
  self.postMessage({
    type: 'GEOMETRY_BUILT',
    matrices: matrices,
    colors: colors,
    count: count
  }, [matrices.buffer, colors.buffer]);
}

function getItemColor(item) {
  // Logic from ThreeViewer.getItemColor
  // Returns integer hex (0xRRGGBB)

  if (item.color) {
    if (typeof item.color === 'string') {
      return parseInt(item.color.replace('#', '0x'), 16);
    }
    return item.color;
  }
  // Default fallback (Electric Blue)
  return 0x00d2ff;
}
