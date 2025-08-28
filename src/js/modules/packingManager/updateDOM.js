import * as THREE from 'three';

// 強制更新DOM元素 - 新增方法
export function forceUpdateDOM(utilizationText, executionTimeText) {
    console.log('--- forceUpdateDOM called with ---');
    console.log('Raw utilizationText:', utilizationText);
    console.log('Raw executionTimeText:', executionTimeText);
    console.log('---------------------------------');
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
        
      // 添加視覺反饋
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
        
      // 添加視覺反饋
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
      
    console.log('✅ DOM元素強制更新完成');
}

// 監聽DOM變化 - 新增方法
export function observeDOMChanges(utilizationText, executionTimeText) {
    try {
      const targetNode = document.getElementById('packing-results');
      if (!targetNode) return;
      
      const observer = new MutationObserver((mutations) => {
        observer.disconnect(); // Disconnect before making changes
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            console.log('🔄 DOM變化檢測到，重新驗證數據...');
            
            const currentUtilization = document.getElementById('utilization-text')?.textContent;
            const currentExecutionTime = document.getElementById('execution-time-text')?.textContent;
            
            console.log('Debug - Utilization:', 'Current:', currentUtilization, 'Expected:', utilizationText);
            if (currentUtilization !== utilizationText) {
              console.log('⚠️ 體積利用率不匹配，重新設置');
              const element = document.getElementById('utilization-text');
              if (element) element.textContent = utilizationText;
            }
            
            console.log('Debug - Execution Time:', 'Current:', currentExecutionTime, 'Expected:', executionTimeText);
            if (currentExecutionTime !== executionTimeText) {
              console.log('⚠️ 執行時間不匹配，重新設置');
              const element = document.getElementById('execution-time-text');
              if (element) element.textContent = executionTimeText;
            }
          }
        });
        observer.observe(targetNode, { // Reconnect after making changes
          childList: true,
          characterData: true,
          subtree: true
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

// 強制瀏覽器重繪 - 新增方法
export function forceRepaint() {
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

// 強制更新3D場景 - 新增方法
export function forceUpdateScene() {
    console.log('🎨 強制更新3D場景渲染');
      
    if (window.scene && window.renderer && window.camera) {
      // 多次強制更新，確保渲染
      for (let i = 0; i < 5; i++) {
        window.renderer.render(window.scene, window.camera);
      }
      
      // 標記場景需要持續更新
      if (window.scene.userData) {
        window.scene.userData.needsUpdate = true;
        window.scene.userData.lastUpdateTime = Date.now();
        console.log("✅ 設定 needsUpdate = true !");
      }
      
      // 強制更新所有物件的可見性和矩陣
      const objects = this.objectManager.getObjects();
      objects.forEach(obj => {
        if (obj.mesh) {
          obj.mesh.visible = true;
          obj.mesh.matrixWorldNeedsUpdate = true;
          obj.mesh.updateMatrix();
          obj.mesh.updateMatrixWorld(true);
          
          // 強制更新材質
          if (obj.mesh.material) {
            obj.mesh.material.needsUpdate = true;
          }
        }
      });
      
      console.log('✅ 3D場景渲染更新完成');
      
      // 啟動持續更新機制
      this.startContinuousRendering();
    } else {
      console.warn('⚠️ 無法找到場景、渲染器或相機引用');
      console.log('🔍 全局變量檢查:', {
        scene: !!window.scene,
        renderer: !!window.renderer,
        camera: !!window.camera
      });
    }
}

// 啟動持續渲染機制 - 新增方法
export function startContinuousRendering() {
    console.log('🔄 啟動持續渲染機制...');
      
    let updateCount = 0;
    const maxUpdates = 100; // 增加更新次數
    const updateInterval = setInterval(() => {
      if (window.scene && window.renderer && window.camera && updateCount < maxUpdates) {
        // 每次更新都強制渲染
        window.renderer.render(window.scene, window.camera);
        updateCount++;
        
        if (updateCount % 20 === 0) {
          console.log(`🔄 持續渲染 ${updateCount}/${maxUpdates}`);
        }
      } else {
        clearInterval(updateInterval);
        console.log('✅ 持續渲染完成，物件位置應該已經穩定顯示');
        
        // 最後一次強制渲染
        if (window.scene && window.renderer && window.camera) {
          window.renderer.render(window.scene, window.camera);
          console.log('🎯 最終強制渲染完成');
        }
      }
    }, 30); // 減少間隔時間，提高更新頻率
}