// src/js_v2/group_items/group_items.js

document.addEventListener('DOMContentLoaded', () => {
    const groupsViewSection = document.getElementById('view-groups-group');
    const itemsViewSection = document.getElementById('view-groups-item');
    
    if (!groupsViewSection || !itemsViewSection) {
        return;
    }
    console.log('[GROUP_ITEMS] Script loaded. Waiting for view change to initialize.');

    // --- DOM Element Selectors ---
    const emptyGroupsPlaceholder = groupsViewSection.querySelector('#empty-groups-placeholder');
    const groupsTableContainer = groupsViewSection.querySelector('#groups-table-container');
    const groupsTableBody = groupsViewSection.querySelector('#groups-tbody');
    const addGroupButtons = groupsViewSection.querySelectorAll('.js-add-group-btn');
    const goToItemsBtn = groupsViewSection.querySelector('#go-to-items-step-btn');

    const itemsEmptyPlaceholder = itemsViewSection.querySelector('#empty-items-placeholder');
    const itemsTableContainer = itemsViewSection.querySelector('#items-table-container');
    const itemsTableBody = itemsViewSection.querySelector('#items-tbody');
    const itemsQtyHeader = itemsViewSection.querySelector('#item-qty-header');
    const currentGroupSelect = itemsViewSection.querySelector('#current-group-select');
    const addItemBtn = itemsViewSection.querySelector('#add-item-btn');
    const buildItemsBtn = document.getElementById('build-items-btn');

    // --- State Management ---
    let allGroupData = {};
    let globalItemCounter = 1;
    let isGroupInitialized = false;
    let isItemInitialized = false;

    // --- Event Listener for View Changes ---
    document.addEventListener('viewChanged', (e) => {
        const newViewId = e.detail.newViewId;
        if (newViewId === 'view-groups-group' && !isGroupInitialized) {
            console.log('[GROUP_ITEMS] Initializing Group View for the first time.');
            initializeGroupView();
        } else if (newViewId === 'view-groups-item') {
            console.log('[GROUP_ITEMS] View changed to Items. Re-initializing.');
            initializeItemView();
        }
    });

    // --- Group View Logic ---
    function initializeGroupView() {
        if(isGroupInitialized) return;
        addGroupButtons.forEach(btn => btn.addEventListener('click', addGroupRow));
        goToItemsBtn.addEventListener('click', () => {
            const groupRows = Array.from(groupsTableBody.rows);
            const groupNames = groupRows.map(row => row.cells[1].querySelector('input').value.trim()).filter(name => name);
            if (groupNames.length === 0) {
                alert('請至少建立一個有效的群組！');
                return;
            }
            localStorage.setItem('groupsList', JSON.stringify(groupNames));
            console.log('[GROUP_ITEMS] Groups saved to localStorage:', groupNames);
            
            const itemSidebarLink = document.querySelector(".sidebar-section[data-target='view-groups-item']");
            if (itemSidebarLink) itemSidebarLink.click();
        });
        updateGroupsViewState();
        isGroupInitialized = true;
    }

    const updateGroupsViewState = () => {
        const groupCount = groupsTableBody.rows.length;
        const hasGroups = groupCount > 0;
        emptyGroupsPlaceholder.style.display = hasGroups ? 'none' : 'flex';
        groupsTableContainer.style.display = hasGroups ? 'block' : 'none';
    };

    const addGroupRow = () => {
        const newRow = groupsTableBody.insertRow();
        const currentLabel = groupsTableBody.rows.length;
        newRow.innerHTML = `
            <td>${currentLabel}</td>
            <td><input type="text" placeholder="e.g., Group A" value="Group ${currentLabel}"></td>
            <td><input type="text" placeholder="Optional notes"></td>
            <td><button class="delete-btn">✕</button></td>
        `;
        newRow.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.target.closest('tr').remove();
            updateGroupLabels();
            updateGroupsViewState();
        });
        updateGroupLabels();
        updateGroupsViewState();
    };

    const updateGroupLabels = () => {
        Array.from(groupsTableBody.rows).forEach((row, index) => {
            row.cells[0].textContent = index + 1;
        });
    };

    // --- Item View Logic ---
    function initializeItemView() {
        const storedGroups = localStorage.getItem('groupsList');
        const groupNames = storedGroups ? JSON.parse(storedGroups) : [];
        console.log('[GROUP_ITEMS] Populating item view with groups:', groupNames);
        
        const selectedValueBeforeUpdate = currentGroupSelect.value;
        currentGroupSelect.innerHTML = '<option value="" disabled selected>— 請選擇一個群組 —</option>';
        groupNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            currentGroupSelect.appendChild(option);
            if (!allGroupData[name]) allGroupData[name] = [];
        });

        // Restore previous selection if still valid
        if (groupNames.includes(selectedValueBeforeUpdate)) {
            currentGroupSelect.value = selectedValueBeforeUpdate;
        }

        if (!isItemInitialized) {
            currentGroupSelect.addEventListener('change', handleGroupSelectChange);
            addItemBtn.addEventListener('click', handleAddItem);
            buildItemsBtn.addEventListener('click', handleBuildItems);
            isItemInitialized = true;
        }
        
        handleGroupSelectChange(); // Render based on current selection
    }
    
    function handleGroupSelectChange() {
        const selectedGroup = currentGroupSelect.value;
        addItemBtn.disabled = !selectedGroup;
        renderItemsForGroup(selectedGroup);
    }

    function renderItemsForGroup(groupName) {
        const items = groupName ? allGroupData[groupName] || [] : [];
        itemsTableBody.innerHTML = '';
        
        const hasItems = items.length > 0;
        itemsEmptyPlaceholder.style.display = hasItems ? 'none' : 'flex';
        itemsTableContainer.style.display = hasItems ? 'block' : 'none';
        buildItemsBtn.style.display = hasItems ? 'block' : 'none';
        itemsQtyHeader.style.display = 'table-cell';
        
        if (hasItems) {
            items.forEach((item, index) => {
                const row = itemsTableBody.insertRow();
                row.dataset.index = index;
                row.innerHTML = `
                    <td>-</td>
                    <td><input type="text" value="${item.name}"></td>
                    <td><input type="number" class="short-input" value="${item.w}"></td>
                    <td><input type="number" class="short-input" value="${item.h}"></td>
                    <td><input type="number" class="short-input" value="${item.d}"></td>
                    <td><input type="number" class="short-input" value="${item.qty}"></td>
                    <td><input type="color" value="${item.color}"></td>
                    <td><button class="delete-btn">✕</button></td>
                `;
                row.querySelector('.delete-btn').addEventListener('click', (e) => {
                    const currentGroup = currentGroupSelect.value;
                    if (currentGroup && allGroupData[currentGroup]) {
                        allGroupData[currentGroup].splice(index, 1);
                        renderItemsForGroup(currentGroup);
                    }
                });
            });
        }
    }

    function handleAddItem() {
        const selectedGroup = currentGroupSelect.value;
        if (!selectedGroup) {
            alert('錯誤：沒有選擇群組！');
            return;
        }
        const newItem = {
            name: `New Item ${allGroupData[selectedGroup].length + 1}`,
            w: 10, h: 10, d: 10, qty: 1, color: '#3498db'
        };
        allGroupData[selectedGroup].push(newItem);
        renderItemsForGroup(selectedGroup);
    }

    function handleBuildItems() {
        const selectedGroup = currentGroupSelect.value;
        if (!selectedGroup) return;

        const currentItemsData = Array.from(itemsTableBody.rows).map(row => ({
            name: row.cells[1].querySelector('input').value,
            w: row.cells[2].querySelector('input').value,
            h: row.cells[3].querySelector('input').value,
            d: row.cells[4].querySelector('input').value,
            qty: parseInt(row.cells[5].querySelector('input').value, 10),
            color: row.cells[6].querySelector('input').value,
        }));
        allGroupData[selectedGroup] = currentItemsData;

        const expandedItems = [];
        let tempGlobalCounter = 1;
        Object.keys(allGroupData).forEach(groupName => {
            allGroupData[groupName].forEach(item => {
                const qty = item.qty || 0;
                for (let i = 0; i < qty; i++) {
                    if (groupName === selectedGroup) {
                        expandedItems.push({
                            label: tempGlobalCounter,
                            name: `${item.name}_${tempGlobalCounter}`,
                            w: item.w, h: item.h, d: item.d, color: item.color,
                        });
                    }
                    tempGlobalCounter++;
                }
            });
        });
        globalItemCounter = tempGlobalCounter;
        
        itemsTableBody.innerHTML = '';
        itemsQtyHeader.style.display = 'none';

        if (expandedItems.length > 0) {
            itemsTableContainer.style.display = 'block';
            itemsEmptyPlaceholder.style.display = 'none';
            expandedItems.forEach(item => {
                const row = itemsTableBody.insertRow();
                row.innerHTML = `
                    <td>${item.label}</td><td>${item.name}</td><td>${item.w}</td>
                    <td>${item.h}</td><td>${item.d}</td><td></td>
                    <td><div class="color-swatch" style="background-color: ${item.color};"></div></td>
                    <td><button class="more-btn">⋮</button></td>`;
            });
        } else {
            itemsTableContainer.style.display = 'none';
            itemsEmptyPlaceholder.style.display = 'flex';
        }
        
        addItemBtn.disabled = true;
        buildItemsBtn.style.display = 'none';
        currentGroupSelect.disabled = true;
    }

    // Initial check on load
    const activeView = document.querySelector('.main-view.main-view-active');
    if (activeView) {
        if (activeView.id === 'view-groups-group') {
            initializeGroupView();
        } else if (activeView.id === 'view-groups-item') {
            initializeItemView();
        }
    }
});
