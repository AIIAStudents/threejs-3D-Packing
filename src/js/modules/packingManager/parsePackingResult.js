  // 應用打包結果
export function applyPackingResult(result) {
    console.log('📦 應用打包結果:', result);
    
    // 檢查結果結構，適配不同的後端響應格式
    let packedObjects = [];
    let utilization = null;
    let executionTime = null;
    
    // 增強數據格式檢測和解析
    try {
      // 處理不同的結果格式
      if (result.packed_objects) {
        // 標準格式：{ packed_objects: [...], utilization: ..., execution_time: ... }
        packedObjects = result.packed_objects;
        utilization = result.volume_utilization || result.utilization;
        executionTime = result.execution_time;
        console.log('✅ 檢測到標準格式數據');
      } else if (Array.isArray(result)) {
        // 直接是物件陣列
        packedObjects = result;
        console.log('✅ 檢測到陣列格式數據');
      } else if (result.result && result.result.packed_objects) {
        // 嵌套在result字段中
        packedObjects = result.result.packed_objects;
        utilization = result.result.volume_utilization || result.result.utilization;
        executionTime = result.result.execution_time;
        console.log('✅ 檢測到嵌套格式數據');
      } else if (result.result && Array.isArray(result.result)) {
        // result字段直接是陣列
        packedObjects = result.result;
        utilization = result.volume_utilization || result.utilization;
        executionTime = result.execution_time;
        console.log('✅ 檢測到result陣列格式數據');
      } else {
        // 嘗試深度搜索
        const deepSearch = deepSearchPackedObjects(result);
        if (deepSearch.packedObjects.length > 0) {
          packedObjects = deepSearch.packedObjects;
          utilization = deepSearch.utilization;
          executionTime = deepSearch.executionTime;
          console.log('✅ 深度搜索找到數據');
        } else {
          console.warn('⚠️ 無法識別的結果格式:', result);
          console.log('🔍 嘗試手動解析...');
          
          // 手動解析嘗試
          const manualParse = manualParseResult(result);
          if (manualParse.success) {
            packedObjects = manualParse.packedObjects;
            utilization = manualParse.utilization;
            executionTime = manualParse.executionTime;
            console.log('✅ 手動解析成功');
          } else {
            console.error('❌ 無法解析打包結果，使用模擬數據');
            throw new Error ('無法解析打包結果');
          }
        }
      }
    } catch (error) {
      console.error('❌ 解析打包結果時發生錯誤:', error);
      throw error;  
    }
    
    // 驗證解析後的數據
    if (!Array.isArray(packedObjects) || packedObjects.length === 0) {
      console.warn('⚠️ 打包物件數據無效，創建後備數據');
    }
    
    console.log('📦 解析後的打包物件:', packedObjects);
    console.log('📦 體積利用率:', utilization);
    console.log('📦 執行時間:', executionTime);
    
    return {
      packed_objects: packedObjects || [],
      volume_utilization: utilization || 0,
      execution_time: executionTime || 0
    };
    
  }

  // 深度搜索打包物件 - 新增方法
function deepSearchPackedObjects(obj, maxDepth = 3, currentDepth = 0) {
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
          // 遞歸搜索
          const subResult = deepSearchPackedObjects(value, maxDepth, currentDepth + 1);
          if (subResult.packedObjects.length > 0) {
            result.packedObjects = subResult.packedObjects;
          }
          if (subResult.utilization !== null) {
            result.utilization = subResult.utilization;
          }
          if (subResult.executionTime !== null) {
            result.executionTime = subResult.executionTime;
          }
        }
      }
    }
    
    return result;
  }

  // 手動解析結果 - 新增方法
function manualParseResult(result) {
    const parsed = { success: false, packedObjects: [], utilization: null, executionTime: null };
    
    try {
      // 嘗試從各種可能的字段中提取數據
      const allKeys = getAllKeys(result);
      console.log('🔍 所有可用字段:', allKeys);
      
      // 尋找打包物件
      for (const key of allKeys) {
        if (key.toLowerCase().includes('packed') || key.toLowerCase().includes('object')) {
          const value = getValueByPath(result, key);
          if (Array.isArray(value) && value.length > 0) {
            parsed.packedObjects = value;
            console.log(`✅ 手動解析找到打包物件: ${key}`);
            break;
          }
        }
      }
      
      // 尋找利用率
      for (const key of allKeys) {
        if (key.toLowerCase().includes('utilization') || key.toLowerCase().includes('volume')) {
          const value = getValueByPath(result, key);
          if (value !== null && value !== undefined && !isNaN(value)) {
            parsed.utilization = value;
            console.log(`✅ 手動解析找到利用率: ${key} = ${value}`);
            break;
          }
        }
      }
      
      // 尋找執行時間
      for (const key of allKeys) {
        if (key.toLowerCase().includes('time') || key.toLowerCase().includes('execution')) {
          const value = getValueByPath(result, key);
          if (value !== null && value !== undefined && !isNaN(value)) {
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

function getAllKeys(obj, prefix = ''){
    const keys = [];
    
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        keys.push(currentPath);
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          keys.push(...getAllKeys(value, currentPath));
        }
      }
    }
    
    return keys;
}
  // 根據路徑獲取值 - 新增方法
function  getValueByPath(obj, path) {
    try {
      return path.split('.').reduce((current, key) => current[key], obj);
    } catch (error) {
      return null;
    }
  }
