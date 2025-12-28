/*
    File: sidebar.js
    Description: Sidebar navigation logic with hash-based routing
*/
export class Sidebar {
  constructor() {
    this.container = document.getElementById('sidebar');
    // Define menu structure
    this.menuItems = [
      {
        id: 'group-flow',
        title: '群組流程',
        icon: '🔗',
        children: [
          { id: 'view-add-group', title: '新增群組', target: '/src/html/add_group.html' },
          { id: 'view-add-inventory', title: '新增物件', target: '/src/html/add_inventory.html' }
        ]
      },
      {
        id: 'space-planning',
        title: '空間配置',
        icon: '📐',
        children: [
          { id: 'view-container-config', title: '空間大小', target: '/src/html/define_container.html' },
          { id: 'view-cut-container', title: '切割容器', target: '/src/html/cut_container.html' },
          { id: 'view-assign-space', title: '分配物件', target: '/src/html/assign_space.html' },
          { id: 'view-assign-sequence', title: '排序設定', target: '/src/html/assign_sequence.html' },
          { id: 'view-result', title: '預覽畫面', target: '/src/html/view_final.html' }
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

  async loadPage(url) {
    // Navigate using hash
    window.location.hash = url;
  }
}
