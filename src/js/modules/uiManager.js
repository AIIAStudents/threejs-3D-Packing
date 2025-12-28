import { addObject, updateObject } from './objectManager/objectManager.js';
import * as api from '../utils/agentAPI.js';

/**
 * UI Manager Module
 * -----------------------
 * 此模組負責管理 3D 物件的使用者介面 (UI)，包括：
 * - 側邊欄物件清單與物件編輯面板 (Modal)
 * - 拖曳新增物件至場景
 * - 物件 hover 與點擊事件 (配合 MouseControls)
 * - 編輯物件尺寸與狀態
 * - 與後端 API 同步更新物件資料
 * - 可調整側邊欄寬度並保存至 localStorage
 * 
 * 提供 initUI(sceneRefs) 作為初始化入口。
 */

// --- DOM Elements --- //
let kebabIcon;

// --- State --- //
let currentlyEditingObject = null;

export function initUI(sceneRefs) {
    // Query for DOM elements
    kebabIcon = document.getElementById('kebab-menu-icon');

    setupEventListeners(sceneRefs);
    initResizer();
    console.log("UI Manager initialized.");
}

function setupEventListeners(sceneRefs) {
    const canvas = sceneRefs.renderer.domElement;

    // --- Drag and Drop (功能已移除) --- //
    // const draggableItem = document.querySelector('.item-icon-button');
    // draggableItem.addEventListener('dragstart', (e) => {
    //     const itemTypeId = e.target.closest('.item-icon-button').dataset.itemTypeId;
    //     e.dataTransfer.setData('text/plain', itemTypeId);
    // });

    canvas.addEventListener('dragover', (e) => e.preventDefault());

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const itemTypeId = e.dataTransfer.getData('text/plain');
        if (itemTypeId) {
            const newItemData = {
                name: `Cube-${Math.round(Date.now() / 1000)}`,
                id: `temp-${Date.now()}`,
                type: 'cube',
                width: 10, height: 10, depth: 10,
                status: 'pending'
            };
            addObject(sceneRefs.scene, newItemData);
        }
    });

    // --- Hover and Click Events from MouseControls --- //
    canvas.addEventListener('objecthover', updateKebabMenu);
}

function updateKebabMenu(event) {
    const { object, pointerEvent } = event.detail;
    if (object) {
        kebabIcon.style.display = 'block';
        kebabIcon.style.left = `${pointerEvent.clientX + 15}px`;
        kebabIcon.style.top = `${pointerEvent.clientY - 15}px`;
    } else {
        kebabIcon.style.display = 'none';
    }
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const leftSidebar = document.getElementById('left-sidebar');

    const storedWidth = localStorage.getItem('sidebarWidth');
    if (storedWidth) {
        leftSidebar.style.width = `${storedWidth}px`;
    }

    const mouseMoveHandler = (e) => {
        e.preventDefault();
        const newWidth = e.clientX;
        if (newWidth > 200 && newWidth < 600) {
            leftSidebar.style.width = `${newWidth}px`;
        }
    };

    const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        localStorage.setItem('sidebarWidth', leftSidebar.style.width);
    };

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
}

const OVERLAY_IDS = [
  'item-edit-modal',
  'add-item-modal',
  'control-weight-editor',
  'group-flow-editor',
  'container-modal',
  'space-planning-view' // Register the new UI panel
];

let activeModalTrigger = null;

/**
 * Manages the display of exclusive UI panels (modals, editors).
 * Handles focus trapping, aria-hidden attributes, and inertness of background content.
 * @param {string | null} targetId - The ID of the panel to show, or null to hide all.
 * @param {{ trigger?: HTMLElement }} [options] - Optional parameters.
 */
export function showExclusiveUI(targetId, options = {}) {
  console.log(`DEBUG: showExclusiveUI called with targetId: '${targetId}'`); // DEBUG LOG
  const appContainer = document.getElementById('app');
  
  // --- Hide all overlays first ---
  OVERLAY_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && id !== targetId) {
      el.style.display = 'none';
      el.inert = true;
    }
  });

  // --- Show the target overlay ---
  if (targetId) {
    const target = document.getElementById(targetId);
    if (target) {
      console.log(`DEBUG: Target element #${targetId} found, setting display to flex.`); // DEBUG LOG
      // Make background inert
      if (appContainer) appContainer.inert = true;

      // Store the trigger element
      activeModalTrigger = options.trigger || document.activeElement;

      // Show the modal
      target.style.display = 'flex'; // Use flex for centering
      target.inert = false;
      
      // Focus the first focusable element inside the modal
      const firstFocusable = target.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      }
      
      // Add Escape key listener (remove first to prevent duplicates)
      document.removeEventListener('keydown', handleEscapeKey);
      document.addEventListener('keydown', handleEscapeKey);

    } else {
      console.warn(`[showExclusiveUI] target #${targetId} not found`);
    }
  } 
  // --- Or hide all (when targetId is null) ---
  else {
    // Make background interactive again
    if (appContainer) appContainer.inert = false;

    // Return focus to the original trigger
    if (activeModalTrigger && typeof activeModalTrigger.focus === 'function') {
      activeModalTrigger.focus();
    }
    activeModalTrigger = null;
    
    document.removeEventListener('keydown', handleEscapeKey);
  }
}

function handleEscapeKey(event) {
    if (event.key === 'Escape') {
        showExclusiveUI(null);
    }
}
