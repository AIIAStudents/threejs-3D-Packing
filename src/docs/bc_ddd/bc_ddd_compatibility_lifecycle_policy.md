# BC + DDD 相容層生命週期政策

## 目的

本文件用來區分哪些 compatibility layer 應長期保留、哪些只是過渡層、哪些已屬可退場項，避免維護者把所有 legacy path 都當成永久設計。

## 分類

### 長期保留項

這類元件預期在可見未來持續存在，因為它們承擔穩定的 adapter / composition 角色。

範例：

- `src/api_server_v2/app.py`
- `src/api_server_v2/bootstrap/...`
- API blueprint registration 與 HTTP 組裝層

保留原因：

- 它們屬於目前穩定的對外執行入口
- 移除會變成功能性交付變更，而非單純 boundary 整理

### 過渡項

這類元件存在是為了讓舊路徑平滑過渡到 context-owned entrypoint。

範例：

- `PackingRepository.update_item_sequence(...)`
- `PackingRepository` 內少量 compatibility-only read helper
- 舊的 legacy repository path

保留原因：

- rollback safety
- 還可能有未完全清點的 caller

規則：

- 不新增新 caller
- 不新增新責任
- 新功能優先走 owner-aligned path

### 可退場項

這類元件理論上未來應退場，但需滿足條件後才能動。

範例：

- 沒有 active caller 的 legacy repository
- 已被 query service / facade 取代的 compatibility helper

## 退場條件

某個 compatibility path 可退場時，至少應符合：

1. replacement path 已存在
2. active caller 已移除或完成遷移
3. governance / regression / smoke 驗證仍通過
4. 文件已更新，不再把它列為現行入口

## 目前實務規則

- `api_server_v2` 屬 retained adapter layer
- context 內的 compatibility shim 屬過渡項
- cross-context repository helper 原則上屬可退場候選

## 禁止事項

- 不因為 compatibility path 還在，就把它當成新功能的預設入口
- 不把 temporary exception 擴張成正式層次
