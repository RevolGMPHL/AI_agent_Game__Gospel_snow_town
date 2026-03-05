#!/usr/bin/env python3
"""
生成6个室内场景的 PNG 布局图，用于给 AI 重绘或直接替换。
每个场景按游戏中的网格大小渲染（TILE=32px），包含墙壁、地板、门口、家具和标注。

使用方法：
    python3 generate_indoor_maps.py
    
输出目录：asset/indoor/
"""

from PIL import Image, ImageDraw, ImageFont
import os

TILE = 32
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'asset', 'indoor')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============ 配色方案（与 maps.js 中 C 对象对应） ============
C = {
    'WALL_INT':    '#7A6A5A',   # 室内北墙
    'WALL_INT2':   '#8A7A6A',   # 室内侧墙/南墙
    'DOOR':        '#5A4A3A',   # 门
    'FLOOR_WOOD':  '#C8B898',   # 木地板
    'FLOOR_STONE': '#A0A098',   # 石地板
    'FLOOR_TILE':  '#B8B0A0',   # 瓷砖地板
    'BED':         '#8898B8',   # 蓝色床
    'BED_RED':     '#A87070',   # 红色床
    'TABLE':       '#A0926A',   # 桌子
    'COUNTER':     '#908878',   # 柜台
    'SHELF':       '#907858',   # 架子
    'STOVE':       '#A05028',   # 灶台
}

# ============ 室内场景定义（从 maps.js 提取） ============
INDOOR_MAPS = {
    'warehouse': {
        'name': '仓库',
        'width': 10, 'height': 8,
        'floor': C['FLOOR_STONE'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 3, 'h': 2, 'color': '#8B5520', 'name': '🪵木柴区'},
            {'x': 6, 'y': 1, 'w': 3, 'h': 2, 'color': '#A09050', 'name': '🍖食物区'},
            {'x': 1, 'y': 4, 'w': 3, 'h': 2, 'color': '#7A7A7A', 'name': '🧱建材区'},
            {'x': 6, 'y': 4, 'w': 3, 'h': 2, 'color': '#6A5A4A', 'name': '📦杂物区'},
        ],
    },
    'medical': {
        'name': '医疗站',
        'width': 10, 'height': 8,
        'floor': C['FLOOR_TILE'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 2, 'h': 2, 'color': C['BED'],     'name': '病床1'},
            {'x': 4, 'y': 1, 'w': 2, 'h': 2, 'color': C['BED'],     'name': '病床2'},
            {'x': 7, 'y': 1, 'w': 2, 'h': 2, 'color': C['BED_RED'], 'name': '病床3'},
            {'x': 1, 'y': 4, 'w': 2, 'h': 1, 'color': C['COUNTER'], 'name': '药柜'},
            {'x': 4, 'y': 4, 'w': 3, 'h': 2, 'color': C['TABLE'],   'name': '诊疗台'},
            {'x': 8, 'y': 4, 'w': 1, 'h': 3, 'color': C['SHELF'],   'name': '草药架'},
        ],
    },
    'dorm_a': {
        'name': '宿舍A（男生宿舍）',
        'width': 12, 'height': 8,
        'floor': C['FLOOR_WOOD'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED'],     'name': '赵铁柱的床'},
            {'x': 3, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED'],     'name': '王策的床'},
            {'x': 5, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED_RED'], 'name': '苏岩的床'},
            {'x': 7, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED_RED'], 'name': '陆辰的床'},
            {'x': 9, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED'],     'name': '老钱的床'},
            {'x': 5,  'y': 4, 'w': 2, 'h': 2, 'color': '#A05030',   'name': '取暖火盆'},
            {'x': 1,  'y': 5, 'w': 2, 'h': 1, 'color': C['TABLE'],  'name': '简易桌'},
            {'x': 9,  'y': 5, 'w': 2, 'h': 1, 'color': C['TABLE'],  'name': '杂物桌'},
        ],
    },
    'dorm_b': {
        'name': '宿舍B（女生宿舍）',
        'width': 12, 'height': 8,
        'floor': C['FLOOR_WOOD'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 2, 'h': 1, 'color': C['BED'],     'name': '李婶的床'},
            {'x': 4, 'y': 1, 'w': 2, 'h': 1, 'color': '#E080A0',   'name': '歆玥的床'},
            {'x': 7, 'y': 1, 'w': 2, 'h': 1, 'color': '#4090B0',   'name': '清璇的床'},
            {'x': 10, 'y': 1, 'w': 1, 'h': 1, 'color': '#E0A0B0',  'name': '空床位'},
            {'x': 1,  'y': 4, 'w': 2, 'h': 2, 'color': '#A05030',  'name': '取暖火盆'},
            {'x': 5,  'y': 5, 'w': 2, 'h': 1, 'color': C['TABLE'], 'name': '简易桌'},
        ],
        'extra': {'furnace_slot': {'x': 9, 'y': 4, 'w': 2, 'h': 2}},
    },
    'kitchen': {
        'name': '炊事房',
        'width': 8, 'height': 8,
        'floor': C['FLOOR_TILE'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 3, 'h': 1, 'color': C['STOVE'], 'name': '灶台'},
            {'x': 5, 'y': 1, 'w': 2, 'h': 2, 'color': C['SHELF'], 'name': '食材架'},
            {'x': 2, 'y': 4, 'w': 4, 'h': 2, 'color': C['TABLE'], 'name': '餐桌'},
        ],
        'seats': [
            {'x': 1, 'y': 4}, {'x': 1, 'y': 5},
            {'x': 6, 'y': 4}, {'x': 6, 'y': 5},
            {'x': 3, 'y': 3}, {'x': 4, 'y': 3},
        ],
    },
    'workshop': {
        'name': '工坊',
        'width': 12, 'height': 8,
        'floor': C['FLOOR_STONE'],
        'furniture': [
            {'x': 1, 'y': 1, 'w': 3, 'h': 2, 'color': C['TABLE'],   'name': '工作台'},
            {'x': 5, 'y': 1, 'w': 3, 'h': 2, 'color': '#606060',   'name': '发电机'},
            {'x': 9, 'y': 1, 'w': 2, 'h': 3, 'color': C['SHELF'],  'name': '工具架'},
            {'x': 1, 'y': 4, 'w': 3, 'h': 2, 'color': '#7A7A7A',   'name': '建材堆'},
            {'x': 5, 'y': 4, 'w': 3, 'h': 2, 'color': '#5A6A5A',   'name': '无线电台'},
        ],
    },
}

# 室内多座位定义（用于标注可站立位置）
INDOOR_SEATS = {
    'dorm_a': [
        {'x': 5, 'y': 6, 'name': '火盆旁左'},
        {'x': 7, 'y': 6, 'name': '火盆旁右'},
        {'x': 2, 'y': 5, 'name': '简易桌旁'},
        {'x': 10, 'y': 5, 'name': '杂物桌旁'},
        {'x': 2, 'y': 2, 'name': '赵铁柱床边'},
        {'x': 4, 'y': 2, 'name': '王策床边'},
        {'x': 6, 'y': 2, 'name': '苏岩床边'},
        {'x': 8, 'y': 2, 'name': '陆辰床边'},
        {'x': 10, 'y': 2, 'name': '老钱床边'},
    ],
    'dorm_b': [
        {'x': 1, 'y': 6, 'name': '火盆旁'},
        {'x': 3, 'y': 5, 'name': '火盆前'},
        {'x': 6, 'y': 5, 'name': '桌旁'},
        {'x': 2, 'y': 2, 'name': '李婶床边'},
        {'x': 5, 'y': 2, 'name': '歆玥床边'},
        {'x': 8, 'y': 2, 'name': '清璇床边'},
    ],
    'medical': [
        {'x': 2, 'y': 3, 'name': '病床1旁'},
        {'x': 5, 'y': 3, 'name': '病床2旁'},
        {'x': 8, 'y': 3, 'name': '病床3旁'},
        {'x': 2, 'y': 5, 'name': '药柜旁'},
        {'x': 7, 'y': 6, 'name': '诊疗台旁'},
    ],
    'warehouse': [
        {'x': 3, 'y': 3, 'name': '木柴区旁'},
        {'x': 7, 'y': 3, 'name': '食物区旁'},
        {'x': 2, 'y': 6, 'name': '建材区旁'},
        {'x': 7, 'y': 6, 'name': '杂物区旁'},
        {'x': 5, 'y': 4, 'name': '仓库中央'},
    ],
    'workshop': [
        {'x': 2, 'y': 3, 'name': '工作台前'},
        {'x': 6, 'y': 3, 'name': '发电机旁'},
        {'x': 10, 'y': 3, 'name': '工具架旁'},
        {'x': 2, 'y': 6, 'name': '建材堆旁'},
        {'x': 6, 'y': 6, 'name': '无线电台旁'},
        {'x': 8, 'y': 6, 'name': '工坊南侧'},
    ],
    'kitchen': [
        {'x': 2, 'y': 2, 'name': '灶台旁'},
        {'x': 6, 'y': 2, 'name': '食材架旁'},
        {'x': 1, 'y': 4, 'name': '餐桌左1'},
        {'x': 1, 'y': 5, 'name': '餐桌左2'},
        {'x': 6, 'y': 4, 'name': '餐桌右1'},
        {'x': 6, 'y': 5, 'name': '餐桌右2'},
    ],
}


def hex_to_rgb(hex_color):
    """将 #RRGGBB 转为 (R, G, B) 元组"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_indoor_map(scene_key, scene_data):
    """渲染一个室内场景为 PNG 图片"""
    w = scene_data['width']
    h = scene_data['height']
    img_w = w * TILE
    img_h = h * TILE
    
    img = Image.new('RGB', (img_w, img_h), '#000000')
    draw = ImageDraw.Draw(img)
    
    floor_color = hex_to_rgb(scene_data['floor'])
    wall_n = hex_to_rgb(C['WALL_INT'])
    wall_s = hex_to_rgb(C['WALL_INT2'])
    door_color = hex_to_rgb(C['DOOR'])
    
    door_x = w // 2
    
    # 绘制地砖（逐格绘制，带微小颜色变化增加纹理感）
    import random
    random.seed(42 + hash(scene_key))  # 固定随机种子保证一致性
    
    for gy in range(h):
        for gx in range(w):
            px, py = gx * TILE, gy * TILE
            
            # 判断类型
            if gy == 0:
                # 北墙
                color = wall_n
            elif gx == 0 or gx == w - 1:
                # 侧墙
                color = wall_s
            elif gy == h - 1:
                if gx >= door_x - 1 and gx <= door_x:
                    # 门口
                    color = door_color
                else:
                    # 南墙
                    color = wall_s
            else:
                # 地板（加轻微随机纹理）
                r, g, b = floor_color
                noise = random.randint(-8, 8)
                color = (max(0, min(255, r + noise)),
                         max(0, min(255, g + noise)),
                         max(0, min(255, b + noise)))
            
            draw.rectangle([px, py, px + TILE - 1, py + TILE - 1], fill=color)
            
            # 网格线（很淡的线）
            draw.rectangle([px, py, px + TILE - 1, py + TILE - 1], outline=(0, 0, 0, 30))
    
    # 绘制家具
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 10)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 10)
        except:
            font = ImageFont.load_default()
    
    for f in scene_data.get('furniture', []):
        fx, fy = f['x'] * TILE, f['y'] * TILE
        fw, fh = f['w'] * TILE, f['h'] * TILE
        fcolor = hex_to_rgb(f['color'])
        
        # 家具主体
        draw.rectangle([fx + 1, fy + 1, fx + fw - 2, fy + fh - 2], fill=fcolor)
        
        # 家具边框（深色）
        border = tuple(max(0, c - 40) for c in fcolor)
        draw.rectangle([fx + 1, fy + 1, fx + fw - 2, fy + fh - 2], outline=border)
        
        # 家具名称
        text = f['name']
        text_x = fx + fw // 2
        text_y = fy - 12
        if text_y < 2:
            text_y = fy + fh // 2 - 5
        
        # 文字阴影
        draw.text((text_x + 1, text_y + 1), text, fill=(0, 0, 0), font=font, anchor='mt')
        draw.text((text_x, text_y), text, fill=(255, 255, 255), font=font, anchor='mt')
    
    # 绘制座位标记（小圆点）
    seats = INDOOR_SEATS.get(scene_key, [])
    for s in seats:
        sx = s['x'] * TILE + TILE // 2
        sy = s['y'] * TILE + TILE // 2
        draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=(100, 255, 100, 128), outline=(60, 200, 60))
    
    # 也绘制 kitchen 的椅子座位
    for s in scene_data.get('seats', []):
        sx = s['x'] * TILE + TILE // 2
        sy = s['y'] * TILE + TILE // 2
        draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=(100, 255, 100, 128), outline=(60, 200, 60))
    
    # 绘制 dorm_b 的预留暖炉区域
    if 'extra' in scene_data and 'furnace_slot' in scene_data['extra']:
        fs = scene_data['extra']['furnace_slot']
        fsx = fs['x'] * TILE + 2
        fsy = fs['y'] * TILE + 2
        fsw = fs['w'] * TILE - 4
        fsh = fs['h'] * TILE - 4
        draw.rectangle([fsx, fsy, fsx + fsw, fsy + fsh], outline=(255, 200, 80), width=1)
        draw.text((fsx + fsw // 2, fsy + fsh // 2), '可建造', fill=(255, 200, 80), font=font, anchor='mm')
    
    # 门口标记
    door_px = (door_x - 1) * TILE + TILE // 2
    door_py = (h - 1) * TILE + TILE // 2
    draw.text((door_px + TILE // 2, door_py + 10), '🚪出口', fill=(200, 200, 200), font=font, anchor='mt')
    
    # 场景名称（左上角）
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 14)
    except:
        try:
            title_font = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 14)
        except:
            title_font = font
    
    draw.text((4, 4), f"{scene_data['name']} ({w}×{h})", fill=(255, 255, 255), font=title_font)
    
    return img


def main():
    print(f"=== 生成室内场景 PNG 到 {OUTPUT_DIR} ===\n")
    
    for key, data in INDOOR_MAPS.items():
        img = draw_indoor_map(key, data)
        
        # 保存原始大小版本
        out_path = os.path.join(OUTPUT_DIR, f'{key}.png')
        img.save(out_path)
        print(f"  ✅ {data['name']}: {key}.png ({img.width}×{img.height}px, {data['width']}×{data['height']}格)")
        
        # 保存放大4倍的版本（方便查看和AI重绘）
        scale = 4
        img_big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        out_path_big = os.path.join(OUTPUT_DIR, f'{key}_4x.png')
        img_big.save(out_path_big)
        print(f"       放大版: {key}_4x.png ({img_big.width}×{img_big.height}px)")
    
    print(f"\n=== 全部完成！共 {len(INDOOR_MAPS)} 个场景 ===")
    print(f"\n布局说明：")
    print(f"  - 绿色小圆点 = NPC可站立的座位位置")
    print(f"  - 每个场景底部中间2格 = 出口门")
    print(f"  - 墙壁: 北墙深色、侧墙/南墙浅色")
    print(f"  - 你可以用这些图做参考，重新渲染后替换 asset/indoor/ 下的同名文件")


if __name__ == '__main__':
    main()
