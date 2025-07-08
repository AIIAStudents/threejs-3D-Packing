import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCube } from '../3js_shape_file/cube.js';
import { createSphere } from '../3js_shape_file/sphere.js';
import { createIcosahedron } from '../3js_shape_file/Icosahedron.js';

// 自訂 cylinder 與 irregular
function createCylinder(radiusTop, radiusBottom, height, radialSegments, heightSegments) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments);
  const material = new THREE.MeshStandardMaterial({ color: 0x4ecdc4 });
  return new THREE.Mesh(geometry, material);
}

function createIrregular(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0xff7700 });
  return new THREE.Mesh(geometry, material);
}

export class ObjectCreator {
  constructor(scene, objectManager) {
    this.scene = scene;
    this.objectManager = objectManager;
  }

  // 建立新物件
  createNewItem() {
    const name = document.getElementById('item-name').value;
    const type = document.getElementById('item-type').value;

    if (name && type) {
      this.createItem(name, type);
      document.getElementById('item-toolbar').style.display = 'none';
    } else {
      alert('請填寫完整的物件資訊');
    }
  }

  // 生成物件
  createItem(name, type) {
    let mesh, shape;

    switch (type) {
      case 'cube': {
        const w = parseFloat(document.getElementById('cube-width').value);
        const h = parseFloat(document.getElementById('cube-height').value);
        const d = parseFloat(document.getElementById('cube-depth').value);
        mesh = createCube(w, h, d);
        shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
        break;
      }
      case 'sphere': {
        const r = parseFloat(document.getElementById('sphere-radius').value);
        const ws = parseInt(document.getElementById('sphere-widthSegments').value);
        const hs = parseInt(document.getElementById('sphere-heightSegments').value);
        mesh = createSphere(r, ws, hs);
        shape = new CANNON.Sphere(r);
        break;
      }
      case 'cylinder': {
        const rt = parseFloat(document.getElementById('cylinder-radiusTop').value);
        const rb = parseFloat(document.getElementById('cylinder-radiusBottom').value);
        const h = parseFloat(document.getElementById('cylinder-height').value);
        const rs = parseInt(document.getElementById('cylinder-radialSegments').value);
        const hs = parseInt(document.getElementById('cylinder-heightSegments').value);
        mesh = createCylinder(rt, rb, h, rs, hs);
        shape = new CANNON.Cylinder(rt, rb, h, rs);
        break;
      }
      case 'icosahedron': {
        const r = parseFloat(document.getElementById('icosahedron-radius').value);
        const det = parseInt(document.getElementById('icosahedron-detail').value);
        mesh = createIcosahedron(r, det);
        shape = new CANNON.Sphere(r);
        break;
      }
      case 'irregular': {
        const w = parseFloat(document.getElementById('irregular-width').value);
        const h = parseFloat(document.getElementById('irregular-height').value);
        const d = parseFloat(document.getElementById('irregular-depth').value);
        mesh = createIrregular(w, h, d);
        shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
        break;
      }
      default:
        console.error('Unknown object type:', type);
        return;
    }

    // 材質屬性
    const color = document.getElementById('item-color').value;
    const opacity = parseFloat(document.getElementById('item-opacity').value);
    mesh.material.color.setHex(parseInt(color.replace('#', ''), 16));
    mesh.material.opacity = opacity;
    mesh.material.transparent = opacity < 1;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // === 方案一：以容器中心為基準隨機生成 ===
    const boundarySize = 120; // 容器邊長
    const half = boundarySize / 2;
    const inset = 5; // 與牆保留距離
    const containerCenter = new THREE.Vector3(0, 60, 0); // 容器中心位置

    mesh.position.set(
      THREE.MathUtils.randFloat(-half + inset, half - inset), // X
      THREE.MathUtils.randFloat(-half + inset, half - inset), // Y（以中心為0）
      THREE.MathUtils.randFloat(-half + inset, half - inset)  // Z
    ).add(containerCenter); // 偏移到容器世界座標

    // 加入場景
    this.scene.add(mesh);

    // 加入物理
    if (window.addPhysicsObject) {
      window.addPhysicsObject(mesh, shape, 1, mesh.position.clone());
    }

    // 註冊到物件管理器
    const item = {
      id: `item_${this.objectManager.getObjectCount()}`,
      name,
      type,
      mesh,
      shape
    };
    this.objectManager.addObject(item);

    console.log(`Created ${type} item: ${name}`);
    return item;
  }

  // 顯示參數 UI
  showObjectTypeParams(type) {
    const sections = ['cube-params', 'sphere-params', 'cylinder-params', 'icosahedron-params', 'irregular-params'];
    sections.forEach(s => {
      document.getElementById(s).style.display = 'none';
    });
    const el = document.getElementById(`${type}-params`);
    if (el) el.style.display = 'block';
  }
}