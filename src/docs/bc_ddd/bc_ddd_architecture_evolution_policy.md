# BC + DDD 架構演進政策

## 目的

本文件定義在目前 bounded context 單體下，新增 read / write use case 時應遵守的演進順序與決策規則。

## 新增 Read Use Case

當需要新增 read use case 時，請依序判斷：

1. 先確認 owner context 是誰
2. 若是跨 context 或 UI 組裝用資料，優先新增：
   - facade
   - read model service
   - query service
3. repository / query repository 只負責底層資料存取，不應直接成為外部 context 的入口

簡化規則：

- 需要跨 context 組裝：先考慮 facade / query service
- 只是 SQL 細節：放在 repository / query repository

## 新增 Write Use Case

新增 write use case 時，必須先回答：

1. 寫入的是哪張表？
2. 這張表的 owner context 是誰？
3. 哪個 application service / owner facade 是合法 entrypoint？

規則：

- 非 owner context 不得直接以 repository 當作寫入 API
- 若既有流程真的需要委派寫入，必須回到 owner path

## 何時允許 Temporary Exception

只有在以下條件同時成立時才可接受：

1. 現行穩定流程仍依賴它
2. 立即替換風險偏高
3. 已明確標記為 temporary / compatibility
4. 已被 guard 或 regression 驗證覆蓋

## Allowlist 規則

若 governance scan 需要 allowlist：

1. 先寫文件
2. 說明為何 owner-aligned path 暫時無法完全取代
3. allowlist 必須盡量縮小範圍
4. 要附上退場條件

allowlist 應縮減的時機：

- replacement path 已上線
- 沒有剩餘 caller
- regression / build / smoke 驗證仍通過

## 什麼情況代表 Boundary 可能被打穿

若改動符合以下任一條件，就應提高警覺：

- 直接 import 其他 context 的 infrastructure
- 直接寫其他 context 的 owner table
- 把 orchestration / business logic 塞進 infrastructure
- 繞過既有 owner facade / query service 直接碰 repository 或 raw SQL

## 建議演進順序

1. 先確認 ownership 與 policy
2. 新增或重用 owner-aligned application entrypoint
3. 把 data access 放到 repository / query repository
4. 再把 caller 接到新的 entrypoint
5. 視需要補 governance / regression guard
