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

    // SUPPORT: pose (Legacy) or position/dimensions (API) or direct properties (Fallback)
    let min, max, w, h, d;
    
    if (item.pose && item.pose.min && item.pose.max) {
      min = item.pose.min;
      max = item.pose.max;
      w = max.x - min.x;
      h = max.y - min.y;
      d = max.z - min.z;
    } else if (item.position && item.dimensions) {
      // API format: item.position = {x,y,z}, item.dimensions = {x,y,z}
      // Note: In API/Packer space, position is already the min corner.
      min = item.position;
      w = item.dimensions.x;
      h = item.dimensions.y;
      d = item.dimensions.z;
      max = { x: min.x + w, y: min.y + h, z: min.z + d };
    } else if (item.length !== undefined && item.width !== undefined && item.height !== undefined) {
      // Direct mapped properties from API
      w = item.length;
      h = item.height;
      d = item.width;
      min = item.position || { x: 0, y: 0, z: 0 };
      max = { x: min.x + w, y: min.y + h, z: min.z + d };
    } else {
      continue; // Skip invalid
    }

    if (isNaN(w) || isNaN(h) || isNaN(d)) {
      console.warn('[GeometryWorker] NaN dimensions for item:', item.item_id);
      continue;
    }

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

    // FIX: Handle Zone Rotation
    // py_packer_v2 returns Local Coords (0..W, 0..D).
    // Zone is centered at (cx, cy) and rotated.
    // Logic: Global = Center + Rotate(Local - HalfSize)

    const transform = item.zoneTransform;
    let finalX = localCenterX;
    let finalY = localCenterY;
    let finalZ = localCenterZ;



    if (transform) {
      // 1. Shift to Zone-Center Relative
      // Safety: default to 0 if width/depth missing to prevent NaN
      const tWidth = transform.width || 0;
      const tDepth = transform.depth || 0;

      const relX = localCenterX - (tWidth / 2);
      const relZ = localCenterZ - (tDepth / 2);

      // 2. Apply Rotation
      const rotation = transform.rotation || 0;
      // Pre-calculate sin/cos only if needed, or just let JS JIT optimize.
      // For thousands of items, this is fast enough.
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      // Rotate around Y axis (in 2D X/Z plane)
      // x' = x cos - z sin
      // z' = x sin + z cos
      // Note: In 3D, Y is up. We rotate on X-Z plane.
      const rotX = relX * cos - relZ * sin;
      const rotZ = relX * sin + relZ * cos;

      // 3. Add Zone Global Center
      finalX = transform.cx + rotX;
      finalZ = transform.cy + rotZ;
    } else if (item.zoneOffset) {
      // Fallback for legacy simple offset (if any)
      finalX += item.zoneOffset.x;
      finalZ += item.zoneOffset.y;
    }

    // Matrix Composition (T * R * S)
    // Rotation is around Y axis
    // cos -sin
    // sin  cos
    // Note: Three.js Matrix4 setFromEuler (Y)
    //  c  0  s  0
    //  0  1  0  0
    // -s  0  c  0
    //  0  0  0  1

    // With data rotation (transform.rotation)
    let rCos = 1, rSin = 0;
    if (transform && transform.rotation) {
      rCos = Math.cos(transform.rotation);
      rSin = Math.sin(transform.rotation);
    }

    // Column-major Order in Array index:
    // 0  4  8  12
    // 1  5  9  13
    // 2  6  10 14
    // 3  7  11 15

    // Col 0 (X-axis basis): Scaled by w, Rotated
    matrices[i * 16 + 0] = rCos * w;
    matrices[i * 16 + 1] = 0;
    matrices[i * 16 + 2] = -rSin * w;
    matrices[i * 16 + 3] = 0;

    // Col 1 (Y-axis basis): Scaled by h, No Rotation
    matrices[i * 16 + 4] = 0;
    matrices[i * 16 + 5] = h;
    matrices[i * 16 + 6] = 0;
    matrices[i * 16 + 7] = 0;

    // Col 2 (Z-axis basis): Scaled by d, Rotated
    matrices[i * 16 + 8] = rSin * d;
    matrices[i * 16 + 9] = 0;
    matrices[i * 16 + 10] = rCos * d;
    matrices[i * 16 + 11] = 0;

    // Col 3 (Position): cx, cy, cz
    matrices[i * 16 + 12] = finalX;
    matrices[i * 16 + 13] = finalY;
    matrices[i * 16 + 14] = finalZ;
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
