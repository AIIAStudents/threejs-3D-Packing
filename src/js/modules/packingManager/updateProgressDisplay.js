/**
 * 這個模組主要用來更新打包過程中的進度顯示。
 * 
 * 功能包含：
 * 1. 更新進度條寬度與百分比文字。
 * 2. 根據狀態更新顯示文字（等待中、計算中、完成、失敗）。
 * 3. 在完成狀態時，更新體積利用率與執行時間。
 * 4. 提供一個安全格式化數值的小工具方法。
 */

import * as THREE from 'three';

// 更新進度顯示
export function updateProgressDisplay(progress) {
    console.log('🔄 更新進度顯示:', progress);
      
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const progressStatus = document.querySelector('.progress-status');
      
    if (!progressFill || !progressText || !progressStatus) {
      console.warn('⚠️ 找不到進度顯示元素');
      return;
    }
      
    // 處理進度百分比
    let progressPercent = 0;
    if (progress.progress !== undefined) {
      progressPercent = Math.min(100, Math.max(0, progress.progress * 100));
    } else if (progress.percentage !== undefined) {
      progressPercent = Math.min(100, Math.max(0, progress.percentage));
    }
      
    // 更新進度條寬度
    progressFill.style.width = `${progressPercent}%`;
    progressText.textContent = `${progressPercent.toFixed(1)}%`;
      
    // 更新狀態文字
    let statusText = '準備中...';
    if (progress.status) {
      switch (progress.status) {
        case 'pending':
          statusText = '等待中...';
          break;
        case 'processing':
          statusText = '計算中...';
          break;
        case 'completed':
          statusText = '完成';
          break;
        case 'failed':
          statusText = '失敗';
          break;
        default:
          statusText = progress.status;
      }
    } else if (progress.state) {
      statusText = progress.state;
    }
      
    progressStatus.textContent = statusText;
      
    // 如果狀態為完成，更新最終結果
    if (progress.status === 'completed') {
      console.log('✅ 打包完成，更新結果顯示');
      
      // 更新體積利用率
      if (progress.utilization) {
        const utilizationElement = document.getElementById('utilization-text');
        if (utilizationElement) {
          utilizationElement.textContent = progress.utilization;
          console.log('✅ 體積利用率已更新:', progress.utilization);
        }
      }
      
      // 更新執行時間
      if (progress.execution_time) {
        const executionTimeElement = document.getElementById('execution-time-text');
        if (executionTimeElement) {
          executionTimeElement.textContent = progress.execution_time;
          console.log('✅ 執行時間已更新:', progress.execution_time);
        }
      }
    }
      
    console.log('🔄 進度顯示更新完成:', {
      status: statusText,
      progress: progressPercent,
      utilization: progress.utilization,
      executionTime: progress.execution_time
    });
}

// 小工具方法：安全格式化數值
export function formatMetric(value, unit) {
    if (value === undefined || value === null || isNaN(value)) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? '-' : `${num.toFixed(2)}${unit}`;
}
