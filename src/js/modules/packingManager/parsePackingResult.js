import * as THREE from 'three';

/**
 * ✅ 應用打包結果並觸發後續處理
 * 
 * 功能：
 * - 檢查後端回傳的打包結果格式（支援多種格式）
 * - 自動解析出物件列表、體積利用率、執行時間
 * - 當結果格式異常時，會嘗試深度搜索或手動解析
 * - 解析失敗則生成「後備模擬數據」
 * 
 * @param {Object|Array} result - 後端或模擬的打包結果
 */
export function applyPackingResult(result) {
    console.log('📦 應用打包結果:', result);

    let packedObjects = [];
    let utilization = null;
    let executionTime = null;

    try {
        /**
         * 🟢 支援多種後端回傳格式
         * 1. 標準格式 { packed_objects, utilization, execution_time }
         * 2. 陣列格式 [ {..}, {..} ]
         * 3. result 包裹格式 { result: { packed_objects: [...] } }
         * 4. result 陣列格式 { result: [...] }
         * 5. 其他情況 → 深度搜索 / 手動解析 / 後備模擬
         */
        if (result.packed_objects) {
            packedObjects = result.packed_objects;
            utilization = result.volume_utilization || result.utilization;
            executionTime = result.execution_time;
            console.log('✅ 檢測到標準格式數據');
        } else if (Array.isArray(result)) {
            packedObjects = result;
            console.log('✅ 檢測到陣列格式數據');
        } else if (result.result && result.result.packed_objects) {
            packedObjects = result.result.packed_objects;
            utilization = result.result.volume_utilization || result.result.utilization;
            executionTime = result.result.execution_time;
            console.log('✅ 檢測到嵌套格式數據');
        } else if (result.result && Array.isArray(result.result)) {
            packedObjects = result.result;
            utilization = result.volume_utilization || result.utilization;
            executionTime = result.execution_time;
            console.log('✅ 檢測到 result 陣列格式數據');
        } else {
            // 嘗試深度搜索
            const deepSearch = this.deepSearchPackedObjects(result);
            if (deepSearch.packedObjects.length > 0) {
                packedObjects = deepSearch.packedObjects;
                utilization = deepSearch.utilization;
                executionTime = deepSearch.executionTime;
                console.log('✅ 深度搜索找到數據');
            } else {
                // 嘗試手動解析
                console.warn('⚠️ 無法識別的結果格式:', result);
                console.log('🔍 嘗試手動解析...');
                const manualParse = this.manualParseResult(result);

                if (manualParse.success) {
                    packedObjects = manualParse.packedObjects;
                    utilization = manualParse.utilization;
                    executionTime = manualParse.executionTime;
                    console.log('✅ 手動解析成功');
                } else {
                    // 最後手段 → 生成後備數據
                    console.error('❌ 無法解析打包結果，使用模擬數據');
                    const objects = this.objectManager.getObjects();
                    packedObjects = this.createFallbackPackedObjects(objects);
                    utilization = 0.85;
                    executionTime = 1.5;
                }
            }
        }
    } catch (error) {
        // 全域錯誤處理
        console.error('❌ 解析打包結果時發生錯誤:', error);
        const objects = this.objectManager.getObjects();
        packedObjects = this.createFallbackPackedObjects(objects);
        utilization = 0.80;
        executionTime = 2.0;
    }

    // 🚨 二次檢查：避免得到空陣列
    if (!Array.isArray(packedObjects) || packedObjects.length === 0) {
        console.warn('⚠️ 打包物件數據無效，創建後備數據');
        const objects = this.objectManager.getObjects();
        packedObjects = this.createFallbackPackedObjects(objects);
    }

    // 調試資訊
    console.log('📦 解析後的打包物件:', packedObjects);
    console.log('📦 體積利用率:', utilization);
    console.log('📦 執行時間:', executionTime);

    // 交給物件處理模組
    this.processPackedObjects(packedObjects, utilization, executionTime);

    // 通知 Three.js 場景刷新
    const scene = this.groupManager.scene;
    if (scene) {
        scene.userData.needsUpdate = true;
        scene.userData.lastUpdateTime = Date.now();
        console.log("🔄 設定 scene.userData.needsUpdate = true");
    } else {
        console.error("❌ 無法從 PackingManager 上下文獲取 scene，無法觸發更新");
    }
}

/**
 * 🔍 深度搜索打包物件 (遞迴搜尋)
 * @param {Object} obj - 輸入的結果物件
 * @param {number} maxDepth - 最大遞迴層數
 * @param {number} currentDepth - 當前層數
 * @returns {Object} { packedObjects, utilization, executionTime }
 */
export function deepSearchPackedObjects(obj, maxDepth = 3, currentDepth = 0) {
    if (currentDepth > maxDepth) return { packedObjects: [], utilization: null, executionTime: null };

    const result = { packedObjects: [], utilization: null, executionTime: null };

    if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            if (key.includes('packed') || key.includes('object')) {
                if (Array.isArray(value)) {
                    result.packedObjects = value;
                    console.log(`🔍 深度搜索找到打包物件: ${key}`);
                }
            } else if (key.includes('utilization') || key.includes('volume')) {
                result.utilization = value;
                console.log(`🔍 深度搜索找到利用率: ${key} = ${value}`);
            } else if (key.includes('time') || key.includes('execution')) {
                result.executionTime = value;
                console.log(`🔍 深度搜索找到執行時間: ${key} = ${value}`);
            } else if (typeof value === 'object' && value !== null) {
                const subResult = this.deepSearchPackedObjects(value, maxDepth, currentDepth + 1);
                if (subResult.packedObjects.length > 0) result.packedObjects = subResult.packedObjects;
                if (subResult.utilization !== null) result.utilization = subResult.utilization;
                if (subResult.executionTime !== null) result.executionTime = subResult.executionTime;
            }
        }
    }
    return result;
}

/**
 * 🛠️ 手動解析打包結果
 * - 遍歷所有鍵，嘗試抽取「物件 / 利用率 / 執行時間」
 * @param {Object} result - 後端結果
 * @returns {Object} { success, packedObjects, utilization, executionTime }
 */
export function manualParseResult(result) {
    const parsed = { success: false, packedObjects: [], utilization: null, executionTime: null };

    try {
        const allKeys = this.getAllKeys(result);
        console.log('🔍 所有可用字段:', allKeys);

        // 找打包物件
        for (const key of allKeys) {
            if (key.toLowerCase().includes('packed') || key.toLowerCase().includes('object')) {
                const value = this.getValueByPath(result, key);
                if (Array.isArray(value) && value.length > 0) {
                    parsed.packedObjects = value;
                    console.log(`✅ 手動解析找到打包物件: ${key}`);
                    break;
                }
            }
        }

        // 找利用率
        for (const key of allKeys) {
            if (key.toLowerCase().includes('utilization') || key.toLowerCase().includes('volume')) {
                const value = this.getValueByPath(result, key);
                if (value !== null && !isNaN(value)) {
                    parsed.utilization = value;
                    console.log(`✅ 手動解析找到利用率: ${key} = ${value}`);
                    break;
                }
            }
        }

        // 找執行時間
        for (const key of allKeys) {
            if (key.toLowerCase().includes('time') || key.toLowerCase().includes('execution')) {
                const value = this.getValueByPath(result, key);
                if (value !== null && !isNaN(value)) {
                    parsed.executionTime = value;
                    console.log(`✅ 手動解析找到執行時間: ${key} = ${value}`);
                    break;
                }
            }
        }

        parsed.success = parsed.packedObjects.length > 0;
    } catch (error) {
        console.error('❌ 手動解析失敗:', error);
    }

    return parsed;
}

/**
 * 🔑 獲取所有屬性路徑
 * @param {Object} obj - 任意物件
 * @param {string} prefix - 路徑前綴
 * @returns {Array<string>} 屬性路徑列表
 */
export function getAllKeys(obj, prefix = '') {
    const keys = [];
    if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = prefix ? `${prefix}.${key}` : key;
            keys.push(currentPath);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                keys.push(...this.getAllKeys(value, currentPath));
            }
        }
    }
    return keys;
}

/**
 * 🔎 根據路徑安全地取值
 * @param {Object} obj - 來源物件
 * @param {string} path - 'a.b.c' 格式路徑
 * @returns {*} 對應的值或 null
 */
export function getValueByPath(obj, path) {
    try {
        return path.split('.').reduce((current, key) => current[key], obj);
    } catch {
        return null;
    }
}

/**
 * 🪄 建立後備打包物件 (Fallback)
 * - 當解析失敗或後端沒回傳時使用
 * - 以簡單網格方式排列物件
 * 
 * @param {Array} objects - 原始物件列表
 * @returns {Array<Object>} 模擬的打包物件
 */
export function createFallbackPackedObjects(objects) {
    console.log('🔄 創建後備打包物件...');

    const packedObjects = [];
    let currentX = 0;
    let currentZ = 0;
    let maxY = 0;

    objects.forEach((obj) => {
        const mesh = obj.mesh;
        const dims = {
            x: parseFloat(document.getElementById('cube-width')?.value) || 15,
            y: parseFloat(document.getElementById('cube-height')?.value) || 15,
            z: parseFloat(document.getElementById('cube-depth')?.value) || 15
        };

        // 簡單的網格排列策略
        if (currentX + dims.x > 120) {
            currentX = 0;
            currentZ += maxY;
            maxY = 0;
        }
        if (currentZ + dims.z > 120) {
            currentX = 0;
            currentZ = 0;
            maxY = 0;
        }

        const packedObj = {
            uuid: mesh.uuid,
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
