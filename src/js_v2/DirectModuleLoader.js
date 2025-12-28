import { Sidebar } from './sidebar/sidebar.js';

/**
 * DirectModuleLoader - Hash-based SPA Router
 * Uses hash routing (#/page) to prevent direct file access on refresh
 */

class DirectModuleLoader {
  constructor() {
    this.contentContainer = document.getElementById('main-content');
    this.moduleCache = new Map();

    // Initialize sidebar   
    this.sidebar = new Sidebar();

    // Listen for hash changes (browser back/forward, manual hash change)
    window.addEventListener('hashchange', () => this.handleHashChange());

    // Listen for sidebar navigation
    window.addEventListener('navigate-to', (e) => {
      window.location.hash = e.detail.path;
    });

    // Load initial route
    this.handleHashChange();
  }

  /**
   * Handle URL hash changes
   */
  async handleHashChange() {
    const hash = window.location.hash.slice(1); // Remove #

    if (!hash || hash === '/') {
      this.showWelcome();
      return;
    }

    await this.loadPage(hash);
  }

  /**
   * Show welcome screen
   */
  showWelcome() {
    this.contentContainer.innerHTML = `
      <div class="welcome-screen" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666;">
        <i class="fas fa-box-open" style="font-size: 4rem; margin-bottom: 20px; color: #ddd;"></i>
        <h2>歡迎使用 3D 裝箱系統</h2>
        <p>請點擊左側選單開始。</p>
      </div>
    `;
  }

  /**
   * Load page HTML and JS module
   */
  async loadPage(path) {
    try {
      this.contentContainer.innerHTML = '<div style="padding: 40px; text-align: center;">載入中...</div>';

      // Fetch HTML
      const response = await fetch(path);
      if (!response.ok) throw new Error(`載入失敗: ${path}`);

      const html = await response.text();
      this.contentContainer.innerHTML = html;

      // Load JS module
      await this.loadModule(path);

    } catch (error) {
      console.error('Page load error:', error);
      this.contentContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #d32f2f;">
          <h3>載入失敗</h3>
          <p>${error.message}</p>
          <button onclick="location.hash=''" class="btn btn-primary">返回首頁</button>
        </div>
      `;
    }
  }

  /**
   * Load corresponding JavaScript module
   */
  async loadModule(htmlPath) {
    const jsPath = htmlPath
      .replace('/src/html/', '/src/js_v2/')
      .replace('.html', '.js')
      .replace('add_group', 'group_items/add_group')
      .replace('add_inventory', 'group_items/add_inventory')
      .replace('define_container', 'container/define_container')
      .replace('cut_container', 'container/cut_container_v2')
      .replace('assign_space', 'assign/assign_space')
      .replace('assign_sequence', 'assign/assign_sequence')
      .replace('view_final', 'view/view_final');

    try {
      if (this.moduleCache.has(jsPath)) {
        const PageModule = this.moduleCache.get(jsPath);
        if (PageModule.init) PageModule.init();
        return;
      }

      const module = await import(/* @vite-ignore */ jsPath);
      const PageModule = module.default || module[Object.keys(module)[0]];

      this.moduleCache.set(jsPath, PageModule);

      if (PageModule && PageModule.init) {
        PageModule.init();
      }

      console.log(`✓ Module loaded: ${jsPath}`);

    } catch (error) {
      console.warn(`No JS module for ${jsPath}`);
    }
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DirectModuleLoader());
} else {
  new DirectModuleLoader();
}
