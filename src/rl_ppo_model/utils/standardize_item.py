import numpy as np

def standardize_item(obj):
    """
    將原始物件轉換為 CustomEnv 所需的 item 格式。
    包含 pos (ndarray) 和 size (ndarray)。
    """
    if not all(k in obj for k in ["position", "scale"]):
        raise ValueError(f"❌ 缺少 position 或 scale 欄位：{obj}")

    pos = obj["position"]
    scale = obj["scale"]

    item = {
        "pos": np.array([pos["x"], pos["y"], pos["z"]]),
        "size": np.array([scale["x"], scale["y"], scale["z"]])
    }
    return item
  

# def standardize_item(obj):
#   norm = normalize_object(obj)
#   return {
#       "pos": np.array([norm["position"]["x"], norm["position"]["y"], norm["position"]["z"]]),
#       "size": np.array([norm["scale"]["x"], norm["scale"]["y"], norm["scale"]["z"]])
#   }
