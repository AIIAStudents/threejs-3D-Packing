// =================================================================
// sidebar.js
//
// 處理側邊欄互動、主內容視圖切換
// =================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log(" sidebar.js 已載入");
  
  // -----------------------------------------------------------------
  // 動態視圖載入邏輯
  // -----------------------------------------------------------------
  async function loadViewContent(viewElement) {
    const source = viewElement.dataset.htmlSource;
    const isLoaded = viewElement.dataset.loaded === 'true';

    if (source && !isLoaded) {
      try {
        console.log(`[VIEW] Loading content from: ${source}`);
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        
        // 使用 DOMParser 來處理 HTML，這樣才能正確處理 script 標籤
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 取得 body 中的所有子節點
        const nodes = Array.from(doc.body.childNodes);

        if (nodes.length > 0) {
          viewElement.innerHTML = ''; // 清空 placeholder

          // 將所有節點附加到目標視圖
          nodes.forEach(node => {
            viewElement.appendChild(node.cloneNode(true));
          });
          
          // 查找並動態載入模組腳本
          const scriptTag = doc.querySelector('script[type="module"]');
          if (scriptTag && scriptTag.src) {
            const scriptSrc = new URL(scriptTag.src, document.baseURI).href;
            console.log(`[VIEW] Dynamically importing module: ${scriptSrc}`);
            try {
              await import(scriptSrc);
            } catch (err) {
              console.error(`[VIEW] Failed to import module ${scriptSrc}:`, err);
            }
          }
        }
        viewElement.dataset.loaded = 'true';
      } catch (error) {
        console.error(`[VIEW] Failed to load content for ${viewElement.id}:`, error);
        viewElement.innerHTML = `<p style="color: red; padding: 20px;">無法載入視圖內容。</p>`;
      }
    }
  }

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
      section.addEventListener("click", async () => { // 這裡改為 async
        const targetId = section.dataset.target;
        if (!targetId) {
          console.warn("[VIEW] .sidebar-section 沒有 data-target");
          return;
        }
        
        // 取得目標視圖元素
        const targetView = document.getElementById(targetId);
        if (!targetView) {
            console.error(`[VIEW] 找不到目標視圖元素: #${targetId}`);
            return;
        }

        // 嘗試載入內容 (如果該視圖是動態載入的)
        await loadViewContent(targetView);

        sidebarSections.forEach(s => s.classList.remove("sidebar-section-active"));
        section.classList.add("sidebar-section-active");
        
        views.forEach(view => {
          view.classList.toggle("main-view-active", view.id === targetId);
        });

        // 發出自訂事件，通知視圖已更改
        console.log(`[VIEW] Dispatching viewChanged for: ${targetId}`);
        document.dispatchEvent(new CustomEvent("viewChanged", {
          detail: { newViewId: targetId }
        }));
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
