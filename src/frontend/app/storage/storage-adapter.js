function readRaw(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch (error) {
    console.warn(`[storage-adapter] Failed to read "${key}"`, error);
    return null;
  }
}

export const storageAdapter = {
  getItem(key, fallbackValue = null) {
    const value = readRaw(key);
    return value === null ? fallbackValue : value;
  },

  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`[storage-adapter] Failed to write "${key}"`, error);
      return false;
    }
  },

  removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`[storage-adapter] Failed to remove "${key}"`, error);
      return false;
    }
  },

  getJSON(key, fallbackValue = null) {
    const rawValue = readRaw(key);
    if (rawValue === null) {
      return fallbackValue;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn(`[storage-adapter] Failed to parse JSON for "${key}"`, error);
      return fallbackValue;
    }
  },

  setJSON(key, value) {
    return this.setItem(key, JSON.stringify(value));
  }
};
