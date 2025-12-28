export const AddInventoryPage = {
  API_BASE: 'http://127.0.0.1:8888/api',
  groups: [],
  items: [],
  currentPage: 1,
  itemsPerPage: 20,
  currentFilter: '',

  async init() {
    console.log('🔧 AddInventoryPage.init() called');
    this.modal = document.getElementById('item-modal');
    this.form = document.getElementById('add-item-form');
    this.itemsList = document.getElementById('items-list');
    this.filterSelect = document.getElementById('filter-group');
    this.saveBtn = document.getElementById('save-changes-btn');

    if (!this.itemsList) {
      console.error('❌ items-list element not found!');
      return;
    }

    console.log('✓ DOM elements found');

    document.getElementById('open-modal-btn')?.addEventListener('click', () => this.openModal());
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeModal());
    document.getElementById('cancel-btn')?.addEventListener('click', () => this.closeModal());
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.loadItems());
    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());

    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    this.filterSelect?.addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.currentPage = 1;
      this.renderItems();
    });

    console.log('✓ Event listeners attached');
    console.log('📡 Loading groups and items...');
    await this.loadGroups();
    await this.loadItems();
    console.log('✓ Data loaded');
  },

  async loadGroups() {
    try {
      const response = await fetch(`${this.API_BASE}/groups`);
      if (!response.ok) throw new Error('無法載入群組');
      this.groups = await response.json();

      // Populate filter dropdown (NO "全部群組" option)
      this.filterSelect.innerHTML = this.groups.map(g =>
        `<option value="${g.id}">${g.name}</option>`
      ).join('');

      // Set default filter to first group
      if (this.groups.length > 0) {
        this.currentFilter = this.groups[0].id.toString();
        this.filterSelect.value = this.currentFilter;
      }

      // Populate modal group selector
      const itemGroupSelect = document.getElementById('item-group');
      if (itemGroupSelect) {
        itemGroupSelect.innerHTML = this.groups.map(g =>
          `<option value="${g.id}">${g.name}</option>`
        ).join('');
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      this.showError('載入群組失敗。', () => this.loadGroups());
    }
  },

  async loadItems() {
    try {
      this.showLoading('載入物件中...');
      const response = await fetch(`${this.API_BASE}/items`);
      if (!response.ok) throw new Error('無法載入物件');
      this.items = await response.json();
      this.hideLoading();
      this.currentPage = 1;
      this.renderItems();
    } catch (error) {
      console.error('Error loading items:', error);
      this.showError('載入物件失敗。', () => this.loadItems());
    }
  },

  showLoading(message = '載入中...') {
    if (this.itemsList) {
      this.itemsList.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>${message}</p>
        </div>
      `;
    }
  },

  hideLoading() {
    const loadingEl = this.itemsList?.querySelector('.loading-state');
    if (loadingEl) loadingEl.remove();
  },

  showError(message, retryFn) {
    if (this.itemsList) {
      this.itemsList.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <p class="error-message">${message}</p>
          ${retryFn ? '<button class="btn btn-primary retry-btn">重試</button>' : ''}
        </div>
      `;

      if (retryFn) {
        const retryBtn = this.itemsList.querySelector('.retry-btn');
        retryBtn?.addEventListener('click', retryFn);
      }
    }
  },

  renderItems() {
    const filteredItems = this.currentFilter
      ? this.items.filter(item => item.group_id.toString() === this.currentFilter)
      : this.items;

    // Check for empty state
    if (filteredItems.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / this.itemsPerPage);
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = startIdx + this.itemsPerPage;
    const paginatedItems = filteredItems.slice(startIdx, endIdx);

    let html = `
      <table class="items-table">
        <thead>
          <tr>
            <th>編號</th>
            <th>群組</th>
            <th>長(L)</th>
            <th>寬(W)</th>
            <th>高(H)</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
    `;

    paginatedItems.forEach(item => {
      const group = this.groups.find(g => g.id === item.group_id);
      html += `
        <tr>
          <td><strong>${item.item_id}</strong></td>
          <td>${group ? group.name : 'N/A'}</td>
          <td>${item.length}</td>
          <td>${item.width}</td>
          <td>${item.height}</td>
          <td>
            <span class="delete-icon" data-id="${item.id}" title="刪除">🗑️</span>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // Add pagination controls if needed
    if (totalPages > 1) {
      html += `
        <div class="pagination">
          <button class="page-btn" id="prev-page" ${this.currentPage === 1 ? 'disabled' : ''}>
            上一頁
          </button>
          <span class="page-info">第 ${this.currentPage} 頁 / 共 ${totalPages} 頁</span>
          <button class="page-btn" id="next-page" ${this.currentPage === totalPages ? 'disabled' : ''}>
            下一頁
          </button>
        </div>
      `;
    }

    this.itemsList.innerHTML = html;

    // Add pagination event listeners
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderItems();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredItems.length / this.itemsPerPage);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderItems();
      }
    });

    // Add delete handlers
    document.querySelectorAll('.delete-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.deleteItem(id);
      });
    });
  },

  renderEmptyState() {
    this.itemsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>當前群組內沒有新增任何物件</h3>
        <p>請點選下方按鈕建立您的第一個物件。</p>
        <button class="btn btn-primary" id="add-first-item">+ 新增物件</button>
      </div>
    `;

    document.getElementById('add-first-item')?.addEventListener('click', () => this.openModal());
  },

  async handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const baseName = formData.get('item_name');
    const groupId = parseInt(formData.get('group_id'));
    const quantity = parseInt(formData.get('quantity')) || 1;

    const itemData = {
      group_id: groupId,
      length: parseFloat(formData.get('length')),
      width: parseFloat(formData.get('width')),
      height: parseFloat(formData.get('height'))
    };

    if (!groupId) {
      alert('請選擇群組');
      return;
    }

    try {
      // Get submit button for progress indication
      const submitBtn = this.form.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent || '確認新增';

      // Show progress
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = `新增中... (${quantity} 個物件)`;
      }

      // Prepare bulk insert data
      const items = [];
      for (let i = 0; i < quantity; i++) {
        const itemId = quantity === 1 ? baseName : `${baseName}_${i + 1}`;
        items.push({
          item_id: itemId,
          ...itemData
        });
      }

      // 🚀 Use bulk insert API (10-100x faster!)
      const response = await fetch(`${this.API_BASE}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      const result = await response.json();

      if (response.ok) {
        const message = result.skipped > 0
          ? `成功新增 ${result.count} 個物件！(跳過 ${result.skipped} 個重複項)`
          : `✓ 成功新增 ${result.count} 個物件！`;

        alert(message);
        this.closeModal();
        await this.loadItems();
      } else {
        throw new Error(result.error || '新增失敗');
      }

      // Restore button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }

    } catch (error) {
      console.error(error);
      alert('新增失敗: ' + error.message);

      // Restore button on error
      const submitBtn = this.form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '確認新增';
      }
    }
  },

  async deleteItem(id) {
    if (!confirm('確定要刪除此物件嗎？')) return;

    try {
      const response = await fetch(`${this.API_BASE}/items/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('刪除成功！');
        await this.loadItems();
      }
    } catch (error) {
      console.error(error);
      alert('刪除失敗');
    }
  },

  openModal() {
    this.modal.classList.add('active');
    this.form.reset();
  },

  closeModal() {
    this.modal.classList.remove('active');
  },

  async handleSaveChanges() {
    // This function always shows success message
    // Database updates happen in real-time during add/delete operations
    alert('儲存變更成功！');

    // Reload to ensure UI is in sync with database
    await this.loadItems();
  }
};
