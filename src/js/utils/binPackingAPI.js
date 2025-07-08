import * as THREE from 'three';
const BASE_URL = "http://localhost:8889";

/**
 * 3D Bin Packing API 服務
 * 處理同步和非同步的物件打包請求
 */

/**
 * 發送3D Bin packing請求
 * @param {Object} packRequest - 打包請求對象
 * @returns {Promise<Object>} 打包結果或任務ID
 */
export async function requestBinPacking(packRequest) {
  try {
    const response = await fetch(`${BASE_URL}/pack_objects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(packRequest)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `伺服器錯誤: ${response.status}`);
    }

    const data = await response.json();
    console.log("📦 Bin Packing 請求結果:", data);
    return data;

  } catch (error) {
    console.error("❌ Bin Packing 請求失敗:", error.message);
    throw error;
  }
}

/**
 * 獲取非同步任務狀態
 * @param {string} jobId - 任務ID
 * @returns {Promise<Object>} 任務狀態
 */
export async function getJobStatus(jobId) {
  try {
    const response = await fetch(`${BASE_URL}/job_status/${jobId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      // 儘量解析 JSON；若非 JSON（如 500 HTML 頁），回傳文字訊息
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `伺服器錯誤: ${response.status}`);
      } catch {
        const text = await response.text();
        throw new Error(`伺服器錯誤: ${response.status} - ${text.slice(0, 120)}`);
      }
    }

    // 部分情況可能返回空內容或文字，先嘗試 JSON，再回退文字
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error(`非JSON回應: ${text.slice(0, 120)}`); }

  } catch (error) {
    console.error("❌ 獲取任務狀態失敗:", error.message);
    throw error;
  }
}

/**
 * 取消非同步任務
 * @param {string} jobId - 任務ID
 * @returns {Promise<Object>} 取消結果
 */
export async function cancelJob(jobId) {
  try {
    const response = await fetch(`${BASE_URL}/cancel_job/${jobId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `伺服器錯誤: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error("❌ 取消任務失敗:", error.message);
    throw error;
  }
}

/**
 * 輪詢非同步任務直到完成
 * @param {string} jobId - 任務ID
 * @param {Function} progressCallback - 進度回調函數
 * @param {number} pollInterval - 輪詢間隔(毫秒)
 * @returns {Promise<Object>} 最終結果
 */
export async function pollJobUntilComplete(jobId, progressCallback = null, pollInterval = 1000) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getJobStatus(jobId);
        console.log('🔄 輪詢任務狀態:', status);
        
        // 調用進度回調
        if (progressCallback) {
          progressCallback(status);
        }

        if (status.status === 'completed') {
          console.log('✅ 任務完成，結果:', status.result);
          // 返回完整的狀態對象，包含結果和進度信息
          resolve(status);
        } else if (status.status === 'failed') {
          reject(new Error(status.error || '任務執行失敗'));
        } else {
          // 繼續輪詢
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * 創建打包請求對象
 * @param {Array} objects - 物件列表
 * @param {Object} containerSize - 容器尺寸
 * @param {Object} options - 選項
 * @returns {Object} 打包請求對象
 */
export function createPackRequest(objects, containerSize, options = {}) {
  return {
    objects: convertObjectsToPackFormat(objects, containerSize),
    container_size: containerSize,
    optimization_type: options.optimizationType || 'volume_utilization',
    algorithm: options.algorithm || 'blf_sa',
    async_mode: options.asyncMode || false,
    timeout: options.timeout || 30
  };
}

/**
 * 將Three.js物件轉換為打包格式
 * @param {Array} objects - Three.js物件列表
 * @returns {Array} 打包格式的物件列表
 */
export function convertObjectsToPackFormat(objects, containerSize = null) {
  return objects
    .filter(obj => obj.isMesh && obj.visible)
    .map(obj => {
      // 計算實際尺寸（包圍盒尺寸 * 縮放），後續位置換算要用這個，不是用 scale
      let dims = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
      let minCornerWorld = new THREE.Vector3().copy(obj.position);
      try {
        const worldBox = new THREE.Box3().setFromObject(obj);
        const size = worldBox.getSize(new THREE.Vector3());
        dims = { x: size.x, y: size.y, z: size.z };
        minCornerWorld = worldBox.min.clone();
      } catch {}

      const half = containerSize ? {
        x: containerSize.width / 2,
        y: containerSize.height / 2,
        z: containerSize.depth / 2
      } : { x: 0, y: 0, z: 0 };

      return {
        uuid: obj.uuid,
        type: obj.geometry?.type || 'Unknown',
        dimensions: dims,
        position: {
          // 直接取世界AABB的最小角，並平移至 0..W/0..H/0..D
          x: minCornerWorld.x + half.x,
          y: minCornerWorld.y + half.y,
          z: minCornerWorld.z + half.z
        },
        scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
        rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
        material: {
          color: obj.material?.color?.getHex?.() || 0xffffff,
          metalness: obj.material?.metalness ?? 0,
          roughness: obj.material?.roughness ?? 1
        }
      };
    });
}

/**
 * 應用打包結果到場景
 * @param {Array} packedObjects - 打包後的物件列表
 * @param {Array} sceneObjects - 場景中的物件列表
 * @param {Object} renderer - Three.js渲染器（可選，用於強制更新）
 * @param {Object} scene - Three.js場景（可選，用於強制更新）
 * @param {Object} camera - 三.js相機（可選，用於強制更新）
 * @param {Array} physicsObjects - 物理對應表：[{ mesh, body }]
 * @param {Object} containerSize - 用於座標轉換的容器尺寸 { width, height, depth }
 */
export function applyPackingResult(
  packedObjects,
  sceneObjects,
  renderer = null,
  scene = null,
  camera = null,
  physicsObjects = [],
  containerSize = null
) {
  console.log("🔄 開始應用打包結果...", packedObjects.length, "個物件");
  
  // 將後端(0..W,0..H,0..D)的角點座標轉為前端以中心為原點(-W/2..W/2)的座標
  const halfOffset = containerSize
    ? { x: containerSize.width / 2, y: containerSize.height / 2, z: containerSize.depth / 2 }
    : { x: 0, y: 0, z: 0 };

  // 在搬運過程中暫停碰撞回應，避免初始穿透造成的彈開
  if (Array.isArray(physicsObjects) && physicsObjects.length > 0) {
    physicsObjects.forEach(o => {
      if (o?.body) {
        try {
          o.body.collisionResponse = false;
          if (o.body.sleep) o.body.sleep();
          if (o.body.velocity && o.body.angularVelocity) {
            o.body.velocity.set(0, 0, 0);
            o.body.angularVelocity.set(0, 0, 0);
          }
        } catch {}
      }
    });
  }

  packedObjects.forEach(packedObj => {
    const sceneObj = sceneObjects.find(obj => obj.uuid === packedObj.uuid);
    if (sceneObj) {
      console.log(`📦 更新物件 ${packedObj.uuid}:`, {
        oldPosition: { x: sceneObj.position.x, y: sceneObj.position.y, z: sceneObj.position.z },
        newPosition: packedObj.position,
        oldRotation: { x: sceneObj.rotation.x, y: sceneObj.rotation.y, z: sceneObj.rotation.z },
        newRotation: packedObj.rotation
      });
      
      // 位置轉換：BLF/SA回傳的是「角點」(min corner)。
      // 需加上物體一半尺寸，換算為「中心點」後再扣掉容器半長，確保物體以中心放置。
      const size = packedObj.dimensions || packedObj.size || packedObj.scale || { x: 0, y: 0, z: 0 };
      const halfSize = { x: (size.x || 0) / 2, y: (size.y || 0) / 2, z: (size.z || 0) / 2 };
      const epsilon = 0.5; // 微小間隙，避免浮點誤差導致初始重疊
      const targetX = (packedObj.position.x ?? 0) + halfSize.x - halfOffset.x + epsilon;
      const targetY = (packedObj.position.y ?? 0) + halfSize.y - halfOffset.y + epsilon;
      const targetZ = (packedObj.position.z ?? 0) + halfSize.z - halfOffset.z + epsilon;

      // 更新位置
      sceneObj.position.set(
        targetX,
        targetY,
        targetZ
      );
      
      // 更新旋轉
      sceneObj.rotation.set(
        packedObj.rotation.x,
        packedObj.rotation.y,
        packedObj.rotation.z
      );
      
      // 標記物件需要更新
      sceneObj.matrixWorldNeedsUpdate = true;
      
      // 如果有物理剛體，需一併更新（否則下一幀會被物理步進覆蓋）
      if (Array.isArray(physicsObjects) && physicsObjects.length > 0) {
        const phys = physicsObjects.find(o => o?.mesh?.uuid === packedObj.uuid || o?.mesh === sceneObj);
        if (phys && phys.body) {
          try {
            phys.body.position.set(targetX, targetY, targetZ);
            if (phys.body.velocity && phys.body.angularVelocity) {
              phys.body.velocity.set(0, 0, 0);
              phys.body.angularVelocity.set(0, 0, 0);
            }
          } catch (e) {
            console.warn("⚠️ 物理剛體位置更新失敗:", e);
          }
        }
      }
    } else {
      console.warn(`⚠️ 找不到物件 ${packedObj.uuid} 在場景中`);
    }
  });
  
  // 強制渲染器更新（如果提供了渲染器、場景和相機）
  if (renderer && renderer.render && scene && camera) {
    console.log("🎨 強制更新渲染器");
    renderer.render(scene, camera);
  } else if (renderer && renderer.render) {
    console.log("⚠️ 無法強制更新渲染器：缺少場景或相機引用");
  }

  // 重新開啟碰撞回應，並讓剛體維持休眠避免立即彈開
  if (Array.isArray(physicsObjects) && physicsObjects.length > 0) {
    physicsObjects.forEach(o => {
      if (o?.body) {
        try {
          o.body.collisionResponse = true;
          if (o.body.sleep) o.body.sleep();
          if (o.body.velocity && o.body.angularVelocity) {
            o.body.velocity.set(0, 0, 0);
            o.body.angularVelocity.set(0, 0, 0);
          }
        } catch {}
      }
    });
  }
  
  console.log("✅ 打包結果應用完成");
}

/**
 * 顯示打包進度
 * @param {Object} status - 任務狀態
 * @param {HTMLElement} progressElement - 進度顯示元素
 */
export function updateProgressDisplay(status, progressElement) {
  if (!progressElement) return;

  const statusText = {
    'pending': '等待中...',
    'processing': '計算中...',
    'completed': '完成',
    'failed': '失敗'
  };

  const statusClass = {
    'pending': 'status-pending',
    'processing': 'status-processing',
    'completed': 'status-completed',
    'failed': 'status-failed'
  };

  // 安全地處理進度百分比
  let progressPercent = 0;
  if (status.progress !== undefined && status.progress !== null) {
    if (typeof status.progress === 'number') {
      progressPercent = Math.min(100, Math.max(0, status.progress * 100));
    } else if (typeof status.progress === 'string') {
      const parsed = parseFloat(status.progress);
      if (!isNaN(parsed)) {
        progressPercent = Math.min(100, Math.max(0, parsed * 100));
      }
    }
  } else if (status.percentage !== undefined && status.percentage !== null) {
    if (typeof status.percentage === 'number') {
      progressPercent = Math.min(100, Math.max(0, status.percentage));
    } else if (typeof status.percentage === 'string') {
      const parsed = parseFloat(status.percentage);
      if (!isNaN(parsed)) {
        progressPercent = Math.min(100, Math.max(0, parsed));
      }
    }
  }

  // 處理預估剩餘時間
  let timeRemainingText = '';
  if (status.estimated_time_remaining !== undefined && status.estimated_time_remaining !== null) {
    const time = parseFloat(status.estimated_time_remaining);
    if (!isNaN(time) && time > 0) {
      timeRemainingText = ` | 預估剩餘時間: ${Math.ceil(time)}秒`;
    }
  }

  progressElement.innerHTML = `
    <div class="progress-container">
      <div class="progress-status ${statusClass[status.status] || ''}">
        ${statusText[status.status] || status.status}
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
      <div class="progress-text">
        進度: ${progressPercent.toFixed(1)}%${timeRemainingText}
      </div>
    </div>
  `;
}