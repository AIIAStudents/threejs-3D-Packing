# BC + DDD 前端對齊路線圖

## 目前狀態

目前前端同時存在兩種組織方式：

- `src/js_v2/...`
  - route / page / router 導向
- `src/frontend/contexts/...`
  - context-scoped 的 application / domain 模組

## 已初步對齊的部分

- packing preview / view-final 已有 context-scoped application / domain 邏輯
- 部分資料整形與 projection 已逐步下沉到 `src/frontend/contexts/packing/...`

## 尚未完全對齊的部分

- route module 仍是主要組裝點
- page lifecycle 與 DOM wiring 仍多半放在 `src/js_v2/...`
- 前端的 top-level 組織仍偏 route/page，而非 bounded context

## 最低風險演進路徑

1. 保持 `AppRouter` 薄且專注 route lifecycle
2. 新的 page data loading 優先下沉到 `src/frontend/contexts/.../application/...`
3. page module 保留 DOM 與 rendering wiring
4. 若某頁反覆重複相同資料整形，再抽到 frontend context domain / projection

## 在低風險階段不要做的事

- 不要重寫 router
- 不要一次重組整個 page tree
- 不要把前端對齊工作與後端 boundary 整理綁在一起做大手術

## 後續建議

- 新增前端模組時，命名優先使用 context 語言，而不是流程步驟語言
- 每次改某頁時，先判斷該頁的資料組裝是否能移到 frontend context application service
- preview / route 相容性修正應維持獨立，不擴張成整站重構
