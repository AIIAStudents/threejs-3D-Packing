import { initScene, animate, disposeScene } from './modules/sceneManager.js';
import { initContainerManager } from './modules/containerManager.js';
import { initUI } from './modules/uiManager.js';
import { initFlowEditor, GroupManager } from './modules/flowEditorManager.js'; // Renamed for clarity, added GroupManager
import { MouseControls } from './modules/mouseControls.js';
import { ObjectManager } from './modules/objectManager/objectManager.js';
import { PackingManager } from './modules/packingManager/packingManager.js'; // Added PackingManager
import * as physics from './utils/physics.js'; // ADDED PHYSICS IMPORT

// 全域參考（debug 用）
let sceneRefs = {};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Application starting...');
  console.log('main.js: Before initScene');
  // 1) 初始化場景（Three.js + Cannon）
  sceneRefs = initScene();
  console.log('main.js: After initScene');
  physics.initPhysics(); // INITIALIZE PHYSICS WORLD
  console.log('main.js: After physics.initPhysics (commented)');

  // 1.5) 初始化物件管理器
  const objectManager = new ObjectManager(sceneRefs.scene, null); // The render callback is not used in the current ObjectManager
  sceneRefs.objectManager = objectManager;
  console.log('main.js: After ObjectManager init');

  // 2) 初始化滑鼠控制
  // NOTE: This must be initialized after the scene and its objects are ready.
  new MouseControls(sceneRefs.camera, sceneRefs.renderer, sceneRefs.scene, sceneRefs.objectManager, sceneRefs.controls);
  console.log('main.js: After MouseControls init');

  // 3) 初始化容器
  console.log('main.js: Before initContainerManager call');
  initContainerManager(sceneRefs.scene);
  console.log('main.js: After initContainerManager call');

  // 4) 初始化 UI
  console.log('main.js: Before initUI call');
  initUI(sceneRefs);
  console.log('main.js: After initUI call');

  // 5) 初始化 Group Management 和 Packing Management
  console.log('main.js: Before Group/Packing Manager init');
  
  // Initialize GroupManager
  const groupManager = new GroupManager(sceneRefs.scene, sceneRefs.objectManager);
  await groupManager.init(); // It's async, so await it
  sceneRefs.groupManager = groupManager; // Store it in sceneRefs if needed elsewhere

  // Initialize PackingManager
  const packingManager = new PackingManager(groupManager);
  sceneRefs.packingManager = packingManager; // Store it in sceneRefs if needed elsewhere

  // Initialize FlowEditor (which uses GroupManager and PackingManager)
  initFlowEditor(sceneRefs, packingManager, groupManager); // Pass packingManager and groupManager
  console.log('main.js: After Group/Packing Manager init');

  // 6) 啟動渲染循環
  try {
    console.log('main.js: Before animate call');
    animate(sceneRefs);
    console.log("main.js: animate function called successfully.");
  } catch (error) {
    console.error("main.js: Error calling animate function:", error);
  }
  console.log('main.js: After animate block');

  // 7) 窗口事件
  window.addEventListener('beforeunload', () => {
    disposeScene(sceneRefs);
  });
  console.log('main.js: End of DOMContentLoaded');
});
