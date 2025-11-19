import * as THREE from 'three';
import { drawPartitions } from '../sceneManager.js';

// FIX: Restore and export all helper functions required by other modules like packingManager.

export function deepSearchPackedObjects(obj, maxDepth = 3, currentDepth = 0) {
    if (currentDepth > maxDepth) return { packedObjects: [], utilization: null, executionTime: null };
    const result = { packedObjects: [], utilization: null, executionTime: null };
    if (typeof obj !== 'object' || obj === null) return result;

    for (const [key, value] of Object.entries(obj)) {
        if ((key.includes('packed') || key.includes('object')) && Array.isArray(value)) {
            result.packedObjects = value;
        } else if (key.includes('utilization') || key.includes('volume')) {
            result.utilization = value;
        } else if (key.includes('time') || key.includes('execution')) {
            result.executionTime = value;
        } else if (typeof value === 'object') {
            const subResult = deepSearchPackedObjects(value, maxDepth, currentDepth + 1);
            if (subResult.packedObjects.length > 0) result.packedObjects = subResult.packedObjects;
            if (subResult.utilization !== null) result.utilization = subResult.utilization;
            if (subResult.executionTime !== null) result.executionTime = subResult.executionTime;
        }
    }
    return result;
}

export function manualParseResult(result) {
    const parsed = { success: false, packedObjects: [], utilization: null, executionTime: null };
    try {
        const allKeys = getAllKeys(result);
        for (const key of allKeys) {
            const value = getValueByPath(result, key);
            const lowerKey = key.toLowerCase();
            if ((lowerKey.includes('packed') || lowerKey.includes('object')) && Array.isArray(value) && value.length > 0) {
                parsed.packedObjects = value;
            } else if ((lowerKey.includes('utilization') || lowerKey.includes('volume')) && value !== null && !isNaN(value)) {
                parsed.utilization = value;
            } else if ((lowerKey.includes('time') || lowerKey.includes('execution')) && value !== null && !isNaN(value)) {
                parsed.executionTime = value;
            }
        }
        parsed.success = parsed.packedObjects.length > 0;
    } catch (error) {
        console.error('❌ 手動解析失敗:', error);
    }
    return parsed;
}

export function getAllKeys(obj, prefix = '') {
    const keys = [];
    if (typeof obj !== 'object' || obj === null) return keys;
    for (const [key, value] of Object.entries(obj)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        keys.push(currentPath);
        if (typeof value === 'object' && !Array.isArray(value)) {
            keys.push(...getAllKeys(value, currentPath));
        }
    }
    return keys;
}

export function getValueByPath(obj, path) {
    try {
        return path.split('.').reduce((current, key) => current[key], obj);
    } catch {
        return null;
    }
}

export function createFallbackPackedObjects(objects) {
    console.log('🔄 創建後備打包物件...');
    const packedObjects = [];
    let currentX = 0, currentZ = 0, maxY = 0;

    objects.forEach((obj) => {
        if (!obj || !obj.uuid) {
            console.warn('⚠️ 創建後備數據時，跳過一個無效的物件:', obj);
            return;
        }
        const dims = {
            x: obj.geometry?.parameters?.width || 15,
            y: obj.geometry?.parameters?.height || 15,
            z: obj.geometry?.parameters?.depth || 15
        };
        if (currentX + dims.x > 120) {
            currentX = 0;
            currentZ += maxY;
            maxY = 0;
        }
        const packedObj = {
            uuid: obj.userData.id || obj.uuid, // Use a reliable ID
            position: { x: currentX, y: 0, z: currentZ },
            dimensions: dims,
            rotation: { x: 0, y: 0, z: 0 }
        };
        packedObjects.push(packedObj);
        currentX += dims.x;
        maxY = Math.max(maxY, dims.y);
    });
    console.log('✅ 後備打包物件創建完成:', packedObjects);
    return packedObjects;
}

export function applyPackingResult(result) {
    console.log('📦 Raw packing result from server:', JSON.stringify(result, null, 2));
    console.log('📦 應用打包結果:', result);

    let packedObjects = [];
    let utilization = null;
    let executionTime = null;

    try {
        if (result.items && Array.isArray(result.items)) {
            packedObjects = result.items
                .filter(item => item.is_packed) // FIX: Use snake_case to match Python JSON output
                .map(item => ({
                    uuid: item.item_id, // FIX: Use snake_case for item_id
                    pose: item.pose, 
                }));
            console.log(`✅ 檢測到標準 'items' 格式，共 ${packedObjects.length} 個已打包物件`);
            utilization = result.volume_utilization ?? null;
            executionTime = result.execution_time_ms ?? null;

        } else if (result.packed_objects) { // Fallback for old format
            console.log("✅ 檢測到舊版 'packed_objects' 格式數據");
            packedObjects = result.packed_objects;
            utilization = result.statistics?.volume_utilization ?? result.volume_utilization ?? result.utilization ?? null;
            executionTime = result.statistics?.execution_time ?? result.execution_time ?? null;
        
        } else {
            console.error('❌ 無法解析打包結果，結果中缺少 \'items\' 或 \'packed_objects\' 欄位。');
            packedObjects = createFallbackPackedObjects(this.objectManager.getSceneObjects());
        }

    } catch (error) {
        console.error('❌ 解析打包結果時發生錯誤:', error);
        packedObjects = createFallbackPackedObjects(this.objectManager.getSceneObjects());
    }

    if (!Array.isArray(packedObjects)) {
        console.warn('⚠️ 打包物件數據無效，創建後備數據');
        packedObjects = createFallbackPackedObjects(this.objectManager.getSceneObjects());
    }

    // Draw partitions if they exist in the result
    if (result.partitions && Array.isArray(result.partitions)) {
        console.log(`🎨 繪製 ${result.partitions.length} 個空間分割區...`);
        drawPartitions(this.groupManager.scene, result.partitions);
    }

    console.log('📦 解析後的打包物件:', packedObjects);
    console.log('📦 體積利用率:', utilization);
    console.log('📦 執行時間:', executionTime);

    this.processPackedObjects(packedObjects, utilization, executionTime);

    const scene = this.groupManager.scene;
    if (scene) {
        scene.userData.needsUpdate = true;
        scene.userData.lastUpdateTime = Date.now();
        console.log("🔄 設定 scene.userData.needsUpdate = true");
    } else {
        console.error("❌ 無法從 PackingManager 上下文獲取 scene，無法觸發更新");
    }
}
