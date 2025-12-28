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
  console.log('[GEOMETRY-UTIL] Building container with shape:', shape, 'and dims:', dim);
  const opacity = opts.opacity ?? 0.2;
  let geo;
  
  const h = _num(dim.height, 'height');

  // Use THREE.Shape and ExtrudeGeometry for complex shapes to ensure consistency
  const extrudeSettings = { depth: h, bevelEnabled: false };
  let footprintShape;

  switch (shape) {
    case 'l-shape':
      geo = buildLShapeGeometry(dim);
      break;

    case 'u_shape':
      const uw = _num(dim.outerWidth, 'outerWidth');
      const ud = _num(dim.outerDepth, 'outerDepth');
      const gw = _num(dim.gapWidth, 'gapWidth');
      const gd = _num(dim.gapDepth, 'gapDepth');
      const sideW = (uw - gw) / 2;

      footprintShape = new THREE.Shape()
        .moveTo(0, 0)
        .lineTo(uw, 0)
        .lineTo(uw, ud)
        .lineTo(uw - sideW, ud)
        .lineTo(uw - sideW, ud - gd)
        .lineTo(sideW, ud - gd)
        .lineTo(sideW, ud)
        .lineTo(0, ud)
        .closePath();
      
      geo = new THREE.ExtrudeGeometry(footprintShape, extrudeSettings);
      geo.translate(-uw / 2, 0, -ud / 2); // Center the shape
      break;

    case 't_shape':
      const cw = _num(dim.crossWidthX, 'crossWidthX');
      const cd = _num(dim.crossDepthZ, 'crossDepthZ');
      const sw = _num(dim.stemWidthX, 'stemWidthX');
      const sd = _num(dim.stemDepthZ, 'stemDepthZ');
      const totalDepth = cd + sd;
      const stemOffset = (cw - sw) / 2;

      footprintShape = new THREE.Shape()
        .moveTo(0, 0)
        .lineTo(cw, 0)
        .lineTo(cw, cd)
        .lineTo(stemOffset + sw, cd)
        .lineTo(stemOffset + sw, totalDepth)
        .lineTo(stemOffset, totalDepth)
        .lineTo(stemOffset, cd)
        .lineTo(0, cd)
        .closePath();

      geo = new THREE.ExtrudeGeometry(footprintShape, extrudeSettings);
      geo.translate(-cw / 2, 0, -totalDepth / 2); // Center the shape
      break;

    case 'cube':
    case 'rectangular':
    default:
      const w = _num(dim.width, 'width');
      const d = _num(dim.depth, 'depth');
      geo = new THREE.BoxGeometry(w, h, d);
      break;
  }
  
  // All geometries should have their base at y=0
  geo.translate(0, h/2, 0);

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x808080, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
  );
  const edges = new THREE.EdgesGeometry(geo, 1); // Use a threshold to catch all edges
  const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xcccccc }));
  
  const group = new THREE.Group();
  group.add(mesh);
  group.add(line);
  return { group, mesh, outline: line };
}