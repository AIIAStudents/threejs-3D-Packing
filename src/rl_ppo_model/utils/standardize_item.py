# --- Imports ---
import numpy as np
from typing import List, Dict, Optional
from pydantic import BaseModel, Field, ValidationError
from dataclasses import dataclass

# --- Step 1: Schema 定義 ---
class ItemSchema(BaseModel):
    uuid: Optional[str]
    position: Dict[str, float] = Field(..., description="包含 x, y, z")
    scale: Dict[str, float] = Field(..., description="包含 x, y, z")
    type: Optional[str] = "box"
    material: Optional[Dict[str, float]] = {
        "metalness": 0.0,
        "roughness": 0.0,
        "color": 16777215
    }

class SceneSchema(BaseModel):
    objects: List[ItemSchema]


# --- Step 2: Dataclass 結構 ---
@dataclass
class StandardItem:
    pos: np.ndarray
    size: np.ndarray
    uuid: Optional[str]
    type: str = "box"
    material: Dict[str, float] = None


# --- Step 3: 單一物件標準化 ---
def standardize_item(obj: Dict) -> StandardItem:
    try:
        validated = ItemSchema(**obj)
    except ValidationError as e:
        raise ValueError(f"❌ 格式驗證失敗：{e}")

    pos = validated.position
    scale = validated.scale

    return StandardItem(
        pos=np.array([pos["x"], pos["y"], pos["z"]], dtype=float),
        size=np.array([scale["x"], scale["y"], scale["z"]], dtype=float),
        uuid=validated.uuid,
        type=validated.type,
        material=validated.material
    )


# --- Step 4: 整包場景驗證與標準化 ---
def parse_scene(data: Dict) -> List[StandardItem]:
    try:
        scene = SceneSchema(**data)
    except ValidationError as e:
        raise ValueError(f"❌ 場景格式錯誤：{e}")
    
    return [standardize_item(item.dict()) for item in scene.objects]