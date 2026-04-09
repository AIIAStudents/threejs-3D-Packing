# BC + DDD 邊界治理規則

## 目的

本文件定義目前專案在 bounded context 單體下的治理規則，讓 shared database 不會再次退化成任意共享資料庫。

## 依賴規則

在 `src/backend/contexts/...` 內：

- 可以依賴：
  - 自己 context 的 `application` / `infrastructure` / `interfaces`
  - 其他 context 的 application-level read entrypoint
  - `src/backend/shared/...`
- 不應直接 import 其他 context 的 `infrastructure`
- 若真的需要 temporary exception，必須：
  - 先寫入 boundary 文件
  - 再加入 governance scan allowlist

## Write-Side Owner Policy

### `inventory`

- owner tables：
  - `groups`
  - `catalog_items`
  - `inventory_items`
- 合法 write entrypoint：
  - `GroupCommandService`
  - `InventoryItemCommandService`
  - `InventoryAccessFacade.update_item_sequence(...)`
- 不應被其他 context 當作 write API 的元件：
  - `GroupRepository`
  - `InventoryItemRepository`

### `space_design`

- owner tables：
  - `containers`
  - `cutting_jobs`
  - `zones`
- 合法 write entrypoint：
  - `ContainerCommandService`
  - `CuttingJobCommandService`
  - `ZoneCommandService`（限本 context）
- 不應被其他 context 當作 write API 的元件：
  - `ContainerRepository`
  - `CuttingJobRepository`
  - `ZoneRepository`

### `allocation`

- owner table：
  - `zone_assignments`
- 合法 write entrypoint：
  - `AllocationCommandService`
- 不應被其他 context 當作 write API 的元件：
  - `AllocationRepository`

### `packing`

- owner table：
  - `packing_results`
- 合法 write entrypoint：
  - `PackingExecutionService`
  - `PackingRepository.insert_packing_result(...)`
- 不應被其他 context 當作 write API 的元件：
  - `PackingRepository` 其他非 owner method

## Compatibility Layer 規則

### `api_server_v2`

- 角色：
  - adapter / HTTP composition / bootstrap / compatibility layer
- 不是 domain owner：
  - 這裡有 API，不代表 ownership 在這裡
- ownership 仍在：
  - `src/backend/contexts/...`

### Legacy Repository 與 Shim

- 範例：
  - `src/api_server_v2/repositories/inventory_repository.py`
  - `PackingRepository.update_item_sequence(...)`
- 規則：
  - 不應新增新 caller
  - 只在有明確 compatibility 需求時保留
  - 需標記退場方向

## Packing Pipeline 規則

packing use case 分成三段：

1. input assembly
   - `PackingInputQueryService`
2. execution orchestration
   - `PackingExecutionService`
3. result persistence / query
   - `PackingRepository`
   - `PackingResultsQueryService`

禁止的方向：

- 直接把其他 context repository 當作 packing 的 general-purpose read/write API

## Governance Guard

### `scripts/verify_boundary_governance.py`

檢查：

- cross-context infrastructure import
- non-owner direct write

### `scripts/verify_application_entrypoints.py`

檢查：

- packing input 是否仍由 `PackingInputQueryService` 組裝
- sequence write 是否仍由 `InventoryAccessFacade` 代理

### `scripts/verify_boundary_regression.py`

檢查：

- 非破壞性初始化
- sequence / packing / result 主資料流

### `scripts/smoke/preview-route-init.spec.js`

檢查：

- `/view-final`
- `/animation-preview`
- preview worker / route 初始化

## Frontend 對齊原則

- `AppRouter` 保持薄
- page module 主要負責 DOM 與 route lifecycle
- 逐步把資料整形與 use case 邏輯下沉到 `src/frontend/contexts/...`
- 不在低風險階段直接重寫整個 page / router 架構
