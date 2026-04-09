# BC + DDD 架構邊界總覽

## 目的

本文件用來記錄目前單體專案在 shared database 前提下，已落地的 bounded context、table ownership、owner / reader matrix、cross-context policy、temporary exception 與治理入口。

本專案的目標不是追求教科書式純化，而是以低風險方式讓單體更接近有邊界的 DDD。

## Bounded Context

### `inventory`

- 職責：
  - 管理群組與庫存主資料
- 主要資料表：
  - `groups`
  - `catalog_items`
  - `inventory_items`
- 相容性讀取投影：
  - `items` view

### `space_design`

- 職責：
  - 管理 container 定義與 cutting 輸出
- 主要資料表：
  - `containers`
  - `cutting_jobs`
  - `zones`

### `allocation`

- 職責：
  - 管理 zone 與 group 的指派關係
- 主要資料表：
  - `zone_assignments`

### `packing`

- 職責：
  - 管理 packing 執行結果與結果查詢
- 主要資料表：
  - `packing_results`

## Table Ownership

| Table | Owner Context | 說明 |
| --- | --- | --- |
| `groups` | `inventory` | 群組主資料 |
| `catalog_items` | `inventory` | 尺寸與主檔資料 |
| `inventory_items` | `inventory` | 實際庫存與 sequence |
| `items` view | `inventory` | 舊版相容讀取投影 |
| `containers` | `space_design` | 容器設定 |
| `cutting_jobs` | `space_design` | 切割作業紀錄 |
| `zones` | `space_design` | cutting 產生的空間區塊 |
| `zone_assignments` | `allocation` | zone 與 group 的指派 |
| `packing_results` | `packing` | packing 執行結果快照 |

## Owner / Reader Matrix

| Table | Owner | Allowed Readers | 現況用途 |
| --- | --- | --- | --- |
| `groups` | `inventory` | `allocation` | assignment 頁面資料組裝 |
| `catalog_items` | `inventory` | `allocation`, `packing` 間接讀取 | inventory projection |
| `inventory_items` | `inventory` | `allocation`, `packing` | assignment、sequence、packing input |
| `containers` | `space_design` | `allocation`, `packing` | assignment 與結果 metadata |
| `cutting_jobs` | `space_design` | `allocation`, `packing` | 最新 layout 與結果 metadata |
| `zones` | `space_design` | `allocation`, `packing` | assignment UI 與 packing input |
| `zone_assignments` | `allocation` | `packing` | zone -> group mapping |
| `packing_results` | `packing` | `packing` query path | latest-result / space-result |
| `inventory_items.item_order` | `inventory` | 無跨 context 直接寫入 | 由 inventory owner path 委派更新 |

## 實際資料流

### Group 與 Inventory

1. 前端呼叫 `/api/v2/groups/`
2. HTTP handler -> `GroupCommandService`
3. `GroupRepository` 寫入 `groups`
4. 前端呼叫 `/api/v2/items/` 或 `/api/v2/items/bulk`
5. HTTP handler -> `InventoryItemCommandService`
6. 先解析或建立 `catalog_items`
7. 透過 `InventoryItemRepository` 寫入 `inventory_items`

### Container 與 Cutting

1. 前端呼叫 `/api/v2/containers/`
2. HTTP handler -> `ContainerCommandService`
3. `ContainerRepository` 寫入 `containers`
4. 前端呼叫 `/api/v2/cutting/jobs`
5. HTTP handler -> `CuttingJobCommandService`
6. `CuttingJobRepository` 寫入 `cutting_jobs` 與 `zones`

### Allocation

1. 前端呼叫 `/api/assignment-data`
2. `AllocationQueryService` 透過：
   - `SpaceDesignReadFacade`
   - `AllocationReadFacade`
   - `InventoryAccessFacade`
   組裝 assignment 頁面資料
3. 前端呼叫 `/api/assignments`
4. HTTP handler -> `AllocationCommandService`
5. `AllocationRepository` 寫入 `zone_assignments`

### Sequence 與 Packing

1. 前端呼叫 `/api/sequence/save`
2. `SequenceService` 將更新委派給 `InventoryAccessFacade.update_item_sequence(...)`
3. owner-side 更新 `inventory_items.item_order`
4. 前端呼叫 `/api/sequence/execute`
5. `PackingExecutionService` 透過 `PackingInputQueryService` 取得：
   - 最新 cutting layout
   - zone 對應 group 的 items
6. packing 演算法執行後寫入 `packing_results`

### View Final 與 Preview

1. 前端呼叫 `/api/sequence/latest-result` 或 `/api/sequence/space-result/<id>`
2. `PackingResultsQueryService` 讀取：
   - `packing_results`
   - `space_design` metadata
3. 結果回到前端 preview / view-final 視覺化流程

## Allowed Cross-Context Reads

- `allocation` 可透過 `InventoryAccessFacade` 讀 groups / items projection
- `allocation` 可透過 `SpaceDesignReadFacade` 讀 container / cutting / zones
- `packing` 可透過 `PackingInputQueryService` 組裝 packing input
- `packing` 可透過 `AllocationReadFacade` 間接取得 assignment mapping
- `packing` 可透過 `InventoryAccessFacade` 間接取得 inventory projection
- `packing` 可透過 `SpaceDesignReadFacade` 間接取得 cutting metadata

## Disallowed Cross-Context Writes

- 非 `inventory` context 不得直接寫：
  - `groups`
  - `catalog_items`
  - `inventory_items`
- 非 `space_design` context 不得直接寫：
  - `containers`
  - `cutting_jobs`
  - `zones`
- 非 `allocation` context 不得直接寫：
  - `zone_assignments`
- 非 `packing` context 不得直接寫：
  - `packing_results`

## Legacy / Compatibility / Temporary Exception

### Legacy Inventory Projection Repository

- 類型：
  - compatibility-only legacy path
- 現況：
  - `src/api_server_v2/repositories/inventory_repository.py` 仍保留
- 原因：
  - 避免未審核的 legacy caller 直接中斷
- 方向：
  - 等確認無 active caller 後再縮減或退場

### PackingRepository Temporary Helper

- 類型：
  - temporary boundary exception
- 現況：
  - `PackingRepository` 仍保留少量 compatibility-only read helper
- 原因：
  - 作為 rollback safety 與過渡期保留
- 方向：
  - 不再新增新責任
  - 有明確 caller 證據時再逐步退場

### Destructive Reset Path

- 類型：
  - explicit dev/reset exception
- 現況：
  - destructive reset 仍存在，但只允許在顯式 dev/reset path 下使用
- 原因：
  - 保留開發期重建資料庫能力
- 方向：
  - 維持 guard、warning 與文件，不納入正常初始化

## Current Access Entrypoints

- `inventory`
  - `InventoryAccessFacade`
- `space_design`
  - `SpaceDesignReadFacade`
- `allocation`
  - `AllocationReadFacade`
- `packing` read-side
  - `PackingInputQueryService`

## Regression Guards

- `scripts/verify_boundary_governance.py`
  - 靜態檢查跨 context import 與 non-owner direct write
- `scripts/verify_application_entrypoints.py`
  - 檢查 packing input 與 sequence write 是否仍走 application-level owner entrypoint
- `scripts/verify_boundary_regression.py`
  - 驗證非破壞性初始化、sequence、packing result 流程
- `scripts/smoke/preview-route-init.spec.js`
  - 驗證 preview route / worker 初始化

## 相關治理文件

- [bc_ddd_boundary_governance.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_boundary_governance.md)
- [bc_ddd_compatibility_lifecycle_policy.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_compatibility_lifecycle_policy.md)
- [bc_ddd_architecture_evolution_policy.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_architecture_evolution_policy.md)
- [bc_ddd_responsibility_map.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_responsibility_map.md)
- [bc_ddd_domain_glossary.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_domain_glossary.md)
- [bc_ddd_frontend_alignment_roadmap.md](/c:/Users/GIGABYTE/blf_sa/3js/three.js/src/docs/bc_ddd_frontend_alignment_roadmap.md)
