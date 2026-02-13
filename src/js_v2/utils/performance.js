/**
 * Performance Utilities for Three.js Applications
 * Focuses on reducing INP (Interaction to Next Paint) and optimizing rendering loops.
 */

// --- Throttling & Debouncing ---

/**
 * Creates a throttled function that only invokes `fn` at most once per every `ms` milliseconds.
 * Useful for high-frequency events like 'mousemove' or 'scroll'.
 *
 * @param {Function} fn - The function to throttle.
 * @param {number} ms - The throttle interval in milliseconds.
 * @returns {Function} - The throttled function.
 */
export function throttle(fn, ms = 100) {
  let last = 0;
  let timer = null;
  let lastArgs = null;

  return function (...args) {
    const now = performance.now();
    lastArgs = args;
    const remain = ms - (now - last);

    if (remain <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn.apply(this, lastArgs);
      lastArgs = null;
    } else if (!timer) {
      timer = setTimeout(() => {
        last = performance.now();
        timer = null;
        if (lastArgs) {
          fn.apply(this, lastArgs);
          lastArgs = null;
        }
      }, remain);
    }
  };
}

/**
 * Creates a debounced function that delays invoking `fn` until after `ms` milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * Useful for 'resize' or 'input' events where you want to wait for the user to stop interacting.
 *
 * @param {Function} fn - The function to debounce.
 * @param {number} ms - The debounce delay in milliseconds.
 * @returns {Function} - The debounced function.
 */
export function debounce(fn, ms = 200) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, ms);
  };
}

// --- Dynamic Quality Scaling ---

/**
 * Manages Dynamic Resolution Scaling (DRS) and quality settings during interactions.
 * Helps maintain high framerates by temporarily reducing visual quality when the user
 * is interacting (e.g., rotating the camera).
 */
export class DynamicQualityScaler {
  constructor(renderer, scene, camera, requestRenderCb) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.requestRender = requestRenderCb;

    this.timer = null;
    this.isInteracting = false;

    // Config
    this.settings = {
      highDpr: Math.min(window.devicePixelRatio || 1, 2), // Cap at 2x for high-DPI screens
      lowDpr: 1, // Standard 1x during interaction
      restoreDelay: 200, // Wait 200ms after interaction ends before restoring quality
      disableShadows: true, // Whether to disable shadows during interaction
      disablePostProcessing: false // Whether to disable pass (if handled externally)
    };

    // Store original state
    this.originalShadowsEnabled = this.renderer.shadowMap.enabled;
  }

  /**
   * Call this when a user interaction starts (e.g., controls 'start' or 'mousedown').
   */
  onInteractStart() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.isInteracting) return;
    this.isInteracting = true;

    // Apply Low Quality Settings
    this.renderer.setPixelRatio(this.settings.lowDpr);

    if (this.settings.disableShadows) {
      this.renderer.shadowMap.enabled = false;
      // Note: Changing shadowMap.enabled might require material updates in some Three.js versions,
      // but usually automatic in WebGLRenderer. If materials need update, needsUpdate=true might be needed.
    }

    this.requestRender();
  }

  /**
   * Call this when a user interaction ends (e.g., controls 'end' or 'mouseup').
   */
  onInteractEnd() {
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.isInteracting = false;
      this.timer = null;

      // Restore High Quality Settings
      this.renderer.setPixelRatio(this.settings.highDpr);

      if (this.settings.disableShadows) {
        this.renderer.shadowMap.enabled = this.originalShadowsEnabled;
      }

      this.requestRender();
    }, this.settings.restoreDelay);
  }

  /**
   * Directly sets the renderer instance if it changes (e.g. re-init).
   */
  setRenderer(newRenderer) {
    this.renderer = newRenderer;
    this.originalShadowsEnabled = this.renderer.shadowMap.enabled;
  }
}

// --- Dirty Flag System ---

/**
 * Manages dirty flags to batch updates and prevent redundant rendering/calculations.
 * Useful for complex scenes where multiple small changes might trigger heavy updates.
 */
export class DirtyFlagSystem {
  constructor(renderCallback) {
    this.flags = {
      transform: false,
      geometry: false,
      material: false,
      label: false,
      picking: false
    };
    this.renderCallback = renderCallback;
    this.pendingFlush = false;
  }

  mark(type) {
    if (this.flags.hasOwnProperty(type)) {
      this.flags[type] = true;
      this.scheduleFlush();
    } else {
      console.warn(`[DirtyFlagSystem] Unknown flag type: ${type}`);
    }
  }

  scheduleFlush() {
    if (!this.pendingFlush) {
      this.pendingFlush = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  flush() {
    this.pendingFlush = false;
    // logic to handle updates would go here or be handled by the consumer checking flags
    // For now, we just ensure a render happens at the end
    if (this.renderCallback) this.renderCallback(this.flags);

    // Reset flags
    Object.keys(this.flags).forEach(key => this.flags[key] = false);
  }
}

// --- Chunked Processing ---

/**
 * Processes an array in chunks to avoid blocking the main thread for too long.
 * Useful for processing large datasets while maintaining UI responsiveness (low INP).
 *
 * @param {Array} items - The items to process.
 * @param {number} chunkSize - The number of items per chunk.
 * @param {Function} processor - Callback to process each chunk.
 * @returns {Promise<void>}
 */
export async function buildInChunks(items, chunkSize, processor) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    processor(chunk);

    // Yield to the main thread after each chunk
    if (i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
