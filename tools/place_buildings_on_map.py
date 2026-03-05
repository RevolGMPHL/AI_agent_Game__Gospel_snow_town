#!/usr/bin/env python3
"""
将带0后缀的建筑素材放置到新地图底图上

用法:
  python place_buildings_on_map.py
"""

import os
import shutil
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))

# 原始地图设计参数
ORIG_TILE = 32
ORIG_MAP_W = 50  # 格数
ORIG_MAP_H = 40
ORIG_IMG_W = ORIG_MAP_W * ORIG_TILE  # 1600
ORIG_IMG_H = ORIG_MAP_H * ORIG_TILE  # 1280

# 建筑在地图上的位置（格坐标）和格尺寸
# 来自 generate-map-base.py 中的 BUILDINGS 定义
# command 没有在 maps.js 中定义位置，暂放在暖炉广场右侧（约 x:33, y:26 附近）
BUILDINGS = [
    # id, grid_x, grid_y, grid_w, grid_h
    ('warehouse', 13, 11, 6, 4),
    ('medical',   30, 11, 6, 4),
    ('dorm_a',    13, 18, 7, 5),
    ('dorm_b',    30, 18, 7, 5),
    ('kitchen',   13, 26, 5, 4),
    ('workshop',  21, 26, 7, 4),
    ('command',   33, 26, 4, 3),  # 指挥所，放在工坊右侧
]


def main():
    # 源地图和输出路径
    src_map = os.path.join(BASE, 'asset', 'map', 'village_base_clean.png')
    out_map = os.path.join(BASE, 'asset', 'map', 'village_base_with_buildings.png')

    print(f'📂 加载地图: {src_map}')
    map_img = Image.open(src_map)
    map_w, map_h = map_img.size
    print(f'   地图尺寸: {map_w}×{map_h}')

    # 转为 RGBA 以支持透明度合成
    if map_img.mode != 'RGBA':
        map_img = map_img.convert('RGBA')

    # 计算缩放比例
    scale_x = map_w / ORIG_IMG_W
    scale_y = map_h / ORIG_IMG_H
    print(f'   缩放比例: X={scale_x:.4f}, Y={scale_y:.4f}')

    # 新的 tile 大小（像素）
    new_tile_x = ORIG_TILE * scale_x
    new_tile_y = ORIG_TILE * scale_y
    print(f'   新Tile大小: {new_tile_x:.1f}×{new_tile_y:.1f}')

    # 放置建筑
    for bid, gx, gy, gw, gh in BUILDINGS:
        sprite_path = os.path.join(BASE, 'asset', 'buildings', f'{bid}0.png')
        if not os.path.exists(sprite_path):
            print(f'  ⚠️ 跳过 {bid}: {sprite_path} 不存在')
            continue

        sprite = Image.open(sprite_path)
        if sprite.mode != 'RGBA':
            sprite = sprite.convert('RGBA')

        sprite_w, sprite_h = sprite.size
        print(f'\n  🏠 {bid}:')
        print(f'     素材原始尺寸: {sprite_w}×{sprite_h}')

        # 建筑在新地图上的目标位置和大小
        target_x = int(gx * new_tile_x)
        target_y = int(gy * new_tile_y)
        target_w = int(gw * new_tile_x)
        target_h = int(gh * new_tile_y)

        # 屋顶需要额外空间（向上延伸约1格），所以建筑素材通常比格子区域高
        # 原始建筑素材 h 方向多了 1 个 TILE（屋顶），按比例计算
        # 将素材缩放到目标区域大小，但保持原始宽高比或直接按格子大小缩放
        # 这里我们按目标区域大小缩放素材，但因为素材包含屋顶，要向上偏移

        # 素材原始设计的像素宽高（基于原始TILE）
        orig_design_w = gw * ORIG_TILE
        orig_design_h = gh * ORIG_TILE + ORIG_TILE  # 额外1格给屋顶

        # 缩放素材到新地图比例
        resize_w = int(orig_design_w * scale_x)
        resize_h = int(orig_design_h * scale_y)

        # 如果素材本身尺寸和原始设计不同（比如0版是更大的版本），直接按比例缩放
        # 先计算素材与原始设计尺寸的比率
        sprite_scale = sprite_w / orig_design_w
        # 0版素材可能是更高分辨率版本，直接缩放到目标大小
        resized_sprite = sprite.resize((resize_w, resize_h), Image.LANCZOS)

        print(f'     格子位置: ({gx},{gy}) 大小: {gw}×{gh}')
        print(f'     目标位置: ({target_x},{target_y})')
        print(f'     缩放后尺寸: {resize_w}×{resize_h}')

        # 放置位置：x 对齐格子左边，y 向上偏移屋顶高度（约1格）
        paste_x = target_x
        paste_y = target_y - int(new_tile_y)  # 屋顶向上延伸1格

        # 确保不超出地图边界
        paste_x = max(0, paste_x)
        paste_y = max(0, paste_y)

        print(f'     粘贴位置: ({paste_x},{paste_y})')

        # 使用 alpha_composite 粘贴（保持透明度）
        # 先创建一个和地图一样大的透明图层
        layer = Image.new('RGBA', (map_w, map_h), (0, 0, 0, 0))
        layer.paste(resized_sprite, (paste_x, paste_y))
        map_img = Image.alpha_composite(map_img, layer)

    # 保存结果
    # 转回 RGB 减小文件大小
    result = map_img.convert('RGB')
    result.save(out_map, quality=95)
    file_size = os.path.getsize(out_map)
    print(f'\n✅ 已保存: {out_map}')
    print(f'   文件大小: {file_size / 1024 / 1024:.2f} MB')
    print('🎉 完成！')


if __name__ == '__main__':
    main()
