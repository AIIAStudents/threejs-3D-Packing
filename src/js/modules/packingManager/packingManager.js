/**
 * 這個模組定義了 PackingManager 類別，負責協調整個「打包管理」流程。
 * 功能包含：
 * 1. 執行單一群組打包（_executePacking），並立即套用結果。
 * 2. 執行多群組批次打包（_executeBatchPacking），依群組優先度逐一打包並合併結果。
 * 3. 呼叫外部模組來處理打包結果、模擬打包、更新 DOM 與進度顯示。
 * 4. 提供取消打包、更新進度顯示等輔助方法。
 */

/*
使用者打包流程：
1. 顯示 packing-panel & 初始化進度

2. 嘗試呼叫 API 執行打包
API 成功 :  _applyPackingResult 
API 失敗或 null:   模擬打包 (simulatePacking / simulatePackingAlgorithm)

3. _processPackedObjects 

4.更新 DOM / 進度顯示(forceUpdateScene + startContinuousRendering)

5.打包完成 / 出錯結束

*/

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { executePacking } from './executePacking.js';
import { createPackRequest, requestBinPacking } from '../../utils/binPackingAPI.js';
import { applyPackingResult, deepSearchPackedObjects, manualParseResult, getAllKeys, getValueByPath, createFallbackPackedObjects } from './parsePackingResult.js';
import { processPackedObjects } from './processPackedObjects.js';
import { simulatePacking, simulatePackingAlgorithm, calculateVolumeUtilization } from './simulatePacking.js';
import { forceUpdateDOM, observeDOMChanges, forceRepaint, forceUpdateScene, startContinuousRendering } from './updateDOM.js';
import { updateProgressDisplay, formatMetric } from './updateProgressDisplay.js';
import * as api from '../../utils/agentAPI.js';
import { currentContainer } from '../container/containerState.js';

export class PackingManager {
    constructor(groupManager) {
      this.groupManager = groupManager;
      this.objectManager = groupManager.objectManager;
      this.physicsEnabled = true;
      
      // 將方法綁定到當前實例，避免 this 綁定錯誤
      this.executePacking = this._executePacking.bind(this);
      this.executeBatchPacking = this._executeBatchPacking.bind(this);
      this.applyPackingResult = this._applyPackingResult.bind(this);
      this.processPackedObjects = this._processPackedObjects.bind(this);
      this.updateProgressDisplay = this._updateProgressDisplay.bind(this);
      this.cancelPacking = this._cancelPacking.bind(this);
      // ... 其他綁定 ...
    }

    /**
     * 單一群組打包的協調器：
     * 1. 顯示打包面板。
     * 2. 呼叫 executePacking 執行打包。
     * 3. 若有結果則立即套用，否則隱藏面板。
     */
    async _executePacking(groupId) {
        const packingPanel = document.getElementById('packing-panel');
        packingPanel.style.display = 'block';
        try {
            // TODO: 未來可由外部管理器提供容器尺寸
            const containerSize = { width: 120, height: 120, depth: 120 };
            const result = await executePacking.call(this, groupId, containerSize);

            if (result) {
                this.applyPackingResult(result);
                this.updateProgressDisplay({ status: 'completed', progress: 100, text: '打包完成！' });
            } else {
                // 沒有物品可打包 → 隱藏面板
                packingPanel.style.display = 'none';
            }
        } catch (error) {
            console.error(`❌ 執行單一群組打包 (${groupId}) 失敗:`, error);
            this.updateProgressDisplay({ status: 'failed', progress: 0, text: `錯誤: ${error.message}` });
        }
    }

    /**
     * 多群組批次打包的協調器：
     * 1. 顯示打包面板並更新進度。
     * 2. 依群組數量切割主容器，分配子容器給每個群組。
     * 3. 順序執行每個群組打包，並將結果合併到最終結果。
     * 4. 計算整體體積利用率並套用到場景。
     */
    async _executeBatchPacking() {
        console.log('🚀 開始執行批次打包...');
        const packingPanel = document.getElementById('packing-panel');
        packingPanel.style.display = 'block';
        this.updateProgressDisplay({ status: 'pending', progress: 0, text: '正在準備打包請求...' });

        try {
            const allGroups = await api.getGroups();
            if (allGroups.length === 0) {
                alert('沒有任何群組可供打包。');
                packingPanel.style.display = 'none';
                return;
            }

            // Fetch all items from all groups and include their confirmed status and group ID
            const groupsWithItems = await Promise.all(allGroups.map(async (group) => {
                // Fetch ALL items, not just confirmed ones, as the backend will sort them.
                const items = await api.getGroupItems(group.id);
                return items.map(item => {
                    const dims = {
                        x: item.dimensions.width || item.dimensions.radius * 2 || 1,
                        y: item.dimensions.height || item.dimensions.radius * 2 || 1,
                        z: item.dimensions.depth || item.dimensions.radius * 2 || 1,
                    };
                    // The backend expects a boolean 'confirmed' field.
                    const isConfirmed = item.status === '已確認'; // FIX: Check against the Chinese status string
                    // Preserve all necessary fields: uuid, type, dims, confirmed status, and group_id
                    return { 
                        uuid: item.id, 
                        type: item.name, 
                        dimensions: dims, 
                        confirmed: isConfirmed, 
                        group_id: group.id // Add group_id here
                    };
                });
            }));

            // Flatten the array of arrays into a single list of objects
            const allObjects = groupsWithItems.flat();

            if (allObjects.length === 0) {
                alert('所有群組都沒有物品可供打包。');
                packingPanel.style.display = 'none';
                return;
            }

            // Get the current container configuration from the shared state
            const containerConfig = currentContainer;

            // Manually construct the request payload to match the backend API,
            // ensuring all necessary fields are included.
            const packableObjects = allObjects.map(item => ({
                uuid: item.uuid,
                name: item.type,
                dimensions: {
                    width: item.dimensions.x,
                    height: item.dimensions.y,
                    depth: item.dimensions.z,
                },
                confirmed: item.confirmed,
                group_id: item.group_id // Pass the group_id to the backend
            }));

            const request = {
                objects: packableObjects,
                optimization_type: 'volume_utilization',
                async_mode: false,
                timeout: 30
            };

            // Add container configuration based on its shape
            if (containerConfig.shape === 'l-shape') {
                // Map the flat dimension properties to the nested structure the API expects.
                request.container_type = 'l-shape';
                request.main_part = {
                    width: containerConfig.dimensions.mainWidth,
                    height: containerConfig.dimensions.mainHeight,
                    depth: containerConfig.dimensions.mainDepth
                };
                request.extend_part = {
                    width: containerConfig.dimensions.extWidth,
                    height: containerConfig.dimensions.extHeight,
                    depth: containerConfig.dimensions.extDepth
                };
            } else { // Default to 'cube'
                request.container_type = 'cube';
                request.container_size = containerConfig.dimensions;
            }

            this.updateProgressDisplay({ status: 'processing', progress: 10, text: '請求已發送，等待後端處理...' });

            // DEBUG: Log the UUIDs being sent to the backend
            console.log('🔍 Checking UUIDs being sent to backend:');
            request.objects.forEach((obj, i) => {
              console.log(`  Object ${i}: uuid = ${obj.uuid}`);
            });

            // USER DEBUG: Capture scene state before packing
            console.log('📸 --- CAPTURING PRE-PACKING SCENE STATE ---');
            const sceneObjects = this.objectManager.getSceneObjects();
            if (sceneObjects && sceneObjects.length > 0) {
                sceneObjects.forEach(obj => {
                    if (!obj || !obj.uuid) {
                        console.log('  - Skipping invalid object in scene.');
                        return;
                    }
                    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                    const body = obj.userData.body;
                    console.log(`  - ID: ${obj.uuid}`, {
                        position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
                        visible: obj.visible,
                        opacity: material ? material.opacity : 'N/A',
                        transparent: material ? material.transparent : 'N/A',
                        physicsBodyType: body ? (body.type === CANNON.Body.STATIC ? 'STATIC' : (body.type === CANNON.Body.DYNAMIC ? 'DYNAMIC' : 'KINEMATIC')) : 'No Body'
                    });
                });
            } else {
                console.log('  - No scene objects found to capture state from.');
            }
            console.log('📸 --- END OF PRE-PACKING SCENE STATE ---');


            const result = await requestBinPacking(request);

            if (result) {
                this.applyPackingResult(result);
                this.updateProgressDisplay({ status: 'completed', progress: 100, text: '打包完成！' });
            } else {
                throw new Error("批次打包未能從後端獲取有效結果");
            }

        } catch (error) {
            console.error('❌ 批次打包過程中發生嚴重錯誤:', error);
            this.updateProgressDisplay({ status: 'failed', progress: 0, text: `錯誤: ${error.message}` });
        }
    }

    /**
     * 套用打包結果到場景
     */
    _applyPackingResult(result) {
        return applyPackingResult.call(this, result);
    }

    /**
     * 處理打包後的物件（建立或更新場景中的 3D 物件）
     */
    _processPackedObjects(packedObjects, utilization, executionTime) {
        // 修正：補上缺失的 objectManager 和 updateProgressDisplay 參數
        return processPackedObjects.call(this, packedObjects, utilization, executionTime, this.forceUpdateScene, this.objectManager, this.updateProgressDisplay);
    }

    /**
     * 更新打包進度顯示
     */
    _updateProgressDisplay(progress) {
        return updateProgressDisplay.call(this, progress);
    }

    /**
     * 取消打包（隱藏面板）
     */
    _cancelPacking() {
        document.getElementById('packing-panel').style.display = 'none';
    }
    
    // ... 其他在建構子綁定的輔助方法 ...
}
