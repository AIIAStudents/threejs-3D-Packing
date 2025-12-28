
document.addEventListener('DOMContentLoaded', () => {
  const objectsList = document.getElementById('objects-list');
  const itemEditModal = document.getElementById('item-edit-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-item-btn');

  // --- Event Delegation for Kebab Menu & Menu Items ---
  objectsList.addEventListener('click', (e) => {
    // --- Handle Kebab Menu Toggle ---
    if (e.target.matches('.kebab')) {
      e.stopPropagation();
      const parent = e.target.closest('.group-header, .item');
      if (!parent) return;

      const menu = parent.querySelector('.menu');
      if (!menu) return;

      const isMenuOpen = menu.style.display === 'block';
      closeAllMenus(); // Close all menus first
      if (!isMenuOpen) {
        menu.style.display = 'block'; // Open the target menu if it was closed
      }
      return; // Stop further processing
    }

    // --- Handle Menu Item Actions ---
    if (e.target.matches('.menu-item')) {
      e.stopPropagation();
      const action = e.target.textContent.trim();
      const itemElement = e.target.closest('.item, .group-header');

      // Remove previous editing highlights
      document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing'));

      // Highlight the current item/group
      if (itemElement) {
        itemElement.classList.add('is-editing');
      }

      console.log(`Action selected: "${action}" on`, itemElement);

      // Show modal for "修改尺寸"
      if (action === '修改尺寸') {
        if (itemEditModal) {
          itemEditModal.style.display = 'block';
        }
      }
      
      closeAllMenus(); // Close menu after action
    }
  });

  // --- Close Menus on Outside Click ---
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) {
      closeAllMenus();
    }
  });

  // --- Handle Modal Close Button ---
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (itemEditModal) {
        itemEditModal.style.display = 'none';
      }
      // Remove editing highlights when modal is canceled
      document.querySelectorAll('.is-editing').forEach(el => el.classList.remove('is-editing'));
    });
  }

  /**
   * Helper function to close all open menus.
   */
  function closeAllMenus() {
    const allMenus = document.querySelectorAll('#objects-list .menu');
    allMenus.forEach(menu => {
      menu.style.display = 'none';
    });
  }
});
