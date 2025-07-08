# 3D Bin Packing 系統使用說明

## 概述

這個3D Bin Packing系統使用BLF (Bottom-Left-Fill) + SA (Simulated Annealing) 算法來實現3D物件的智能打包，目標是最大化容器的體積利用率。

## 功能特點

- **BLF + SA算法**: 結合底部左側填充策略和模擬退火優化
- **同步/非同步處理**: 根據物件數量自動選擇處理模式
- **實時進度顯示**: 非同步任務的進度追蹤
- **可取消任務**: 支援取消正在進行的打包任務
- **體積利用率計算**: 即時顯示打包效果

## 系統架構

### 後端 API (Python Flask)

- **端口**: 8889
- **主要端點**:
  - `POST /pack_objects` - 執行3D Bin Packing
  - `GET /job_status/<job_id>` - 獲取任務狀態
  - `POST /cancel_job/<job_id>` - 取消任務
  - `GET /list_jobs` - 列出所有任務
  - `POST /clear_completed_jobs` - 清理已完成任務

### 前端 (Three.js)

- **3D場景編輯**: 添加、修改物件
- **打包控制面板**: 執行打包、查看進度
- **實時結果顯示**: 體積利用率、執行時間

## 數據格式

### PackRequest Schema (前端 → 後端)

```json
{
  "objects": [
    {
      "uuid": "object-uuid",
      "type": "BoxGeometry",
      "position": {"x": 0, "y": 0, "z": 0},
      "scale": {"x": 1, "y": 1, "z": 1},
      "rotation": {"x": 0, "y": 0, "z": 0},
      "material": {
        "color": 16777215,
        "metalness": 0,
        "roughness": 1
      }
    }
  ],
  "container_size": {
    "width": 150,
    "height": 150,
    "depth": 150
  },
  "optimization_type": "volume_utilization",
  "algorithm": "blf_sa",
  "async_mode": false,
  "timeout": 30
}
```

### PackResult Schema (後端 → 前端)

```json
{
  "job_id": "job-uuid",
  "success": true,
  "packed_objects": [
    {
      "uuid": "object-uuid",
      "position": {"x": 10, "y": 5, "z": 0},
      "rotation": {"x": 0, "y": 0, "z": 0}
    }
  ],
  "volume_utilization": 85.5,
  "execution_time": 2.34,
  "algorithm_used": "BLF_SA",
  "message": "成功打包 15/15 個物件，體積利用率: 85.50%"
}
```

### JobStatusResponse Schema (非同步流程)

```json
{
  "job_id": "job-uuid",
  "status": "processing",
  "progress": 45.2,
  "estimated_time_remaining": 12.5,
  "result": null,
  "error": ""
}
```

## 使用方法

### 1. 啟動服務器

```bash
# 啟動3D Bin Packing服務器
cd 3js/three.js
python run_bin_packing_server.py
```

### 2. 啟動前端

```bash
# 在另一個終端啟動前端服務器
cd 3js/three.js
python -m http.server 8000
```

### 3. 使用步驟

1. **添加物件**: 使用工具列添加3D物件到場景
2. **調整物件**: 修改物件的大小、位置等屬性
3. **執行打包**: 點擊"執行3D打包"按鈕
4. **查看結果**: 觀察打包後的物件排列和體積利用率

## 算法說明

### BLF (Bottom-Left-Fill) 策略

- 優先選擇容器底部的位置
- 其次選擇左側位置
- 最後選擇前側位置
- 確保物件緊密排列

### SA (Simulated Annealing) 優化

- 初始溫度: 100.0
- 冷卻率: 0.95
- 最小溫度: 0.1
- 最大迭代次數: 1000

### 同步 vs 非同步

- **同步模式**: 物件數量 ≤ 10，立即返回結果
- **非同步模式**: 物件數量 > 10，使用任務隊列處理

## 配置選項

### 容器尺寸

```javascript
const containerSize = {
  width: 150,   // 容器寬度
  height: 150,  // 容器高度
  depth: 150    // 容器深度
};
```

### 打包選項

```javascript
const options = {
  optimizationType: 'volume_utilization',  // 優化目標
  algorithm: 'blf_sa',                     // 使用算法
  asyncMode: false,                        // 強制非同步模式
  timeout: 30                              // 超時時間(秒)
};
```

## 錯誤處理

### 常見錯誤

1. **物件重疊**: 算法會自動避免物件重疊
2. **超出邊界**: 物件會被限制在容器內
3. **任務超時**: 長時間運行的任務會被自動取消

### 錯誤響應

```json
{
  "error": "錯誤描述",
  "error_code": "ERROR_TYPE"
}
```

## 性能優化

### 算法優化

- 使用空間索引加速碰撞檢測
- 實現物件排序策略
- 優化候選位置生成

### 系統優化

- 非同步處理避免阻塞
- 進度回調減少輪詢頻率
- 任務隊列管理資源

## 擴展功能

### 未來改進

1. **多容器支持**: 支援多個容器的打包
2. **重量限制**: 考慮物件的重量約束
3. **旋轉優化**: 允許物件旋轉以獲得更好的利用率
4. **視覺化改進**: 3D視圖中的打包過程動畫

### 自定義算法

可以通過繼承 `BLF_SA_Algorithm` 類來實現自定義的打包算法：

```python
class CustomAlgorithm(BLF_SA_Algorithm):
    def pack_objects(self, objects, progress_callback=None):
        # 實現自定義打包邏輯
        pass
```

## 故障排除

### 服務器無法啟動

1. 檢查端口8889是否被佔用
2. 確認Python環境和依賴已安裝
3. 檢查文件路徑是否正確

### 前端無法連接

1. 確認後端服務器正在運行
2. 檢查CORS設置
3. 確認API端點URL正確

### 打包結果不理想

1. 調整容器尺寸
2. 修改物件大小
3. 嘗試不同的算法參數

## 技術棧

- **後端**: Python, Flask, NumPy
- **前端**: JavaScript, Three.js, HTML5, CSS3
- **算法**: BLF + Simulated Annealing
- **通信**: RESTful API, JSON

## 版本信息

- **版本**: 1.0.0
- **更新日期**: 2024年
- **作者**: 3D Bin Packing Team
