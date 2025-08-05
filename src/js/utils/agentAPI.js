const BASE_URL = "http://localhost:8888";

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
      console.error("🔴 [submit_scene] 伺服器回傳錯誤狀態碼：", response.status);
      throw new Error(`伺服器返回錯誤：${response.status}`);
    }

    const data = await response.json();
    console.info("✅ 場景成功提交，物件數量：", data.num_objects);
    return data;

  } catch (error) {
    console.error("❌ [submit_scene] 提交場景時發生錯誤:", error.message);
    return { status: "error", num_objects: 0, message: error.message };
  }
}

/**
 * 傳送當前狀態並請 agent 執行動作（已加雙層安全檢查）
 * @param {Object} state - current scene state
 * @returns {Promise<{ action: Object|null, reward: number, message?: string }>}
 */
export async function requestAgentAction(state) {

  // 🔍 第一層保險：檢查 state.objects 是否合理
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
      const errorText = await response.text();  // 有些 Flask 回錯不是 JSON
      console.error("🔴 [get_action] 伺服器回傳錯誤狀態碼：", response.status);
      console.error("🔴 錯誤內容：", errorText);
      throw new Error(`伺服器返回錯誤：${response.status} | ${errorText}`);
    }

    const data = await response.json();

    // 🧪 二層保險：檢查 action 結構是否正常
    if (!data.action || typeof data.action !== "object" || !data.action.uuid) {
      console.warn("⚠️ [get_action] 後端回傳的 action 無效！", data);
      return {
        action: null,
        reward: data.reward || 0,
        message: "動作格式異常，可能缺少 uuid 或結構不符"
      };
    }

    // 🎯 成功，印出動作與獎勵
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