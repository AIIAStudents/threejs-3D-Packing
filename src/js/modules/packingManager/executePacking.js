import * as THREE from 'three';
import { requestBinPacking, pollJobUntilComplete } from '../../utils/binPackingAPI.js';

export async function executePacking() {
    console.log('🚀 開始執行分組3D打包...');

    const groups = this.groupManager.groups;
    if (groups.length === 0) {
        alert('請先創建至少一個群組並添加物件');
        return;
    }

    const packingPanel = document.getElementById('packing-panel');
    packingPanel.style.display = 'block';
    this.updateProgressDisplay({ status: 'pending', progress: 0, text: '準備中...' });

    try {
        const mainContainer = { width: 120, height: 120, depth: 120 };
        const numGroups = groups.length;
        const subContainerDepth = mainContainer.depth / numGroups;

        // 為每個群組創建一個打包任務
        const packingPromises = groups.map((group, index) => {
            if (group.items.length === 0) {
                console.log(`⏭️ 群組 '${group.name}' 為空，已跳過`);
                return Promise.resolve(null); // 對於空群組，返回一個已解決的Promise
            }

            console.log(`📦 正在為群組 '${group.name}' 準備打包...`);

            const packObjects = group.items.map(obj => {
                const params = obj.geometryParams;
                let dims;
                switch (obj.type) {
                    case 'cube':
                    case 'irregular':
                        dims = { x: params.width, y: params.height, z: params.depth };
                        break;
                    case 'sphere':
                        dims = { x: params.radius * 2, y: params.radius * 2, z: params.radius * 2 };
                        break;
                    case 'cylinder':
                        dims = { x: Math.max(params.radiusTop, params.radiusBottom) * 2, y: params.height, z: Math.max(params.radiusTop, params.radiusBottom) * 2 };
                        break;
                    case 'icosahedron':
                        dims = { x: params.radius * 2, y: params.radius * 2, z: params.radius * 2 };
                        break;
                    default:
                        dims = { x: 1, y: 1, z: 1 };
                }
                return {
                    uuid: obj.uuid, // Use the conceptual item's unique ID
                    type: obj.type,
                    dimensions: dims
                };
            });

            const subContainer = { ...mainContainer, depth: subContainerDepth };

            const request = {
                objects: packObjects,
                container_size: subContainer,
                optimization_type: 'volume_utilization',
                algorithm: 'blf_sa',
                async_mode: true,
                timeout: 30
            };

            console.log(`📤 為群組 '${group.name}' 發送打包請求`, request);
            
            // 執行打包並等待結果
            return (async () => {
                const response = await requestBinPacking(request);
                if (!response.job_id) {
                    throw new Error(`群組 '${group.name}' 的打包請求未能獲取 job_id`);
                }
                return await pollJobUntilComplete(response.job_id, (progress) => {
                    // 可以根據需要更新每個組的進度，或匯總進度
                    console.log(`📊 群組 '${group.name}' 進度:`, progress);
                });
            })();
        });

        // 等待所有群組的打包任務完成
        const groupResults = await Promise.all(packingPromises);
        console.log('📥 所有群組打包完成', groupResults);

        // --- 合併並偏移結果 ---
        let finalPackedObjects = [];
        let totalVolume = 0;
        let totalItemVolume = 0;

        groupResults.forEach((result, index) => {
            if (!result || !result.result || !result.result.packed_objects) {
                return; // 跳過空的或失敗的結果
            }

            const packedGroup = result.result.packed_objects;
            const zOffset = index * subContainerDepth;
            
            totalVolume += mainContainer.width * mainContainer.height * subContainerDepth;
            totalItemVolume += result.result.total_item_volume || 0;

            packedGroup.forEach(packedObj => {
                // 應用Z軸偏移
                packedObj.position.z += zOffset;
                finalPackedObjects.push(packedObj);
            });
        });

        console.log('📦 合併後的最終打包物件:', finalPackedObjects);

        const finalUtilization = totalVolume > 0 ? (totalItemVolume / totalVolume) : 0;
        const finalResult = {
            packed_objects: finalPackedObjects,
            volume_utilization: finalUtilization,
            execution_time: null // 執行時間需要另外計算或匯總
        };

        // 應用最終結果
        this.applyPackingResult(finalResult);

    } catch (error) {
        console.error('❌ 打包過程中發生嚴重錯誤:', error);
        alert('打包失敗: ' + error.message);
        this.updateProgressDisplay({ status: 'failed', progress: 0 });
    }
}
