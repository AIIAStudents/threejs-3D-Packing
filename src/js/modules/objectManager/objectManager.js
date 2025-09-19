import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as api from '../../utils/agentAPI.js';
import { getGroupColor } from './groupColor.js';
import * as physics from '../../utils/physics.js'; // ADDED PHYSICS IMPORT

const CONTAINER_SIZE = { width: 120, height: 150, depth: 120 };

function clampToContainer(object) {
    const objectSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const halfContainer = { 
        width: CONTAINER_SIZE.width / 2, 
        depth: CONTAINER_SIZE.depth / 2 
    };

    object.position.x = Math.max(
        -halfContainer.width + objectSize.x / 2,
        Math.min(object.position.x, halfContainer.width - objectSize.x / 2)
    );
    object.position.z = Math.max(
        -halfContainer.depth + objectSize.z / 2,
        Math.min(object.position.z, halfContainer.depth - objectSize.z / 2)
    );
    object.position.y = Math.max(
        objectSize.y / 2,
        Math.min(object.position.y, CONTAINER_SIZE.height - objectSize.y / 2)
    );
}

export class ObjectManager {
  constructor(scene, renderCallback) {
    this.scene = scene;
    this.render = renderCallback;
    this.activeGroupId = null;
    this.items = [];
    this.allGroups = [];
    this.selectedObject = null; // Add this line

    this._setupEventListeners();
  }

  // Add these two methods
  setSelectedObject(object) {
    this.selectedObject = object;
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  getSceneObjects() {
    return this.scene.children.filter(child => child.userData.isManagedByObjectManager);
  }

  async _setupEventListeners() {
    document.addEventListener('groupSelected', async (e) => {
      const { groupId } = e.detail;
      this.activeGroupId = groupId;
      try {
          this.allGroups = await api.getGroups();
          this.loadItemsForGroup(groupId);
      } catch (error) {
          console.error("Failed to fetch all groups for color mapping:", error);
          this.allGroups = [];
          this.loadItemsForGroup(groupId);
      }
    });

    const addItemBtn = document.getElementById('add-item-btn');
    if(addItemBtn) {
        addItemBtn.addEventListener('click', () => this.addNewCube()); // MODIFIED CALL
    }
  }

  async loadItemsForGroup(groupId) {
    if (groupId === null || typeof groupId === 'undefined') {
      this.clearItemsList();
      // Do not clear the scene, allow multiple groups to be shown
      return;
    }
    console.log(`🔄 Loading items for group ${groupId}...`);
    try {
      let itemsFromApi = await api.getGroupItems(groupId);
      console.log(`[DEBUG] API returned ${itemsFromApi.length} items.`);

      this.items = itemsFromApi; // This might need adjustment if showing multiple groups
      this.renderItemsList();

      // Instead of clearing, add new items if they don't exist
      this.items.forEach((item, index) => {
        const existingObject = this.scene.children.find(child => child.userData.id === item.id);
        if (!existingObject) {
          addObject(this.scene, item, this.allGroups, index);
        }
      });

    } catch (error) {
      console.error(`❌ Failed to load items for group ${groupId}:`, error);
    }
  }

  _clearSceneObjects() {
    const objectsToRemove = this.scene.children.filter(child => child.userData.isManagedByObjectManager);
    objectsToRemove.forEach(obj => {
      this.scene.remove(obj);
      // REMOVE PHYSICS BODY WHEN REMOVING MESH
      if (obj.userData.body) {
          physics.removePhysicsObject(obj.userData.id);
      }
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
          if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
          } else {
              obj.material.dispose();
          }
      }
    });
    console.log(`🧹 Cleared ${objectsToRemove.length} objects from the scene.`);
  }

  renderItemsList() {
    const activeGroupElement = document.querySelector(`.group-item[data-id='${this.activeGroupId}']`);
    if (!activeGroupElement) return;

    const listElement = activeGroupElement.querySelector('.group-items-list');
    if (!listElement) return;

    listElement.innerHTML = '';
    listElement.classList.remove('collapsed');

    if (this.items.length === 0) {
        listElement.innerHTML = '<div class="empty-list-placeholder">此群組尚無物品</div>';
    }

    this.items.forEach(item => {
      const itemElement = this._createItemElement(item);
      listElement.appendChild(itemElement);
    });
  }

  clearItemsList() {
      document.querySelectorAll('.group-items-list').forEach(list => {
          list.innerHTML = '';
          list.classList.add('collapsed');
      });
  }

  _createItemElement(item) {
    const itemElement = document.createElement('div');
    itemElement.className = `object-item status-${item.status}`;
    itemElement.dataset.id = item.id;

    let buttons = '';
    if (item.status === 'pending') {
      buttons = '<button class="confirm-btn">確認</button>';
    }

    itemElement.innerHTML = `
      <div class="object-info">
        <span class="object-name">${item.name} (ID: ${item.item_type_id})</span>
        <span class="object-status">${item.status}</span>
      </div>
      <div class="object-actions">
        ${buttons}
      </div>
    `;

    const confirmBtn = itemElement.querySelector('.confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api.confirmItem(item.id);
          itemElement.classList.remove('status-pending');
          itemElement.classList.add('status-confirmed');
          itemElement.querySelector('.object-status').textContent = 'confirmed';
          confirmBtn.remove();
          updateObjectOpacity(this.scene, item.id, 'confirmed');
        } catch (error) {
          console.error(`❌ Failed to confirm item ${item.id}:`, error);
          alert(`確認物品失敗: ${error.message}`);
        }
      });
    }

    return itemElement;
  }

  async addNewCube() { // RENAMED FROM promptForNewItem
    if (this.activeGroupId === null) {
      alert("請先選擇一個群組！");
      return;
    }

    const itemTypeId = 3; // Hardcode item_type_id to 3 for Cube

    try {
      const newItemData = {
        item_type_id: itemTypeId,
        group_id: this.activeGroupId,
      };
      await api.addInventoryItem(newItemData);
      this.loadItemsForGroup(this.activeGroupId);
    } catch (error) {
      console.error("❌ Failed to add cube:", error);
      alert(`新增立方體失敗: ${error.message}`);
    }
  }

  update() {
    this.scene.children.forEach(mesh => {
      if (mesh.userData.isManagedByObjectManager && mesh.userData.body) {
        mesh.position.copy(mesh.userData.body.position);
        mesh.quaternion.copy(mesh.userData.body.quaternion);
      }
    });
  }
}

export function addObject(scene, item, allGroups = [], itemIndex = 0) {
    // All items are considered to be cubes, so we don't need to check the name.
    // We will render any item that comes from the API.

    const dims = item.dimensions || {};
    const width = parseFloat(dims.width) || 15;
    const height = parseFloat(dims.height) || 15;
    const depth = parseFloat(dims.depth) || 15;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    const color = getGroupColor(item.group_id, allGroups);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.1,
        transparent: item.status === 'pending',
        opacity: item.status === 'pending' ? 0.5 : 1.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = item.name || 'Unnamed Object';
    
    mesh.userData = { ...item, isManagedByObjectManager: true };

    const spacing = 25;
    const itemsPerRow = 4;
    const x = (itemIndex % itemsPerRow) * spacing - (itemsPerRow - 1) * spacing / 2;
    const z = Math.floor(itemIndex / itemsPerRow) * spacing;
    mesh.position.set(x, height / 2, z);
    clampToContainer(mesh);

    scene.add(mesh);
    console.log(`📦 Added ${mesh.name} to the scene with color #${color.toString(16)} at position`, mesh.position);

    // ADD PHYSICS BODY
    const physicsShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const physicsBody = physics.addPhysicsObject(
        new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        new CANNON.Quaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w),
        physicsShape,
        item.id // Use item.id as the unique ID for physics body
    );
    mesh.userData.body = physicsBody; // Store physics body in mesh userData
}

export function updateObject(object, data) {
    const { name, width, height, depth, status } = data;

    // --- Update Visual Mesh ---
    object.name = name;
    if (object.geometry) {
        object.geometry.dispose(); // Dispose old geometry to free memory
    }
    object.geometry = new THREE.BoxGeometry(width, height, depth);
    object.material.transparent = (status === 'pending');
    object.material.opacity = (status === 'pending') ? 0.5 : 1.0;

    // --- Update Physics Body ---
    if (object.userData.body) {
        // Remove the old physics body from the world
        physics.removePhysicsObject(object.userData.id);
    }

    // Create a new physics body with the new dimensions
    const newPhysicsShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const newPhysicsBody = physics.addPhysicsObject(
        new CANNON.Vec3(object.position.x, object.position.y, object.position.z),
        new CANNON.Quaternion(object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w),
        newPhysicsShape,
        object.userData.id,
        object.userData.body ? object.userData.body.mass : 1 // Preserve mass if it exists
    );
    object.userData.body = newPhysicsBody; // Link the new body

    // --- Update UserData Store ---
    object.userData.name = name;
    object.userData.width = width;
    object.userData.height = height;
    object.userData.depth = depth;
    object.userData.status = status;

    clampToContainer(object);
    object.updateMatrixWorld(true);

    console.log(`🔄 Updated ${name} (visuals and physics).`);
}

export function updateObjectOpacity(scene, itemId, status) {
    if (typeof itemId === 'undefined') {
        console.error('updateObjectOpacity called with undefined itemId');
        return;
    }
    const object = scene.children.find(obj => obj.userData.id === itemId);
    if (object && object.material) {
        object.material.transparent = status === 'pending';
        object.material.opacity = status === 'pending' ? 0.5 : 1.0;
    } else {
        console.warn(`Object with inventory ID ${itemId} not found in scene or has no material.`);
    }
}

