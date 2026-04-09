# BC + DDD 責任分層圖

## 目的

本文件說明 application / domain / data access / facade 各自應負責的內容，避免未來把業務邏輯再次塞回 infrastructure。

## Application Layer

負責：

- orchestration
- use case flow
- 跨 context 讀取的合法協調
- 將 write 委派回 owner path

典型元件：

- `PackingExecutionService`
- `PackingInputQueryService`
- `AllocationCommandService`
- `InventoryAccessFacade`

不應負責：

- raw SQL
- 大量 persistence 細節

## Domain Layer

負責：

- business rule
- algorithm
- domain projection / problem-space rule

典型元件：

- `src/py_packer_v2/...`
- `src/frontend/contexts/.../domain/...`

不應負責：

- transport
- persistence orchestration

## Data Access Layer

負責：

- SQL
- row mapping
- repository / query repository 細節

典型元件：

- `src/backend/contexts/*/infrastructure/...`

不應負責：

- use case orchestration
- 跨 context 的對外 application API

## Facade / Query Service

負責：

- 提供 application-level 穩定入口
- 隱藏底層 repository / query repository 細節
- 將 cross-context 使用集中與命名

適用情境：

- 其他 context 需要讀取 owner context 的資料
- 需要 delegated owner write
- UI / use case 需要組裝 read model

## 快速判斷

- use case 協調：application service
- 業務規則 / 演算法：domain
- SQL / persistence：repository
- cross-context read 入口：facade / query service
- delegated owner write：owner facade / owner application service
