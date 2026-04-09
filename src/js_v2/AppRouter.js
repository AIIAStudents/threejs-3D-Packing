import { Sidebar } from './sidebar/sidebar.js?v=2';
import DocsMain from './docs/main.js';
import { ScrollReveal } from './docs/scroll_reveal.js';
import { AddGroupPage } from './group_items/add_group.js';
import { AddInventoryPage } from './group_items/add_inventory.js';
import { DefineContainerPage } from './container/define_container.js';
import { SpacePlanningPage } from './container/cut_container_v2.js';
import './container/secondary_region_editor.js';
import { AssignSpacePage } from './assign/assign_space.js';
import { AssignSequencePage } from './assign/assign_sequence.js';
import { PackingResultsPage } from './view/packing_results_page.js';

class AppRouter {
  static HTML_MODULES = import.meta.glob('../html/**/*.html', {
    query: '?raw',
    import: 'default'
  });

  static PATH_MAP = {
    '/docs': {
      html: '/src/html/docs/index.html',
      module: DocsMain
    },
    '/docs/group-flow': {
      html: '/src/html/docs/group_flow.html',
      module: ScrollReveal
    },
    '/docs/space-config': {
      html: '/src/html/docs/space_config.html',
      module: ScrollReveal
    },
    '/docs/animation-preview': {
      html: '/src/html/docs/animation_preview_docs.html',
      module: ScrollReveal
    },
    '/add-group': {
      html: '/src/html/app/group/add_group.html',
      module: AddGroupPage
    },
    '/add-inventory': {
      html: '/src/html/app/group/add_inventory.html',
      module: AddInventoryPage
    },
    '/planning-v2': {
      html: '/src/html/app/space/warehouse_planning_v2.html',
      loadModule: async () => {
        const module = await import('./planning/warehouse_planning_v2.js?v=26');
        return module.WarehousePlanningV2Page;
      }
    },
    '/define-container': {
      html: '/src/html/app/space/define_container.html',
      module: DefineContainerPage
    },
    '/cut-container': {
      html: '/src/html/app/space/cut_container.html',
      module: SpacePlanningPage
    },
    '/assign-space': {
      html: '/src/html/app/space/assign_space.html',
      module: AssignSpacePage
    },
    '/assign-sequence': {
      html: '/src/html/app/space/assign_sequence.html',
      module: AssignSequencePage
    },
    '/view-final': {
      html: '/src/html/app/preview/packing_results_page.html',
      module: PackingResultsPage
    },
    '/animation-preview': {
      html: '/src/html/app/preview/animation_preview.html',
      loadModule: async () => {
        const module = await import('./view/animation_preview.js?v=3');
        return module.default;
      }
    }
  };

  constructor() {
    this.contentContainer = document.getElementById('main-content');
    this.pageCache = new Map();
    this.sidebar = new Sidebar();

    window.addEventListener('hashchange', () => this.handleHashChange());
    window.addEventListener('route-change', (event) => {
      console.log('Route change event:', event.detail.path);
    });

    this.init();
  }

  normalizePath(path) {
    const rawPath = typeof path === 'string' ? path : '';
    const decodedPath = (() => {
      try {
        return decodeURIComponent(rawPath);
      } catch {
        return rawPath;
      }
    })();

    const normalized = decodedPath
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/{2,}/g, '/');

    if (!normalized) {
      return '';
    }

    if (normalized.length > 1 && normalized.endsWith('/')) {
      return normalized.slice(0, -1);
    }

    return normalized;
  }

  init() {
    const initialPath = this.normalizePath(window.location.hash.slice(1)) || '/planning-v2';
    console.log('AppRouter init with path:', initialPath);
    this.handlePath(initialPath);
  }

  async handleHashChange() {
    const path = this.normalizePath(window.location.hash.slice(1));
    console.log('Hash changed to:', path);
    await this.handlePath(path);
  }

  normalizeLegacyPath(path) {
    const legacyMap = {
      '/src/html/add_group.html': '/add-group',
      '/src/html/add_inventory.html': '/add-inventory',
      '/src/html/define_container.html': '/define-container',
      '/src/html/cut_container.html': '/cut-container',
      '/src/html/assign_space.html': '/assign-space',
      '/src/html/assign_sequence.html': '/assign-sequence',
      '/src/html/view_final.html': '/view-final',
      '/src/html/packing_results_page.html': '/view-final',
      '/src/html/animation_preview.html': '/animation-preview',
      '/src/html/app/group/add_group.html': '/add-group',
      '/src/html/app/group/add_inventory.html': '/add-inventory',
      '/src/html/app/space/warehouse_planning_v2.html': '/planning-v2',
      '/src/html/app/space/define_container.html': '/define-container',
      '/src/html/app/space/cut_container.html': '/cut-container',
      '/src/html/app/space/assign_space.html': '/assign-space',
      '/src/html/app/space/assign_sequence.html': '/assign-sequence',
      '/src/html/app/preview/packing_results_page.html': '/view-final',
      '/src/html/app/preview/animation_preview.html': '/animation-preview'
    };

    return legacyMap[path] || path;
  }

  async handlePath(path) {
    try {
      console.log('[AppRouter] handlePath called with:', path);
      if (!path || path === '/') {
        window.location.hash = '/planning-v2';
        return;
      }

      const cleanedPath = this.normalizePath(path);

      const normalizedPath = cleanedPath.includes('/src/html/')
        ? this.normalizePath(this.normalizeLegacyPath(cleanedPath))
        : cleanedPath;

      if (normalizedPath !== path) {
        window.location.hash = normalizedPath;
        return;
      }

      const routeConfig = AppRouter.PATH_MAP[normalizedPath];
      if (!routeConfig) {
        this.showError(`找不到路由：${normalizedPath}`);
        return;
      }

      await this.loadPage(normalizedPath, routeConfig);
    } catch (error) {
      console.error('Handle path error:', error);
      this.showError(`載入頁面失敗：${error.message}`);
    }
  }

  showError(message) {
    this.contentContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #d32f2f;">
        <h3>頁面載入失敗</h3>
        <p>${message}</p>
        <button onclick="location.hash=''" class="btn btn-primary">回到首頁</button>
      </div>
    `;
  }

  async loadPage(route, config) {
    this.contentContainer.innerHTML = '<div style="padding: 40px; text-align: center;">載入中...</div>';
    console.log(`Loading route: ${route}`, config);

    const html = await this.loadRouteHtml(config.html);
    this.contentContainer.innerHTML = html;
    console.log(`HTML loaded: ${config.html}`);

    const pageModule = config.loadModule
      ? await config.loadModule()
      : config.module;

    this.initPageModule(route, pageModule);
  }

  initPageModule(route, pageModule) {
    if (!pageModule || typeof pageModule.init !== 'function') {
      console.warn(`[AppRouter] Page module missing init(): ${route}`);
      return;
    }

    this.pageCache.set(route, pageModule);
    pageModule.init();
    console.log(`Module initialized: ${route}`);
  }

  async loadRouteHtml(htmlPath) {
    const modulePath = this.toHtmlModulePath(htmlPath);
    const loader = modulePath ? AppRouter.HTML_MODULES[modulePath] : null;

    if (loader) {
      return await loader();
    }

    const response = await fetch(htmlPath);
    if (!response.ok) {
      throw new Error(`HTML fetch failed: ${response.statusText}`);
    }

    return await response.text();
  }

  toHtmlModulePath(htmlPath) {
    if (typeof htmlPath !== 'string' || !htmlPath.startsWith('/src/html/')) {
      return null;
    }

    return htmlPath.replace('/src/html/', '../html/');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AppRouter());
} else {
  new AppRouter();
}
