/**
 * 這個模組負責執行「單一群組」的自動打包流程。
 * 功能包含：
 * 1. 檢查並取得指定群組的資訊與物品。
 * 2. 計算物品體積，並依照設定將部分延遲物品加入打包。
 * 3. 對物品進行排序（依高度、深度）。
 * 4. 呼叫打包 API（requestBinPacking）請求最佳化擺放，並持續輪詢直到完成。
 * 5. 更新前端顯示打包進度，最後回傳打包結果。
 */

import { requestBinPacking, pollJobUntilComplete } from '../../utils/binPackingAPI.js';
import * as api from '../../utils/agentAPI.js';

const calculateVolume = (dimensions) => {
    if (!dimensions) return 0;
    const x = dimensions.width || dimensions.radius * 2 || 1;
    const y = dimensions.height || dimensions.radius * 2 || 1;
    const z = dimensions.depth || dimensions.radius * 2 || 1;
    return x * y * z;
};

/**
 * 執行單一群組的打包流程。
 * @param {number} groupId 要打包的群組 ID。
 * @param {object} [containerSize] 容器尺寸，若未提供則使用預設值。
 * @returns {Promise<object|null>} 打包結果物件，若失敗或跳過則回傳 null。
 */
export async function executePacking(groupId, containerSize = { width: 120, height: 120, depth: 120 }) {
    if (groupId === null || groupId === undefined) {
        alert('錯誤：未提供有效的群組 ID 進行打包！');
        return null;
    }

    console.log(`📦 執行群組 ${groupId} 的打包...`);

    // 單一群組打包時，顯示打包面板。
    // 批次打包時由批次程序統一顯示。
    const packingPanel = document.getElementById('packing-panel');
    if (packingPanel.style.display !== 'block') {
        packingPanel.style.display = 'block';
    }
    this.updateProgressDisplay({ status: 'pending', progress: 0, text: `準備打包群組 ${groupId}...` });

    try {
        const allGroups = await api.getGroups(); // 取得所有群組
        const group = allGroups.find(g => g.id === groupId); // 找到指定群組
        if (!group) throw new Error(`找不到 ID 為 ${groupId} 的群組`);

        const confirmedItems = await api.getGroupItems(groupId, 'confirmed'); // 取得已確認物品
        if (confirmedItems.length === 0) {
            console.log(`群組 ${group.name} 中沒有已確認的物品，跳過打包。`);
            // 如果是批次呼叫，不需跳出 alert，只需回傳 null。
            return null;
        }

        let itemsToPack = [...confirmedItems];
        // 如果群組設定了保留比例，則嘗試加入延遲物品
        if (group.reserveForDelayed > 0 && group.reserveForDelayed < 1) {
            const totalConfirmedVolume = confirmedItems.reduce((sum, item) => sum + calculateVolume(item.dimensions), 0);
            const reservedVolumeForDelayed = (totalConfirmedVolume / (1 - group.reserveForDelayed)) * group.reserveForDelayed;
            const delayedItems = await api.getGroupItems(groupId, 'delayed');
            if (delayedItems.length > 0) {
                let currentDelayedVolume = 0;
                const delayedToPack = [];
                for (const item of delayedItems) {
                    const itemVolume = calculateVolume(item.dimensions);
                    if (currentDelayedVolume + itemVolume <= reservedVolumeForDelayed) {
                        delayedToPack.push(item);
                        currentDelayedVolume += itemVolume;
                    }
                }
                itemsToPack.push(...delayedToPack);
            }
        }

        // 物品排序邏輯已移至後端統一處理，此處不再進行排序。

        // 建立打包物件清單
        const packObjects = itemsToPack.map(item => {
            const dims = {
                x: item.dimensions.width || item.dimensions.radius * 2 || 1,
                y: item.dimensions.height || item.dimensions.radius * 2 || 1,
                z: item.dimensions.depth || item.dimensions.radius * 2 || 1,
            };
            return { uuid: item.id, type: item.name, dimensions: dims };
        });

        // 打包請求參數
        const request = {
            objects: packObjects,
            container_size: containerSize,
            optimization_type: 'volume_utilization', // 優化目標：容積利用率
            algorithm: 'blf_sa', // 使用的打包演算法
            async_mode: true,
            timeout: 60
        };

        const response = await requestBinPacking(request);
        if (!response.job_id) throw new Error(`打包請求未能獲取 job_id`);

        // 輪詢直到打包完成，同時更新進度顯示
        const result = await pollJobUntilComplete(response.job_id, (progress) => {
            this.updateProgressDisplay(progress);
        });

        if (result && result.result) {
            // 單一群組模式下可直接套用結果
            // 批次模式則由外層控制是否套用
            console.log(`✅ 群組 ${group.name} 打包完成。`);
            return result.result; 
        } else {
            throw new Error("打包任務回傳的結果格式不正確");
        }

    } catch (error) {
        console.error(`❌ 群組 ${groupId} 打包過程發生錯誤:`, error);
        this.updateProgressDisplay({ status: 'failed', progress: 0, text: `錯誤: ${error.message}` });
        // 錯誤拋出以讓批次程序能感知失敗
        throw error;
    }
}
