/**
 * Performance Utilities for Three.js
 * Throttle, Render-on-Demand, and Quality Management
 */

/**
 * Throttle function - limits how often a function can be called
 */
export function throttle(fn, ms = 100) {
  let last = 0;
  let timer = null;
  let lastArgs = null;

  return (...args) => {
    const now = performance.now();
    lastArgs = args;
    const remain = ms - (now - last);

    if (remain <= 0) {
      last = now;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...lastArgs);
      lastArgs = null;
    } else if (!timer) {
      timer = setTimeout(() => {
        last = performance.now();
        timer = null;
        fn(...(lastArgs ?? []));
        lastArgs = null;
      }, remain);
    }
  };
}

/**
 * Render-on-Demand Manager
 * Prevents unnecessary 60fps rendering when scene is static
 */
export class RenderManager {
  constructor(renderFn) {
    this.renderFn = renderFn;
    this.renderRequested = false;
    this.dirty = false;
  }

  /**
   * Request render if not already scheduled
   */
  requestRender() {
    this.dirty = true;

    if (this.renderRequested) return;
    this.renderRequested = true;

    requestAnimationFrame(() => {
      this.renderRequested = false;

      if (!this.dirty) return;
      this.dirty = false;

      if (this.renderFn) {
        this.renderFn();
      }
    });
  }

  /**
   * Force mark as dirty
   */
  markDirty() {
    this.dirty = true;
  }

  /**
   * Reset state
   */
  reset() {
    this.renderRequested = false;
    this.dirty = false;
  }
}

/**
 * Dynamic Quality Scaler
 * Adjusts renderer quality during interaction
 */
export class QualityScaler {
  constructor(renderer) {
    this.renderer = renderer;

    // Quality presets
    this.quality = {
      highDpr: Math.min(window.devicePixelRatio || 1, 2),
      lowDpr: 1,
      shadowEnabledHigh: true,
      shadowEnabledLow: false
    };

    this.interactionTimer = null;
    this.isInteracting = false;
  }

  /**
   * Apply quality mode
   */
  applyQuality(mode, requestRenderCallback) {
    if (mode === "low") {
      this.renderer.setPixelRatio(this.quality.lowDpr);
      if (this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = this.quality.shadowEnabledLow;
      }
    } else {
      this.renderer.setPixelRatio(this.quality.highDpr);
      if (this.renderer.shadowMap) {
        this.renderer.shadowMap.enabled = this.quality.shadowEnabledHigh;
      }
    }

    if (requestRenderCallback) {
      requestRenderCallback();
    }
  }

  /**
   * Handle interaction start
   */
  onInteractionStart(requestRenderCallback) {
    this.isInteracting = true;

    if (this.interactionTimer) {
      clearTimeout(this.interactionTimer);
      this.interactionTimer = null;
    }

    this.applyQuality("low", requestRenderCallback);
  }

  /**
   * Handle interaction end
   */
  onInteractionEnd(requestRenderCallback) {
    this.isInteracting = false;

    if (this.interactionTimer) {
      clearTimeout(this.interactionTimer);
    }

    // Delay quality restoration to avoid jitter
    this.interactionTimer = setTimeout(() => {
      this.applyQuality("high", requestRenderCallback);
    }, 200);
  }

  /**
   * Force set quality
   */
  setQuality(mode, requestRenderCallback) {
    this.applyQuality(mode, requestRenderCallback);
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.interactionTimer) {
      clearTimeout(this.interactionTimer);
      this.interactionTimer = null;
    }
  }
}
