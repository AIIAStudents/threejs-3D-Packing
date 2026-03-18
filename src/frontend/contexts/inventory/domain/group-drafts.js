function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildCreateGroupDraft(name) {
  return {
    name: normalizeText(name)
  };
}

export function buildGroupUpdateDraft({ currentGroup, name, note }) {
  return {
    name: normalizeText(name ?? currentGroup?.name ?? ''),
    note: note ?? currentGroup?.description ?? currentGroup?.note ?? ''
  };
}
