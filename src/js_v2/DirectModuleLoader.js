import { Sidebar } from './sidebar/sidebar.js';

/**
 * DirectModuleLoader - Logical Route Based SPA Router
 * Uses hash routing with logical routes (#/page-name) instead of file paths
 */

class DirectModuleLoader {
  // Logical route to file path mapping
  static PATH_MAP = {
    '/add-group': {
      html: '/src/html/add_group.html',
      js: '/src/js_v2/group_items/add_group.js'
    },
    '/add-inventory': {
      html: '/src/html/add_inventory.html',
      js: '/src/js_v2/group_items/add_inventory.js'
    },
    '/define-container': {
      html: '/src/html/define_container.html',
      js: '/src/js_v2/container/define_container.js'
    },
    '/cut-container': {
      html: '/src/html/cut_container.html',
      js: '/src/js_v2/container/cut_container_v2.js'
    },
    '/assign-space': {
      html: '/src/html/assign_space.html',
      js: '/src/js_v2/assign/assign_space.js'
    },
    '/assign-sequence': {
      html: '/src/html/assign_sequence.html',
      js: '/src/js_v2/assign/assign_sequence.js'
    },
    '/view-final': {
      html: '/src/html/view_final.html',
      js: '/src/js_v2/view/view_final.js'
    },
    '/animation-preview': {
      html: '/src/html/animation_preview.html',
      js: '/src/js_v2/view/animation_preview.js'
    }
  };

  constructor() {
    this.contentContainer = document.getElementById('main-content');
    this.moduleCache = new Map();

    // Initialize sidebar (controls)
    this.sidebar = new Sidebar();

    // Listen for hash changes (browser back/forward, manual hash change)
    window.addEventListener('hashchange', () => this.handleHashChange());

    // Listen for route change events from sidebar
    window.addEventListener('route-change', (e) => {
      console.log('Route change event:', e.detail.path);
    });

    // Load initial route from hash
    this.init();
  }

  /**
   * Initialize with current hash
   */
  init() {
    const initialPath = window.location.hash.slice(1) || '/';
    console.log('DirectModuleLoader init with path:', initialPath);
    this.handlePath(initialPath);
  }

  /**
   * Handle URL hash changes
   */
  async handleHashChange() {
    const path = window.location.hash.slice(1); // Remove #
    console.log('Hash changed to:', path);
    await this.handlePath(path);
  }

  /**
   * Handle route path with error handling
   */
  async handlePath(path) {
    try {
      if (!path || path === '/') {
        this.showWelcome();
        return;
      }

      // 1. Handle legacy paths (e.g., /src/html/cut_container.html)
      // This fixes browser history navigation issues
      if (path.includes('/src/html/')) {
        const legacyMap = {
          '/src/html/add_group.html': '/add-group',
          '/src/html/add_inventory.html': '/add-inventory',
          '/src/html/define_container.html': '/define-container',
          '/src/html/cut_container.html': '/cut-container',
          '/src/html/assign_space.html': '/assign-space',
          '/src/html/assign_sequence.html': '/assign-sequence',
          '/src/html/view_final.html': '/view-final',
          '/src/html/animation_preview.html': '/animation-preview'
        };

        const newRoute = legacyMap[path];
        if (newRoute) {
          console.log(`Redirecting legacy route: ${path} -> ${newRoute}`);
          window.location.hash = newRoute; // This will trigger hashchange again
          return;
        }
      }

      // Validate route exists in PATH_MAP
      const routeConfig = DirectModuleLoader.PATH_MAP[path];
      if (!routeConfig) {
        console.error(`Route not found: ${path}`);
        this.showError(`路由不存在: ${path}`);
        return;
      }

      await this.loadPage(path, routeConfig);

    } catch (error) {
      console.error('Handle path error:', error);
      this.showError(`載入失敗: ${error.message}`);
    }
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
   * Show error screen
   */
  showError(message) {
    this.contentContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #d32f2f;">
        <h3>❌ 載入失敗</h3>
        <p>${message}</p>
        <button onclick="location.hash=''" class="btn btn-primary">返回首頁</button>
      </div>
    `;
  }

  /**
   * Load page HTML and JS module using PATH_MAP
   */
  async loadPage(route, config) {
    try {
      // Clear container before loading
      this.contentContainer.innerHTML = '<div style="padding: 40px; text-align: center;">⏳ 載入中...</div>';

      console.log(`Loading route: ${route}`, config);

      // Fetch HTML
      const response = await fetch(config.html);
      if (!response.ok) throw new Error(`HTML fetch failed: ${response.statusText}`);

      const html = await response.text();
      this.contentContainer.innerHTML = html;

      console.log(`✓ HTML loaded: ${config.html}`);

      // Load JS module
      await this.loadModule(config.js);

    } catch (error) {
      console.error('Page load error:', error);
      throw error; // Re-throw to be caught by handlePath
    }
  }

  /**
   * Load and initialize JavaScript module
   */
  async loadModule(jsPath) {
    try {
      // Check cache
      if (this.moduleCache.has(jsPath)) {
        const PageModule = this.moduleCache.get(jsPath);
        if (PageModule && PageModule.init) {
          PageModule.init();
          console.log(`✓ Module re-initialized from cache: ${jsPath}`);
        }
        return;
      }

      // Dynamic import
      const module = await import(/* @vite-ignore */ jsPath);
      const PageModule = module.default || module[Object.keys(module)[0]];

      this.moduleCache.set(jsPath, PageModule);

      if (PageModule && PageModule.init) {
        PageModule.init();
        console.log(`✓ Module loaded and initialized: ${jsPath}`);
      } else {
        console.warn(`⚠️ Module loaded but no init function: ${jsPath}`);
      }

    } catch (error) {
      console.error(`❌ Module load failed: ${jsPath}`, error);
      // Don't throw - allow page to display even if JS fails
    }
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DirectModuleLoader());
} else {
  new DirectModuleLoader();
}
