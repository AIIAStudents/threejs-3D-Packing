/* eslint-disable no-unused-vars */
/* global THREE */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addPhysicsObject, removePhysicsObject } from '../utils/physics.js';

// 物件管理模組 (整合物理引擎同步 - 修正版 v2)
export class ObjectManager {
  constructor(scene, renderCallback) {
    this.scene = scene;
    this.render = renderCallback;
    this.objects = [];
    this.selectedObject = null;
    this.packingManager = null;
    this._setupEventListeners();
  }

  setPackingManager(manager) {
    this.packingManager = manager;
  }

  _createCannonShape(params) {
    switch (params.type) {
      case 'cube':
      case 'irregular':
        return new CANNON.Box(new CANNON.Vec3(params.width / 2, params.height / 2, params.depth / 2));
      case 'sphere':
        return new CANNON.Sphere(params.radius);
      case 'cylinder':
        const radius = Math.max(params.radiusTop, params.radiusBottom);
        return new CANNON.Box(new CANNON.Vec3(radius, params.height / 2, radius));
      case 'icosahedron':
        return new CANNON.Sphere(params.radius);
      default:
        return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    }
  }

  _setupEventListeners() {
    const itemTypeSelect = document.getElementById('item-type');
    if (itemTypeSelect) {
      itemTypeSelect.addEventListener('change', (e) => {
        this._showObjectParams(e.target.value);
      });
    }

    const itemToolbar = document.getElementById('item-toolbar');
    if (itemToolbar) {
      itemToolbar.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.id === 'create-item-btn') {
          if (this.selectedObject) {
            this.updateObject();
          } else {
            this.createObject();
          }
        } else if (target.id === 'delete-item-btn') {
          this.deleteObject();
        }
      });
    }
    
    const opacitySlider = document.getElementById('item-opacity');
    const opacityValue = document.getElementById('opacity-value');
    if (opacitySlider && opacityValue) {
        opacitySlider.addEventListener('input', (e) => {
            opacityValue.textContent = e.target.value;
        });
    }
  }

  _showObjectParams(type) {
    const paramSections = document.querySelectorAll('.toolbar-section[id$="-params"]');
    paramSections.forEach(section => {
      section.style.display = 'none';
    });
    const targetSection = document.getElementById(`${type}-params`);
    if (targetSection) {
      targetSection.style.display = 'block';
    }
  }

  _getParamsFromUI(type) {
    const params = { type };
    params.name = document.getElementById('item-name').value || '未命名物件';
    params.color = document.getElementById('item-color').value;
    params.opacity = parseFloat(document.getElementById('item-opacity').value);

    switch (type) {
      case 'cube':
      case 'irregular':
        params.width = parseFloat(document.getElementById(`${type}-width`).value);
        params.height = parseFloat(document.getElementById(`${type}-height`).value);
        params.depth = parseFloat(document.getElementById(`${type}-depth`).value);
        break;
      case 'sphere':
        params.radius = parseFloat(document.getElementById('sphere-radius').value);
        params.widthSegments = parseInt(document.getElementById('sphere-widthSegments').value);
        params.heightSegments = parseInt(document.getElementById('sphere-heightSegments').value);
        break;
      case 'cylinder':
        params.radiusTop = parseFloat(document.getElementById('cylinder-radiusTop').value);
        params.radiusBottom = parseFloat(document.getElementById('cylinder-radiusBottom').value);
        params.height = parseFloat(document.getElementById('cylinder-height').value);
        params.radialSegments = parseInt(document.getElementById('cylinder-radialSegments').value);
        params.heightSegments = parseInt(document.getElementById('cylinder-heightSegments').value);
        break;
      case 'icosahedron':
        params.radius = parseFloat(document.getElementById('icosahedron-radius').value);
        params.detail = parseInt(document.getElementById('icosahedron-detail').value);
        break;
    }
    return params;
  }

  _createGeometry(params) {
    switch (params.type) {
      case 'cube':
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
      case 'irregular':
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
      case 'sphere':
        return new THREE.SphereGeometry(params.radius, params.widthSegments, params.heightSegments);
      case 'cylinder':
        return new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom, params.height, params.radialSegments, params.heightSegments);
      case 'icosahedron':
        return new THREE.IcosahedronGeometry(params.radius, params.detail);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }

  _createMesh(params) {
    const geometry = this._createGeometry(params);
    const material = new THREE.MeshStandardMaterial({
      color: params.color,
      opacity: params.opacity,
      transparent: params.opacity < 1,
    });
    return new THREE.Mesh(geometry, material);
  }

  showCreatePanel() {
    this.selectedObject = null;
    document.getElementById('item-name').value = '新物件';
    document.getElementById('item-type').disabled = false;
    const currentType = document.getElementById('item-type').value;
    this._showObjectParams(currentType);
    document.getElementById('create-item-btn').textContent = '創建物件';
    document.getElementById('delete-item-btn').style.display = 'none';
    document.getElementById('item-toolbar').style.display = 'block';
  }

  showEditPanel(itemId) {
    const item = this.objects.find(obj => obj.id === itemId);
    if (!item) return;
    this.selectedObject = item;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-type').value = item.type;
    document.getElementById('item-type').disabled = false;
    document.getElementById('item-color').value = '#' + item.mesh.material.color.getHexString();
    const opacity = item.mesh.material.opacity;
    document.getElementById('item-opacity').value = opacity;
    document.getElementById('opacity-value').textContent = opacity;
    this._showObjectParams(item.type);
    const params = item.mesh.geometry.parameters;
    switch (item.type) {
        case 'cube':
        case 'irregular':
            document.getElementById(`${item.type}-width`).value = params.width;
            document.getElementById(`${item.type}-height`).value = params.height;
            document.getElementById(`${item.type}-depth`).value = params.depth;
            break;
        case 'sphere':
            document.getElementById('sphere-radius').value = params.radius;
            document.getElementById('sphere-widthSegments').value = params.widthSegments;
            document.getElementById('sphere-heightSegments').value = params.heightSegments;
            break;
        case 'cylinder':
            document.getElementById('cylinder-radiusTop').value = params.radiusTop;
            document.getElementById('cylinder-radiusBottom').value = params.radiusBottom;
            document.getElementById('cylinder-height').value = params.height;
            document.getElementById('cylinder-radialSegments').value = params.radialSegments;
            document.getElementById('cylinder-heightSegments').value = params.heightSegments;
            break;
        case 'icosahedron':
            document.getElementById('icosahedron-radius').value = params.radius;
            document.getElementById('icosahedron-detail').value = params.detail;
            break;
    }
    document.getElementById('create-item-btn').textContent = '更新物件';
    document.getElementById('delete-item-btn').style.display = 'inline-block';
    document.getElementById('item-toolbar').style.display = 'block';
  }

  createObject() {
    const params = this._getParamsFromUI(document.getElementById('item-type').value);
    if ((params.type === 'cube' || params.type === 'irregular') && (!params.width || !params.height || !params.depth)) {
        console.error("無法建立物件：寬度、高度和深度是必要的。");
        return;
    }
    const mesh = this._createMesh(params);
    
    // 設定安全的初始位置，避免與地板或其他物體重疊
    mesh.position.set(
      (Math.random() - 0.5) * 20, 
      100, 
      (Math.random() - 0.5) * 20
    );

    const newItem = {
      id: `obj-${Date.now()}`,
      name: params.name,
      type: params.type,
      mesh: mesh,
      body: null
    };

    this.objects.push(newItem);
    this.scene.add(newItem.mesh);
    this.addObjectToList(newItem);

    if (this.packingManager && this.packingManager.physicsEnabled) {
      const shape = this._createCannonShape(params);
      const body = addPhysicsObject(newItem.mesh, shape);
      newItem.body = body;
    }

    document.getElementById('item-toolbar').style.display = 'none';
    if (this.render) this.render();
  }

  updateObject() {
    if (!this.selectedObject) return;

    const item = this.selectedObject;
    const params = this._getParamsFromUI(document.getElementById('item-type').value);

    if (this.packingManager && this.packingManager.physicsEnabled && item.body) {
      removePhysicsObject(item.body);
      item.body = null;
    }

    const needsRebuild = this._checkIfGeometryNeedsRebuild(item, params);

    if (needsRebuild) {
        const oldPosition = item.mesh.position.clone();
        this.scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        
        item.mesh = this._createMesh(params);
        item.mesh.position.copy(oldPosition);
        item.type = params.type; // 更新類型
        this.scene.add(item.mesh);
    } 

    item.name = params.name;
    item.mesh.material.color.set(params.color);
    item.mesh.material.opacity = params.opacity;
    item.mesh.material.transparent = params.opacity < 1;
    item.mesh.material.needsUpdate = true;

    if (this.packingManager && this.packingManager.physicsEnabled) {
      const newShape = this._createCannonShape(params);
      const newBody = addPhysicsObject(item.mesh, newShape);
      item.body = newBody;
    }

    const objectItem = document.querySelector(`[data-id="${item.id}"] .object-name`);
    if (objectItem) objectItem.textContent = item.name;

    document.getElementById('item-toolbar').style.display = 'none';
    this.selectedObject = null;
    if (this.render) this.render();
  }

  _checkIfGeometryNeedsRebuild(item, params) {
    if (item.type !== params.type) return true;
    const currentParams = item.mesh.geometry.parameters;
    switch(item.type) {
        case 'sphere':
            return currentParams.radius !== params.radius || currentParams.widthSegments !== params.widthSegments || currentParams.heightSegments !== params.heightSegments;
        case 'cylinder':
            return currentParams.radiusTop !== params.radiusTop || currentParams.radiusBottom !== params.radiusBottom || currentParams.height !== params.height || currentParams.radialSegments !== params.radialSegments || currentParams.heightSegments !== params.heightSegments;
        case 'icosahedron':
            return currentParams.radius !== params.radius || currentParams.detail !== params.detail;
        case 'cube':
        case 'irregular':
            return currentParams.width !== params.width || currentParams.height !== params.height || currentParams.depth !== params.depth;
    }
    return false;
  }

  deleteObject() {
    if (!this.selectedObject) return;
    const item = this.selectedObject;

    if (this.packingManager && this.packingManager.physicsEnabled && item.body) {
      removePhysicsObject(item.body);
    }

    this.scene.remove(item.mesh);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();

    const index = this.objects.findIndex(obj => obj.id === item.id);
    if (index > -1) this.objects.splice(index, 1);

    const objectItem = document.querySelector(`[data-id="${item.id}"]`);
    if (objectItem) objectItem.remove();

    document.getElementById('item-toolbar').style.display = 'none';
    this.selectedObject = null;
    if (this.render) this.render();
    console.log(`已刪除物件: ${item.name}`);
  }

  setSelectedObject(object) {
    this.selectedObject = object;
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  getObjects() {
    return this.objects;
  }

  addObjectToList(item) {
    const objectsList = document.getElementById('objects-list');
    if (!objectsList) return;

    const objectItem = document.createElement('div');
    objectItem.className = 'object-item';
    objectItem.dataset.id = item.id;

    objectItem.innerHTML = `
      <div class="object-info">
        <div class="object-name">${item.name}</div>
      </div>
      <div class="object-actions">
        <button class="menu-btn">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
    `;

    const menuBtn = objectItem.querySelector('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showEditPanel(item.id);
      });
    }

    objectsList.appendChild(objectItem);
  }
}