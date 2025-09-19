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
import { executePacking } from './executePacking.js';
import { requestBinPacking } from '../../utils/binPackingAPI.js';
import { applyPackingResult, deepSearchPackedObjects, manualParseResult, getAllKeys, getValueByPath, createFallbackPackedObjects } from './parsePackingResult.js';
import { processPackedObjects } from './processPackedObjects.js';
import { simulatePacking, simulatePackingAlgorithm, calculateVolumeUtilization } from './simulatePacking.js';
import { forceUpdateDOM, observeDOMChanges, forceRepaint, forceUpdateScene, startContinuousRendering } from './updateDOM.js';
import { updateProgressDisplay, formatMetric } from './updateProgressDisplay.js';
import * as api from '../../utils/agentAPI.js';

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
        console.log('🚀 開始執行多群組批次打包...');
        const packingPanel = document.getElementById('packing-panel');
        packingPanel.style.display = 'block';
        this.updateProgressDisplay({ status: 'pending', progress: 0, text: '正在準備批次打包請求...' });

        try {
            const allGroups = await api.getGroups(); // 後端將處理排序
            if (allGroups.length === 0) {
                alert('沒有任何群組可供打包。');
                packingPanel.style.display = 'none';
                return;
            }

            // 為每個群組獲取其物品
            const groupsWithItems = await Promise.all(allGroups.map(async (group) => {
                const items = await api.getGroupItems(group.id, 'confirmed');
                // 將後端需要的 `dimensions` 附加到每個 item 上
                const objects = items.map(item => {
                    const dims = {
                        x: item.dimensions.width || item.dimensions.radius * 2 || 1,
                        y: item.dimensions.height || item.dimensions.radius * 2 || 1,
                        z: item.dimensions.depth || item.dimensions.radius * 2 || 1,
                    };
                    return { uuid: item.id, type: item.name, dimensions: dims };
                });
                return {
                    ...group,
                    objects: objects,
                };
            }));
            
            const mainContainer = { width: 120, height: 120, depth: 120 };

            // 建立單一的打包請求
            const request = {
                groups: groupsWithItems.filter(g => g.objects.length > 0), // 過濾掉沒有物品的群組
                container_size: mainContainer,
                optimization_type: 'volume_utilization',
                algorithm: 'blf_sa_groups', // 標示使用新的群組演算法
            };

            if (request.groups.length === 0) {
                alert('所有群組都沒有已確認的物品可供打包。');
                packingPanel.style.display = 'none';
                return;
            }

            this.updateProgressDisplay({ status: 'processing', progress: 10, text: '請求已發送，等待後端處理...' });

            // 直接呼叫 requestBinPacking 並等待最終結果
            const result = await requestBinPacking(request);

            if (result) {
                this.applyPackingResult(result);
                this.updateProgressDisplay({ status: 'completed', progress: 100, text: '所有群組打包完成！' });
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
