#!/usr/bin/env python3
"""
用 gen 目录下的建筑裁剪图替换游戏中的建筑素材

布局映射（与地图上建筑位置对应）：
  1(warehouse)  2(medical)
  3(dorm_a)     4(dorm_b)
  5(kitchen)    6(workshop)  7(command)

操作：
  1. 将裁剪图缩放为游戏精灵图（小尺寸，用于实时渲染）
  2. 将裁剪图缩放为底图合成版（0后缀，用于烘焙进底图PNG）
  3. 重新运行底图合成脚本
"""

import os
import shutil
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(BASE, 'asset', 'buildings', 'gen')
BUILD_DIR = os.path.join(BASE, 'asset', 'buildings')

# 原始地图参数
ORIG_TILE = 32

# 裁剪图 -> 建筑ID 的映射（按用户指定的 "12/34/567" 布局）
# 每个建筑的 grid 尺寸来自 maps.js / place_buildings_on_map.py
MAPPING = [
    # (crop_index, building_id, grid_w, grid_h)
    (1, 'warehouse', 6, 4),
    (2, 'medical',   6, 4),
    (3, 'dorm_a',    7, 5),
    (4, 'dorm_b',    7, 5),
    (5, 'kitchen',   5, 4),
    (6, 'workshop',  7, 4),
    (7, 'command',   4, 3),
]


def main():
    print('🏗️ 开始替换建筑素材...\n')

    for crop_idx, bid, gw, gh in MAPPING:
        src_path = os.path.join(GEN_DIR, f'building_crop_{crop_idx}.png')
        if not os.path.exists(src_path):
            print(f'  ⚠️ 跳过 {bid}: {src_path} 不存在')
            continue

        img = Image.open(src_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        print(f'🏠 [{crop_idx}] -> {bid}')
        print(f'   原始尺寸: {img.size[0]}×{img.size[1]}')

        # === 1. 生成游戏精灵图（用于 SpriteLoader 实时渲染） ===
        # 精灵图尺寸：宽 = gw * TILE, 高 = (gh+1) * TILE（+1格给屋顶）
        # 参考现有建筑精灵图的尺寸比例
        sprite_w = gw * ORIG_TILE
        sprite_h = (gh + 1) * ORIG_TILE  # 额外1格给屋顶
        sprite = img.resize((sprite_w, sprite_h), Image.LANCZOS)
        sprite_path = os.path.join(BUILD_DIR, f'{bid}.png')
        sprite.save(sprite_path)
        print(f'   精灵图: {sprite_w}×{sprite_h} -> {sprite_path}')

        # === 2. 生成底图合成版（0后缀，高分辨率，用于 place_buildings_on_map.py） ===
        # 0版素材使用更大尺寸以提高底图质量
        # 原始设计尺寸 * 4 倍（与现有 0 版素材比例一致）
        hi_res_w = sprite_w * 4
        hi_res_h = sprite_h * 4
        hi_res = img.resize((hi_res_w, hi_res_h), Image.LANCZOS)
        hi_res_path = os.path.join(BUILD_DIR, f'{bid}0.png')
        hi_res.save(hi_res_path)
        print(f'   底图版: {hi_res_w}×{hi_res_h} -> {hi_res_path}')
        print()

    print('✅ 所有建筑素材已替换！')
    print()

    # === 3. 重新合成底图 ===
    print('🗺️ 重新合成底图...')
    place_script = os.path.join(BASE, 'place_buildings_on_map.py')
    if os.path.exists(place_script):
        os.system(f'cd "{BASE}" && python3 "{place_script}"')
    else:
        print('  ⚠️ place_buildings_on_map.py 不存在，跳过底图合成')

    print('\n🎉 全部完成！')


if __name__ == '__main__':
    main()
