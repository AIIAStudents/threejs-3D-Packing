import * as THREE from 'three';

/**
 * GroupManager
 * 
 * Responsibilities:
 * - Manage groups and their items.
 * - Render the collapsible group list in the sidebar.
 * - Handle UI for creating, renaming, and deleting groups.
 * - Handle UI for adding items to groups.
 * - Coordinate with ObjectManager for 3D object operations.
 */
export class GroupManager {
  constructor(scene, objectManager) {
    this.scene = scene;
    this.objectManager = objectManager;
    this.groups = [];
    this.activeContextMenu = null; // Track the currently open context menu

    this._setupEventListeners();
  }

  /**
   * Sets up global event listeners.
   */
  _setupEventListeners() {
    // Listener for the main "Add Group" button
    document.getElementById('add-group-btn').addEventListener('click', () => this.promptForNewGroup());

    // Global listener to close context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (this.activeContextMenu) {
        // Check if the click was outside the active menu
        if (!this.activeContextMenu.contains(e.target)) {
          this._closeActiveContextMenu();
        }
      }
    });
  }

  /**
   * Prompts for and adds a new group.
   */
  promptForNewGroup() {
    const groupName = prompt('請輸入新的群組名稱:', `Group ${this.groups.length + 1}`);
    if (groupName && groupName.trim() !== '') {
      this.addGroup(groupName.trim());
    }
  }

  /**
   * Adds a new group object and re-renders the list.
   * @param {string} name - The name for the new group.
   */
  addGroup(name) {
    const newGroup = {
      id: `group-${Date.now()}`,
      name: name,
      items: [],
      isCollapsed: false, // Groups are expanded by default
    };
    this.groups.push(newGroup);
    console.log(`Group added: ${name}`);
    this.renderList();
  }

  /**
   * Prompts for a new name and renames a group.
   * @param {string} groupId - The ID of the group to rename.
   */
  renameGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;

    const newName = prompt('請輸入新的群組名稱:', group.name);
    if (newName && newName.trim() !== '' && newName.trim() !== group.name) {
      group.name = newName.trim();
      console.log(`Group renamed to: ${group.name}`);
      this.renderList(); // Re-render to show the new name
    }
  }

  /**
   * Deletes a group and all its associated 3D objects.
   * @param {string} groupId - The ID of the group to delete.
   */
  deleteGroup(groupId) {
    const groupIndex = this.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const groupToDelete = this.groups[groupIndex];
    
    // Confirmation before deleting
    if (!confirm(`您確定要刪除群組 "${groupToDelete.name}" 嗎？群組內的所有物件將會被一併刪除。`)) {
      return;
    }

    // Use ObjectManager to delete all 3D objects in the group
    [...groupToDelete.items].forEach(item => {
      this.objectManager.deleteObject(item, false); // `false` to prevent re-rendering list for each item
    });

    this.groups.splice(groupIndex, 1);
    console.log(`Group deleted: ${groupToDelete.name}`);
    this.renderList(); // Re-render the list without the deleted group
  }

  /**
   * Renders the entire list of groups and their items in the sidebar.
   */
  renderList() {
    const listElement = document.getElementById('objects-list');
    listElement.innerHTML = ''; // Clear the current list

    this.groups.forEach(group => {
      const groupElement = this._createGroupElement(group);
      listElement.appendChild(groupElement);
    });
    // Add this line to ensure object manager has the latest groups
    this.objectManager.setGroups(this.groups);
  }

  /**
   * Creates the complete DOM element for a single group, including its header,
   * item list, and context menu.
   * @param {object} group - The group data object.
   * @returns {HTMLElement} The created group element.
   */
  _createGroupElement(group) {
    const groupItem = document.createElement('div');
    groupItem.className = 'group-item';
    groupItem.dataset.id = group.id;

    // --- Group Header (for collapsing and name display) ---
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    groupHeader.innerHTML = `
      <span class="group-name">${group.name}</span>
      <button class="group-menu-btn"><i class="fas fa-ellipsis-v"></i></button>
    `;

    // --- Items List (collapsible) ---
    const itemsList = document.createElement('div');
    itemsList.className = 'group-items-list';
    
    group.items.forEach(item => {
      const itemElement = this.objectManager.createItemElement(item);
      itemsList.appendChild(itemElement);
    });

    // Set initial collapsed state
    if (group.isCollapsed) {
      itemsList.classList.add('collapsed');
      groupHeader.classList.add('collapsed');
    }

    // --- Context Menu (for actions) ---
    const contextMenu = this._createContextMenu(group);

    // --- Assemble ---
    groupItem.appendChild(groupHeader);
    groupItem.appendChild(itemsList);
    groupItem.appendChild(contextMenu);

    // --- Event Listeners ---
    // Click header to toggle collapse
    groupHeader.addEventListener('click', (e) => {
      // Only toggle if the click is not on the menu button itself
      if (!e.target.closest('.group-menu-btn')) {
        group.isCollapsed = !group.isCollapsed;
        itemsList.classList.toggle('collapsed');
        groupHeader.classList.toggle('collapsed');
      }
    });

    // Click menu button to show context menu
    const menuBtn = groupHeader.querySelector('.group-menu-btn');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent header click from firing
      this._toggleContextMenu(contextMenu);
    });

    return groupItem;
  }

  /**
   * Creates the context menu for a group.
   * @param {object} group - The group data object.
   * @returns {HTMLElement} The context menu element.
   */
  _createContextMenu(group) {
    const menu = document.createElement('div');
    menu.className = 'group-context-menu';

    // Add Item button
    const addItemBtn = document.createElement('button');
    addItemBtn.className = 'context-menu-item';
    addItemBtn.innerHTML = '<i class="fas fa-plus"></i> 新增物件';
    addItemBtn.addEventListener('click', () => {
      this.objectManager.showCreatePanel(group.id);
      this._closeActiveContextMenu();
    });

    // Rename Group button
    const renameBtn = document.createElement('button');
    renameBtn.className = 'context-menu-item';
    renameBtn.innerHTML = '<i class="fas fa-pen"></i> 更改名稱';
    renameBtn.addEventListener('click', () => {
      this.renameGroup(group.id);
      this._closeActiveContextMenu();
    });

    // Delete Group button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'context-menu-item';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> 刪除群組';
    deleteBtn.addEventListener('click', () => {
      this.deleteGroup(group.id);
      this._closeActiveContextMenu();
    });

    menu.appendChild(addItemBtn);
    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);

    return menu;
  }

  /**
   * Shows/hides a context menu, ensuring only one is open at a time.
   * @param {HTMLElement} menu - The menu element to toggle.
   */
  _toggleContextMenu(menu) {
    // If another menu is open, close it first
    if (this.activeContextMenu && this.activeContextMenu !== menu) {
      this._closeActiveContextMenu();
    }

    const isVisible = menu.classList.toggle('visible');
    this.activeContextMenu = isVisible ? menu : null;
  }

  /**
   * Closes the currently active context menu.
   */
  _closeActiveContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.classList.remove('visible');
      this.activeContextMenu = null;
    }
  }

  // --- Methods called by ObjectManager ---

  addItemToGroup(item, groupId) {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.items.push(item);
      // --- START OPTIMIZATION ---
      // Instead of this.renderList(), just add the new element to the DOM
      const groupElement = document.querySelector(`.group-item[data-id="${groupId}"]`);
      if (groupElement) {
        const itemsList = groupElement.querySelector('.group-items-list');
        if (itemsList) {
          const itemElement = this.objectManager.createItemElement(item);
          itemsList.appendChild(itemElement);
        }
      }
      // --- END OPTIMIZATION ---
    } else {
      console.error(`Group with id ${groupId} not found.`);
    }
  }

  removeItemFromGroup(itemId) {
    for (const group of this.groups) {
      const itemIndex = group.items.findIndex(i => i.id === itemId);
      if (itemIndex > -1) {
        group.items.splice(itemIndex, 1);
        // --- START OPTIMIZATION ---
        // Instead of this.renderList(), just remove the element from the DOM
        const itemElement = document.querySelector(`.object-item[data-id="${itemId}"]`);
        if (itemElement) {
          itemElement.remove();
        }
        // --- END OPTIMIZATION ---
        return;
      }
    }
  }

  getAllObjects() {
    return this.groups.flatMap(g => g.items);
  }
}