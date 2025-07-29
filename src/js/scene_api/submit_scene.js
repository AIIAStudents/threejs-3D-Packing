/**
 * 將場景資料提交至後端進行優化
 * @param {Object} sceneJson - 場景的 JSON 結構
 * @param {Function} [onSuccess] - 成功回傳後的處理 callback，例如 updateScene
 * @param {Function} [onError] - 失敗時的處理 callback（可選）
 */
export async function submitScene(sceneJson, onSuccess, onError) {
  // ✅ 可選：顯示載入中狀態
  console.log('📤 正在送出場景資料...');

  try {
    const res = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sceneJson)
    });

    if (!res.ok) {
      throw new Error(`HTTP 錯誤：${res.status}`);
    }

    const result = await res.json();
    console.log('✅ 模型回傳結果：', result);

    // 🎯 執行成功的 callback，如果提供了
    if (typeof onSuccess === 'function') {
      onSuccess(result);
    }
  } catch (err) {
    console.error('❌ 場景送出失敗：', err);

    // ⚠️ 執行錯誤處理 callback，如果有提供
    if (typeof onError === 'function') {
      onError(err);
    }
  }
}