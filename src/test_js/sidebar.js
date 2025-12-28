// src/test_js/sidebar.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SIDEBAR] sidebar.js 已載入");

  // -----------------------------------------------------------------
  // 側邊欄收合功能
  // -----------------------------------------------------------------
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggle-btn");

  if (sidebar && toggleButton) {
    toggleButton.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  } else {
    console.warn("[SIDEBAR] 找不到 #sidebar 或 #toggle-btn 元素");
  }

  // -----------------------------------------------------------------
  // 主內容視圖切換 (根據側邊欄點擊)
  // -----------------------------------------------------------------
  const sidebarSections = document.querySelectorAll(".sidebar-section");
  const views = document.querySelectorAll(".main-view");

  if (sidebarSections.length > 0 && views.length > 0) {
    sidebarSections.forEach(section => {
      section.addEventListener("click", () => {
        const targetId = section.dataset.target;
        if (!targetId) {
          console.warn("[SIDEBAR] .sidebar-section 沒有 data-target 屬性");
          return;
        }

        // --- Debug Log Start ---
        console.log(`[SIDEBAR] Section clicked. data-target: ${targetId}`);
        const currentActiveView = document.querySelector(".main-view.main-view-active");
        if(currentActiveView) {
            console.log(`[SIDEBAR] Hiding current view: #${currentActiveView.id}`);
        }
        // --- Debug Log End ---

        // 更新 Sidebar 的 active 狀態
        sidebarSections.forEach(s => s.classList.remove("sidebar-section-active"));
        section.classList.add("sidebar-section-active");
        
        // 切換 Main View 的 active 狀態
        views.forEach(view => {
          view.classList.toggle("main-view-active", view.id === targetId);
        });

        // --- Debug Log Start ---
        const newActiveView = document.querySelector(".main-view.main-view-active");
        if(newActiveView) {
            console.log(`[SIDEBAR] Showing new view: #${newActiveView.id}`);
        } else {
            console.error(`[SIDEBAR] Error: No view found with id: #${targetId}`);
        }
        // --- Debug Log End ---
      });
    });

  } else {
    console.warn("[SIDEBAR] 找不到任何 .sidebar-section 或 .main-view 元素");
  }
});