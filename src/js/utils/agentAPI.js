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
      throw new Error(`伺服器返回錯誤：${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("提交場景時發生錯誤:", error);
    return { status: "error", num_objects: 0, message: error.message };
  }
}

/**
 * 傳送當前狀態並請 agent 執行動作
 * @param {Object} state - current scene state
 * @returns {Promise<{ action: Object, reward: number }>}
 */
export async function requestAgentAction(state) {
  try {
    const response = await fetch(`${BASE_URL}/get_action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`伺服器返回錯誤：${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("請求動作時發生錯誤:", error);
    return { action: null, reward: 0, message: error.message };
  }
}