/**
 * containerManager.js
 * 
 * 這是容器管理功能的核心協調器模組。
 * 主要職責包括：
 * - 作為功能的初始化入口 (init)。
 * - 註冊主要的 DOM 事件監聽器 (例如打開視窗、確認、取消等)。
 * - 呼叫其他專職模組 (UI, Scene, Physics) 的方法來完成具體任務。
 * - 在主場景中創建預設的容器物理實體。
 * 這個模組本身不包含複雜的實現邏輯，而是專注於協調和串聯其他模組。
 */

import { createDefaultContainer } from './containerPhysics.js';
import {
    showModal, 
    hideModal, 
    showContainerControls, 
    showSizeControls, 
    showDoorControls, 
    handleSubmit, 
    handleDiscard 
} from './containerUI.js';

// 導出 init 給 main.js 使用
export { init as initContainerManager };

/**
 * 初始化容器管理模組
 * @param {THREE.Scene} mainScene - 主 3D 場景，用於創建物理邊界。
 */
function init(mainScene) {
    console.log("containerManager.js: init - Start");

    // 獲取 DOM 元素
    const changeContainerBtn = document.getElementById('change-container-btn');
    if (!changeContainerBtn) { console.error("Missing #change-container-btn in DOM"); return; }
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (!modalCloseBtn) { console.error("Missing #modal-close-btn in DOM"); return; }
    const containerIconBtn = document.getElementById('container-icon-btn');
    if (!containerIconBtn) { console.error("Missing #container-icon-btn in DOM"); return; }
    const sizeIconBtn = document.getElementById('size-icon-btn');
    if (!sizeIconBtn) { console.error("Missing #size-icon-btn in DOM"); return; }
    const doorIconBtn = document.getElementById('door-icon-btn');
    if (!doorIconBtn) { console.error("Missing #door-icon-btn in DOM"); return; }
    const arrowIconBtn = document.getElementById('arrow-icon-btn');
    if (!arrowIconBtn) { console.error("Missing #arrow-icon-btn in DOM"); return; }
    const submitConfirmation = document.getElementById('submit-confirmation');
    if (!submitConfirmation) { console.error("Missing #submit-confirmation in DOM"); return; }
    const discardConfirmation = document.getElementById('discard-confirmation');
    if (!discardConfirmation) { console.error("Missing #discard-confirmation in DOM"); return; }
    const confirmSubmitYes = document.getElementById('confirm-submit-yes');
    if (!confirmSubmitYes) { console.error("Missing #confirm-submit-yes in DOM"); return; }
    const confirmSubmitNo = document.getElementById('confirm-submit-no');
    if (!confirmSubmitNo) { console.error("Missing #confirm-submit-no in DOM"); return; }
    const confirmDiscardYes = document.getElementById('confirm-discard-yes');
    if (!confirmDiscardYes) { console.error("Missing #confirm-discard-yes in DOM"); return; }
    const confirmDiscardNo = document.getElementById('confirm-discard-no');
    if (!confirmDiscardNo) { console.error("Missing #confirm-discard-no in DOM"); return; }

    // -------------------- 註冊事件監聽 --------------------
    try {
        // 主要按鈕
        changeContainerBtn.addEventListener('click', showModal);
        modalCloseBtn.addEventListener('click', () => discardConfirmation.style.display = 'block');

        // 彈出視窗內的圖示按鈕
        containerIconBtn.addEventListener('click', showContainerControls);
        sizeIconBtn.addEventListener('click', showSizeControls);
        doorIconBtn.addEventListener('click', showDoorControls);
        arrowIconBtn.addEventListener('click', () => submitConfirmation.style.display = 'block');

        // 確認對話框按鈕
        confirmSubmitYes.addEventListener('click', handleSubmit);
        confirmSubmitNo.addEventListener('click', () => submitConfirmation.style.display = 'none');
        confirmDiscardYes.addEventListener('click', handleDiscard);
        confirmDiscardNo.addEventListener('click', () => discardConfirmation.style.display = 'none');

    } catch (e) {
        console.error("Error attaching event listeners in containerManager:", e);
    }
    console.log("containerManager.js: Event listeners attached.");

    // 在主場景中創建預設的物理容器
    createDefaultContainer(mainScene);
    console.log("containerManager.js: init - Complete");
}