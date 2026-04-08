import { storageAdapter } from '../../../app/storage/storage-adapter.js';

const STORAGE_KEYS = {
  draft: 'planningV2Draft',
  latestResult: 'planningV2LatestResult',
  history: 'planningV2History'
};

const memoryStore = new Map();

function readWithFallback(key, fallbackValue) {
  const stored = storageAdapter.getJSON(key, undefined);
  if (stored !== undefined) {
    return stored;
  }
  return memoryStore.has(key) ? memoryStore.get(key) : fallbackValue;
}

function writeWithFallback(key, value) {
  memoryStore.set(key, value);
  return storageAdapter.setJSON(key, value);
}

export const planningV2Storage = {
  loadDraft() {
    return readWithFallback(STORAGE_KEYS.draft, null);
  },

  saveDraft(draft) {
    return writeWithFallback(STORAGE_KEYS.draft, draft);
  },

  loadLatestResult() {
    return readWithFallback(STORAGE_KEYS.latestResult, null);
  },

  saveLatestResult(result) {
    return writeWithFallback(STORAGE_KEYS.latestResult, result);
  },

  loadHistory() {
    const history = readWithFallback(STORAGE_KEYS.history, []);
    return Array.isArray(history) ? history : [];
  },

  saveHistory(history) {
    return writeWithFallback(STORAGE_KEYS.history, history);
  }
};
