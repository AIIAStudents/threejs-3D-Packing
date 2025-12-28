import * as THREE from 'three';
import * as CANNON from 'cannon-es';
/**
 * MouseControls
 * 管理滑鼠對 Three.js 場景中物件的懸停、點擊與拖曳操作
 * 支援：
 * - Shift + 拖曳控制相機
 * - 點擊選取物件
 * - 拖曳物件（考慮物理剛體與邊界限制）
 */
export class MouseControls {
    /**
   * @param {THREE.Camera} camera - 場景攝影機
   * @param {THREE.Renderer} renderer - Three.js 渲染器
   * @param {THREE.Scene} scene - 場景參考
   * @param {ObjectManager} objectManager - 管理選取物件的物件管理器
   * @param {THREE.OrbitControls} controls - 相機控制器
   */

  constructor(camera, renderer, scene, objectManager, controls) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene; // 新增 scene 參考
    this.objectManager = objectManager;
    this.controls = controls;
    
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.isDragging = false;                  // 是否正在拖曳物件
    this.dragPlane = new THREE.Plane();       // 拖曳平面
    this.dragOffset = new THREE.Vector3();    // 拖曳偏移量
    this.isShiftPressed = false;              // shift 鍵狀態
    this.boundary = new THREE.Box3(           // 拖曳邊界限制
      new THREE.Vector3(-60, 0, -60),
      new THREE.Vector3(60, 120, 60)
    );

    this.hoveredObject = null; // 追蹤懸停的物件
    
    this.setupEventListeners();
  }

  // 初始化監聽
  setupEventListeners() {
    const canvas = this.renderer.domElement;
  
    this.controls.enabled = false;

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
  
    // 將 pointermove 分為 hover 和 drag
    canvas.addEventListener('pointermove', (event) => {
      if (this.isDragging) {
        this.onPointerDrag(event);
      } else {
        this.onPointerHover(event);
      }
    });
  
    document.addEventListener('pointerup', (event) => this.onPointerUp(event));
    document.addEventListener('pointercancel', (event) => this.onPointerUp(event));
  }

  onPointerHover(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // 尋找第一個可互動的物件 (有 userData.id)
    const foundIntersect = intersects.find(i => i.object.userData.id);
    const newHoveredObject = foundIntersect ? foundIntersect.object : null;

    if (this.hoveredObject !== newHoveredObject) {
      this.hoveredObject = newHoveredObject;
      
      // 發送自訂事件
      const hoverEvent = new CustomEvent('objecthover', {
        detail: { 
          object: this.hoveredObject,
          pointerEvent: event
        }
      });
      this.renderer.domElement.dispatchEvent(hoverEvent);
    }
  }
  
  onPointerDown(event) {
    if (this.isShiftPressed) return; // If Shift is pressed, allow camera controls

    this.raycaster.setFromCamera(this.pointer, this.camera); // Re-set raycaster for accurate click point

    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    const foundIntersect = intersects.find(i => i.object.userData.id); // Find the clicked object

    if (foundIntersect) {
      this.isDragging = true;
      this.objectManager.setSelectedObject(foundIntersect.object); // Set the selected object for dragging

      // Calculate drag plane and offset
      this.dragPlane.setFromNormalAndCoplanarPoint(
        this.camera.getWorldDirection(this.dragPlane.normal),
        foundIntersect.point
      );
      this.dragOffset.copy(foundIntersect.point).sub(foundIntersect.object.position);

      // If the object has a physics body, make it kinematic during drag
      if (foundIntersect.object.userData.body) {
        foundIntersect.object.userData.body.type = CANNON.Body.KINEMATIC;
        foundIntersect.object.userData.body.sleep(); // Put to sleep to prevent physics interference
      }

      // Dispatch click event if needed (keeping existing functionality)
      const clickEvent = new CustomEvent('objectclick', {
        detail: { object: foundIntersect.object }
      });
      this.renderer.domElement.dispatchEvent(clickEvent);
    }
  }

  onPointerUp(event) {
    if (this.isDragging) {
      const selectedObject = this.objectManager.getSelectedObject();
      if (selectedObject?.userData.body) {
        const body = selectedObject.userData.body;
        body.type = CANNON.Body.DYNAMIC;
        body.velocity.set(0, -10, 0); // Give it a nudge to ensure it falls
        body.wakeUp();
      }
      this.objectManager.setSelectedObject(null);
    }
    this.isDragging = false;
  }
    
  onPointerDrag(event) {
    if (!this.isDragging) return;
  
    const selectedObject = this.objectManager.getSelectedObject();
    if (!selectedObject) return;
  
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectPoint = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) return;
  
    const targetWorld = intersectPoint.clone().sub(this.dragOffset);
  
    const objectSize = new THREE.Vector3();
    new THREE.Box3().setFromObject(selectedObject).getSize(objectSize);
    const halfSize = objectSize.multiplyScalar(0.5);

    const clampedWorld = targetWorld.clone().clamp(
        this.boundary.min.clone().add(halfSize),
        this.boundary.max.clone().sub(halfSize)
    );
  
    let localPos = clampedWorld.clone();
    if (selectedObject.parent) {
      localPos = selectedObject.parent.worldToLocal(clampedWorld.clone());
    }

    selectedObject.position.copy(localPos);

    if (selectedObject.userData.body) {
      selectedObject.userData.body.position.copy(clampedWorld);
    }
  }

  isDraggingObject() {
    return this.isDragging;
  }

  getSelectedObject() {
    return this.objectManager.getSelectedObject();
  }
}
