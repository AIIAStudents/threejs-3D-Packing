import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function _num(v, name) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`[GEOMETRY-UTIL] invalid number for ${name}: ${v}`);
  return n;
}

function _assertDims(dim) {
  // 允許從 width/depth 映射以兼容舊 UI
  const outerWidth  = _num(dim.outerWidth ?? dim.width,  'outerWidth');
  const outerDepth  = _num(dim.outerDepth ?? dim.depth,  'outerDepth');
  const height      = _num(dim.height,      'height');
  const notchWidth  = _num(dim.notchWidth,  'notchWidth');
  const notchDepth  = _num(dim.notchDepth,  'notchDepth');
  if (outerWidth <=0 || outerDepth<=0 || height<=0 || notchWidth<=0 || notchDepth<=0) {
    throw new Error('[GEOMETRY-UTIL] non-positive dimension');
  }
  if (notchWidth >= outerWidth || notchDepth >= outerDepth) {
    throw new Error('[GEOMETRY-UTIL] notch must be smaller than outer');
  }
  return { outerWidth, outerDepth, height, notchWidth, notchDepth };
}

export function buildLShapeGeometry(dim) {
  console.log('[GEOMETRY-UTIL] Building L-shape geometry with dimensions:', dim);
  const { outerWidth, outerDepth, height, notchWidth, notchDepth } = _assertDims(dim);

  const shape = new THREE.Shape();
  const halfW = outerWidth / 2;
  const halfD = outerDepth / 2;

  // Draw the L-shape footprint on the XY plane (which will become the XZ plane)
  shape.moveTo(-halfW, -halfD); // Start at bottom-left
  shape.lineTo(halfW, -halfD);  // Bottom edge
  shape.lineTo(halfW, halfD - notchDepth); // Right edge of the short/bottom leg
  shape.lineTo(halfW - notchWidth, halfD - notchDepth); // Top edge of the short/bottom leg (the notch part)
  shape.lineTo(halfW - notchWidth, halfD); // Inner vertical edge of the notch
  shape.lineTo(-halfW, halfD); // Top edge of the long/vertical leg
  shape.closePath(); // Back to start

  const extrudeSettings = {
    depth: height,
    bevelEnabled: false
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // The geometry is created on the XY plane and extruded along Z.
  // We need to rotate it to lie on the XZ plane and sit with its base at y=0.
  geo.rotateX(-Math.PI / 2); // Rotate shape from XY plane to XZ plane.
  geo.translate(0, height, 0);   // After rotation, it's extruded downwards, so move up by 'height' to place its base at y=0.

  // The original code computed these, so let's do it too for consistency.
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  return geo;
}

export function buildContainerMeshWithOutline(shape, dim, opts = {}) {
  console.log('[GEOMETRY-UTIL] Building container with shape:', shape);
  const opacity = opts.opacity ?? 0.2;
  let geo;
  if (shape === 'l-shape') {
    geo = buildLShapeGeometry(dim);
  } else {
    const w = _num(dim.width, 'width');
    const d = _num(dim.depth, 'depth');
    const h = _num(dim.height, 'height');
    geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h/2, 0);
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x808080, transparent: true, opacity, depthWrite: false })
  );
  const edges = new THREE.EdgesGeometry(geo, 1e-3);
  const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff0000 }));
  line.renderOrder = 999;
  const group = new THREE.Group();
  group.add(mesh);
  group.add(line);
  return { group, mesh, outline: line };
}