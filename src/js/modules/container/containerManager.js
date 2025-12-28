/**
 * containerManager.js
 * 
 * This module coordinates the container management functionality.
 */

import { createDefaultContainer } from './containerPhysics.js';
import {
    showModal, 
    hideModal, 
    showContainerControls, 
    showSizeControls, 
    showDoorControls, 
    getContainerConfigAndHideModal, 
    handleDiscard 
} from './containerUI.js';

// FIX: Create a module-level variable to hold the container mesh instance.
let _containerMesh = null;

// Export init and the new getContainer function for use in other modules.
export { init as initContainerManager, getContainer, setContainer, getContainerDimensions, getContainerOrigin, getContainerShape };

/**
 * Initializes the container management module.
 * @param {THREE.Scene} mainScene - The main 3D scene.
 */
function init(mainScene) {
    console.log("containerManager.js: init - Start");

    const changeContainerBtn = document.getElementById('change-container-btn');
    if (!changeContainerBtn) { console.error("Missing #change-container-btn in DOM"); return; }
    // ... (other DOM element checks are omitted for brevity but should be present)
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const containerIconBtn = document.getElementById('container-icon-btn');
    const sizeIconBtn = document.getElementById('size-icon-btn');
    const doorIconBtn = document.getElementById('door-icon-btn');
    const arrowIconBtn = document.getElementById('arrow-icon-btn');
    const submitConfirmation = document.getElementById('submit-confirmation');
    const discardConfirmation = document.getElementById('discard-confirmation');
    const confirmSubmitYes = document.getElementById('confirm-submit-yes');
    const confirmSubmitNo = document.getElementById('confirm-submit-no');
    const confirmDiscardYes = document.getElementById('confirm-discard-yes');
    const confirmDiscardNo = document.getElementById('confirm-discard-no');

    // -------------------- Register Event Listeners --------------------
    try {
        changeContainerBtn.addEventListener('click', showModal);
        modalCloseBtn.addEventListener('click', () => discardConfirmation.style.display = 'block');
        containerIconBtn.addEventListener('click', showContainerControls);
        sizeIconBtn.addEventListener('click', showSizeControls);
        doorIconBtn.addEventListener('click', showDoorControls);
        arrowIconBtn.addEventListener('click', () => submitConfirmation.style.display = 'block');
        confirmSubmitYes.addEventListener('click', () => {
            const containerConfig = getContainerConfigAndHideModal();
            if (containerConfig) {
                window.dispatchEvent(new CustomEvent('container-submit', { detail: containerConfig }));
            }
        });
        confirmSubmitNo.addEventListener('click', () => submitConfirmation.style.display = 'none');
        confirmDiscardYes.addEventListener('click', handleDiscard);
        confirmDiscardNo.addEventListener('click', () => discardConfirmation.style.display = 'none');
    } catch (e) {
        console.error("Error attaching event listeners in containerManager:", e);
    }
    console.log("containerManager.js: Event listeners attached.");

    // FIX: Capture the returned container mesh and store it.
    _containerMesh = createDefaultContainer(mainScene);
    if (_containerMesh) {
        console.log("containerManager.js: Container mesh reference stored successfully.");
    } else {
        console.error("containerManager.js: Failed to get a valid container mesh from createDefaultContainer.");
    }

    console.log("containerManager.js: init - Complete");
}

/**
 * FIX: Implement and export a getter function to provide access to the container mesh.
 * This resolves the error `objectManager.getContainer is not a function` by providing the correct interface.
 * @returns {THREE.Object3D | null} The container mesh object, or null if not initialized.
 */
function getContainer() {
    return _containerMesh;
}

/**
 * Sets the module-level container mesh reference.
 * @param {THREE.Object3D} newContainerMesh - The new container mesh to be stored.
 */
function setContainer(newContainerMesh) {
    _containerMesh = newContainerMesh;
    console.log("containerManager.js: Internal container reference updated.");
}

function getContainerDimensions() {
    if (!_containerMesh || !_containerMesh.userData) return null;

    const u = _containerMesh.userData;

    return {
        // 基本尺寸
        width:  u.width,
        height: u.height,
        depth:  u.depth,

        // 外框尺寸：沒有就用內部 width/depth 當外框
        outerWidth: u.outerWidth ?? u.width,
        outerDepth: u.outerDepth ?? u.depth,

        // 缺口尺寸：支援兩種命名 notchWidth / notch_width
        notchWidth:  u.notchWidth  ?? u.notch_width  ?? 0,
        notchDepth:  u.notchDepth  ?? u.notch_depth ?? 0,
    };
    
}
function getContainerOrigin() {
    if (!_containerMesh) return { x: 0, y: 0, z: 0 }; // Return default origin if no container
    return _containerMesh.position.clone();
}

function getContainerShape() {
    if (!_containerMesh || !_containerMesh.userData) return 'default';
    return _containerMesh.userData.shape || 'default';
}
