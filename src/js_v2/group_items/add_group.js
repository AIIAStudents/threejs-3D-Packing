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

    // Rename modal elements
    this.renameModal = document.getElementById('rename-group-modal');
    this.renameForm = document.getElementById('rename-group-form');
    this.renameInput = document.getElementById('rename-group-name');
    this.closeRenameBtn = document.getElementById('modal-close-rename');
    this.cancelRenameBtn = document.getElementById('cancel-rename-btn');

    // Note modal elements
    this.noteModal = document.getElementById('note-group-modal');
    this.noteForm = document.getElementById('note-group-form');
    this.noteTextarea = document.getElementById('group-note-text');
    this.closeNoteBtn = document.getElementById('modal-close-note');
    this.cancelNoteBtn = document.getElementById('cancel-note-btn');

    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    this.saveBtn?.addEventListener('click', () => this.handleSaveChanges());

    // Modal events
    this.openModalBtn?.addEventListener('click', () => this.openModal());
    this.closeModalBtn?.addEventListener('click', () => this.closeModal());
    this.cancelBtn?.addEventListener('click', () => this.closeModal());

    // Rename modal events
    this.renameForm?.addEventListener('submit', (e) => this.handleRenameSubmit(e));
    this.closeRenameBtn?.addEventListener('click', () => this.closeRenameModal());
    this.cancelRenameBtn?.addEventListener('click', () => this.closeRenameModal());

    // Note modal events
    this.noteForm?.addEventListener('submit', (e) => this.handleNoteSubmit(e));
    this.closeNoteBtn?.addEventListener('click', () => this.closeNoteModal());
    this.cancelNoteBtn?.addEventListener('click', () => this.closeNoteModal());

    // Global click handler to close dropdowns (only add once)
    this.setupGlobalClickHandler();

    this.loadGroups();
  },

  setupGlobalClickHandler() {
    // Remove existing handler if any
    if (this.globalClickHandler) {
      document.removeEventListener('click', this.globalClickHandler, true);
    }

    // Create new handler and store reference
    this.globalClickHandler = (e) => {
      // Check if click is inside any dropdown (button or menu)
      const clickedDropdown = e.target.closest('.dropdown');
      const clickedToggle = e.target.closest('.dropdown-toggle');

      // Don't close if:
      // 1. Clicking on dropdown toggle (handled by delegation)
      // 2. Clicking inside dropdown menu
      if (clickedToggle || clickedDropdown) {
        return;
      }

      // Close all dropdowns when clicking outside
      document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.group-card').forEach(c => c.classList.remove('z-top'));
    };

    // Use capture phase to handle before delegation
    document.addEventListener('click', this.globalClickHandler, true);
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

  openRenameModal(id, currentName) {
    this.currentEditingId = id;
    if (this.renameModal && this.renameInput) {
      this.renameInput.value = currentName;
      this.renameModal.classList.add('active');
      setTimeout(() => this.renameInput?.focus(), 100);
    }
  },

  closeRenameModal() {
    if (this.renameModal) {
      this.renameModal.classList.remove('active');
      this.currentEditingId = null;
    }
  },

  openNoteModal(id, currentNote) {
    this.currentEditingId = id;
    if (this.noteModal && this.noteTextarea) {
      this.noteTextarea.value = currentNote || '';
      this.noteModal.classList.add('active');
      setTimeout(() => this.noteTextarea?.focus(), 100);
    }
  },

  closeNoteModal() {
    if (this.noteModal) {
      this.noteModal.classList.remove('active');
      this.currentEditingId = null;
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

    let html = '<div class="groups-list">';

    this.groups.forEach(group => {
      const noteContent = group.note || group.description || '';
      const hasNote = noteContent.trim() !== '';

      html += `
        <div class="group-card">
          <div class="group-card-header">
            <div class="group-info">
              <h4>${group.name}</h4>
              <p class="group-id">ID: ${group.id}</p>
            </div>
            <div class="group-actions">
              <div class="dropdown">
                <button type="button" class="btn btn-icon dropdown-toggle" data-id="${group.id}" title="選項">
                  ⋮
                </button>
                <div class="dropdown-menu">
                  <button type="button" class="dropdown-item rename-btn" data-id="${group.id}" data-name="${this.escapeHtml(group.name)}">
                    ✏️ 修改群組名稱
                  </button>
                  <button type="button" class="dropdown-item note-btn" data-id="${group.id}" data-note="${this.escapeHtml(noteContent)}">
                    📝 ${hasNote ? '編輯備註' : '新增備註'}
                  </button>
                  <div class="dropdown-divider"></div>
                  <button type="button" class="dropdown-item delete-btn" data-id="${group.id}">
                    🗑️ 刪除
                  </button>
                </div>
              </div>
            </div>
          </div>
          ${hasNote ? `
            <div class="group-note-content">
              <span class="note-icon">📝</span>
              <span class="note-text">${this.escapeHtml(noteContent)}</span>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += '</div>';
    this.groupsList.innerHTML = html;

    // Use event delegation to avoid duplicate listeners
    this.setupEventDelegation();
  },

  setupEventDelegation() {
    // Remove existing delegation handler if any
    if (this.delegationHandler) {
      this.groupsList.removeEventListener('click', this.delegationHandler);
    }

    // Create new delegation handler
    this.delegationHandler = (e) => {
      const target = e.target;

      // Handle dropdown toggle
      if (target.closest('.dropdown-toggle')) {
        e.preventDefault();  // Prevent default button behavior
        e.stopPropagation(); // Stop event from bubbling to document
        const btn = target.closest('.dropdown-toggle');
        const dropdown = btn.parentElement;
        const wasOpen = dropdown.classList.contains('active');

        // Close all dropdowns and reset card z-indexes
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
        document.querySelectorAll('.group-card').forEach(c => c.classList.remove('z-top'));

        // Toggle current dropdown (use setTimeout to avoid race condition)
        if (!wasOpen) {
          setTimeout(() => {
            dropdown.classList.add('active');
            dropdown.closest('.group-card').classList.add('z-top');
          }, 0);
        }
        return;
      }

      // Handle rename button
      if (target.closest('.rename-btn')) {
        e.stopPropagation();
        const btn = target.closest('.rename-btn');
        const id = parseInt(btn.dataset.id);
        const name = btn.dataset.name;
        this.openRenameModal(id, name);
        return;
      }

      // Handle note button
      if (target.closest('.note-btn')) {
        e.stopPropagation();
        const btn = target.closest('.note-btn');
        const id = parseInt(btn.dataset.id);
        const note = btn.dataset.note;
        this.openNoteModal(id, note);
        return;
      }

      // Handle delete button
      if (target.closest('.delete-btn')) {
        e.stopPropagation();
        const btn = target.closest('.delete-btn');
        const id = parseInt(btn.dataset.id);
        this.deleteGroup(id);
        return;
      }
    };

    // Add single event listener to parent
    this.groupsList.addEventListener('click', this.delegationHandler);
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
      this.openModal();
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
    // Store the ID for later use
    this.pendingDeleteId = id;

    // Show delete confirmation modal
    const deleteModal = document.getElementById('delete-confirm-modal');
    if (deleteModal) {
      deleteModal.classList.add('active');

      // Setup event listeners for this specific delete action
      const confirmBtn = document.getElementById('btn-delete-confirm');
      const cancelBtn = document.getElementById('btn-delete-cancel');
      const closeBtn = document.getElementById('modal-close-delete-confirm');

      const handleConfirm = async () => {
        await this.executeDelete(this.pendingDeleteId);
        this.closeDeleteModal();
        cleanup();
      };

      const handleCancel = () => {
        this.closeDeleteModal();
        cleanup();
      };

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        closeBtn.removeEventListener('click', handleCancel);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      closeBtn.addEventListener('click', handleCancel);
    }
  },

  closeDeleteModal() {
    const deleteModal = document.getElementById('delete-confirm-modal');
    if (deleteModal) {
      deleteModal.classList.remove('active');
    }
    this.pendingDeleteId = null;
  },

  async executeDelete(id) {
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
        successTitle.textContent = '刪除成功';
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

  async handleRenameSubmit(e) {
    e.preventDefault();

    const newName = this.renameInput.value.trim();
    if (!newName) {
      alert('請輸入群組名稱');
      return;
    }

    try {
      // Get current group data to preserve note/description
      const currentGroup = this.groups.find(g => g.id === this.currentEditingId);

      if (!currentGroup) {
        throw new Error('找不到群組資料');
      }

      const response = await fetch(`${this.API_BASE}/groups/${this.currentEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          note: currentGroup.description || currentGroup.note || ''  // Preserve existing note
        })
      });

      if (!response.ok) throw new Error('更新失敗');

      this.closeRenameModal();

      // Show Success Modal
      const successModal = document.getElementById('success-modal');
      const successTitle = successModal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (successModal && okBtn) {
        successTitle.textContent = '更新成功';
        successModal.classList.add('active');

        const handleOk = () => {
          successModal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
          this.loadGroups();
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('更新成功！');
        this.loadGroups();
      }

    } catch (error) {
      console.error('Error renaming group:', error);
      alert('更新失敗: ' + error.message);
    }
  },

  async handleNoteSubmit(e) {
    e.preventDefault();

    const newNote = this.noteTextarea.value.trim();

    try {
      // Get current group data to preserve name
      const currentGroup = this.groups.find(g => g.id === this.currentEditingId);

      if (!currentGroup) {
        throw new Error('找不到群組資料');
      }

      const response = await fetch(`${this.API_BASE}/groups/${this.currentEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentGroup.name,  // Always preserve the name
          note: newNote
        })
      });

      if (!response.ok) throw new Error('更新失敗');

      this.closeNoteModal();

      // Show Success Modal
      const successModal = document.getElementById('success-modal');
      const successTitle = successModal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (successModal && okBtn) {
        successTitle.textContent = '備註已儲存';
        successModal.classList.add('active');

        const handleOk = () => {
          successModal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
          this.loadGroups();
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('備註已儲存！');
        this.loadGroups();
      }

    } catch (error) {
      console.error('Error saving note:', error);
      alert('儲存失敗: ' + error.message);
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
