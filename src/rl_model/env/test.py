# import torch
# print(torch.cuda.is_available())            # 應該是 True
# print(torch.cuda.get_device_name(0))        # 顯示你的 GPU 名稱

from stable_baselines3 import PPO
import torch

print(f"PyTorch CUDA: {torch.cuda.is_available()}")
print(f"SB3 device: {PPO.policy_aliases['MlpPolicy'].__module__}")
