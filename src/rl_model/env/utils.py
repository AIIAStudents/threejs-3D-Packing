import numpy as np

def get_item_size(props):
    if "width" in props and "height" in props and "depth" in props:
        return np.array([props["width"], props["height"], props["depth"]])
    elif "radius" in props:
        r = props["radius"]
        return np.array([r*2, r*2, r*2])
    elif "radiusTop" in props and "height" in props:
        r = max(props["radiusTop"], props.get("radiusBottom", props["radiusTop"]))
        return np.array([r*2, props["height"], r*2])
    else:
        return np.array([10, 10, 10])

def check_overlap(pos, size, placed_items):
    px, py, pz = pos
    sx, sy, sz = size
    for item in placed_items:
        ix, iy, iz = item["pos"]
        isx, isy, isz = item["size"]
        if (px + sx > ix and px < ix + isx and
            py + sy > iy and py < iy + isy and
            pz + sz > iz and pz < iz + isz):
            return True
    return False

def geometry_to_box(item_type, props, scene_dims=(100, 100, 100), scale_ratio=0.6):
    # 固定尺寸以簡化訓練（未來可加動態縮放）
    return [5.0, 5.0, 5.0]

def get_color(name):
    name = name.lower()
    if "sphere" in name:
        return "orange"
    elif "cube" in name:
        return "skyblue"
    elif "cylinder" in name:
        return "green"
    elif "icosahedron" in name:
        return "purple"
    else:
        return "gray"