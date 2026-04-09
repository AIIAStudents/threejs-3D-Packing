# BC + DDD 領域詞彙表

## 目的

本詞彙表集中定義目前專案中的核心名詞，降低命名漂移與 context 間語意混淆。

## 詞彙

### Group

- 所屬 context：
  - `inventory`
- 定義：
  - 一組會一起進入 assignment 與 packing 流程的 inventory item 集合

### Inventory Item

- 所屬 context：
  - `inventory`
- 定義：
  - 實際參與 sequence 與 packing 的單筆庫存項目

### Catalog Item

- 所屬 context：
  - `inventory`
- 定義：
  - inventory item 所引用的尺寸 / 主資料定義

### Container

- 所屬 context：
  - `space_design`
- 定義：
  - 用來切割與視覺化的容器設定

### Cutting Job

- 所屬 context：
  - `space_design`
- 定義：
  - 將 container 定義轉成一組 zones 的切割作業紀錄

### Zone

- 所屬 context：
  - `space_design`
- 定義：
  - cutting job 產生的空間區塊

### Assignment

- 所屬 context：
  - `allocation`
- 定義：
  - zone 與 group 之間的指派關係

### Sequence

- 所屬 context：
  - owner 在 `inventory`
  - 被 `packing` 使用
- 定義：
  - inventory items 在 packing 前的明確順序

### Packing Result

- 所屬 context：
  - `packing`
- 定義：
  - packing 演算法對某個 zone/job 的執行結果

### Preview / View Final

- 所屬 context：
  - 前端呈現層，主要投影 `packing` 結果
- 定義：
  - latest-result / space-result 的 UI 顯示與視覺化流程
