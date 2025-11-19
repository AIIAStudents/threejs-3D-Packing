const sidebar = document.getElementById("sidebar");
const toggleButton = document.getElementById("toggle-btn");

/*
    測試側邊欄切換功能
*/
console.log(" sidebar.js 已載入");
// 切換 collapsed class
toggleButton.addEventListener("click", () => {
  // console.log("按鈕被點擊了");
  sidebar.classList.toggle("collapsed");
});

/*
  測試側邊欄選單切換功能 (群組&物件 vs 空間配置)
*/

// 1. 抓左邊 sidebar 的所有項目
const sidebarSections = document.querySelectorAll(".sidebar-section");
console.log("[INIT] sidebarSections length =", sidebarSections.length);

// 2. 抓右邊的所有主內容 section
const views = document.querySelectorAll(".main-view");
console.log("[INIT] main views length =", views.length);

sidebarSections.forEach(section => {
  section.addEventListener("click", () => {
    const targetId = section.dataset.target; // e.g. "view-groups-items"
    console.log("[CLICK] targetId =", targetId);

    if (!targetId) {
      console.warn("[WARNING] .sidebar-section 沒有 data-target，請檢查 HTML。");
      return;
    }

    // 1. 左邊：更新 active 樣式
    sidebarSections.forEach(s => s.classList.remove("sidebar-section-active"));
    section.classList.add("sidebar-section-active");

    // 2. 右邊：顯示對應內容，隱藏其他
    views.forEach(view => {
      const isActive = view.id === targetId;
      view.classList.toggle("main-view-active", isActive);
      if (isActive) {
        console.log("[VIEW] show:", view.id);
      }
    });
  });
});
