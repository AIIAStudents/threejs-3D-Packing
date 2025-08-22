// updateDOM.js - 更新DOM元素模組

// 強制更新DOM元素
export function updateDOM(utilizationText, executionTimeText) {
  console.log('🔄 強制更新DOM元素...');
  
  // 方法1：直接更新DOM
  const utilizationElement = document.getElementById('utilization-text');
  const executionTimeElement = document.getElementById('execution-time-text');
  
  if (utilizationElement) {
    utilizationElement.textContent = utilizationText;
    console.log('✅ 體積利用率已更新:', utilizationText);
    
    // 強制觸發DOM更新事件
    utilizationElement.dispatchEvent(new Event('change', { bubbles: true }));
    utilizationElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 添加視覺回饋
    utilizationElement.style.color = '#27ae60';
    utilizationElement.style.fontWeight = 'bold';
    
    // 延遲恢復樣式
    setTimeout(() => {
      utilizationElement.style.color = '';
      utilizationElement.style.fontWeight = '';
    }, 2000);
  } else {
    console.warn('⚠️ 找不到體積利用率顯示元素');
  }
  
  if (executionTimeElement) {
    executionTimeElement.textContent = executionTimeText;
    console.log('✅ 執行時間已更新:', executionTimeText);
    
    // 強制觸發DOM更新事件
    executionTimeElement.dispatchEvent(new Event('change', { bubbles: true }));
    executionTimeElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 添加視覺回饋
    executionTimeElement.style.color = '#3498db';
    executionTimeElement.style.fontWeight = 'bold';
    
    // 延遲恢復樣式
    setTimeout(() => {
      executionTimeElement.style.color = '';
      executionTimeElement.style.fontWeight = '';
    }, 2000);
  } else {
    console.warn('⚠️ 找不到執行時間顯示元素');
  }
  
  // 方法2：使用 requestAnimationFrame 確保DOM更新
  requestAnimationFrame(() => {
    if (utilizationElement) {
      utilizationElement.textContent = utilizationText;
      console.log('🔄 requestAnimationFrame 更新體積利用率');
    }
    if (executionTimeElement) {
      executionTimeElement.textContent = executionTimeText;
      console.log('🔄 requestAnimationFrame 更新執行時間');
    }
  });
  
  // 方法3：延遲再次更新，確保DOM已渲染
  setTimeout(() => {
    if (utilizationElement) {
      utilizationElement.textContent = utilizationText;
      console.log('🔄 延遲更新體積利用率');
    }
    if (executionTimeElement) {
      executionTimeElement.textContent = executionTimeText;
      console.log('🔄 延遲更新執行時間');
    }
  }, 100);
  
  // 方法4：使用 MutationObserver 監聽DOM變化
  observeDOMChanges(utilizationText, executionTimeText);
  
  // 方法5：強制觸發瀏覽器重繪
  forceRepaint();
  
  console.log('✅ DOM元素強制更新完成');
}

// 監聽DOM變化
function observeDOMChanges(utilizationText, executionTimeText) {
  try {
    const targetNode = document.getElementById('packing-results');
    if (!targetNode) return;
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          console.log('🔄 DOM變化檢測到，重新驗證數據...');
          
          // 重新檢查數據是否正確
          const currentUtilization = document.getElementById('utilization-text')?.textContent;
          const currentExecutionTime = document.getElementById('execution-time-text')?.textContent;
          
          if (currentUtilization !== utilizationText) {
            console.log('⚠️ 體積利用率不匹配，重新設置');
            const element = document.getElementById('utilization-text');
            if (element) element.textContent = utilizationText;
          }
          
          if (currentExecutionTime !== executionTimeText) {
            console.log('⚠️ 執行時間不匹配，重新設置');
            const element = document.getElementById('execution-time-text');
            if (element) element.textContent = executionTimeText;
          }
        }
      });
    });
    
    observer.observe(targetNode, {
      childList: true,
      characterData: true,
      subtree: true
    });
    
    // 5秒後停止監聽
    setTimeout(() => {
      observer.disconnect();
      console.log('🔄 DOM變化監聽已停止');
    }, 5000);
    
  } catch (error) {
    console.warn('⚠️ DOM變化監聽設置失敗:', error);
  }
}

// 強制瀏覽器重繪
function forceRepaint() {
  try {
    // 方法1：觸發重排
    const packingPanel = document.getElementById('packing-panel');
    if (packingPanel) {
      packingPanel.style.display = 'none';
      packingPanel.offsetHeight; // 強制重排
      packingPanel.style.display = 'block';
    }
    
    // 方法2：觸發重繪
    const progressBar = document.querySelector('.progress-fill');
    if (progressBar) {
      const currentWidth = progressBar.style.width;
      progressBar.style.width = '0%';
      progressBar.offsetHeight; // 強制重排
      progressBar.style.width = currentWidth;
    }
    
    // 方法3：觸發動畫
    const elements = document.querySelectorAll('#utilization-text, #execution-time-text');
    elements.forEach(element => {
      element.style.transform = 'scale(1.05)';
      element.style.transition = 'transform 0.1s ease';
      
      setTimeout(() => {
        element.style.transform = 'scale(1)';
      }, 100);
    });
    
    console.log('✅ 強制重繪完成');
  } catch (error) {
    console.warn('⚠️ 強制重繪失敗:', error);
  }
}