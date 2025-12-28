// src/js/utils/logger.js
// 根據使用者需求，LOG_VERBOSE 可由 window 物件或環境變數設定
export const LOG_VERBOSE = window.LOG_VERBOSE ?? true;

/**
 * 標準化日誌函式
 * @param {'INFO'|'WARN'|'ERROR'} level - 日誌等級
 * @param {string} mod - 模組名稱 (e.g., 'SpacePlanning', 'agentAPI')
 * @param {string} trace - 追蹤 ID (trace_id)
 * @param {string} event - 事件描述 (e.g., '準備送出打包請求')
 * @param {Object} [fields={}] - 附帶的結構化資料 (key-value pairs)
 */
export function log(level, mod, trace, event, fields = {}) {
  const head = `[${level}][${mod}][${trace}] ${event}`;
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  
  const message = kv ? `${head} ${kv}` : head;

  switch (level) {
    case 'ERROR':
      console.error(message);
      break;
    case 'WARN':
      console.warn(message);
      break;
    default:
      console.log(message);
      break;
  }
}
