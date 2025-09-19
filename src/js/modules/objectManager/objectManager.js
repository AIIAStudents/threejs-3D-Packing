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
import { getGroupColor } from './groupColor.js';
import * as physics from '../../utils/physics.js'; // 物理模組

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

/**
 * 類別：ObjectManager
 * 作用：
 * - 管理 Three.js 場景中的物件
 * - 與 API 串接，載入群組物品並顯示
 * - 與 UI (DOM) 綁定互動，支援新增/確認物品
 * - 與 physics.js 整合，保持物理剛體與 mesh 同步
 */
export class ObjectManager {
  constructor(scene, renderCallback) {
    this.scene = scene;               // Three.js 場景
    this.render = renderCallback;     // 渲染回調函式
    this.activeGroupId = null;        // 當前選取的群組 ID
    this.items = [];                  // 當前群組的物品列表
    this.allGroups = [];              // 所有群組列表
    this.selectedObject = null;       // 當前選取的物件

    this._setupEventListeners();      // 設置事件監聽器
  }

  // 設定, 取得 當前被選取的物件
  setSelectedObject(object) {
    this.selectedObject = object;
  }

  getSelectedObject() {
    return this.selectedObject;
  }

  // 取得由 ObjectManager 管理的場景物件
  getSceneObjects() {
    return this.scene.children.filter(child => child.userData.isManagedByObjectManager);
  }

    /**
   * 副程式：_setupEventListeners
   * 作用：
   * - 綁定 UI 與自訂事件，例如 groupSelected 與新增物件按鈕
   * - 觸發群組切換或新增物品流程
   */
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
  /**
     * 副程式：loadItemsForGroup
     * 作用：
     * - 從 API 載入指定群組的物品清單
     * - 渲染清單到 UI 與場景
     */
  async loadItemsForGroup(groupId) {
    if (groupId === null || typeof groupId === 'undefined') {
      this.clearItemsList(); // 清空UI清單
      return;
    }
    console.log(`🔄 Loading items for group ${groupId}...`);
    try {
      let itemsFromApi = await api.getGroupItems(groupId);
      console.log(`[DEBUG] API returned ${itemsFromApi.length} items.`);

      this.items = itemsFromApi; 
      this.renderItemsList();

      // 若場景中不存在此物品，就會新增
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

  /**
   * 副程式：_clearSceneObjects
   * 作用：
   * - 移除場景中由 ObjectManager 管理的物件
   * - 釋放幾何、材質資源並移除物理剛體
   */
  _clearSceneObjects() {
    const objectsToRemove = this.scene.children.filter(child => child.userData.isManagedByObjectManager);
    objectsToRemove.forEach(obj => {
      this.scene.remove(obj);
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

    /**
   * 副程式：renderItemsList
   * 作用：
   * - 渲染目前群組的物品清單到 UI
   * - 若群組無物品，顯示提示文字
   */
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

  // 清空 UI 中所有群組物品清單
  clearItemsList() {
      document.querySelectorAll('.group-items-list').forEach(list => {
          list.innerHTML = '';
          list.classList.add('collapsed');
      });
  }

  /**
   * 副程式：_createItemElement
   * 作用：
   * - 建立物品 DOM 節點，並綁定確認按鈕事件
   */
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

  /**
   * 副程式：addNewCube
   * 作用：
   * - 向 API 新增一個立方體物品 (item_type_id = 3)
   * - 新增完成後重新載入群組物品清單
   */
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

  /**
   * 副程式：update
   * 作用：
   * - 更新場景中物件的 Mesh 與 Physics 同步
   */
  update() {
    this.scene.children.forEach(mesh => {
      if (mesh.userData.isManagedByObjectManager && mesh.userData.body) {
        mesh.position.copy(mesh.userData.body.position);
        mesh.quaternion.copy(mesh.userData.body.quaternion);
      }
    });
  }
}

/**
 * 副程式：addObject
 * 作用：
 * - 將一個新物品 (item) 加入場景
 * - 建立對應的 Three.js Mesh 與 Physics 剛體
 */
export function addObject(scene, item, allGroups = [], itemIndex = 0) {

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
        item.id 
    );
    mesh.userData.body = physicsBody; 
}

/**
 * 副程式：updateObject
 * 作用：
 * - 更新物件的 Mesh (幾何、材質)
 * - 移除舊的 Physics 剛體並建立新的
 * - 更新物件的 userData 與位置
 */
export function updateObject(object, data) {
    const { name, width, height, depth, status } = data;

    object.name = name;
    if (object.geometry) {
        object.geometry.dispose();
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

/**
 * 副程式：updateObjectOpacity
 * 作用：
 * - 根據物件狀態 (pending/confirmed)，更新材質透明度
 */
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

