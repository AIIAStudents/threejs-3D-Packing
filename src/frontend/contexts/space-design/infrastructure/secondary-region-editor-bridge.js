function getSecondaryRegionEditor() {
  return globalThis.window?.SecondaryRegionEditor ?? null;
}

export const secondaryRegionEditorBridge = {
  exitEditMode() {
    getSecondaryRegionEditor()?.exitEditMode?.();
  },

  activateEditingMode() {
    const editor = getSecondaryRegionEditor();
    if (!editor) {
      return false;
    }

    if (editor.state) {
      editor.state.mode = 'editing';
    }
    editor.init?.();
    editor.updateRegionsList?.();
    editor.renderCanvas?.();
    return true;
  }
};
