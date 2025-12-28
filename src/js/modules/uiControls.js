import * as THREE from 'three';

/**
 * 創建一個始終面向攝影機的文字標籤 Sprite。
 * @param {string} text - 要顯示的文字。
 * @param {THREE.Vector3} position - 標籤在世界座標中的位置。
 * @param {number} [fontSize=48] - 文字的字體大小。
 * @returns {THREE.Sprite} 創建的文字標籤 Sprite。
 */
function createAxisLabel(text, position, fontSize = 48) { // 字體縮小
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = `Bold ${fontSize}px Arial`;
    context.font = font;

    // 測量文字寬度以設定畫布大小
    const metrics = context.measureText(text);
    const textWidth = metrics.width;

    canvas.width = textWidth;
    canvas.height = fontSize;
    
    // 重新設定字體，因為畫布大小改變會重置 context
    context.font = font;
    context.fillStyle = 'rgba(0, 0, 0, 0.9)'; // 顏色改為黑色
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true,
        depthTest: false, // 確保標籤不會被其他物體遮擋
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);

    // 調整 Sprite 的大小，使其在場景中具有合理的尺寸
    const scale = 10; // 調整縮放比例
    sprite.scale.set(scale, scale * (canvas.height / canvas.width), 1);

    return sprite;
}

/**
 * 顯示與打包結果相關的控制圖標。
 */
export function showPackingControls() {
    const toggleFloorBtn = document.getElementById('toggle-floor-btn');
    const togglePartitionsBtn = document.getElementById('toggle-partitions-btn');
    if (toggleFloorBtn) {
        toggleFloorBtn.style.display = 'flex';
    }
    if (togglePartitionsBtn) {
        togglePartitionsBtn.style.display = 'flex';
    }
}

/**
 * 初始化右上角的視圖控制圖標。
 * @param {THREE.Scene} scene - Three.js 場景物件。
 * @param {THREE.AxesHelper} axesHelper - 原始的座標軸輔助物件。
 */
export function initViewControls(scene, axesHelper) {
    // --- 1. 創建座標軸與其標籤的群組 ---
    const axesGroup = new THREE.Group();
    axesGroup.name = 'axesGroup';
    axesGroup.add(axesHelper.clone()); // 將原始 helper 的複製品加入群組

    const axisLength = 100; // 與 AxesHelper 的大小保持一致
    const labelOffset = 10; // 標籤與軸末端的距離

    const xLabel = createAxisLabel('X', new THREE.Vector3(axisLength + labelOffset, 0, 0));
    const yLabel = createAxisLabel('Y', new THREE.Vector3(0, axisLength + labelOffset, 0));
    const zLabel = createAxisLabel('Z', new THREE.Vector3(0, 0, axisLength + labelOffset));
    
    axesGroup.add(xLabel, yLabel, zLabel);
    scene.add(axesGroup);

    // 隱藏原始的 axesHelper，由 group 控制
    if (axesHelper) {
        axesHelper.visible = false;
    }

    // --- 2. 獲取 DOM 元素 ---
    const toggleAxisBtn = document.getElementById('toggle-axis-btn');
    const toggleFloorBtn = document.getElementById('toggle-floor-btn');
    const togglePartitionsBtn = document.getElementById('toggle-partitions-btn');

    if (!toggleAxisBtn || !toggleFloorBtn || !togglePartitionsBtn) {
        console.error('一個或多個視圖控制按鈕未在 DOM 中找到。');
        return;
    }

    // Hide controls by default
    toggleFloorBtn.style.display = 'none';
    togglePartitionsBtn.style.display = 'none';

    // --- 3. 綁定事件監聽器 ---
    
    // 座標軸切換
    toggleAxisBtn.addEventListener('click', () => {
        axesGroup.visible = !axesGroup.visible;
        toggleAxisBtn.classList.toggle('toggled-off');
    });

    // 分配空間 (Floor) 切換
    toggleFloorBtn.addEventListener('click', () => {
        const partitionGroup = scene.getObjectByName('partitionGroup');
        if (partitionGroup) {
            let isVisible = false;
            partitionGroup.traverse(child => {
                if (child.isMesh || child.isLineSegments) {
                    child.visible = !child.visible;
                    isVisible = child.visible; // 記錄最後一個物件的可見性狀態
                }
            });
            // 根據子物件的狀態來決定按鈕是否顯示為 "toggled-off"
            if (isVisible) {
                toggleFloorBtn.classList.remove('toggled-off');
            } else {
                toggleFloorBtn.classList.add('toggled-off');
            }
        } else {
            console.warn('Partition group 物件不存在於場景中。');
        }
    });

    // 容器分割標籤 (product-development) 切換
    togglePartitionsBtn.addEventListener('click', () => {
        const partitionGroup = scene.getObjectByName('partitionGroup');
        if (partitionGroup) {
            let isVisible = false;
            partitionGroup.traverse(child => {
                if (child.isSprite) { // 文字標籤是 Sprite
                    child.visible = !child.visible;
                    isVisible = child.visible;
                }
            });
            if (isVisible) {
                togglePartitionsBtn.classList.remove('toggled-off');
            } else {
                togglePartitionsBtn.classList.add('toggled-off');
            }
        } else {
            console.warn('Partition group 物件不存在於場景中。');
        }
    });

    console.log('視圖控制 UI 初始化完成。');
}