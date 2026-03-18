import { Sidebar } from './sidebar/sidebar.js';

/**
 * AppRouter - Logical Route Based SPA Router
 * Uses hash routing with logical routes (#/page-name) instead of file paths
 */

class AppRouter {
  // Logical route to file path mapping
  static PATH_MAP = {
    '/docs': {
      html: '/src/html/docs/index.html',
      js: '/src/js_v2/docs/main.js'
    },
    '/docs/group-flow': {
      html: '/src/html/docs/group_flow.html',
      js: '/src/js_v2/docs/scroll_reveal.js'
    },
    '/docs/space-config': {
      html: '/src/html/docs/space_config.html',
      js: '/src/js_v2/docs/scroll_reveal.js'
    },
    '/docs/animation-preview': {
      html: '/src/html/docs/animation_preview_docs.html',
      js: '/src/js_v2/docs/scroll_reveal.js'
    },
    '/add-group': {
      html: '/src/html/app/group/add_group.html',
      js: '/src/js_v2/group_items/add_group.js'
    },
    '/add-inventory': {
      html: '/src/html/app/group/add_inventory.html',
      js: '/src/js_v2/group_items/add_inventory.js'
    },
    '/define-container': {
      html: '/src/html/app/space/define_container.html',
      js: '/src/js_v2/container/define_container.js'
    },
    '/cut-container': {
      html: '/src/html/app/space/cut_container.html',
      js: '/src/js_v2/container/cut_container_v2.js',
      exportName: 'SpacePlanningPage',
      additionalModules: ['/src/js_v2/container/secondary_region_editor.js']
    },
    '/assign-space': {
      html: '/src/html/app/space/assign_space.html',
      js: '/src/js_v2/assign/assign_space.js'
    },
    '/assign-sequence': {
      html: '/src/html/app/space/assign_sequence.html',
      js: '/src/js_v2/assign/assign_sequence.js'
    },
    '/view-final': {
      html: '/src/html/app/preview/packing_results_page.html',
      js: '/src/js_v2/view/packing_results_page.js'
    },
    '/animation-preview': {
      html: '/src/html/app/preview/animation_preview.html',
      js: '/src/js_v2/view/animation_preview.js'
    },
    // Performance Demos
    '/demo-worker': {
      html: '/src/html/worker_demo.html',
      js: '/src/js_v2/view/worker_demo.js'
    },
    '/demo-instanced': {
      html: '/src/html/instanced_mesh_demo.html',
      js: '/src/js_v2/view/instanced_mesh_demo.js'
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
    console.log('AppRouter init with path:', initialPath);
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
      console.log('[AppRouter] handlePath called with:', path);
      if (!path || path === '/') {
        // Load docs page as default instead of showing welcome screen
        console.log('[AppRouter] Loading default docs page...');
        const docsConfig = AppRouter.PATH_MAP['/docs'];
        console.log('[AppRouter] docsConfig:', docsConfig);
        if (docsConfig) {
          await this.loadPage('/docs', docsConfig);
          console.log('[AppRouter] Docs page loaded successfully');
        } else {
          console.warn('[AppRouter] No docs config found, showing welcome');
          this.showWelcome();
        }
        return;
      }

      // 1. Handle legacy paths (e.g., /src/html/cut_container.html)
      // This fixes browser history navigation issues
      if (path.includes('/src/html/')) {
        const legacyMap = {
          // Old paths (before restructure)
          '/src/html/add_group.html': '/add-group',
          '/src/html/add_inventory.html': '/add-inventory',
          '/src/html/define_container.html': '/define-container',
          '/src/html/cut_container.html': '/cut-container',
          '/src/html/assign_space.html': '/assign-space',
          '/src/html/assign_sequence.html': '/assign-sequence',
          '/src/html/view_final.html': '/view-final',
          '/src/html/packing_results_page.html': '/view-final',
          '/src/html/animation_preview.html': '/animation-preview',
          '/src/html/worker_demo.html': '/demo-worker',
          '/src/html/instanced_mesh_demo.html': '/demo-instanced',
          // New paths (after restructure)
          '/src/html/app/group/add_group.html': '/add-group',
          '/src/html/app/group/add_inventory.html': '/add-inventory',
          '/src/html/app/space/define_container.html': '/define-container',
          '/src/html/app/space/cut_container.html': '/cut-container',
          '/src/html/app/space/assign_space.html': '/assign-space',
          '/src/html/app/space/assign_sequence.html': '/assign-sequence',
          '/src/html/app/preview/view_final.html': '/view-final',
          '/src/html/app/preview/packing_results_page.html': '/view-final',
          '/src/html/app/preview/animation_preview.html': '/animation-preview'
        };

        const newRoute = legacyMap[path];
        if (newRoute) {
          console.log(`Redirecting legacy route: ${path} -> ${newRoute}`);
          window.location.hash = newRoute; // This will trigger hashchange again
          return;
        }
      }

      // Validate route exists in PATH_MAP
      const routeConfig = AppRouter.PATH_MAP[path];
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
        <p>請點擊左側選單開始新專案或管理設定。</p>

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
      await this.loadModule(config.js, config);

      // Load additional modules if specified
      if (config.additionalModules && Array.isArray(config.additionalModules)) {
        for (const modulePath of config.additionalModules) {
          await this.loadModule(modulePath, { isAdditional: true });
        }
      }

    } catch (error) {
      console.error('Page load error:', error);
      throw error; // Re-throw to be caught by handlePath
    }
  }

  /**
   * Load and initialize JavaScript module
   */
  async loadModule(jsPath, routeConfig = {}) {
    try {
      const isAdditionalModule = routeConfig.isAdditional || false;

      // Check cache
      if (this.moduleCache.has(jsPath)) {
        const PageModule = this.moduleCache.get(jsPath);
        // Only re-init main modules, not additional ones
        if (PageModule && PageModule.init && !isAdditionalModule) {
          PageModule.init();
          console.log(`✓ Module re-initialized from cache: ${jsPath}`);
        }
        return;
      }

      // Dynamic import
      const module = await import(/* @vite-ignore */ jsPath);

      // Use exportName if specified, otherwise fallback to default or first export
      let PageModule;
      if (routeConfig.exportName && module[routeConfig.exportName]) {
        PageModule = module[routeConfig.exportName];
      } else {
        PageModule = module.default || module[Object.keys(module)[0]];
      }

      this.moduleCache.set(jsPath, PageModule);

      // Only auto-init main modules, not additional modules
      if (PageModule && PageModule.init && !isAdditionalModule) {
        PageModule.init();
        console.log(`✓ Module loaded and initialized: ${jsPath}`);
      } else if (isAdditionalModule) {
        console.log(`✓ Additional module loaded (not auto-initialized): ${jsPath}`);
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
  document.addEventListener('DOMContentLoaded', () => new AppRouter());
} else {
  new AppRouter();
}
