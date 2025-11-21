// src/js_v2/sidebar.js

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SIDEBAR] sidebar.js 已載入");

  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggle-btn");
  const sidebarSections = document.querySelectorAll(".sidebar-section");
  const views = document.querySelectorAll(".main-view");

  // 1. 側邊欄收合功能
  if (sidebar && toggleButton) {
    toggleButton.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  } else {
    console.warn("[SIDEBAR] 找不到 #sidebar 或 #toggle-btn 元素");
  }

  // 2. 主內容視圖切換
  if (sidebarSections.length > 0 && views.length > 0) {
    sidebarSections.forEach(section => {
      section.addEventListener("click", (event) => {
        // 防止點擊父項目時，子項目也被觸發 (如果結構有嵌套)
        if (event.target.closest('.sidebar-section') !== section) {
            return;
        }

        const targetId = section.dataset.target;
        if (!targetId) {
          console.warn("[SIDEBAR] .sidebar-section 沒有 data-target 屬性:", section);
          return;
        }

        console.log(`[SIDEBAR] Section clicked. data-target: ${targetId}`);
        const currentActiveView = document.querySelector(".main-view.main-view-active");
        if(currentActiveView) {
            console.log(`[SIDEBAR] Hiding current view: #${currentActiveView.id}`);
        }

        // 更新 Sidebar 的 active 狀態
        sidebarSections.forEach(s => s.classList.remove("sidebar-section-active"));
        section.classList.add("sidebar-section-active");
        
        // 切換 Main View 的 active 狀態
        views.forEach(view => {
          view.classList.toggle("main-view-active", view.id === targetId);
        });

        const newActiveView = document.querySelector(".main-view.main-view-active");
        if(newActiveView) {
            console.log(`[SIDEBAR] Showing new view: #${newActiveView.id}`);
            // 發送自訂事件，通知其他 script 目前的 view 已變更
            document.dispatchEvent(new CustomEvent('viewChanged', { detail: { newViewId: newActiveView.id } }));
        } else {
            console.error(`[SIDEBAR] Error: No view found with id: #${targetId}`);
        }
      });
    });
  } else {
    console.warn("[SIDEBAR] 找不到任何 .sidebar-section 或 .main-view 元素");
  }
});
