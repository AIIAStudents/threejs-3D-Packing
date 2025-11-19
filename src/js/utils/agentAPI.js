import { log, LOG_VERBOSE } from './logger.js';

export const PACK_BASE_URL = "http://localhost:8888"; // 容器、打包服務
export const GROUPS_AND_RL_BASE_URL = "http://localhost:8888"; // 群組、庫存、RL

async function parseResponseSafe(response) {
  const ct = response.headers.get('content-type') || '';
  if (response.status === 204) return null;
  if (ct.includes('application/json')) return await response.json();
  return await response.text();
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await parseResponseSafe(res);
  if (!res.ok) {
    const msg = typeof data === 'string' && data.trim() ? data : JSON.stringify(data);
    throw new Error(`HTTP ${res.status} - ${msg}`);
  }
  return data;
}

/**
 * 執行一個 POST 請求並處理回應，整合了結構化日誌
 * @param {string} url - The URL to fetch
 * @param {Object} data - The data to send in the body
 * @param {string} trace_id - The trace ID for this request
 * @param {Object} options - Optional fetch options
 * @returns {Promise<any>}
 */
export async function postJSON(url, data, trace_id, options = {}) {
  const t_start = performance.now();
  const body = JSON.stringify({ ...data, trace_id });
  
  if (LOG_VERBOSE) {
    log('INFO', 'agentAPI', trace_id, '發送POST請求', { url, payload_size: body.length });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Trace-Id': trace_id,
        ...options.headers
      },
      body: body,
      ...options,
    });

    const duration_ms = performance.now() - t_start;
    const response_trace_id = res.headers.get('X-Trace-Id');

    if (response_trace_id && response_trace_id !== trace_id) {
      log('WARN', 'agentAPI', trace_id, 'Trace ID 不匹配', { sent: trace_id, received: response_trace_id });
    }

    const response_payload = await parseResponseSafe(res);

    if (!res.ok) {
      const error_message = typeof response_payload === 'string' ? response_payload : JSON.stringify(response_payload);
      log('ERROR', 'agentAPI', trace_id, '請求失敗', {
        url,
        status: res.status,
        duration_ms: duration_ms.toFixed(2),
        error: error_message
      });
      throw new Error(`HTTP ${res.status} - ${error_message}`);
    }

    log('INFO', 'agentAPI', trace_id, '收到成功回應', {
        url,
        status: res.status,
        duration_ms: duration_ms.toFixed(2)
    });

    return response_payload;

  } catch (err) {
    const duration_ms = performance.now() - t_start;
    const error_info = {
        url,
        duration_ms: duration_ms.toFixed(2),
        error_type: err.name,
        message: err.message,
    };
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        error_info.message = `無法連線到後端服務 (${url})。請檢查服務是否已啟動、網路位址與 Port 是否正確。`;
    }
    log('ERROR', 'agentAPI', trace_id, '請求時發生例外', error_info);
    throw new Error(error_info.message);
  }
}

// --- 新增：群組與庫存管理 API ---

export async function updateGroupOrder(groupIds) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/groups/update-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupIds),
    });
  } catch (error) {
    console.error("❌ [updateGroupOrder] 更新群組順序失敗:", error);
    throw error;
  }
}

/**
 * 獲取所有群組
 * @returns {Promise<Array>}
 */
export async function getGroups() {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/groups`);
  } catch (error) {
    console.error("❌ [getGroups] 獲取群組失敗:", error);
    throw error;
  }
}

/**
 * 建立一個新群組
 * @param {Object} groupData - e.g., { name: "A組", packingTime: "2023-10-27T15:30:00" }
 * @returns {Promise<Object>}
 */
export async function createGroup(groupData) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupData),
    });
  } catch (error) {
    console.error("❌ [createGroup] 建立群組失敗:", error);
    throw error;
  }
}

/**
 * 獲取指定群組的物品
 * @param {number} groupId
 * @param {string|null} status - 'pending', 'confirmed', or 'delayed'
 * @returns {Promise<Array>}
 */
export async function getGroupItems(groupId, status = null) {
  try {
    const url = new URL(`${GROUPS_AND_RL_BASE_URL}/groups/${groupId}/items`);
    if (status) {
      url.searchParams.append('status', status);
    }
    return await fetchJSON(url);
  } catch (error) {
    console.error(`❌ [getGroupItems] 獲取群組 ${groupId} 的物品失敗:`, error);
    throw error;
  }
}

/**
 * 新增一個物品到庫存
 * @param {Object} itemData - e.g., { item_type_id: 1, group_id: 1 }
 * @returns {Promise<Object>}
 */
export async function addInventoryItem(itemData) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/inventory_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemData),
    });
  } catch (error) {
    console.error("❌ [addInventoryItem] 新增物品到庫存失敗:", error);
    throw error;
  }
}

export async function getItemTypes() {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/item_types`);
  } catch (error) {
    console.error("❌ [getItemTypes] 獲取物品類型失敗:", error);
    throw error;
  }
}

export async function addBatchItems(payload) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/inventory_items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("❌ [addBatchItems] 批量新增物品失敗:", error);
    throw error;
  }
}

/**
 * 確認物品狀態
 * @param {number} itemId
 * @returns {Promise<Object>}
 */
export async function confirmItem(itemId) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/inventory_items/${itemId}/confirm`, {
      method: "PUT",
    });
  } catch (error) {
    console.error(`❌ [confirmItem] 確認物品 ${itemId} 失敗:`, error);
    throw error;
  }
}

/**
 * 更新一個庫存物品
 * @param {number} itemId
 * @param {Object} itemData - e.g., { name: "New Name", width: 10, height: 10, depth: 10 }
 * @returns {Promise<Object>}
 */
export async function updateInventoryItem(itemId, itemData) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/inventory_items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemData),
    });
  } catch (error) {
    console.error(`❌ [updateInventoryItem] 更新物品 ${itemId} 失敗:`, error);
    throw error;
  }
}

/**
 * 更新群組
 * @param {number} groupId
 * @param {Object} groupData - e.g., { name: "New Name" }
 * @returns {Promise<Object>}
 */
export async function updateGroup(groupId, groupData) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
  } catch (e) {
    console.error(`❌ [updateGroup] 更新群組 ${groupId} 失敗:`, e);
    throw e;
  }
}

/**
 * 刪除群組
 * @param {number} groupId
 * @returns {Promise<Object>}
 */
export async function deleteGroup(groupId) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/groups/${groupId}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.error(`❌ [deleteGroup] 刪除群組 ${groupId} 失敗:`, error);
    throw error;
  }
}

/**
 * 刪除庫存物品
 * @param {number} itemId
 * @returns {Promise<Object>}
 */
export async function deleteItem(itemId) {
  try {
    return await fetchJSON(`${GROUPS_AND_RL_BASE_URL}/inventory_items/${itemId}`, {
      method: "DELETE",
    });
  } catch (error) {
    console.error(`❌ [deleteItem] 刪除物品 ${itemId} 失敗:`, error);
    throw error;
  }
}


// --- 保留的既有 API ---

/**
 * 傳送場景資料給後端
 * @param {Object} sceneConfig - 包含 objects 與 environment_meta
 * @returns {Promise<{ status: string, num_objects: number }>}
 */
export async function sendSceneConfig(sceneConfig) {
  try {
    const response = await fetch(`${GROUPS_AND_RL_BASE_URL}/submit_scene`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sceneConfig)
    });

    if (!response.ok) {
      let errData = {};
      try {
        errData = await response.json();
      } catch (_) {}
      console.error(
        `🔴 [submit_scene] 錯誤狀態碼：${response.status}`,
        errData.error_code,
        errData.error
      );
      throw new Error(errData.error || `伺服器返回錯誤：${response.status}`);
    }

    const data = await response.json();
    console.info("✅ 場景成功提交，物件數量：", data.num_objects);
    return data;

  } catch (error) {
    console.error("❌ [submit_scene] 提交場景時發生錯誤:", error.message);
    throw error;
  }
}

/**
 * 傳送當前狀態並請 agent 執行動作
 * @param {Object} state - current scene state
 * @returns {Promise<{ action: Object|null, reward: number, message?: string }>}
 */
export async function requestAgentAction(state) {
  if (!state.objects || !Array.isArray(state.objects) || state.objects.length === 0) {
    console.warn("⚠️ [get_action] 傳送前檢查失敗：state.objects 不存在或是空陣列！");
    return { action: null, reward: 0, message: "無效的場景資料" };
  }

  try {
    const response = await fetch(`${GROUPS_AND_RL_BASE_URL}/get_action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔴 [get_action] 伺服器回傳錯誤狀態碼：", response.status);
      console.error("🔴 錯誤內容：", errorText);
      throw new Error(`伺服器返回錯誤：${response.status} | ${errorText}`);
    }

    const data = await response.json();

    if (!data.action || typeof data.action !== "object" || !data.action.uuid) {
      console.warn("⚠️ [get_action] 後端回傳的 action 無效！", data);
      return {
        action: null,
        reward: data.reward || 0,
        message: "動作格式異常，可能缺少 uuid 或結構不符"
      };
    }

    console.info("✅ [get_action] 成功獲取動作:", data.action.uuid, "| reward:", data.reward);
    return data;

  } catch (error) {
    console.error("❌ [get_action] 請求動作失敗！錯誤訊息：", error.message);
    return {
      action: null,
      reward: 0,
      message: error.message
    };
  }
}
