function getSpacePlanning() {
  return globalThis.window?.SpacePlanning ?? null;
}

export const spacePlanningBridge = {
  getZones() {
    return getSpacePlanning()?.state?.zones ?? null;
  },

  redraw() {
    getSpacePlanning()?.redraw?.();
  },

  worldToCanvas(worldX, worldY) {
    const result = getSpacePlanning()?.worldToCanvas?.(worldX, worldY, 0, 0);
    if (!result) {
      return null;
    }

    return { x: result.x, y: result.y };
  },

  getViewportRect(canvas) {
    return getSpacePlanning()?.getViewportRect?.(canvas) ?? null;
  },

  computeFitTransform(bounds, viewportRect) {
    return getSpacePlanning()?.computeFitTransform?.(bounds, viewportRect) ?? null;
  },

  getContainerBounds() {
    return getSpacePlanning()?.getContainerBounds?.() ?? null;
  },

  exitSecondaryEditMode() {
    getSpacePlanning()?.exitSecondaryEditMode?.();
  }
};
