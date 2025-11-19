import { initScene, animate, disposeScene, updateContainer } from './modules/sceneManager.js';
import { postJSON, GROUPS_AND_RL_BASE_URL } from './utils/agentAPI.js';
import { initContainerManager, getContainerDimensions, getContainerOrigin, getContainerShape } from './modules/container/containerManager.js';
import { initUI } from './modules/uiManager.js';
import { initViewControls } from './modules/uiControls.js'; // 引入視圖控制模組
import SpacePlanningManager from './modules/spacePlanningManager.js'; // Import the new Space Planning Manager
import { initFlowEditor, GroupManager } from './modules/flowEditorManager.js'; // Renamed for clarity, added GroupManager
import { initBatchAddManager } from './modules/batchAddManager.js'; // Import the new manager
import { initControlWeightManager } from './modules/controlWeightManager.js'; // Import the Control Weight manager
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
  try {
    console.log('main.js: Before initUI call');
    initUI(sceneRefs);
    console.log('main.js: After initUI call');
  } catch (error) {
    console.error('Error initializing main UI (uiManager):', error);
  }

  // 5) 初始化視圖控制 UI
  try {
    console.log('main.js: Before initViewControls call');
    const axesHelper = sceneRefs.scene.getObjectByName('mainAxesHelper');
    initViewControls(sceneRefs.scene, axesHelper);
    console.log('main.js: After initViewControls call');
  } catch (error) {
    console.error('Error initializing view controls (uiControls):', error);
  }

  // 6) 初始化 Group Management 和 Packing Management
  try {
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

    // Initialize Batch Add Manager
    initBatchAddManager(sceneRefs);

    // Initialize Control Weight Manager
    initControlWeightManager(objectManager);
    
    console.log('main.js: After Group/Packing Manager init');
  } catch (error) {
    console.error('Error initializing core managers (Group/Packing/Flow/Batch):', error);
  }

  // 7) 啟動渲染循環
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

  // 8) 監聽容器變更事件
  window.addEventListener('containerChanged', (event) => {
    console.log('main.js: containerChanged event received.');
    updateContainer(sceneRefs.scene, event.detail);
  });

  // 9) 監聽容器提交事件
  window.addEventListener('container-submit', async (event) => {
    const containerConfig = event.detail;
    if (!containerConfig) {
        console.error('Container-submit event fired without config data.');
        return;
    }

    try {
        console.log('Submitting container configuration from main.js:', containerConfig);
        const data = await postJSON(`${GROUPS_AND_RL_BASE_URL}/save_container_config`, containerConfig);
        console.log('Container configuration successfully saved:', data.message);
        alert('容器設定已成功儲存！');
    } catch (error) {
        console.error('Error saving container configuration:', error);
        alert(`儲存容器設定時發生錯誤: ${error.message}`);
    }
  });

  console.log('main.js: End of DOMContentLoaded');

  // --- Event Listener for Space Planning ---
  const planningBtn = document.getElementById('execute-packing-btn');
  if(planningBtn) {
    console.log("DEBUG: 'execute-packing-btn' found and listener is being attached.");
    planningBtn.addEventListener('click', () => {
      console.log("[PACK] Planning button clicked");
      
      const dims = getContainerDimensions();
      const shape = getContainerShape();
      const origin = getContainerOrigin();
      
      if (!dims) { 
          console.error("[PACK] Container dimensions are missing. Cannot open planner."); 
          alert("錯誤：無法獲取容器尺寸。無法開啟規劃器。");
          return; 
      }

      SpacePlanningManager.init({
          scene: sceneRefs.scene,
          shape: shape,
          dimensions: dims,
          origin: origin,
          groupManager: sceneRefs.groupManager
      });
    });
  }

  // --- 側邊欄切換功能 ---
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const appContainer = document.getElementById('app');

  if (sidebarToggle && appContainer) {
    sidebarToggle.addEventListener('click', () => {
      appContainer.classList.toggle('sidebar-collapsed');
    });
  } else {
    console.error('Sidebar toggle button or app container not found.');
  }

  // --- Event Listener for Scene Updates from Packing ---
  document.addEventListener('packedPositionsReady', (event) => {
    const { uuid, position, dimensions } = event.detail;
    if (window.objectManager?.updateItemPlacement) {
      console.log(`[Event] Triggering placement update for ${uuid}`);
      window.objectManager.updateItemPlacement(uuid, position, dimensions);
    }
  });

  document.addEventListener('sceneNeedsRender', () => {
    console.log('[Event] Triggering manual re-render.');
    if (sceneRefs.renderer && sceneRefs.scene && sceneRefs.camera) {
      sceneRefs.renderer.render(sceneRefs.scene, sceneRefs.camera);
    }
  });
});
