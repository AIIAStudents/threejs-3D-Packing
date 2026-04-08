/*
    File: sidebar.js
    Description: Sidebar navigation with logical hash routing
*/
export class Sidebar {
  constructor() {
    this.container = document.getElementById('controls');
    this.menuItems = [
      {
        id: 'group-flow',
        title: '群組流程',
        icon: '鏈',
        children: [
          { id: 'view-add-group', title: '新增群組', target: '/add-group' },
          { id: 'view-add-inventory', title: '新增物件', target: '/add-inventory' }
        ]
      },
      {
        id: 'space-planning',
        title: '空間規劃',
        icon: '工',
        children: [
          { id: 'view-container-config', title: '定義容器', target: '/define-container' },
          { id: 'view-planning-v2', title: '智慧規劃', target: '/planning-v2' },
          { id: 'view-assign-space', title: '分配物件', target: '/assign-space' },
          { id: 'view-assign-sequence', title: '排序設定', target: '/assign-sequence' },
          { id: 'view-result', title: '規劃結果', target: '/view-final' }
        ]
      },
      {
        id: 'animation-section',
        title: '3D 動畫預覽',
        icon: '3D',
        children: [
          { id: 'view-animation', title: '3D 預覽', target: '/animation-preview' }
        ]
      }
    ];
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('[Sidebar] Container #controls not found');
      return;
    }

    this.render();
    this.addEventListeners();

    window.addEventListener('hashchange', () => {
      const path = window.location.hash.slice(1);
      this.updateActiveState(path);
    });

    const initialPath = window.location.hash.slice(1) || '/';
    this.updateActiveState(initialPath);
  }

  render() {
    let html = '<div class="sidebar-header" style="cursor: pointer;" data-home="true"><h3>3D Packer</h3></div><div class="sidebar-menu">';
    const docsRoutes = {
      'group-flow': '/docs/group-flow',
      'space-planning': '/docs/space-config',
      'animation-section': '/docs/animation-preview'
    };

    this.menuItems.forEach((section) => {
      const docsTarget = docsRoutes[section.id] || '';
      const cursorStyle = docsTarget ? 'cursor: pointer;' : '';
      const dataAttr = docsTarget ? `data-docs-target="${docsTarget}"` : '';

      html += `
        <div class="menu-section">
          <div class="section-title" style="${cursorStyle}" ${dataAttr}>
            <span class="icon">${section.icon}</span>
            <span class="section-title-label">${section.title}</span>
          </div>
          <ul class="section-items">
      `;

      section.children.forEach((item) => {
        html += `
          <li class="menu-item" data-target="${item.target}">
            <span class="menu-item-label">${item.title}</span>
          </li>
        `;
      });

      html += '</ul></div>';
    });

    html += '</div>';
    this.container.innerHTML = html;
  }

  addEventListeners() {
    const header = this.container.querySelector('.sidebar-header');
    if (header) {
      header.addEventListener('click', () => {
        this.loadPage('/docs');
      });
    }

    this.container.querySelectorAll('.section-title[data-docs-target]').forEach((title) => {
      title.addEventListener('click', () => {
        const target = title.dataset.docsTarget;
        if (target) {
          this.loadPage(target);
        }
      });
    });

    this.container.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.dataset.target;
        if (target) {
          this.loadPage(target);
        }
      });
    });
  }

  setActive(element) {
    this.container.querySelectorAll('.menu-item').forEach((entry) => entry.classList.remove('active'));
    if (element) {
      element.classList.add('active');
    }
  }

  updateActiveState(path) {
    let logicalPath = path;
    if (path.includes('/assign_space.html')) logicalPath = '/assign-space';
    if (path.includes('/define_container.html')) logicalPath = '/define-container';
    if (path.includes('/warehouse_planning_v2.html')) logicalPath = '/planning-v2';
    if (path.includes('/packing_results_page.html')) logicalPath = '/view-final';

    const items = this.container.querySelectorAll('.menu-item');
    let found = false;

    items.forEach((item) => {
      if (item.dataset.target === logicalPath) {
        this.setActive(item);
        found = true;
      }
    });

    if (!found && path !== '/' && path !== '') {
      console.warn(`[Sidebar] No menu item found for path: ${path}`);
    }
  }

  async loadPage(route) {
    window.location.hash = route;
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { path: route }
    }));
  }
}
