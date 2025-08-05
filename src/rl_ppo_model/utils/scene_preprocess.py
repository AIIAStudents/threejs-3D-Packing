def normalize_object(obj: dict) -> dict:
    obj["position"] = obj.get("position", {"x": 0, "y": 0, "z": 0})
    obj["scale"] = obj.get("scale", {"x": 1, "y": 1, "z": 1})
    obj["material"] = obj.get("material", {
        "metalness": 0,
        "roughness": 1,
        "color": 0xFFFFFF  # 白色 HEX 預設
    })
    obj["rotation"] = obj.get("rotation", {"x": 0, "y": 0, "z": 0})
    obj["bbox"] = obj.get("bbox", {"width": 1, "height": 1, "depth": 1})
    obj["velocity"] = obj.get("velocity", {"x": 0, "y": 0, "z": 0})
    return obj