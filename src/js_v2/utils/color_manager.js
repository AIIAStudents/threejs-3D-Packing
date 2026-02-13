/**
 * ColorManager
 * Centralized utility to ensure consistent coloring for groups across the application.
 */

export const ColorManager = {
  // Vibrant palette (Tailwind-ish: Blue, Red, Green, Amber, Violet, Pink, Indigo, Teal, Orange, Fuchsia)
  palette: [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#d946ef',
    '#0ea5e9', '#84cc16', '#eab308'
  ],

  // Storage for assigned colors: { groupId: colorString }
  groupColorMap: {},
  nextPaletteIndex: 0,

  /**
   * Get the color for a specific group ID.
   * If the group already has a color, returns it.
   * If not, assigns the next available color from the palette or generates a hash.
   * 
   * @param {string} groupId 
   * @returns {string} Hex color string
   */
  getGroupColor(groupId) {
    if (!groupId) return '#94a3b8'; // Default gray for undefined group

    // Return existing assignment
    if (this.groupColorMap[groupId]) {
      return this.groupColorMap[groupId];
    }

    // Assign new color
    let color;
    if (this.nextPaletteIndex < this.palette.length) {
      color = this.palette[this.nextPaletteIndex++];
    } else {
      // Deterministic generation if palette exhausted
      color = this.generateHashColor(groupId);
    }

    this.groupColorMap[groupId] = color;
    return color;
  },

  /**
   * Reset the color mapping state. 
   * Useful when reloading a fresh dataset.
   */
  reset() {
    this.groupColorMap = {};
    this.nextPaletteIndex = 0;
  },

  /**
   * Generate a consistent hex color from a string.
   */
  generateHashColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  }
};
