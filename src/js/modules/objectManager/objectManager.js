/**
 * 本程式碼用途：
 * - 提供 3D 場景物件(Object)的管理與顯示，並支援物理引擎 (cannon-es) 整合。
 * - 功能包含：
 *   1. 從 API 載入物品並渲染到 Three.js 場景。
 *   2. 為物件新增/移除物理剛體，保持與場景同步。
 *   3. 提供群組管理 (group) 與 UI 更新 (DOM 操作)。
 *   4. 控制物件位置不超出預設容器範圍。
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as api from '../../utils/agentAPI.js';
import { toCanonical } from '../../utils/statusUtils.js'; // 導入狀態轉換工具
import { getGroupColor } from './groupColor.js';
import * as physics from '../../utils/physics.js'; // 物理模組

// --- 全域變數與 API ---

const uuidToObject = new Map();

// 在 window 上建立唯一的 objectManager API
if (!window.objectManager) window.objectManager = {};

window.objectManager.getAllObjectUuids = () => {
    return Array.from(uuidToObject.keys());
};

window.objectManager.updateItemPlacement = (uuid, position) => {
    const obj = uuidToObject.get(String(uuid));
    
    if (!obj) {
        console.warn(`[objectManager] updateItemPlacement: 無法透過 uuid 找到物件: ${uuid}`);
        return;
    }

    if (position) {
        console.log(`[OBJ] MOVED: ${uuid} to`, position);
        
        // 1. 更新視覺物件 (Mesh) 的位置
        obj.position.set(position.x, position.y, position.z);
        
        const body = obj.userData.body;
        if (body) {
            // 2. 同步更新物理剛體 (Body) 的位置
            body.position.copy(obj.position);
            body.quaternion.copy(obj.quaternion);
            
            // 3. **關鍵修復**: 將物件設為靜態，使其固定不動
            body.type = CANNON.Body.STATIC;
            body.updateMassProperties();

            // 4. 喚醒剛體以確保變更生效
            body.wakeUp();
        }
    }
    
    obj.updateMatrixWorld(true);
};

// 預設容器大小 (寬 / 高 / 深)，用來限制物件位置範圍
const CONTAINER_SIZE = { width: 120, height: 150, depth: 120 };

/**
 * 副程式：clampToContainer
 * 作用：
 * - 限制 3D 物件的位置，使其不超出容器邊界。
 * - 對 X / Y / Z 座標進行邊界檢查與修正。
 */
function clampToContainer(object) {
    const objectSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const halfContainer = { 
        width: CONTAINER_SIZE.width / 2, 
        depth: CONTAINER_SIZE.depth / 2 
    };

    object.position.x = Math.max(-halfContainer.width + objectSize.x / 2, Math.min(object.position.x, halfContainer.width - objectSize.x / 2));
    object.position.z = Math.max(-halfContainer.depth + objectSize.z / 2, Math.min(object.position.z, halfContainer.depth - objectSize.z / 2));
    object.position.y = Math.max(objectSize.y / 2, Math.min(object.position.y, CONTAINER_SIZE.height - objectSize.y / 2));
}

export class ObjectManager {
  constructor(scene, renderCallback) {
    this.scene = scene;
    this.render = renderCallback;
    this.activeGroupId = null;
    this.items = [];
    this.allGroups = [];
    this.selectedObject = null;
    this._setupEventListeners();
  }

  setSelectedObject(object) { this.selectedObject = object; }
  getSelectedObject() { return this.selectedObject; }
  getSceneObjects() { return this.scene.children.filter(child => child.userData.isManagedByObjectManager); }

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
  }

  async loadItemsForGroup(groupId) {
    if (groupId === null || typeof groupId === 'undefined') {
      this.clearItemsList();
      return;
    }
    console.log(`🔄 Loading items for group ${groupId}...`);
    try {
      let itemsFromApi = await api.getGroupItems(groupId);
      console.log(`[DEBUG] API returned ${itemsFromApi.length} items.`);
      itemsFromApi.forEach(item => {
        if (item.group_id === undefined || item.group_id === null) {
          item.group_id = parseInt(groupId, 10);
        }
      });
      this.items = itemsFromApi; 
      this.renderItemsList();
      this.items.forEach((item, index) => {
        const uuid = String(item.uuid ?? item.id);
        const existingObject = uuidToObject.get(uuid);
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
      if (obj.userData.body) { physics.removePhysicsObject(obj.userData.id); }
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
          if (Array.isArray(obj.material)) { obj.material.forEach(m => m.dispose()); } 
          else { obj.material.dispose(); }
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
    if (item.status === '尚未確認') {
      buttons = '<button class="confirm-btn">確認</button>';
    }
    itemElement.innerHTML = `
      <div class="object-info"><span class="object-name">${item.name} (ID: ${item.item_type_id})</span><span class="object-status">${item.status}</span></div>
      <div class="object-actions">${buttons}</div>
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
          const obj = this.getSceneObjects().find(o => o.userData.id === item.id);
          if (obj) {
            obj.userData.state = 'placed';
            updateObjectAppearanceByState(this.scene, obj);
          }
        } catch (error) {
          console.error(`❌ Failed to confirm item ${item.id}:`, error);
          alert(`確認物品失敗: ${error.message}`);
        }
      });
    }
    return itemElement;
  }

  async addNewCube() {
    if (this.activeGroupId === null) {
      alert("請先選擇一個群組！");
      return;
    }
    const itemTypeId = 3;
    try {
      const newItemData = { item_type_id: itemTypeId, group_id: this.activeGroupId, status: 'confirmed' };
      await api.addInventoryItem(newItemData);
      this.loadItemsForGroup(this.activeGroupId);
    } catch (error) {
      console.error("❌ Failed to add cube:", error);
      alert(`新增立方體失敗: ${error.message}`);
    }
  }

  update() {
    this.scene.children.forEach(mesh => {
      if (mesh.userData.isManagedByObjectManager && mesh.userData.body && mesh.userData.body.type === CANNON.Body.DYNAMIC) {
        mesh.position.copy(mesh.userData.body.position);
        mesh.quaternion.copy(mesh.userData.body.quaternion);
      }
    });
  }
}

export function addObject(scene, item, allGroups = [], itemIndex = 0) {
    const dims = item.dimensions || {};
    const width = parseFloat(dims.width) || 15;
    const height = parseFloat(dims.height) || 15;
    const depth = parseFloat(dims.depth) || 15;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const color = getGroupColor(item.group_id, allGroups);
    const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.1, transparent: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = item.name || 'Unnamed Object';
    
    const uuid = String(item.uuid ?? item.id);
    // 使用 toCanonical 轉換狀態，確保無論中文或英文都能正確判斷
    const state = toCanonical(item.status) === 'confirmed' ? 'placed' : 'unplaced';
    mesh.userData = { ...item, uuid: uuid, id: uuid, isManagedByObjectManager: true, packIndex: itemIndex, state: state };
    uuidToObject.set(uuid, mesh);

    const spacing = 25;
    const itemsPerRow = 4;
    const x = (itemIndex % itemsPerRow) * spacing - (itemsPerRow - 1) * spacing / 2;
    const z = Math.floor(itemIndex / itemsPerRow) * spacing;
    mesh.position.set(x, height / 2, z);
    clampToContainer(mesh);
    scene.add(mesh);
    console.log(`📦 Added ${mesh.name} (uuid: ${uuid}) to the scene with state '${mesh.userData.state}'`);
    updateObjectAppearanceByState(scene, mesh);

    const physicsShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const physicsBody = physics.addPhysicsObject(
        new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        new CANNON.Quaternion(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w),
        physicsShape,
        uuid
    );
    mesh.userData.body = physicsBody; 
}

export function removeObjectById(scene, itemId) {
    const objectToRemove = scene.children.find(child => child.userData.id === itemId);
    if (objectToRemove) {
        if (objectToRemove.userData.body) {
            physics.removePhysicsObject(objectToRemove.userData.id);
        }
        if (objectToRemove.geometry) objectToRemove.geometry.dispose();
        if (objectToRemove.material) {
            if (Array.isArray(objectToRemove.material)) {
                objectToRemove.material.forEach(m => m.dispose());
            } else {
                objectToRemove.material.dispose();
            }
        }
        scene.remove(objectToRemove);
        console.log(`🔥 Removed object with ID ${itemId} from the scene.`);
        return true;
    } else {
        console.warn(`[removeObjectById] Could not find object with ID: ${itemId}`);
        return false;
    }
}

export function updateObjectAppearanceByState(scene, object) {
    if (!object || !object.material) return;

    if (!object.material.isCloned) {
        object.material = object.material.clone();
        object.material.isCloned = true;
    }

    const state = object.userData.state || 'placed';
    
    if (object.userData.baseColor === undefined) {
        object.userData.baseColor = object.material.color.getHex();
    }

    let newColor = new THREE.Color(object.userData.baseColor);
    let newEmissive = new THREE.Color(0x000000);
    let newOpacity = 1.0;

    switch (state) {
        case 'unplaced':
            newOpacity = 0.4;
            break;
        case 'active':
            newOpacity = 1.0;
            newEmissive.set(object.userData.baseColor).multiplyScalar(0.5);
            break;
        case 'error':
            newOpacity = 1.0;
            newColor.set(0xff0000);
            break;
        case 'locked':
            newOpacity = 1.0;
            newColor.set(0x808080);
            break;
        case 'placed':
        default:
            newOpacity = 1.0;
            break;
    }

    object.material.color.set(newColor);
    object.material.emissive.set(newEmissive);
    object.material.opacity = newOpacity;
    object.material.transparent = newOpacity < 1.0;
    object.material.needsUpdate = true;
}

export function updateObject(object, data) {
    const { name, width, height, depth, status } = data;

    object.name = name;
    if (object.geometry) {
        object.geometry.dispose();
    }
    object.geometry = new THREE.BoxGeometry(width, height, depth);

    if (object.userData.body) {
        physics.removePhysicsObject(object.userData.id);
    }
    const newPhysicsShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const newPhysicsBody = physics.addPhysicsObject(
        new CANNON.Vec3(object.position.x, object.position.y, object.position.z),
        new CANNON.Quaternion(object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w),
        newPhysicsShape,
        object.userData.id,
        object.userData.body ? object.userData.body.mass : 1
    );
    object.userData.body = newPhysicsBody;

    object.userData.name = name;
    object.userData.width = width;
    object.userData.height = height;
    object.userData.depth = depth;
    object.userData.status = status;

    // 使用 toCanonical 轉換狀態
    const newState = toCanonical(status) === 'confirmed' ? 'placed' : 'unplaced';
    object.userData.state = newState;
    updateObjectAppearanceByState(object.parent, object);

    clampToContainer(object);
    object.updateMatrixWorld(true);

    console.log(`🔄 Updated ${name} (visuals and physics).`);
}
