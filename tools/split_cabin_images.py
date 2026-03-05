#!/usr/bin/env python3
"""
将 cabin 目录下的每张图片按水平方向三等分切割成3张图片
"""
from PIL import Image
import os

cabin_dir = "/data/project/project_revol/vibegame/20260220-gospel_snow_town/asset/buildings/cabin"

cabin_files = [
    "Neighbor Cabin.png",
    "Plank Cabin.png",
    "Rustic Cabin.png",
    "Stone Cabin.png",
    "Trailer Cabin.png",
]

# 先打印每张图片的尺寸，方便确认切割方式
print("=== 图片尺寸信息 ===")
for fname in cabin_files:
    fpath = os.path.join(cabin_dir, fname)
    img = Image.open(fpath)
    print(f"{fname}: {img.size[0]}x{img.size[1]} (宽x高)")

print()
print("=== 开始切割 ===")

for fname in cabin_files:
    fpath = os.path.join(cabin_dir, fname)
    img = Image.open(fpath)
    w, h = img.size

    # 按宽度三等分（每个屋子横向排列）
    part_w = w // 3
    base_name = os.path.splitext(fname)[0]

    for i in range(3):
        left = i * part_w
        # 最后一块取到图片末尾，避免因整除误差丢失像素
        right = (i + 1) * part_w if i < 2 else w
        crop = img.crop((left, 0, right, h))
        out_name = f"{base_name}_{i+1}.png"
        out_path = os.path.join(cabin_dir, out_name)
        crop.save(out_path)
        print(f"  保存: {out_name}  ({crop.size[0]}x{crop.size[1]})")

print()
print("切割完成！")
