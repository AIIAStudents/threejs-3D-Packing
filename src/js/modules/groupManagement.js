import { updateObjectOpacity } from './objectManager/objectManager.js';
import { openControlWeightEditor } from './controlWeightManager.js';

/**
 * 初始化群組與物件管理事件
 * @param {Object} sceneRefs - 包含 Three.js 場景與相關參考的物件
 */
export function initGroupManagement(sceneRefs) {
    const objectsList = document.getElementById('objects-list'); // 群組與物件列表容器
    const itemEditModal = document.getElementById('item-edit-modal'); // 物件編輯模態框
    const cancelEditBtn = document.getElementById('cancel-edit-item-btn'); // 編輯取消按鈕

    // --- 物件列表點擊事件委派 ---
    objectsList.addEventListener('click', (e) => {
        // 點擊 kebab 按鈕（右上選單）
        if (e.target.matches('.kebab')) {
            e.stopPropagation();
            const parent = e.target.closest('.group-header, .item'); // 找到對應群組或物件
            if (!parent) return;
            const menu = parent.querySelector('.menu'); // 找到對應的選單
            if (!menu) return;

            const isMenuOpen = menu.style.display === 'block';
            closeAllMenus(); // 先關閉所有選單
            if (!isMenuOpen) {
                menu.style.display = 'block'; // 打開當前選單
            }
            return;
        }

        // 點擊選單項目
        if (e.target.matches('.menu-item')) {
            e.stopPropagation();
            const action = e.target.dataset.action; // Use data-action for reliability
            const itemElement = e.target.closest('.item, .group-header');

            // 移除先前編輯狀態
            document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing'));
            if (itemElement) {
                itemElement.classList.add('is-editing'); // 標記當前編輯的元素
            }
            console.log(`Action selected: "${action}" on`, itemElement);

            // --- 選單動作判斷 ---
            if (action === 'control-weight') {
                openControlWeightEditor(itemElement); // Pass the group header element
            } else if (action === 'rename-group') {
                // TODO: Implement rename group logic
                console.log('Rename group action triggered');
            } else if (action === 'delete-group') {
                // TODO: Implement delete group logic
                console.log('Delete group action triggered');
            } else if (action === '修改尺寸') {
                // 顯示物件編輯模態框
                if (itemEditModal) {
                    itemEditModal.style.display = 'block';
                }
            } else if (action === '狀態列') {
                // 尋找場景中最後加入的 mesh 物件並更新狀態
                const sceneChildren = sceneRefs.scene.children;
                let lastObject = null;
                for (let i = sceneChildren.length - 1; i >= 0; i--) {
                    if (sceneChildren[i].isMesh) {
                        lastObject = sceneChildren[i];
                        break;
                    }
                }

                if (lastObject && lastObject.userData.itemId) {
                    console.log(`Confirming status for last added object:`, lastObject);
                    updateObjectOpacity(sceneRefs.scene, lastObject.userData.itemId, 'confirmed');
                    // 實際應用中也可更新側邊欄 UI
                } else {
                    console.warn('Could not find a suitable object to confirm.');
                }
            }

            closeAllMenus(); // 關閉所有選單
        }
    });

    // 點擊頁面空白處時關閉所有選單
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu')) {
            closeAllMenus();
        }
    });

    // --- 取消編輯按鈕 ---
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (itemEditModal) {
                itemEditModal.style.display = 'none'; // 隱藏編輯模態框
            }
            document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing')); // 移除編輯狀態
        });
    }

    // --- 工具函式：關閉所有選單 ---
    function closeAllMenus() {
        const allMenus = document.querySelectorAll('#objects-list .menu');
        allMenus.forEach(menu => {
            menu.style.display = 'none';
        });
    }
}
