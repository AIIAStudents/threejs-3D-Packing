export const AddGroupPage = {
  API_BASE: 'http://127.0.0.1:8888/api',
  groups: [],

  init() {
    this.form = document.getElementById('add-group-form');
    this.groupsList = document.getElementById('groups-list');
    this.saveBtn = document.getElementById('save-changes-btn');

    // Modal elements
    this.modal = document.getElementById('group-modal');
    this.openModalBtn = document.getElementById('open-group-modal-btn');
    this.closeModalBtn = document.getElementById('modal-close-group');
    this.cancelBtn = document.getElementById('cancel-group-btn');

    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());

    // Modal events
    this.openModalBtn?.addEventListener('click', () => this.openModal());
    this.closeModalBtn?.addEventListener('click', () => this.closeModal());
    this.cancelBtn?.addEventListener('click', () => this.closeModal());

    this.loadGroups();
  },

  openModal() {
    if (this.modal) {
      this.modal.classList.add('active');
      this.form.reset();
      setTimeout(() => document.getElementById('group-name')?.focus(), 100);
    }
  },

  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('active');
    }
  },

  async loadGroups() {
    try {
      const response = await fetch(`${this.API_BASE}/groups`);
      if (!response.ok) throw new Error('載入失敗');

      this.groups = await response.json();
      this.renderGroups();

    } catch (error) {
      console.error('Error loading groups:', error);
      this.groupsList.innerHTML = '<div class="error">載入失敗</div>';
    }
  },

  renderGroups() {
    if (this.groups.length === 0) {
      this.renderEmptyState();
      return;
    }

    let html = '<div class="groups-grid">';

    this.groups.forEach(group => {
      html += `
        <div class="group-card">
          <div class="group-info">
            <h4>${group.name}</h4>
            <p class="group-id">ID: ${group.id}</p>
          </div>
          <div class="group-actions">
            <button class="btn btn-sm btn-danger delete-btn" data-id="${group.id}" title="刪除">
              🗑️ 刪除
            </button>
          </div>
        </div>
      `;
    });

    html += '</div>';
    this.groupsList.innerHTML = html;

    // Add delete handlers
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.deleteGroup(id);
      });
    });
  },

  renderEmptyState() {
    this.groupsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>當前群組內沒有新增任何群組</h3>
        <p>請點選下方按鈕建立您的第一個群組。</p>
        <button class="btn btn-primary" id="add-first-group">+ 新增群組</button>
      </div>
    `;

    document.getElementById('add-first-group')?.addEventListener('click', () => {
      document.getElementById('group-name')?.focus();
    });
  },

  async handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const groupName = formData.get('name');

    if (!groupName) {
      alert('請輸入群組名稱');
      return;
    }

    try {
      const response = await fetch(`${this.API_BASE}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName })
      });

      if (!response.ok) throw new Error('新增失敗');

      this.closeModal(); // Close the input modal first

      // Show Success Modal
      const successModal = document.getElementById('success-modal');
      const successTitle = successModal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (successModal && okBtn) {
        successTitle.textContent = '新增成功'; // Update text
        successModal.classList.add('active');

        const handleOk = () => {
          successModal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
          // Reload data after confirmation
          this.loadGroups();
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('新增成功！');
        this.loadGroups();
      }

      this.form.reset();

    } catch (error) {
      console.error('Error creating group:', error);
      alert('新增失敗: ' + error.message);
    }
  },

  async deleteGroup(id) {
    if (!confirm('確定要刪除此群組嗎？刪除群組會同時刪除該群組的所有物件！')) {
      return;
    }

    try {
      const response = await fetch(`${this.API_BASE}/groups/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('刪除失敗');

      // Show Success Modal
      const successModal = document.getElementById('success-modal');
      const successTitle = successModal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (successModal && okBtn) {
        successTitle.textContent = '刪除成功'; // Update text
        successModal.classList.add('active');

        const handleOk = () => {
          successModal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
          this.loadGroups();
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('刪除成功！');
        await this.loadGroups();
      }

    } catch (error) {
      console.error('Error deleting group:', error);
      alert('刪除失敗: ' + error.message);
    }
  },

  async handleSaveChanges() {
    // Show Success Modal
    const modal = document.getElementById('success-modal');
    const successTitle = modal.querySelector('.modal-title');
    const okBtn = document.getElementById('btn-modal-ok');

    if (modal && okBtn) {
      successTitle.textContent = '更新成功';
      modal.classList.add('active');

      const handleOk = () => {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', handleOk);
        // Reload to ensure UI is in sync with database
        this.loadGroups();
      };

      okBtn.addEventListener('click', handleOk);
    } else {
      // Fallback
      alert('儲存變更成功！');
      await this.loadGroups();
    }
  }
};
