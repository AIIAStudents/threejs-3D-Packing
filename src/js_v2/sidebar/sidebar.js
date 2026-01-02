/*
    File: sidebar.js
    Description: Sidebar navigation with logical hash routing
*/
export class Sidebar {
  constructor() {
    this.container = document.getElementById('sidebar');
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
        icon: '📐',
        children: [
          { id: 'view-container-config', title: '空間大小', target: '/define-container' },
          { id: 'view-cut-container', title: '切割容器', target: '/cut-container' },
          { id: 'view-assign-space', title: '分配物件', target: '/assign-space' },
          { id: 'view-assign-sequence', title: '排序設定', target: '/assign-sequence' },
          { id: 'view-result', title: '預覽畫面', target: '/view-final' }
        ]
      }
    ];
    this.init();
  }

  init() {
    if (!this.container) return;
    this.render();
    this.addEventListeners();
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
          this.setActive(item);
        }
      });
    });
  }

  setActive(element) {
    this.container.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
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
