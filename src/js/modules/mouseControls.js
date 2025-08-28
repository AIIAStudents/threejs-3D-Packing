import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// 滑鼠控制模組
export class MouseControls {
  constructor(camera, renderer, objectManager, controls) {
    this.camera = camera;
    this.renderer = renderer;
    this.objectManager = objectManager;
    this.controls = controls;
    
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.isDragging = false;
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();
    this.isShiftPressed = false;
    this.boundary = new THREE.Box3(new THREE.Vector3(-60, 0, -60), new THREE.Vector3(60, 120, 60)); // 容器邊界
    
    this.setupEventListeners();
  }

    // 初始化監聽
  setupEventListeners() {
    const canvas = this.renderer.domElement;
  
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Shift') {
        this.isShiftPressed = true;
        this.controls.enabled = true;
      }
    });
  
    document.addEventListener('keyup', (event) => {
      if (event.key === 'Shift') {
        this.isShiftPressed = false;
        this.controls.enabled = false;
      }
    });
  
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return; // 左鍵
      if (!this.isShiftPressed) {
        this.onPointerDown(event);
      }
    });
  
    canvas.addEventListener('pointermove', (event) => {
      if (this.isDragging && !this.isShiftPressed) {
        this.onPointerMove(event);
      }
    });
  
    document.addEventListener('pointerup', (event) => this.onPointerUp(event));
    document.addEventListener('pointercancel', (event) => this.onPointerUp(event));
  }
  
  onPointerUp(event) {
    const canvas = this.renderer.domElement;
    try { canvas.releasePointerCapture(event.pointerId); } catch (e) {}
  
    if (this.isDragging) {
      const selectedObject = this.objectManager.getSelectedObject();
      if (selectedObject?.body) {
        selectedObject.body.type = CANNON.Body.DYNAMIC;
        selectedObject.body.wakeUp();
      }
      this.objectManager.setSelectedObject(null);
    }
  
    // 這行放到 if 外，保證一定會重置
    this.isDragging = false;
  }
    
  onPointerDown(event) {
    // 只接受左鍵
    if (event.button !== 0) return;
  
    const canvas = this.renderer.domElement;
    canvas.setPointerCapture(event.pointerId); // 保證收到後續 pointermove
  
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.objectManager.getObjects();
    const intersects = this.raycaster.intersectObjects(objects.map(obj => obj.mesh));
  
    if (intersects.length === 0) return;
  
    const selectedObject = objects.find(obj => obj.mesh === intersects[0].object);
    this.objectManager.setSelectedObject(selectedObject);
    this.isDragging = true;
  
    // 建立拖曳平面（使用相機方向，過滑鼠點）
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir, intersects[0].point.clone());

    // 物件世界座標
    const objWorldPos = selectedObject.mesh.getWorldPosition(new THREE.Vector3());

    // 計算 "滑鼠交點在平面上的位置"
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);

    // offset = 滑鼠平面交點 - 物件中心
    this.dragOffset.copy(intersectPoint).sub(objWorldPos);

    // 改變物理 body 型態（若有）
    if (selectedObject.body) {
      selectedObject.body.type = CANNON.Body.KINEMATIC;
      selectedObject.body.velocity.set(0,0,0);
      selectedObject.body.angularVelocity.set(0,0,0);
    }
  }
  
  onPointerMove(event) {
    if (!this.isDragging) return;
  
    const selectedObject = this.objectManager.getSelectedObject();
    if (!selectedObject) return;
  
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectPoint = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) return;
  
    // 計算新的 world 位置（保持當初的 offset）
    const targetWorld = intersectPoint.clone().sub(this.dragOffset);
  
    // 在 world 座標做邊界限制（Box3 的 min/max 要與 world 座標一致）
    const objectSize = new THREE.Vector3();
    new THREE.Box3().setFromObject(selectedObject.mesh).getSize(objectSize);
    const halfSize = objectSize.multiplyScalar(0.5);

    const clampedWorld = targetWorld.clone().clamp(
        this.boundary.min.clone().add(halfSize),
        this.boundary.max.clone().sub(halfSize)
    );
  
    // 轉回 local
    let localPos = clampedWorld.clone();
    if (selectedObject.mesh.parent) {
      localPos = selectedObject.mesh.parent.worldToLocal(clampedWorld.clone());
    }

    selectedObject.mesh.position.copy(localPos);

    // 同步 physics body
    if (selectedObject.body) {
      selectedObject.body.position.copy(clampedWorld);
    }
  }
  // 檢查是否正在拖曳
  isDraggingObject() {
    return this.isDragging;
  }

  // 獲取選中的物件
  getSelectedObject() {
    return this.objectManager.getSelectedObject();
  }
}