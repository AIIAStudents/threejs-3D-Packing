/**
 * Scroll Reveal - IntersectionObserver-based reveal animations
 * Lightweight, performant, supports reduced motion
 */

export const ScrollReveal = {
  observer: null,
  elements: new Set(),

  init() {
    console.log('[ScrollReveal] Initializing...');

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      console.log('[ScrollReveal] Reduced motion detected, skipping animations');
      this.revealAll();
      return;
    }

    // Create observer
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        threshold: 0.1,
        rootMargin: '0px 0px -10% 0px'
      }
    );

    // Observe all reveal elements
    this.observeElements();

    console.log('[ScrollReveal] Initialized with', this.elements.size, 'elements');
  },

  observeElements() {
    const elements = document.querySelectorAll('.reveal-element');

    elements.forEach(el => {
      this.elements.add(el);
      this.observer.observe(el);
    });
  },

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Unobserve after revealing (one-time animation)
        this.observer.unobserve(entry.target);
        this.elements.delete(entry.target);
      }
    });
  },

  revealAll() {
    // Immediately reveal all elements (for reduced motion)
    const elements = document.querySelectorAll('.reveal-element');
    elements.forEach(el => el.classList.add('revealed'));
  },

  cleanup() {
    console.log('[ScrollReveal] Cleaning up...');

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.elements.clear();
  }
};

// Auto-initialize when module is loaded
// Note: Will be called by DirectModuleLoader when page loads
export function init() {
  ScrollReveal.init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  ScrollReveal.cleanup();
});
