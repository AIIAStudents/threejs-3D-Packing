/*
    File: sidebar.js
    Description: Sidebar navigation with logical hash routing
*/
export class Sidebar {
  constructor() {
    this.container = document.getElementById('controls');
    // Define menu structure with LOGICAL routes
    this.menuItems = [
      {
        id: 'group-flow',
        title: '群組流程',
        icon: '🔗',
        children: [
          { id: 'view-add-group', title: '新增群組', target: '/add-group' },
          { id: 'view-add-inventory', title: '新增物件', target: '/add-inventory' }
        ]
      },
      {
        id: 'space-planning',
        title: '空間配置',
        icon: '📏',
        children: [
          { id: 'view-container-config', title: '空間大小', target: '/define-container' },
          { id: 'view-cut-container', title: '切割容器', target: '/cut-container' },
          { id: 'view-assign-space', title: '分配物件', target: '/assign-space' },
          { id: 'view-assign-sequence', title: '排序設定', target: '/assign-sequence' },
          { id: 'view-result', title: '預覽畫面', target: '/view-final' }
        ]
      },
      {
        id: 'animation-section',
        title: '動畫預覽',
        icon: '🎬',
        children: [
          { id: 'view-animation', title: '3D 預覽', target: '/animation-preview' }
        ]
      }
    ];
    this.init();
  }

  init() {
    console.log('[Sidebar] Initializing with container:', this.container);
    if (!this.container) {
      console.error('[Sidebar] Container #controls not found!');
      return;
    }
    this.render();
    this.addEventListeners();

    // Listen for hash changes to update active state
    window.addEventListener('hashchange', () => {
      const path = window.location.hash.slice(1);
      this.updateActiveState(path);
    });

    // Set initial active state based on current hash
    const initialPath = window.location.hash.slice(1) || '/';
    this.updateActiveState(initialPath);

    console.log('[Sidebar] Rendered successfully');
  }

  render() {
    let html = '<div class="sidebar-header"><h3>3D Packer</h3></div><div class="sidebar-menu">';

    this.menuItems.forEach(section => {
      html += `
        <div class="menu-section">
          <div class="section-title">
            <span class="icon">${section.icon}</span>
            <span>${section.title}</span>
          </div>
          <ul class="section-items">
      `;

      section.children.forEach(item => {
        html += `
          <li class="menu-item" data-target="${item.target}">
            ${item.title}
          </li>
        `;
      });

      html += `</ul></div>`;
    });

    html += '</div>';
    this.container.innerHTML = html;
  }

  addEventListeners() {
    this.container.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const target = item.dataset.target;
        if (target) {
          this.loadPage(target);
          // Active state will be updated by hashchange listener
        }
      });
    });
  }

  setActive(element) {
    this.container.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
  }

  updateActiveState(path) {
    // Handle potential legacy paths or clean up path
    // DirectModuleLoader handles the redirection, so sidebar just needs to match the final hash

    // Find matching menu item
    // We use endsWith or includes because the path might have extra params eventually, 
    // but for now exact match or mapping is best. 
    // Given the legacy redirect in DirectModuleLoader, we should try to match the logical route.

    let logicalPath = path;

    // Simple mapping for legacy HTML paths if they somehow persist in UI checks
    if (path.includes('/src/html/assign_space.html')) logicalPath = '/assign-space';
    if (path.includes('/src/html/define_container.html')) logicalPath = '/define-container';

    const items = this.container.querySelectorAll('.menu-item');
    let found = false;

    items.forEach(item => {
      if (item.dataset.target === logicalPath) {
        this.setActive(item);
        found = true;
      }
    });

    // If not found (maybe legacy path), try to fallback logic if needed
    if (!found) {
      console.warn(`[Sidebar] No menu item found for path: ${path}`);
    }
  }

  async loadPage(route) {
    // Navigate using hash with LOGICAL route
    window.location.hash = route;
    // Dispatch custom event for route change
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { path: route }
    }));
  }
}
