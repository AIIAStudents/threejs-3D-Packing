// executePacking.js - 執行3D打包的核心副程式
import { simulatePacking } from './simulatePacking.js';
import { applyPackingResult } from './parsePackingResult.js';
import { updateProgress } from './updateProgressDisplay.js';
import { processPackedObjects } from './processPackedObjects.js';

// 執行3D打包的核心函數 (原本class裡面的executePacking方法)
export async function executePacking(objectManager, physicsEnabled) {
  console.log('🚀 開始執行3D打包...');
  
  const objects = objectManager.getObjects();
  console.log('📦 當前物件數量:', objects.length);
  
  if (objects.length === 0) {
    alert('請先添加物件');
    return;
  }
  
  const packingPanel = document.getElementById('packing-panel');
  packingPanel.style.display = 'block';
  
  // 重置進度顯示
  updateProgress({ status: 'pending', progress: 0 });
  
  try {
    // 轉換物件格式
    const packObjects = objects.map(obj => {
      const mesh = obj.mesh;
      // 根據物件類型獲取尺寸
      let dims;
      switch (obj.type) {
        case 'cube':
          dims = {
            x: parseFloat(document.getElementById('cube-width').value) || 15,
            y: parseFloat(document.getElementById('cube-height').value) || 15,
            z: parseFloat(document.getElementById('cube-depth').value) || 15
          };
          break;
        case 'sphere':
          const radius = parseFloat(document.getElementById('sphere-radius').value) || 10;
          dims = { x: radius * 2, y: radius * 2, z: radius * 2 };
          break;
        case 'cylinder':
          const cylinderHeight = parseFloat(document.getElementById('cylinder-height').value) || 10;
          const cylinderRadius = Math.max(
            parseFloat(document.getElementById('cylinder-radiusTop').value) || 5,
            parseFloat(document.getElementById('cylinder-radiusBottom').value) || 5
          );
          dims = { x: cylinderRadius * 2, y: cylinderHeight, z: cylinderRadius * 2 };
          break;
        case 'icosahedron':
          const icosahedronRadius = parseFloat(document.getElementById('icosahedron-radius').value) || 10;
          dims = { x: icosahedronRadius * 2, y: icosahedronRadius * 2, z: icosahedronRadius * 2 };
          break;
        case 'irregular':
          dims = {
            x: parseFloat(document.getElementById('irregular-width').value) || 10,
            y: parseFloat(document.getElementById('irregular-height').value) || 15,
            z: parseFloat(document.getElementById('irregular-depth').value) || 8
          };
          break;
        default:
          dims = { x: 1, y: 1, z: 1 };
      }
      
      const packObj = {
        uuid: mesh.uuid,
        type: obj.type,
        dimensions: dims,
        position: {
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z
        },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
        material: {
          color: mesh.material?.color?.getHex?.() || 0xffffff,
          metalness: 0,
          roughness: 1
        }
      };
      
      console.log(`📦 物件 ${mesh.uuid} 打包數據:`, packObj);
      return packObj;
    });
    
    console.log('📦 所有物件打包數據:', packObjects);
    
    // 使用固定的120^3容器
    const packContainer = {
      width: 120,
      height: 120,
      depth: 120
    };
    
    // 發送打包請求
    const request = {
      objects: packObjects,
      container_size: packContainer,
      optimization_type: 'volume_utilization',
      algorithm: 'blf_sa',
      async_mode: true,
      timeout: 30
    };
    
    console.log('📤 發送打包請求:', request);
    
    // 這裡需要導入binPackingAPI
    if (window.requestBinPacking) {
      console.log('✅ Bin packing API 可用，發送請求...');
      try {
        const response = await window.requestBinPacking(request);
        console.log('📥 收到打包響應:', response);
        
        if (response.job_id) {
          console.log('🆔 任務ID:', response.job_id);
          // 輪詢結果
          if (window.pollJobUntilComplete) {
            console.log('🔄 開始輪詢任務結果...');
            const result = await window.pollJobUntilComplete(response.job_id, (progress) => {
              console.log('📊 進度更新:', progress);
              updateProgress(progress);
            });
            
            console.log('🎯 輪詢完成，最終結果:', result);
            if (result) {
              const parsedResult = applyPackingResult(result);
              processPackedObjects(parsedResult, objectManager, physicsEnabled);
              console.log("✅ applyPackingResult 被呼叫，結果是:", result);
            }
          } else {
            console.error('❌ pollJobUntilComplete 函數不可用');
          }
        } else {
          console.warn('⚠️ 響應中沒有job_id');
          // 可能是同步響應，直接處理
          if (response.packed_objects || response.result) {
            console.log('🔄 處理同步響應...');
            const parsedResult = applyPackingResult(response);
            processPackedObjects(parsedResult, objectManager, physicsEnabled);
          }
        }
      } catch (apiError) {
        console.warn('⚠️ API調用失敗，使用模擬打包:', apiError);
        // 如果API調用失敗，使用模擬打包
        simulatePacking(packObjects, packContainer, objectManager, physicsEnabled);
      }
    } else {
      console.log('🔄 Bin packing API 不可用，使用模擬打包...');
      // 使用模擬打包
      simulatePacking(packObjects, packContainer, objectManager, physicsEnabled);
    }
  } catch (error) {
    console.error('❌ 打包失敗:', error);
    alert('打包失敗: ' + error.message);
    // 顯示錯誤狀態
    updateProgress({ status: 'failed', progress: 0 });
  }
}