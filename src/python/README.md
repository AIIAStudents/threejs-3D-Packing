# Python 腳本說明

本目錄包含3D Bin Packing系統的Python後端腳本。

## 文件說明

### `start_servers.py`
主要的服務器啟動腳本，用於啟動所有必要的後端服務。

**使用方法：**
```bash
cd src/python
python start_servers.py
```

### `run_bin_packing_server.py`
3D Bin Packing算法的後端服務器，處理打包請求。

**使用方法：**
```bash
cd src/python
python run_bin_packing_server.py
```

### `test_bin_packing.py`
測試3D Bin Packing功能的腳本。

**使用方法：**
```bash
cd src/python
python test_bin_packing.py
```

## 依賴安裝

確保已安裝所需的Python套件：

```bash
pip install -r ../../requirements.txt
```

## 注意事項

- 所有腳本都應該從項目根目錄運行
- 確保後端服務器在端口8888上運行
- 前端應用需要後端服務才能正常運作
