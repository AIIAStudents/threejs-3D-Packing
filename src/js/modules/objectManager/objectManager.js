/* global THREE, CANNON */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addPhysicsObject, removePhysicsObject, world } from '../../utils/physics.js';
import { getGroupColor } from './groupColor.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const DOOR_SIZES = {
    'human': { w: 12, h: 22 }, // 1.2m x 2.2m
    'forklift': { w: 30, h: 40 }, // 3m x 4m
    'truck': { w: 40, h: 50 } // 4m x 5m
};

/**
 * ObjectManager - Manages Three.js objects and their Cannon.js bodies.
 */
export class ObjectManager {
  constructor(scene, renderCallback) {
    this.scene = scene;
    this.render = renderCallback;
    this.groupManager = null;
    this.selectedObject = null;
    this.activeGroupId = null;
    this.containerSize = { x: 120, y: 120, z: 120 };
    this.doorOutlines = []; // To keep track of door outlines

    this.items = []; // Stores conceptual items with references to mesh
    this.groups = []; // Reference to groupManager's groups

    this._setupEventListeners();

    // Listen for container changes from the containerManager modal
    window.addEventListener('containerChanged', (e) => {
        this.updateContainer(e.detail);
    });
  }

  setGroupManager(manager) {
    this.groupManager = manager;
  }

  setGroups(groups) {
    this.groups = groups;
  }

  updateContainer(containerConfig) {
    console.log('ObjectManager received containerChanged event:', containerConfig);

    // --- 1. Update containerSize for item placement ---
    if (containerConfig.shape === 'cube') {
        this.containerSize = { ...containerConfig.dimensions };
    } else if (containerConfig.shape === 'l-shape') {
        const { mainWidth, mainHeight, mainDepth } = containerConfig.dimensions;
        this.containerSize = {
            x: mainWidth,
            y: mainHeight,
            z: mainDepth,
        };
        console.warn('L-shape container size for item placement is an approximation based on the main part.');
    }

    // --- 2. Draw door outlines ---
    this.doorOutlines.forEach(outline => this.scene.remove(outline));
    this.doorOutlines = [];

    const { shape, dimensions, doors } = containerConfig;
    if (!doors || !Array.isArray(doors)) {
        if (this.render) this.render();
        return;
    }

    const createOutline = (w, h, color) => {
        const material = new THREE.LineBasicMaterial({ color: color, linewidth: 3, depthTest: false });
        // Draw the outline from y=0 to y=h, assuming floor is at y=0
        const points = [
            new THREE.Vector3(-w / 2, 0, 0), new THREE.Vector3(w / 2, 0, 0),
            new THREE.Vector3(w / 2, h, 0), new THREE.Vector3(-w / 2, h, 0),
            new THREE.Vector3(-w / 2, 0, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 1; // Ensure lines are drawn on top
        this.doorOutlines.push(line);
        this.scene.add(line);
        return line;
    };

    const colorMap = { front: 0x00ff00, back: 0xff0000, side: 0x0000ff };

    if (shape === 'cube') {
        const { width, height, depth } = dimensions;

        doors.forEach(door => {
            if (!door.enabled) return;

            const doorSize = DOOR_SIZES[door.type];
            if (!doorSize) return;

            let outline;
            let color;

            if (door.face.includes('front')) color = colorMap.front;
            else if (door.face.includes('back')) color = colorMap.back;
            else color = colorMap.side;

            // Create outline with the specific door's dimensions
            outline = createOutline(doorSize.w, doorSize.h, color);

            // Position the outline based on the face and slider position
            // A small Y offset (0.2) is added to prevent z-fighting with the floor.
            switch (door.face) {
                case 'front':
                    outline.position.set(door.position.x, 0.2, depth / 2 + 0.1);
                    break;
                case 'back':
                    outline.position.set(door.position.x, 0.2, -depth / 2 - 0.1);
                    break;
                case 'left':
                    outline.position.set(-width / 2 - 0.1, 0.2, door.position.x);
                    outline.rotation.y = Math.PI / 2;
                    break;
                case 'right':
                    outline.position.set(width / 2 + 0.1, 0.2, door.position.x);
                    outline.rotation.y = Math.PI / 2;
                    break;
            }
        });
        console.log('Drew specific door outlines for cube container.');
    } else if (shape === 'l-shape') {
        console.warn('Drawing door outlines for L-Shape containers is not yet implemented due to complex geometry.');
    }

    if (this.render) this.render();
  }

  _createGeometry(params) {
    switch (params.type) {
      case 'cube':
      case 'irregular':
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
      case 'sphere':
        return new THREE.SphereGeometry(params.radius, params.widthSegments, params.heightSegments);
      case 'cylinder':
        return new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom, params.height, params.radialSegments, params.heightSegments);
      case 'icosahedron':
        return new THREE.IcosahedronGeometry(params.radius, params.detail);
      case 'l-shape-item': // L-shape items are not instanced due to their complex geometry
        const totalWidth = params.totalWidth;
        const totalHeight = params.totalHeight;
        const totalDepth = params.totalDepth;
        const cutWidth = params.cutWidth;
        const cutDepth = params.cutDepth;

        const geometries = [];

        // Part 1 (horizontal part of L)
        const geom1 = new THREE.BoxGeometry(totalWidth, totalHeight, cutDepth);
        geom1.translate(0, 0, totalDepth / 2 - cutDepth / 2);
        geometries.push(geom1);

        // Part 2 (vertical part of L)
        const geom2 = new THREE.BoxGeometry(cutWidth, totalHeight, totalDepth - cutDepth);
        geom2.translate(totalWidth / 2 - cutWidth / 2, 0, -cutDepth / 2);
        geometries.push(geom2);

        return BufferGeometryUtils.mergeGeometries(geometries);
      default:
        return new THREE.BoxGeometry(10, 10, 10);
    }
  }

  _createCannonShape(params) {
    let shape;
    let body = new CANNON.Body({ mass: 1 }); // 統一先建 body

    switch (params.type) {
      case 'cube':
      case 'irregular':
        shape = new CANNON.Box(new CANNON.Vec3(params.width / 2, params.height / 2, params.depth / 2));
        body.addShape(shape);
        break;
      case 'sphere':
        shape = new CANNON.Sphere(params.radius);
        body.addShape(shape);
        break;
      case 'cylinder':
        shape = new CANNON.Cylinder(params.radiusTop, params.radiusBottom, params.height, params.radialSegments);
        body.addShape(shape);
        break;
      case 'icosahedron':
        shape = new CANNON.Sphere(params.radius);
        body.addShape(shape);
        break;
      case 'l-shape-item':
        const totalWidth = params.totalWidth;
        const totalHeight = params.totalHeight;
        const totalDepth = params.totalDepth;
        const cutWidth = params.cutWidth;
        const cutDepth = params.cutDepth;

        // Part 1 (horizontal part of L)
        const shape1 = new CANNON.Box(new CANNON.Vec3(totalWidth / 2, totalHeight / 2, cutDepth / 2));
        const offset1 = new CANNON.Vec3(0, 0, totalDepth / 2 - cutDepth / 2);
        body.addShape(shape1, offset1);

        // Part 2 (vertical part of L)
        const shape2 = new CANNON.Box(new CANNON.Vec3(cutWidth / 2, totalHeight / 2, (totalDepth - cutDepth) / 2));
        const offset2 = new CANNON.Vec3(totalWidth / 2 - cutWidth / 2, 0, -cutDepth / 2);
        body.addShape(shape2, offset2);

        break;
      default:
        shape = new CANNON.Box(new CANNON.Vec3(5, 5, 5));
        body.addShape(shape);
    }

    return body; // 永遠回傳 CANNON.Body
  }


  createObject(groupId) {
    if (!this.groupManager || !groupId) {
      console.error('GroupManager not set or groupId not provided.');
      return;
    }

    const params = this._getParamsFromUI(document.getElementById('item-type-select').value);
    
    const geometry = this._createGeometry(params);
    if (!geometry) {
        console.error(`Failed to create geometry for ${params.type} item.`);
        return;
    }
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(getGroupColor(groupId, this.groups)),
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (!mesh) {
        console.error(`Failed to create mesh for ${params.type} item.`);
        return;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const initialPosition = this._getPlacementPosition(groupId, this.groups);
    mesh.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    const body = this._createCannonShape(params);
    body.position.copy(initialPosition);
    body.quaternion.copy(mesh.quaternion);
    world.addBody(body);

    const newItem = {
        id: `item-${THREE.MathUtils.generateUUID()}`,
        uuid: THREE.MathUtils.generateUUID(),
        name: params.name,
        type: params.type,
        mesh: mesh, // Store the mesh directly
        body: body,
        groupId: groupId,
        geometryParams: params
    };
    this.items.push(newItem);
    this.groupManager.addItemToGroup(newItem, groupId);
    document.getElementById('item-toolbar').style.display = 'none';
    if (this.render) this.render();
    console.log(`📦 Created ${params.type} object with ID ${newItem.id}`);
  }

  deleteObject(item, shouldRenderList = true) {
    if (!item) return;

    console.log(`🗑️ Deleting object ${item.id}`);

    if (item.mesh) { // Now all items will have a mesh property
      this.scene.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.mesh.material.dispose();
    }

    if (item.body) {
      removePhysicsObject(item.id);
    }

    const itemIndex = this.items.findIndex(i => i.id === item.id);
    if (itemIndex > -1) {
      this.items.splice(itemIndex, 1);
    }

    if (this.selectedObject && this.selectedObject.id === item.id) {
      document.getElementById('item-toolbar').style.display = 'none';
      this.selectedObject = null;
    }
    
    if (this.render) this.render();
  }

  getObjects() {
    return this.items;
  }

  setSelectedObject(item) {
    this.selectedObject = item;
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  // --- UI METHODS ---

  updateObject() {
      console.warn("updateObject is not implemented yet.");
      document.getElementById('item-toolbar').style.display = 'none';
  }

  showCreatePanel(groupId) {
    this.selectedObject = null;
    this.activeGroupId = groupId;
    document.getElementById('item-name').value = '新物件';

    const currentType = document.getElementById('item-type-select').value;
    this._showObjectParams(currentType);
    document.getElementById('create-item-btn').textContent = '創建物件';
    document.getElementById('delete-item-btn').style.display = 'none';
    document.getElementById('item-toolbar').style.display = 'block';
  }

  showEditPanel(item) {
    if (!item) return;
    this.selectedObject = item;
    this.activeGroupId = null;

    document.getElementById('item-name').value = item.name;
    document.getElementById('item-type-select').value = item.type;
    
    this._showObjectParams(item.type);
    const paramSections = document.querySelectorAll('.toolbar-section[id$="-params"]');
    paramSections.forEach(section => {
      const inputs = section.querySelectorAll('input');
      inputs.forEach(input => input.disabled = false);
    });

    document.getElementById('create-item-btn').textContent = '更新物件';
    document.getElementById('delete-item-btn').style.display = 'inline-block';
    document.getElementById('item-toolbar').style.display = 'block';
  }

  _setupEventListeners() {
    const itemTypeSelect = document.getElementById('item-type-select');
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
            this.createObject(this.activeGroupId);
          }
        } else if (target.id === 'delete-item-btn') {
          this.deleteObject(this.selectedObject, true);
        }
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

    if (type === 'l-shape-item') {
        document.getElementById('l-shape-item-params').style.display = 'block';
    }
  }

  _getParamsFromUI(type) {
    const params = { type };
    params.name = document.getElementById('item-name').value || '未命名物件';

    switch (type) {
      case 'cube':
      case 'irregular':
        params.width = parseFloat(document.getElementById(`${type}-width`).value) || 15;
        params.height = parseFloat(document.getElementById(`${type}-height`).value) || 15;
        params.depth = parseFloat(document.getElementById(`${type}-depth`).value) || 15;
        break;
      case 'sphere':
        params.radius = parseFloat(document.getElementById('sphere-radius').value) || 10;
        params.widthSegments = 32;
        params.heightSegments = 16;
        break;
      case 'cylinder':
        params.radiusTop = parseFloat(document.getElementById('cylinder-radiusTop').value) || 8;
        params.radiusBottom = parseFloat(document.getElementById('cylinder-radiusBottom').value) || 8;
        params.height = parseFloat(document.getElementById('cylinder-height').value) || 20;
        params.radialSegments = 32;
        params.heightSegments = 1;
        break;
      case 'icosahedron':
        params.radius = parseFloat(document.getElementById('icosahedron-radius').value) || 10;
        params.detail = 1;
        break;
      case 'l-shape-item':
        params.totalWidth = parseFloat(document.getElementById('l-shape-item-total-width').value) || 30;
        params.totalHeight = parseFloat(document.getElementById('l-shape-item-total-height').value) || 15;
        params.totalDepth = parseFloat(document.getElementById('l-shape-item-total-depth').value) || 30;
        params.cutWidth = parseFloat(document.getElementById('l-shape-item-cut-width').value) || 10;
        params.cutDepth = parseFloat(document.getElementById('l-shape-item-cut-depth').value) || 10;
        break;
    }
    return params;
  }

  _getPlacementPosition(groupId, allGroups) {
    if (!Array.isArray(allGroups) || allGroups.length === 0) {
        console.warn("⚠️ 沒有群組，使用預設座標");
        return new THREE.Vector3(0, 100, 0); // Default position inside container
    }

    const numGroups = allGroups.length;
    let groupIndex = allGroups.findIndex(g => g.id === groupId);

    if (groupIndex === -1) {
        console.warn(`⚠️ Group ID ${groupId} 不存在，放到第一組`);
        groupIndex = 0;
    }

    const inset = 5; // Inset from container walls

    // Place objects near the top of the container, assuming container's base is at y=0
    const startY = this.containerSize.y - inset;

    const randomX = THREE.MathUtils.randFloat(
        -this.containerSize.x / 2 + inset,
        this.containerSize.x / 2 - inset
    );

    const zPartitionSize = this.containerSize.z / numGroups;
    const zStart = -this.containerSize.z / 2 + (groupIndex * zPartitionSize);
    const randomZ = THREE.MathUtils.randFloat(zStart + inset, zStart + zPartitionSize - inset);
    
    const position = new THREE.Vector3(randomX, startY, randomZ);

    return position;
  }

  createItemElement(item) {
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
        this.showEditPanel(item);
      });
    }

    return objectItem;
  }
}