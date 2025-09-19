const BASE_URL = "http://localhost:8889";

// --- 新增：群組與庫存管理 API ---

export async function updateGroupOrder(groupIds) {
  try {
    const response = await fetch(`${BASE_URL}/groups/update-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupIds),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/groups`);
    if (!response.ok) {
      throw new Error(`伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const url = new URL(`${BASE_URL}/groups/${groupId}/items`);
    if (status) {
      url.searchParams.append('status', status);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/inventory_items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("❌ [addInventoryItem] 新增物品到庫存失敗:", error);
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
    const response = await fetch(`${BASE_URL}/inventory_items/${itemId}/confirm`, {
      method: "PUT",
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/inventory_items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`❌ [updateGroup] 更新群組 ${groupId} 失敗:`, error);
    throw error;
  }
}

/**
 * 刪除群組
 * @param {number} groupId
 * @returns {Promise<Object>}
 */
export async function deleteGroup(groupId) {
  try {
    const response = await fetch(`${BASE_URL}/groups/${groupId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/inventory_items/${itemId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `伺服器錯誤: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(`${BASE_URL}/submit_scene`, {
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
    const response = await fetch(`${BASE_URL}/get_action`, {
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