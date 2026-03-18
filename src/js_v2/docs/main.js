/**
 * 3D Packer - Apple-style Scroll Animation System
 * 
 * 核心機制：
 * 1. IntersectionObserver 監測 .reveal 元素進入 viewport
 * 2. 進入時加上 .is-visible class，觸發 CSS transition
 * 3. 支援 data-anim 屬性指定動畫類型（fade-up/slide-left/scale-in 等）
 * 4. 支援 data-delay 屬性實現 stagger 效果
 * 5. 支援 data-repeat 屬性控制是否重複播放（預設只播一次）
 * 
 * 效能考量：
 * - 只觀察必要的 .reveal 元素
 * - 使用 CSS transform/opacity（GPU 加速）
 * - 避免 scroll 事件監聽，改用 IntersectionObserver
 * - 元素顯示後自動 unobserve（除非設定 data-repeat）
 */

// ==================== 設定 ====================
const CONFIG = {
  // IntersectionObserver 設定
  rootMargin: '0px 0px -10% 0px', // 提早 10% 觸發，體感更順
  threshold: 0.15, // 元素露出 15% 就觸發

  // Debug 模式（URL 參數 ?debug=1 啟用）
  debug: new URLSearchParams(window.location.search).get('debug') === '1'
};

// ==================== 工具函數 ====================

/**
 * Debug 日誌
 */
function log(...args) {
  if (CONFIG.debug) {
    console.log('[ScrollAnim]', ...args);
  }
}

/**
 * 檢查是否啟用 reduced motion
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ==================== 動畫系統 ====================

/**
 * 初始化滾動動畫系統
 */
function initScrollAnimations() {
  // 如果使用者偏好減少動畫，直接顯示所有元素
  if (prefersReducedMotion()) {
    log('Reduced motion detected, skipping animations');
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach(el => {
      el.classList.add('is-visible');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  // 取得所有需要動畫的元素
  const reveals = document.querySelectorAll('.reveal');

  if (reveals.length === 0) {
    log('No .reveal elements found');
    return;
  }

  log(`Found ${reveals.length} reveal elements`);

  // 建立 IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        const animType = target.dataset.anim || 'fade-in';
        const repeat = target.dataset.repeat === 'true';

        log(`Revealing element with animation: ${animType}`, target);

        // 加上 visible class 觸發動畫
        target.classList.add('is-visible');

        // 如果不需要重複播放，停止觀察此元素（效能優化）
        if (!repeat) {
          observer.unobserve(target);
        }
      } else {
        // 如果設定為重複播放，離開 viewport 時移除 class
        if (entry.target.dataset.repeat === 'true') {
          entry.target.classList.remove('is-visible');
        }
      }
    });
  }, {
    rootMargin: CONFIG.rootMargin,
    threshold: CONFIG.threshold
  });

  // 開始觀察所有 reveal 元素
  reveals.forEach(el => observer.observe(el));

  log('ScrollAnimations initialized');
}

/**
 * 初始化首屏元素（避免首屏元素卡在透明狀態）
 */
function initHeroElements() {
  // 首屏的 reveal 元素需要特別處理，確保頁面載入時能正常顯示
  const heroSection = document.querySelector('.hero');
  if (!heroSection) return;

  const heroReveals = heroSection.querySelectorAll('.reveal');

  // 如果首屏元素已經在 viewport 內，立即觸發動畫
  // 這避免了頁面載入時首屏一片空白的問題
  const checkHeroVisibility = () => {
    heroReveals.forEach(el => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (isVisible && !el.classList.contains('is-visible')) {
        // 稍微延遲，讓頁面載入更自然
        setTimeout(() => {
          el.classList.add('is-visible');
        }, 100);
      }
    });
  };

  // 立即檢查
  checkHeroVisibility();
}

// ==================== 初始化 ====================

/**
 * 主初始化函數
 */
function init() {
  console.log('[DocsPage] Initializing scroll animations');

  // 初始化首屏元素
  initHeroElements();

  // 初始化滾動動畫系統
  initScrollAnimations();

  // 監聽 reduced motion 偏好變更
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', (e) => {
    if (e.matches) {
      log('User enabled reduced motion');
      // 立即顯示所有元素
      document.querySelectorAll('.reveal').forEach(el => {
        el.classList.add('is-visible');
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }
  });
}

// Export for AppRouter
export default { init };
