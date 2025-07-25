# env/env_reward_utils.py

import numpy as np

GAMMA = 0.99  # 與 PPO discount factor 保持一致

def calculate_longterm_reward(item, placed_items, scene_dims, done, debug=False):
    """
    重寫後的獎懲：
      φ(s) = sum(volume of placed_items)
      immediate: +vol(item) / -0.5·vol(item)
      shaping: γ·[φ(s') - φ(s)]  （只有 valid 才給 shaping）
      done bonus: φ(s')  （done 且 valid）
    回傳：reward, status ("success"/"fail")
    """
    phi_s = sum(np.prod(it["size"]) for it in placed_items)
    volume = np.prod(item["size"])

    # 驗證有效性並取得失敗原因
    valid, reasons = check_validity(item, placed_items, scene_dims)

    # φ(s')
    phi_s_prime = phi_s + (volume if valid else 0.0)

    # shaping reward 僅 valid 時才計算
    shaping = GAMMA * (phi_s_prime - phi_s) if valid else 0.0

    # base reward / penalty    
    base_reward = volume if valid else -0.5 * volume

    # 完成時的額外獎勵
    done_bonus = phi_s_prime if (done and valid) else 0.0

    reward = base_reward + shaping + done_bonus
    status = "success" if valid else "fail"

    if debug and not valid:
        print(f"[EnvReward] 放置失敗原因：{reasons}, "
              f"pos={item['pos']}, size={item['size']}")

    return reward, status


def check_validity(item, placed_items, scene_dims):
    """回傳 (valid, reasons)，reasons 是所有失敗檢查的標籤列表"""
    reasons = []

    if is_out_of_bounds(item, scene_dims):
        reasons.append("out_of_bounds")

    if has_overlap(item, placed_items):
        reasons.append("overlap")

    if not has_support(item, placed_items):
        reasons.append("no_support")

    return (len(reasons) == 0), reasons


def is_out_of_bounds(item, scene_dims):
    return np.any(item["pos"] < 0) or np.any(item["pos"] + item["size"] > scene_dims)


def has_overlap(new_item, placed_items):
    for it in placed_items:
        if is_overlap(it, new_item):
            return True
    return False


def is_overlap(a, b):
    for i in range(3):
        if abs(a["pos"][i] - b["pos"][i]) >= (a["size"][i] + b["size"][i]) / 2:
            return False
    return True


def has_support(item, placed_items):
    # 直接落地
    if abs(item["pos"][1]) < 1e-6:
        return True

    for other in placed_items:
        top_y = other["pos"][1] + other["size"][1]
        touching = abs(item["pos"][1] - top_y) < 1e-3
        if touching and overlaps_xy(item, other):
            return True

    return False


def overlaps_xy(a, b):
    for idx in (0, 2):
        if abs(a["pos"][idx] - b["pos"][idx]) >= (a["size"][idx] + b["size"][idx]) / 2:
            return False
    return True