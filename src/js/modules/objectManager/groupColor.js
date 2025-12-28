// --- Group Color Logic ---
const normalColors = [0xff0000, 0xffa500, 0xffff00, 0x00ff00, 0x0000ff, 0x800080]; // 紅, 橙, 黃, 綠, 藍, 紫
const lightColors = [0xffcccb, 0xffd8b1, 0xffffe0, 0x90ee90, 0xadd8e6, 0xe6e6fa]; // 淺紅, 淺橙, 淺黃, 淺綠, 淺藍, 淺紫
const darkColors = [0x8b0000, 0xcc5500, 0x808000, 0x006400, 0x00008b, 0x4b0082]; // 深紅, 深橙, 橄欖綠, 深綠, 深藍, 靛紫

const colorPalettes = [normalColors, lightColors, darkColors];

/**
 * 根據物件所屬的群組來決定其顏色。
 * @param {string} groupId - 物件所屬群組的 ID。
 * @param {Array} allGroups - 所有群組的陣列 (來自 GroupManager)。
 * @returns {number} 代表顏色的十六進位數值。
 */
export function getGroupColor(groupId, allGroups) {
  if (!groupId || !allGroups || allGroups.length === 0) {
    return 0xffffff; // 如果沒有群組資訊，預設為白色
  }
  
  const groupIndex = allGroups.findIndex(g => g.id === groupId);

  if (groupIndex === -1) {
    return 0xffffff; // 如果找不到群組，預設為白色
  }

  const paletteIndex = Math.floor(groupIndex / 6) % colorPalettes.length;
  const colorIndex = groupIndex % 6;
  
  return colorPalettes[paletteIndex][colorIndex];
}
