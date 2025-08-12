# 3D 模型互動場景（Three.js + GLTF + TrackballControls）

本專案是一個基於 [Three.js](https://threejs.org/) 建立的 3D 模型互動環境，使用 `TrackballControls` 實現視角控制、可拖曳的 3D 幾何物件，以及載入 `.glb` 格式背景模型。


## 功能介紹

- 使用 `GLTFLoader` 載入 `.glb` 格式的 3D 倉庫背景。
- 可從工具列新增 3D 幾何物件（球體、立方體、二十面體）。
- 使用滑鼠直接拖曳新增的物件（限制在背景邊界範圍內）。
- 按住 `Tab` 鍵啟用視角控制（可旋轉、平移、縮放場景）。
- 拖曳與視角控制不互相干擾。
- 使用 `dat.GUI` 調整物件參數與編輯。


## 操作方式

| 動作             | 效果                       |
|------------------|----------------------------|
| 點選圖示按鈕     | 新增幾何物件               |
| 拖曳物件         | 移動至其他位置（有限制範圍）|
| 按住 `Shift` 鍵    | 啟用視角控制               |
| 放開 `Shift` 鍵    | 回復為拖曳模式             |

## 控制切換
- 預設關閉 `TrackballControls`：
`controls.enabled = false;`

- 按住 `Shift` 啟用視角控制，放開則恢復拖曳模式。

- 拖曳與視角互斥，不會互相干擾。

## 使用套件

- [`three`](https://www.npmjs.com/package/three)
- [`three/examples/jsm/controls/TrackballControls.js`](https://threejs.org/docs/#examples/en/controls/TrackballControls)
- [`three/examples/jsm/loaders/GLTFLoader.js`](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [`dat.gui`](https://github.com/dataarts/dat.gui)


## 工具列icon來源
- https://www.flaticon.com/