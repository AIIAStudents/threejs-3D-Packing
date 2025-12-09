/**
 * @typedef {object} Group
 * @property {number} id - 唯一 ID，使用 timestamp
 * @property {string} name - 群組名稱
 * @property {string} note - 備註
 */

// --- 全域變數與狀態管理 ---

/** @type {Group[]} */
let groups = [];
const API_BASE_URL = 'http://localhost:8888';
/** @type {boolean} */
let isInitialized = false; 

// --- DOM 節點參考 ---
/** @type {HTMLElement | null} */
let mainContent;
/** @type {HTMLElement | null} */
let emptyStateContainer;
/** @type {HTMLElement | null} */
let groupTableContainer;
/** @type {HTMLTableSectionElement | null} */
let groupTableBody;
/** @type {HTMLButtonElement | null} */
let addGroupBtnEmpty;
/** @type {HTMLButtonElement | null} */
let addGroupBtnTable;


// --- [核心修正] 函數匯出 ---

/**
 * 初始化函式，由外部模組載入器 (sidebar.js) 呼叫。
 * @returns {void}
 */
export async function init() {
  if (isInitialized) {
    return;
  }
  console.log('[add_group.js] init() function called.');
  
  // 1. 綁定頁面主要 DOM 元素
  mainContent = document.getElementById('main-content');
  emptyStateContainer = document.getElementById('empty-state-container');
  groupTableContainer = document.getElementById('group-table-container');
  groupTableBody = document.getElementById('group-table-body');
  addGroupBtnEmpty = document.getElementById('add-group-btn-empty');
  addGroupBtnTable = document.getElementById('add-group-btn-table');

  if (!mainContent || !emptyStateContainer || !groupTableContainer || !groupTableBody || !addGroupBtnEmpty || !addGroupBtnTable) {
    console.error('[add_group.js] CRITICAL: One or more required DOM elements are missing. Halting initialization.');
    return;
  }

  // 2. 從 API 載入群組資料
  await loadGroupsFromAPI();

  // 3. 綁定所有事件監聽器
  bindEvents();

  // 4. 根據目前資料狀態渲染畫面
  render();
  
  isInitialized = true;
  console.log('[add_group.js] "群組" 頁面初始化完成。');
}
// --- 資料儲存相關函式 ---

/**
 * 從後端 API 載入群組資料。
 * @returns {Promise<void>}
 */
async function loadGroupsFromAPI() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/groups/`);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      groups = data;
    }
    console.log('[add_group.js] Successfully loaded groups from API.');
  } catch (error) {
    console.error('[add_group.js] 從 API 載入群組資料失敗:', error);
    // 可選擇在此處向使用者顯示錯誤訊息
    groups = [];
  }
}




// --- 渲染函式 ---

/**
 * 根據 groups 陣列的狀態，決定要渲染空狀態還是表格。
 * @returns {void}
 */
function render() {
  if (groups.length === 0) {
    renderEmptyState();
  } else {
    renderGroupTable();
  }
}

/**
 * 渲染空狀態畫面。
 * @returns {void}
 */
function renderEmptyState() {
  // 使用可選鏈操作符，避免在元素為 null 時出錯
  emptyStateContainer?.classList.remove('hidden');
  groupTableContainer?.classList.add('hidden');
}

/**
 * 渲染群組表格畫面。
 * @returns {void}
 */
function renderGroupTable() {
  // [修正] 使用防衛性程式碼，如果 groupTableBody 不存在，則直接返回，函式後續的程式碼將不會執行
  if (!groupTableBody) {
    console.error('[add_group.js] groupTableBody is null. Cannot render table.');
    return;
  }

  emptyStateContainer?.classList.add('hidden');
  groupTableContainer?.classList.remove('hidden');

  groupTableBody.innerHTML = '';

  groups.forEach((group, index) => {
    const tr = document.createElement('tr');
    tr.dataset.groupId = String(group.id);

    const tdLabel = document.createElement('td');
    tdLabel.textContent = String(index + 1);
    tr.appendChild(tdLabel);

    const tdName = document.createElement('td');
    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.className = 'input-control';
    inputName.name = 'name';
    inputName.value = group.name;
    inputName.placeholder = '群組名稱';
    inputName.dataset.id = String(group.id);
    tdName.appendChild(inputName);
    tr.appendChild(tdName);

    const tdNote = document.createElement('td');
    const textareaNote = document.createElement('textarea');
    textareaNote.className = 'input-control';
    textareaNote.name = 'note';
    textareaNote.value = group.note;
    textareaNote.placeholder = '可選填的備註說明';
    textareaNote.dataset.id = String(group.id);
    tdNote.appendChild(textareaNote);
    tr.appendChild(tdNote);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';
    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn-danger';
    deleteButton.textContent = '刪除';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.id = String(group.id);
    tdActions.appendChild(deleteButton);
    tr.appendChild(tdActions);

    // [修正] 由於上面已經有 if 檢查，此處的 groupTableBody 已被靜態分析器確認為非 null
    groupTableBody.appendChild(tr);
  });
}

// --- 事件處理相關函式 ---

/**
 * 綁定所有頁面需要的事件監聽器。
 * @returns {void}
 */
function bindEvents() {
  console.log('[add_group.js] bindEvents() function called. Attaching listeners.');
  // [修正] 使用可選鏈操作符，安全地綁定事件
  addGroupBtnEmpty?.addEventListener('click', handleAddGroup);
  addGroupBtnTable?.addEventListener('click', handleAddGroup);
  groupTableContainer?.addEventListener('click', handleTableClick);
  groupTableContainer?.addEventListener('input', handleTableInput);
}

/**
 * 處理新增群組的邏輯。
 * @returns {Promise<void>}
 */
async function handleAddGroup() {
  console.log('[add_group.js] handleAddGroup() function called.');
  const groupData = {
    name: '', // 後端會處理預設值，但明確發送
    note: ''
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/groups/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const newGroup = await response.json();
    groups.push(newGroup);
    render();
    console.log('[add_group.js] New group added via API and view re-rendered.', newGroup);

  } catch (error) {
    console.error('[add_group.js] 無法透過 API 建立新群組:', error);
  }
}

/**
 * 處理表格內的點擊事件 (例如：刪除按鈕)。
 * @param {Event} e - 點擊事件物件。
 */
function handleTableClick(e) {
  if (!(e.target instanceof HTMLElement)) return;
  const target = e.target;

  const action = target.dataset.action;
  if (action === 'delete') {
    const groupId = Number(target.dataset.id);
    handleDeleteGroup(groupId);
  }
}

let debounceTimer;

/**
 * 處理表格內的輸入事件 (名稱、備註)，並使用 debounce 更新後端。
 * @param {Event} e - 輸入事件物件。
 */
function handleTableInput(e) {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return;
  const target = e.target;
  
  const groupId = Number(target.dataset.id);
  const fieldName = target.name;
  const value = target.value;

  const groupToUpdate = groups.find(g => g.id === groupId);
  if (!groupToUpdate) return;

  // 1. 先即時更新前端 state，讓 UI 反應靈敏
  if (fieldName === 'name' || fieldName === 'note') {
    groupToUpdate[fieldName] = value;
  }

  // 2. 使用 debounce 機制來更新後端
  // 清除之前的計時器，避免頻繁發送請求
  clearTimeout(debounceTimer);

  // 設定一個新的計時器，延遲 500ms 後執行
  debounceTimer = setTimeout(async () => {
    try {
      console.log(`[add_group.js] Debounced update for group ${groupId}...`);
      const response = await fetch(`${API_BASE_URL}/api/v2/groups/${groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: groupToUpdate.name,
          note: groupToUpdate.note,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`[add_group.js] Group ${groupId} updated successfully via API.`);
    } catch (error) {
      console.error(`[add_group.js] 無法透過 API 更新群組 ${groupId}:`, error);
      // 可選：在這裡實作 UI 回滾或錯誤提示
    }
  }, 500);
}

/**
 * 處理刪除群組的邏輯。
 * @param {number} groupId - 要刪除的群組 ID。
 * @returns {Promise<void>}
 */
async function handleDeleteGroup(groupId) {
  if (!confirm('您確定要刪除此群組嗎？')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/groups/${groupId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 從前端的陣列中移除該群組
    groups = groups.filter(g => g.id !== groupId);
    render();
    console.log(`[add_group.js] Group with id ${groupId} deleted via API and view re-rendered.`);

  } catch (error) {
    console.error(`[add_group.js] 無法透過 API 刪除群組 ${groupId}:`, error);
  }
}
