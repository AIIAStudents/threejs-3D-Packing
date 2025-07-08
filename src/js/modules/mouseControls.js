import * as THREE from 'three';

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
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    const canvas = this.renderer.domElement;

    // 監聽Shift鍵
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Shift') {
        this.isShiftPressed = true;
        this.controls.enabled = true;
        console.log('Shift pressed - camera controls enabled');
      }
    });

    document.addEventListener('keyup', (event) => {
      if (event.key === 'Shift') {
        this.isShiftPressed = false;
        this.controls.enabled = false;
        console.log('Shift released - object dragging enabled');
      }
    });

    canvas.addEventListener('pointerdown', (event) => {
      this.onPointerDown(event);
    });

    canvas.addEventListener('pointermove', (event) => {
      this.onPointerMove(event);
    });

    canvas.addEventListener('pointerup', () => {
      this.onPointerUp();
    });
  }

  onPointerDown(event) {
    // 如果按住Shift，不處理物件拖曳
    if (this.isShiftPressed) {
      console.log('Shift pressed, ignoring object drag');
      return;
    }
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objects = this.objectManager.getObjects();
    const intersects = this.raycaster.intersectObjects(objects.map(obj => obj.mesh));
    
    console.log('Objects found:', objects.length);
    console.log('Intersects found:', intersects.length);
    
    if (intersects.length > 0) {
      const selectedObject = objects.find(obj => obj.mesh === intersects[0].object);
      this.objectManager.setSelectedObject(selectedObject);
      this.isDragging = true;
      console.log('Started dragging object:', selectedObject.name);
      
      // 設置拖曳平面
      this.dragPlane.setFromNormalAndCoplanarPoint(
        this.camera.getWorldDirection(new THREE.Vector3()),
        intersects[0].point
      );
      
      this.dragOffset.subVectors(intersects[0].point, selectedObject.mesh.position);
    }
  }

  onPointerMove(event) {
    // 如果按住Shift，不處理物件拖曳
    if (this.isShiftPressed) return;
    
    if (!this.isDragging) return;
    
    const selectedObject = this.objectManager.getSelectedObject();
    if (!selectedObject) return;
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectPoint = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
      selectedObject.mesh.position.copy(intersectPoint.sub(this.dragOffset));
      console.log('Moving object to:', selectedObject.mesh.position);
    }
  }

  onPointerUp() {
    if (this.isDragging) {
      console.log('Stopped dragging object');
    }
    this.isDragging = false;
    this.objectManager.setSelectedObject(null);
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

