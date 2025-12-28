// src/js/utils/statusUtils.js
/**
 * Utility to standardize status values.
 * 將各種狀態值標準化為唯一的英文 canonical 值。
 */

const statusMap = {
  '尚未確認': 'pending',
  'pending': 'pending',
  '已確認': 'confirmed',
  'confirmed': 'confirmed',
  '補確認': 'reconfirmed',
  'reconfirmed': 'reconfirmed',
};

/**
 * Converts a status value to its canonical English form.
 * @param {string} value - The status value (e.g., '已確認', 'confirmed').
 * @returns {'pending' | 'confirmed' | 'reconfirmed'}
 */
export function toCanonical(value) {
  return statusMap[value] || 'pending';
}

// Add toLocalized if needed in the future
// export function toLocalized(value) { ... }
