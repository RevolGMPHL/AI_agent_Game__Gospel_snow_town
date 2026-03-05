#!/usr/bin/env python3
"""
resize_indoor.py — 将AI生成的室内场景图缩放为游戏所需尺寸
每张图生成两个版本：
  1. 原始版（用于游戏渲染底图）
  2. 4x放大版（保留高分辨率细节备份）
"""

from PIL import Image
import os

BASE = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(BASE, 'asset', 'indoor', 'gen')
OUT_DIR = os.path.join(BASE, 'asset', 'indoor')

# 场景名 → (目标宽, 目标高)  —— 与 maps.js 中的网格尺寸×32 对应
# warehouse: 10×8 → 320×256
# medical:   10×8 → 320×256
# dorm_a:    12×8 → 384×256
# dorm_b:    12×8 → 384×256
# kitchen:    8×8 → 256×256
# workshop:  12×8 → 384×256
SCENES = {
    'warehouse': (320, 256),
    'medical':   (320, 256),
    'dorm_a':    (384, 256),
    'dorm_b':    (384, 256),
    'kitchen':   (256, 256),
    'workshop':  (384, 256),
}

# gen目录中的文件名映射
FILE_MAP = {
    'warehouse': 'warehouse2.png',
    'medical':   'medical2.png',
    'dorm_a':    'dorm_a1.png',
    'dorm_b':    'dorm_b1.png',
    'kitchen':   'kitchen2.png',
    'workshop':  'workshop2.png',
}

for scene, (tw, th) in SCENES.items():
    src_file = os.path.join(GEN_DIR, FILE_MAP[scene])
    if not os.path.exists(src_file):
        print(f'[跳过] {src_file} 不存在')
        continue

    img = Image.open(src_file).convert('RGBA')
    print(f'[{scene}] 原始: {img.size} → 目标: ({tw}, {th})')

    # 缩放到游戏尺寸（原始版）
    img_small = img.resize((tw, th), Image.LANCZOS)
    out_path = os.path.join(OUT_DIR, f'{scene}.png')
    img_small.save(out_path, 'PNG')
    print(f'  → 已保存: {out_path} ({tw}×{th})')

    # 4x放大版（用于备份/后续编辑）
    tw4, th4 = tw * 4, th * 4
    img_4x = img.resize((tw4, th4), Image.LANCZOS)
    out_4x = os.path.join(OUT_DIR, f'{scene}_4x.png')
    img_4x.save(out_4x, 'PNG')
    print(f'  → 已保存: {out_4x} ({tw4}×{th4})')

print('\n✅ 全部完成！')
