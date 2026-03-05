#!/usr/bin/env python3
"""
福音雪镇 — 素材占位符生成器
生成 32×32 像素风格的 tile/decoration/building PNG 占位符
你可以用像素画工具（如 Aseprite、Piskel、LibreSprite）替换这些图片
"""

from PIL import Image, ImageDraw, ImageFont
import random
import os

BASE = os.path.dirname(os.path.abspath(__file__))
TILE = 32

random.seed(42)  # 固定随机种子，保证每次生成一致


def hex_to_rgb(h):
    """将 '#RRGGBB' 转为 (R, G, B)"""
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def noise_color(base_rgb, variance=15):
    """给基色加随机噪声，variance为负值时表示暗化偏移"""
    v = abs(variance)
    if v == 0:
        return base_rgb
    offset = min(0, variance)  # 负值=暗化偏移
    return tuple(max(0, min(255, c + offset + random.randint(-v, v))) for c in base_rgb)


def make_tile(name, base_color, variant_func=None, size=TILE):
    """生成一个地砖 tile"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    base = hex_to_rgb(base_color)

    # 逐像素填充 + 噪声纹理
    for y in range(size):
        for x in range(size):
            if variant_func:
                c = variant_func(x, y, base)
            else:
                c = noise_color(base, 8)
            img.putpixel((x, y), c + (255,))

    path = os.path.join(BASE, 'asset', 'tiles', f'{name}.png')
    img.save(path)
    print(f'  ✓ tiles/{name}.png')
    return img


def make_decoration(name, size_w, size_h, draw_func):
    """生成一个装饰物精灵"""
    img = Image.new('RGBA', (size_w, size_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_func(img, draw, size_w, size_h)
    path = os.path.join(BASE, 'asset', 'decorations', f'{name}.png')
    img.save(path)
    print(f'  ✓ decorations/{name}.png')
    return img


def make_building(name, w_tiles, h_tiles, wall_color, roof_color):
    """生成一个建筑精灵"""
    pw = w_tiles * TILE
    ph = h_tiles * TILE + TILE  # 额外空间给屋顶
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    wall_rgb = hex_to_rgb(wall_color)
    roof_rgb = hex_to_rgb(roof_color)

    roof_h = int(ph * 0.35)
    wall_top = roof_h

    # 墙体
    for y in range(wall_top, ph):
        for x in range(pw):
            c = noise_color(wall_rgb, 10)
            img.putpixel((x, y), c + (255,))
    # 砖缝线
    for y in range(wall_top + 8, ph, 8):
        draw.line([(0, y), (pw, y)], fill=noise_color(wall_rgb, -20) + (80,), width=1)
    for y in range(wall_top + 8, ph, 8):
        offset = 0 if ((y - wall_top) // 8) % 2 == 0 else 8
        for x in range(offset, pw, 16):
            draw.line([(x, y), (x, y + 8)], fill=noise_color(wall_rgb, -20) + (60,), width=1)

    # 屋顶 (三角形)
    for y in range(roof_h):
        ratio = y / max(roof_h, 1)
        left = int(pw / 2 * (1 - ratio)) - 4
        right = pw - left + 4
        for x in range(max(0, left), min(pw, right)):
            c = noise_color(roof_rgb, 12)
            img.putpixel((x, y), c + (255,))
    # 积雪层
    for y in range(max(0, roof_h // 3), roof_h // 2):
        ratio = y / max(roof_h, 1)
        left = int(pw / 2 * (1 - ratio))
        right = pw - left
        for x in range(max(0, left + 2), min(pw, right - 2)):
            snow = noise_color((228, 232, 240), 8)
            old = img.getpixel((x, y))
            if old[3] > 0:
                blended = tuple(int(old[i] * 0.4 + snow[i] * 0.6) for i in range(3)) + (255,)
                img.putpixel((x, y), blended)

    # 窗户
    win_count = max(1, w_tiles // 3)
    win_spacing = pw // (win_count + 1)
    win_y = wall_top + int((ph - wall_top) * 0.25)
    for i in range(1, win_count + 1):
        wx = win_spacing * i - 6
        # 窗框
        draw.rectangle([wx - 1, win_y - 1, wx + 12, win_y + 10], fill=hex_to_rgb('#606058') + (255,))
        # 窗玻璃
        draw.rectangle([wx, win_y, wx + 11, win_y + 9], fill=hex_to_rgb('#78B8D8') + (255,))
        # 十字窗格
        draw.line([(wx + 5, win_y), (wx + 5, win_y + 9)], fill=hex_to_rgb('#606058') + (255,), width=1)
        draw.line([(wx, win_y + 4), (wx + 11, win_y + 4)], fill=hex_to_rgb('#606058') + (255,), width=1)
        # 窗台
        draw.rectangle([wx - 2, win_y + 10, wx + 13, win_y + 12], fill=(200, 196, 190, 180))
        # 窗台积雪
        draw.rectangle([wx - 1, win_y + 9, wx + 12, win_y + 10], fill=(230, 234, 240, 160))

    # 门
    door_x = pw // 2 - 8
    door_y = ph - TILE
    draw.rectangle([door_x - 2, door_y - 2, door_x + 16, ph - 1], fill=hex_to_rgb('#5A3A08') + (255,))
    draw.rectangle([door_x, door_y, door_x + 14, ph - 1], fill=hex_to_rgb('#7B5010') + (255,))
    draw.rectangle([door_x + 10, door_y + 14, door_x + 13, door_y + 17], fill=(192, 160, 96, 255))

    # 烟囱
    chx = int(pw * 0.7)
    chy = roof_h // 3
    draw.rectangle([chx, chy, chx + 9, chy + 15], fill=hex_to_rgb('#5A5450') + (255,))
    draw.rectangle([chx - 1, chy - 2, chx + 10, chy + 2], fill=hex_to_rgb('#484440') + (255,))
    draw.rectangle([chx, chy - 3, chx + 9, chy - 1], fill=(230, 234, 240, 140))

    path = os.path.join(BASE, 'asset', 'buildings', f'{name}.png')
    img.save(path)
    print(f'  ✓ buildings/{name}.png ({pw}x{ph})')
    return img


# ============================================================
# 生成地砖 (32x32)
# ============================================================
print('\n🏔 生成地砖素材...')

# 雪地变体
def snow_variant(x, y, base):
    v = random.randint(-10, 10)
    # 随机雪点
    if random.random() > 0.92:
        return (min(255, base[0] + 20), min(255, base[1] + 20), min(255, base[2] + 20))
    # 微阴影
    if (x + y) % 7 == 0:
        return (max(0, base[0] - 8), max(0, base[1] - 6), max(0, base[2] - 4))
    return noise_color(base, 6)

make_tile('snow', '#D8DDE4', snow_variant)
make_tile('snow_dark', '#C4CAD2', snow_variant)
make_tile('snow_light', '#E8ECF0', snow_variant)

# 道路
def path_variant(x, y, base):
    # 踩踏痕迹
    if 10 < y < 22 and random.random() > 0.7:
        return noise_color((160, 150, 140), 8)
    return noise_color(base, 10)

make_tile('path', '#B8B0A0', path_variant)
make_tile('path_dark', '#A8A090', path_variant)

# 广场石砖
def plaza_variant(x, y, base):
    # 石砖缝
    if y % 16 < 1 or x % 16 < 1:
        return noise_color((140, 135, 128), 5)
    # 微红/黄变化
    if (x // 16 + y // 16) % 2 == 0:
        return noise_color(base, 6)
    return noise_color((196, 190, 180), 6)

make_tile('plaza', '#C0BAB0', plaza_variant)

# 冻土
make_tile('dirt', '#A09080')

# 冰面
def ice_variant(x, y, base):
    # 冰裂纹
    if abs(x - y) < 2 and random.random() > 0.5:
        return (200, 220, 240)
    # 冰面高光
    if x < 12 and y < 8:
        return noise_color((200, 220, 240), 5)
    return noise_color(base, 8)

make_tile('ice', '#B8D4E8', ice_variant)
make_tile('ice_deep', '#A0C0D8', ice_variant)

# 沙地 (雪覆盖)
make_tile('sand', '#D8D0C0')

# 围墙
def wall_variant(x, y, base):
    # 石砖纹理
    if y % 8 < 1:
        return noise_color((80, 70, 60), 5)
    if x % 12 < 1 and (y // 8) % 2 == 0:
        return noise_color((80, 70, 60), 5)
    if (x + 6) % 12 < 1 and (y // 8) % 2 == 1:
        return noise_color((80, 70, 60), 5)
    return noise_color(base, 8)

make_tile('wall_stone', '#706858', wall_variant)


# ============================================================
# 生成装饰物
# ============================================================
print('\n🌲 生成装饰物素材...')

# 树
def draw_tree(img, draw, w, h):
    # 树影
    draw.ellipse([4, h - 8, w - 4, h], fill=(60, 70, 80, 40))
    # 树干
    draw.rectangle([w // 2 - 4, h // 2, w // 2 + 3, h - 4], fill=hex_to_rgb('#6B4820') + (255,))
    draw.rectangle([w // 2 - 2, h // 2 + 2, w // 2 + 1, h - 6], fill=hex_to_rgb('#8B6830') + (255,))
    # 树冠 (底层)
    draw.ellipse([2, 0, w - 2, h // 2 + 6], fill=hex_to_rgb('#8A9098') + (255,))
    # 枝条
    draw.line([(w // 2, h // 2 - 4), (4, 4)], fill=(90, 70, 50, 120), width=1)
    draw.line([(w // 2, h // 2 - 4), (w - 4, 2)], fill=(90, 70, 50, 120), width=1)
    # 积雪层
    draw.ellipse([4, 0, w - 6, h // 3], fill=(224, 228, 234, 160))

make_decoration('tree', TILE, TILE, draw_tree)

# 灌木
def draw_bush(img, draw, w, h):
    draw.ellipse([4, h - 8, w - 4, h], fill=(60, 70, 80, 35))
    draw.ellipse([3, h // 3, w - 3, h - 3], fill=hex_to_rgb('#8A9880') + (255,))
    draw.ellipse([5, h // 4, w - 5, h // 2 + 2], fill=(224, 228, 234, 140))

make_decoration('bush', TILE, TILE, draw_bush)

# 雪堆
def draw_snowpile(img, draw, w, h):
    draw.ellipse([2, h // 3, w - 2, h - 2], fill=(224, 228, 234, 255))
    draw.ellipse([4, h // 4, w - 6, h // 2 + 4], fill=(232, 236, 242, 255))
    draw.ellipse([8, h // 4, w // 2, h // 3 + 4], fill=(255, 255, 255, 100))

make_decoration('snowpile', TILE, TILE, draw_snowpile)

# 冰锥
def draw_icicle(img, draw, w, h):
    for i in range(4):
        x0 = 4 + i * 7
        ilen = 12 + random.randint(0, 8)
        draw.polygon([(x0, 0), (x0 + 3, 0), (x0 + 1, ilen)], fill=(180, 220, 240, 180))
        draw.polygon([(x0, 0), (x0 + 2, 0), (x0 + 1, ilen // 2)], fill=(220, 240, 255, 120))

make_decoration('icicle', TILE, TILE, draw_icicle)

# 废墟碎石
def draw_debris(img, draw, w, h):
    draw.rectangle([2, h // 2, 14, h - 4], fill=hex_to_rgb('#8A7A6A') + (255,))
    draw.rectangle([8, h // 3, 24, h // 2 + 4], fill=hex_to_rgb('#6A5A4A') + (255,))
    draw.rectangle([16, h // 4, 22, h // 3 + 2], fill=hex_to_rgb('#9A8A7A') + (255,))
    draw.rectangle([3, h // 2 - 2, 12, h // 2], fill=(220, 224, 230, 120))

make_decoration('debris', TILE, TILE, draw_debris)

# 长椅
def draw_bench(img, draw, w, h):
    draw.rectangle([3, h - 6, 29, h - 2], fill=(60, 70, 80, 35))
    draw.rectangle([2, h // 2, 30, h // 2 + 4], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([4, h // 2 + 4, 8, h - 4], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([24, h // 2 + 4, 28, h - 4], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([2, h // 2 - 6, 30, h // 2], fill=hex_to_rgb('#604838') + (255,))
    draw.rectangle([4, h // 2 - 8, 28, h // 2 - 6], fill=(230, 234, 240, 120))

make_decoration('bench', TILE, TILE, draw_bench)

# 路灯
def draw_lamppost(img, draw, w, h):
    draw.rectangle([14, 8, 17, h - 4], fill=hex_to_rgb('#505050') + (255,))
    draw.rectangle([11, 4, 21, 8], fill=(64, 64, 64, 255))
    draw.ellipse([9, 0, 23, 12], fill=(255, 232, 128, 100))

make_decoration('lamppost', TILE, TILE, draw_lamppost)

# 路灯(夜间亮灯版)
def draw_lamppost_lit(img, draw, w, h):
    # 光晕
    draw.ellipse([0, 0, 32, 28], fill=(255, 220, 80, 30))
    draw.ellipse([4, 0, 28, 20], fill=(255, 232, 128, 50))
    draw.rectangle([14, 8, 17, h - 4], fill=hex_to_rgb('#505050') + (255,))
    draw.rectangle([11, 4, 21, 8], fill=(64, 64, 64, 255))
    draw.ellipse([8, 0, 24, 14], fill=(255, 232, 128, 200))

make_decoration('lamppost_lit', TILE, TILE, draw_lamppost_lit)

# 告示牌
def draw_sign(img, draw, w, h):
    draw.rectangle([14, h // 2, 17, h - 2], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([4, h // 4, 28, h // 2], fill=hex_to_rgb('#B09050') + (255,))
    draw.line([(8, h // 4 + 4), (24, h // 4 + 4)], fill=(60, 40, 20, 80), width=1)
    draw.line([(8, h // 4 + 8), (20, h // 4 + 8)], fill=(60, 40, 20, 80), width=1)
    draw.rectangle([3, h // 4 - 2, 29, h // 4], fill=(230, 234, 240, 140))

make_decoration('sign', TILE, TILE, draw_sign)

# 水井
def draw_well(img, draw, w, h):
    draw.ellipse([4, h - 8, w - 4, h], fill=(60, 70, 80, 35))
    draw.rectangle([4, h // 3, 28, h - 4], fill=hex_to_rgb('#707070') + (255,))
    draw.rectangle([8, h // 3 + 4, 24, h - 8], fill=(144, 184, 208, 255))
    draw.rectangle([10, h // 3 + 6, 18, h // 3 + 10], fill=(200, 220, 240, 90))
    draw.rectangle([6, h // 6, 10, h // 3], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([22, h // 6, 26, h // 3], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([6, h // 6 - 2, 26, h // 6 + 1], fill=hex_to_rgb('#807060') + (255,))
    draw.rectangle([6, h // 6 - 4, 26, h // 6 - 2], fill=(230, 234, 240, 130))

make_decoration('well', TILE, TILE, draw_well)

# 花 (三种)
for fname, color in [('flower_pink', '#E0D0D0'), ('flower_yellow', '#D8D8C0'), ('flower_blue', '#C8D0E0')]:
    def draw_flower(img, draw, w, h, c=color):
        draw.ellipse([w // 2 - 5, h // 2, w // 2 + 5, h // 2 + 10], fill=hex_to_rgb(c) + (255,))
        draw.ellipse([w // 2 - 2, h // 2 + 2, w // 2 + 2, h // 2 + 6], fill=(255, 224, 96, 255))
        draw.rectangle([w // 2 - 2, h // 2 - 1, w // 2 + 2, h // 2 + 1], fill=(240, 244, 250, 140))
    make_decoration(fname, TILE, TILE, draw_flower)


# ============================================================
# 生成建筑
# ============================================================
print('\n🏠 生成建筑素材...')

buildings_config = [
    ('warehouse',    6, 5, '#8B7050', '#A03828'),   # 物资仓库
    ('dorm_a',       5, 4, '#D8D2C4', '#405880'),   # 宿舍A
    ('dorm_b',       5, 4, '#D8D2C4', '#405880'),   # 宿舍B
    ('medical',      4, 4, '#D8D2C4', '#406840'),   # 医疗站
    ('kitchen',      5, 4, '#8B7050', '#7B5830'),    # 炊事房
    ('workshop',     5, 4, '#8E8A82', '#A03828'),    # 工坊
    ('command',      4, 3, '#8E8A82', '#6B4080'),    # 指挥所
]

for name, w, h, wc, rc in buildings_config:
    make_building(name, w, h, wc, rc)


# ============================================================
# 生成精灵图清单 (sprite-manifest.json)
# ============================================================
print('\n📋 生成素材清单...')

import json

manifest = {
    "_description": "福音雪镇 素材清单 — 所有图片均为 PNG 格式，坐标单位为像素",
    "_tile_size": TILE,
    "_制作说明": "你可以用 Aseprite / Piskel / LibreSprite 等像素画工具替换这些文件",

    "tiles": {
        "snow":       {"file": "asset/tiles/snow.png",       "size": [32, 32], "desc": "普通雪地"},
        "snow_dark":  {"file": "asset/tiles/snow_dark.png",  "size": [32, 32], "desc": "深色雪地（阴影处/被踩过）"},
        "snow_light": {"file": "asset/tiles/snow_light.png", "size": [32, 32], "desc": "亮色雪地（新雪）"},
        "path":       {"file": "asset/tiles/path.png",       "size": [32, 32], "desc": "踩过的雪路"},
        "path_dark":  {"file": "asset/tiles/path_dark.png",  "size": [32, 32], "desc": "深色雪路"},
        "plaza":      {"file": "asset/tiles/plaza.png",      "size": [32, 32], "desc": "广场石砖"},
        "dirt":       {"file": "asset/tiles/dirt.png",        "size": [32, 32], "desc": "冻土"},
        "ice":        {"file": "asset/tiles/ice.png",         "size": [32, 32], "desc": "冰面"},
        "ice_deep":   {"file": "asset/tiles/ice_deep.png",   "size": [32, 32], "desc": "深色冰面"},
        "sand":       {"file": "asset/tiles/sand.png",        "size": [32, 32], "desc": "雪覆盖沙地"},
        "wall_stone": {"file": "asset/tiles/wall_stone.png", "size": [32, 32], "desc": "围墙石砖"},
    },

    "decorations": {
        "tree":          {"file": "asset/decorations/tree.png",          "size": [32, 32], "desc": "枯树+积雪"},
        "bush":          {"file": "asset/decorations/bush.png",          "size": [32, 32], "desc": "雪覆盖灌木"},
        "snowpile":      {"file": "asset/decorations/snowpile.png",      "size": [32, 32], "desc": "雪堆"},
        "icicle":        {"file": "asset/decorations/icicle.png",        "size": [32, 32], "desc": "冰锥"},
        "debris":        {"file": "asset/decorations/debris.png",        "size": [32, 32], "desc": "废墟碎石"},
        "bench":         {"file": "asset/decorations/bench.png",         "size": [32, 32], "desc": "长椅"},
        "lamppost":      {"file": "asset/decorations/lamppost.png",      "size": [32, 32], "desc": "路灯（白天）"},
        "lamppost_lit":  {"file": "asset/decorations/lamppost_lit.png",  "size": [32, 32], "desc": "路灯（夜间亮灯）"},
        "sign":          {"file": "asset/decorations/sign.png",          "size": [32, 32], "desc": "告示牌"},
        "well":          {"file": "asset/decorations/well.png",          "size": [32, 32], "desc": "水井"},
        "flower_pink":   {"file": "asset/decorations/flower_pink.png",   "size": [32, 32], "desc": "粉色花（积雪覆盖）"},
        "flower_yellow": {"file": "asset/decorations/flower_yellow.png", "size": [32, 32], "desc": "黄色花（积雪覆盖）"},
        "flower_blue":   {"file": "asset/decorations/flower_blue.png",   "size": [32, 32], "desc": "蓝色花（积雪覆盖）"},
    },

    "buildings": {
        "warehouse": {"file": "asset/buildings/warehouse.png", "size_tiles": [6, 5], "desc": "物资仓库（木墙+红屋顶）"},
        "dorm_a":    {"file": "asset/buildings/dorm_a.png",    "size_tiles": [5, 4], "desc": "宿舍A（白墙+蓝屋顶）"},
        "dorm_b":    {"file": "asset/buildings/dorm_b.png",    "size_tiles": [5, 4], "desc": "宿舍B（白墙+蓝屋顶）"},
        "medical":   {"file": "asset/buildings/medical.png",   "size_tiles": [4, 4], "desc": "医疗站（白墙+绿屋顶）"},
        "kitchen":   {"file": "asset/buildings/kitchen.png",   "size_tiles": [5, 4], "desc": "炊事房（木墙+棕屋顶）"},
        "workshop":  {"file": "asset/buildings/workshop.png",  "size_tiles": [5, 4], "desc": "工坊（石墙+红屋顶）"},
        "command":   {"file": "asset/buildings/command.png",   "size_tiles": [4, 3], "desc": "指挥所（石墙+紫屋顶）"},
    }
}

manifest_path = os.path.join(BASE, 'asset', 'sprite-manifest.json')
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(f'  ✓ sprite-manifest.json')

print('\n✅ 所有素材生成完成！')
print(f'   tiles:       {len(manifest["tiles"])} 张')
print(f'   decorations: {len(manifest["decorations"])} 张')
print(f'   buildings:   {len(manifest["buildings"])} 张')
print(f'\n📌 你可以用像素画工具替换 asset/ 下的 PNG 文件')
print(f'   保持文件名和尺寸不变即可热替换')
