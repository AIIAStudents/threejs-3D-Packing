// =================================================================
// sidebar.js
//
// 處理側邊欄互動、主內容視圖切換
// =================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log(" sidebar.js 已載入");
  
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
    console.warn("[Sidebar] 找不到 #sidebar 或 #toggle-btn 元素");
  }

  // -----------------------------------------------------------------
  // 主內容視圖切換 (根據側邊欄點擊)
  // -----------------------------------------------------------------
  const sidebarSections = document.querySelectorAll(".sidebar-section");
  const views = document.querySelectorAll(".main-view");
  const breadcrumbLinks = document.querySelectorAll(".breadcrumb__link");

  if (sidebarSections.length > 0 && views.length > 0) {
    sidebarSections.forEach(section => {
      section.addEventListener("click", () => {
        const targetId = section.dataset.target;
        if (!targetId) {
          console.warn("[VIEW] .sidebar-section 沒有 data-target");
          return;
        }
        
        sidebarSections.forEach(s => s.classList.remove("sidebar-section-active"));
        section.classList.add("sidebar-section-active");
        
        views.forEach(view => {
          view.classList.toggle("main-view-active", view.id === targetId);
        });
      });
    });

    breadcrumbLinks.forEach(link => {
      link.addEventListener("click", () => {
        const targetId = link.dataset.target;
        if (!targetId) return;

        const targetSidebar = Array.from(sidebarSections)
          .find(sec => sec.dataset.target === targetId);
        
        if (targetSidebar) {
          targetSidebar.click();
        }
      });
    });

  } else {
    console.warn("[VIEW] 找不到 .sidebar-section 或 .main-view 元素");
  }
  
  // -----------------------------------------------------------------
  // 動態載入說明文件 (groups_readme.md)
  // -----------------------------------------------------------------
  function loadGroupsReadme() {
    const container = document.getElementById("groups-doc");
    if (!container) {
      console.warn("[README] 找不到 #groups-doc 容器");
      return;
    }
    if (container.dataset.loaded === "true") {
      return;
    }

    fetch("./src/docs/groups_readme.md")
      .then(res => res.ok ? res.text() : Promise.reject(res.status))
      .then(md => {
        if (window.marked) {
          container.innerHTML = marked.parse(md);
          container.dataset.loaded = "true";
        } else {
          console.error("[README] marked.js 函式庫未載入");
          container.textContent = "Markdown 解析器載入失敗。";
        }
      })
      .catch(err => {
        console.error("[README] 載入說明文件失敗:", err);
        container.textContent = "無法載入說明文件。";
      });
  }
  
  loadGroupsReadme();
});
