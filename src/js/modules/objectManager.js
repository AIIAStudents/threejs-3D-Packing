// 物件管理模組
export class ObjectManager {
  constructor() {
    this.objectCount = 0;
    this.objects = [];
    this.selectedObject = null;
  }

  // 添加物件到列表
  addObjectToList(item) {
    const objectsList = document.getElementById('objects-list');
    const objectItem = document.createElement('div');
    objectItem.className = 'object-item';
    objectItem.dataset.id = item.id;
    
    objectItem.innerHTML = `
      <div class="object-info">
        <div class="object-name">${item.name}</div>
      </div>
      <div class="object-actions">
        <button class="menu-btn" onclick="window.objectManager.showItemMenu('${item.id}')">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
    `;
    
    objectsList.appendChild(objectItem);
  }

  // 顯示物件選單
  showItemMenu(itemId) {
    const item = this.objects.find(obj => obj.id === itemId);
    if (!item) return;
    
    // 設置選中的物件
    this.selectedObject = item;
    
    // 填充物件屬性工具列
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-type').value = item.type;
    
    // 顯示對應的參數區塊
    this.showObjectTypeParams(item.type);
    
    // 填充顏色
    const color = '#' + item.mesh.material.color.getHexString();
    document.getElementById('item-color').value = color;
    
    // 填充透明度
    document.getElementById('item-opacity').value = item.mesh.material.opacity;
    document.getElementById('opacity-value').textContent = item.mesh.material.opacity;
    
    // 顯示工具列
    document.getElementById('item-toolbar').style.display = 'block';
    
    // 設置更新模式
    document.getElementById('create-item-btn').textContent = '更新物件';
    document.getElementById('create-item-btn').onclick = () => this.updateItem(itemId);
    
    // 設置工具列事件監聽器
    this.setupToolbarEventListeners();
  }

  // 顯示物件類型參數
  showObjectTypeParams(type) {
    // 隱藏所有參數區塊
    const paramSections = ['cube-params', 'sphere-params', 'cylinder-params', 'icosahedron-params', 'irregular-params'];
    paramSections.forEach(section => {
      document.getElementById(section).style.display = 'none';
    });
    
    // 顯示對應的參數區塊
    const targetSection = `${type}-params`;
    const element = document.getElementById(targetSection);
    if (element) {
      element.style.display = 'block';
    }
  }

  // 設置工具列事件監聽器
  setupToolbarEventListeners() {
    // 實時更新物件屬性
    const inputs = [
      'item-color', 'item-opacity'
    ];
    
    inputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('input', () => this.updateSelectedObject());
      }
    });
    
    // 添加刪除物件按鈕事件
    document.getElementById('delete-item-btn').addEventListener('click', () => {
      if (this.selectedObject && window.confirm('確定要刪除這個物件嗎？')) {
        this.deleteObject(this.selectedObject);
        document.getElementById('item-toolbar').style.display = 'none';
      }
    });
  }

  // 更新選中的物件
  updateSelectedObject() {
    if (!this.selectedObject) return;
    
    const mesh = this.selectedObject.mesh;
    
    // 更新顏色
    const color = document.getElementById('item-color').value;
    mesh.material.color.setHex(parseInt(color.replace('#', ''), 16));
    
    // 更新透明度
    const opacity = parseFloat(document.getElementById('item-opacity').value) || 0.9;
    mesh.material.opacity = opacity;
    mesh.material.transparent = opacity < 1;
  }

  // 刪除物件
  deleteObject(item) {
    // 從場景中移除
    if (window.scene) {
      window.scene.remove(item.mesh);
    }
    
    // 從物件陣列中移除
    const index = this.objects.findIndex(obj => obj.id === item.id);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
    
    // 從物理引擎中移除
    if (window.removePhysicsObject) {
      window.removePhysicsObject(item.mesh);
    }
    
    // 清理資源
    if (item.mesh.geometry) {
      item.mesh.geometry.dispose();
    }
    if (item.material) {
      item.material.dispose();
    }
    
    // 從物件列表中移除
    const objectItem = document.querySelector(`[data-id="${item.id}"]`);
    if (objectItem) {
      objectItem.remove();
    }
    
    // 清除選中的物件
    this.selectedObject = null;
    
    console.log(`Deleted object: ${item.name}`);
  }

  // 更新物件
  updateItem(itemId) {
    const item = this.objects.find(obj => obj.id === itemId);
    if (!item) return;
    
    const name = document.getElementById('item-name').value;
    
    // 更新物件屬性
    item.name = name;
    
    // 更新列表顯示
    const objectItem = document.querySelector(`[data-id="${itemId}"]`);
    if (objectItem) {
      objectItem.querySelector('.object-name').textContent = name;
    }
    
    // 隱藏面板
    document.getElementById('item-toolbar').style.display = 'none';
  }

  // 獲取物件列表
  getObjects() {
    return this.objects;
  }

  // 添加物件
  addObject(item) {
    this.objects.push(item);
    this.objectCount++;
    this.addObjectToList(item);
  }

  // 獲取物件計數
  getObjectCount() {
    return this.objectCount;
  }

  // 獲取選中的物件
  getSelectedObject() {
    return this.selectedObject;
  }

  // 設置選中的物件
  setSelectedObject(object) {
    this.selectedObject = object;
  }
}
