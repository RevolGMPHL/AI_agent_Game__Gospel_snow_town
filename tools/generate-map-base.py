#!/usr/bin/env python3
"""
福音雪镇 — 地图底图 + 建筑素材生成器
生成完整的地图底图 PNG（1600×1280）和各建筑独立 PNG

用法:
  python generate-map-base.py             # 生成全部
  python generate-map-base.py --force     # 强制覆盖已有建筑素材
  python generate-map-base.py --annotate-only  # 仅生成带标注版底图
"""

import argparse
import json
import os
import random
import time
from PIL import Image, ImageDraw, ImageFont

# ============================================================
# 常量
# ============================================================
BASE = os.path.dirname(os.path.abspath(__file__))
TILE = 32
MAP_W = 50   # 格数
MAP_H = 40
IMG_W = MAP_W * TILE  # 1600
IMG_H = MAP_H * TILE  # 1280

SEED = 42  # 固定随机种子

# ============================================================
# 颜色常量（与 maps.js 中 C 对象一一对应）
# ============================================================
C = {
    # 地面
    'GRASS':        '#D8DDE4',
    'GRASS_DARK':   '#C4CAD2',
    'GRASS_LIGHT':  '#E8ECF0',
    'PATH':         '#B8B0A0',
    'PATH_DARK':    '#A8A090',
    'PLAZA':        '#C0BAB0',
    'DIRT':         '#A09080',
    'WATER':        '#B8D4E8',
    'WATER_DEEP':   '#A0C0D8',
    'SAND':         '#D8D0C0',
    # 建筑
    'WALL_WOOD':    '#8B7050',
    'WALL_STONE':   '#8E8A82',
    'WALL_WHITE':   '#D8D2C4',
    'WALL_WOOD_DARK': '#6B5030',
    'WALL_STONE_DARK': '#6E6A62',
    'ROOF_RED':     '#A03828',
    'ROOF_BLUE':    '#405880',
    'ROOF_GREEN':   '#406840',
    'ROOF_BROWN':   '#7B5830',
    'ROOF_PURPLE':  '#6B4080',
    'ROOF_SNOW':    '#E4E8F0',
    'DOOR':         '#7B5010',
    'DOOR_FRAME':   '#5A3A08',
    'WINDOW':       '#78B8D8',
    'WINDOW_LIT':   '#FFE880',
    'WINDOW_FRAME': '#606058',
    'CHIMNEY':      '#5A5450',
    'CHIMNEY_TOP':  '#484440',
    # 自然
    'TREE_TRUNK':   '#6B4820',
    'TREE_TRUNK_LIGHT': '#8B6830',
    'TREE_CROWN':   '#8A9098',
    'TREE_CROWN2':  '#7A8088',
    'TREE_SNOW':    '#E0E4EA',
    'BUSH':         '#8A9880',
    'FENCE':        '#807060',
    'FENCE_DARK':   '#604838',
    # 特殊
    'LAMPPOST':     '#505050',
    'SIGN':         '#B09050',
    'WELL':         '#707070',
}

# ============================================================
# 地图数据（从 maps.js VillageMap 中提取）
# ============================================================
BUILDINGS = [
    {'id': 'warehouse', 'name': '📦仓库',     'x': 13, 'y': 11, 'w': 6, 'h': 4,
     'wallColor': C['WALL_WOOD'],  'roofColor': C['ROOF_BROWN'], 'doorX': 16, 'doorY': 15},
    {'id': 'medical',   'name': '🏥医疗站',   'x': 30, 'y': 11, 'w': 6, 'h': 4,
     'wallColor': C['WALL_WHITE'], 'roofColor': C['ROOF_RED'],   'doorX': 33, 'doorY': 15},
    {'id': 'dorm_a',    'name': '🏠宿舍A',    'x': 13, 'y': 18, 'w': 7, 'h': 5,
     'wallColor': C['WALL_WOOD'],  'roofColor': C['ROOF_BLUE'],  'doorX': 16, 'doorY': 23},
    {'id': 'dorm_b',    'name': '🏠宿舍B',    'x': 30, 'y': 18, 'w': 7, 'h': 5,
     'wallColor': C['WALL_WOOD'],  'roofColor': C['ROOF_GREEN'], 'doorX': 33, 'doorY': 23},
    {'id': 'kitchen',   'name': '🍳炊事房',   'x': 13, 'y': 26, 'w': 5, 'h': 4,
     'wallColor': C['WALL_STONE'], 'roofColor': C['ROOF_RED'],   'doorX': 15, 'doorY': 30},
    {'id': 'workshop',  'name': '🔧工坊',     'x': 21, 'y': 26, 'w': 7, 'h': 4,
     'wallColor': C['WALL_STONE'], 'roofColor': C['ROOF_BROWN'], 'doorX': 24, 'doorY': 30},
]

RESOURCE_AREAS = [
    {'id': 'lumber_camp', 'name': '🌲伐木场', 'x': 2,  'y': 2,  'w': 8,  'h': 6, 'color': '#5A6B50'},
    {'id': 'ruins_site',  'name': '🏔️废墟',   'x': 38, 'y': 2,  'w': 10, 'h': 6, 'color': '#7A6A5A'},
    {'id': 'frozen_lake', 'name': '🎣冰湖',   'x': 2,  'y': 32, 'w': 8,  'h': 6, 'color': '#90B8D0'},
    {'id': 'ore_pile',    'name': '⛏️矿渣堆', 'x': 38, 'y': 32, 'w': 10, 'h': 6, 'color': '#8A7A6A'},
]

WALL_BOUNDS = {'x1': 11, 'y1': 9, 'x2': 39, 'y2': 31}
NORTH_GATE = {'x': 24, 'y': 9, 'w': 2}
SOUTH_GATE = {'x': 24, 'y': 31, 'w': 2}

FURNACE_PLAZA = {'x': 22, 'y': 18, 'w': 6, 'h': 4}

# 装饰物（与 maps.js _addDecorations 完全一致）
TREE_POSITIONS = [
    (1,1),(9,1),(1,8),(10,8),
    (39,1),(47,1),(48,7),
    (1,33),(8,37),(1,38),
    (39,38),(47,33),(48,38),
    (10,15),(10,25),(40,15),(40,25),
]

SNOW_PILES = [
    (20,16),(29,16),(20,24),(29,24),
    (12,20),(37,20),(25,10),(25,30),
]

ICICLES = [(14,11),(17,11),(31,11),(34,11),(14,18),(17,18),(31,18),(34,18)]

DEBRIS = [(5,10),(44,10),(5,30),(44,30),(15,2),(35,2),(15,37),(35,37)]

LAMPPOSTS = [(20,20),(29,20),(25,16),(25,24)]

SIGN_POS = (23, 16)


# ============================================================
# 辅助函数
# ============================================================
def hex_to_rgb(h):
    """'#RRGGBB' → (R, G, B)"""
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def hex_to_rgba(h, a=255):
    """'#RRGGBB' → (R, G, B, A)"""
    return hex_to_rgb(h) + (a,)


def noise_color(base_rgb, variance=8):
    """给基色加随机噪声"""
    return tuple(max(0, min(255, c + random.randint(-variance, variance))) for c in base_rgb)


def get_tile_noise(x, y):
    """复刻 maps.js 中 _getTileNoise — 基于坐标的伪随机哈希 (0~1)"""
    h = (x * 374761393 + y * 668265263) ^ 0x55555555
    h = h & 0xFFFFFFFF  # 保持32位无符号
    h = (((h >> 16) ^ h) * 0x45d9f3b) & 0xFFFFFFFF
    h = (((h >> 16) ^ h) * 0x45d9f3b) & 0xFFFFFFFF
    h = ((h >> 16) ^ h) & 0xFFFFFFFF
    return (h & 0xFF) / 255.0


def lerp_color(c1, c2, t):
    """线性插值两个RGB颜色"""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def make_dirs():
    """创建所需目录"""
    for d in ['asset/map', 'asset/buildings']:
        os.makedirs(os.path.join(BASE, d), exist_ok=True)


# ============================================================
# 地面纹理绘制 — 复刻 VillageMap.getTileColor()
# ============================================================
def get_tile_color(x, y):
    """返回 (R,G,B) 元组，完全复刻 maps.js VillageMap.getTileColor()"""
    if x < 0 or y < 0 or x >= MAP_W or y >= MAP_H:
        return hex_to_rgb(C['GRASS_DARK'])

    wb = WALL_BOUNDS
    n = get_tile_noise(x, y)

    # 围墙内 — 安全区
    if wb['x1'] <= x <= wb['x2'] and wb['y1'] <= y <= wb['y2']:
        fp = FURNACE_PLAZA
        # 主暖炉广场
        if fp['x'] <= x < fp['x'] + fp['w'] and fp['y'] <= y < fp['y'] + fp['h']:
            return hex_to_rgb(C['PLAZA'])

        # 十字主路
        if 20 <= y <= 21 and wb['x1'] + 1 <= x <= wb['x2'] - 1:
            return hex_to_rgb(C['PATH_DARK']) if n > 0.6 else hex_to_rgb(C['PATH'])
        if 24 <= x <= 26 and wb['y1'] + 1 <= y <= wb['y2'] - 1:
            return hex_to_rgb(C['PATH_DARK']) if n > 0.6 else hex_to_rgb(C['PATH'])

        # 通往各建筑的小路
        if 15 <= x <= 17 and 15 <= y <= 17:
            return hex_to_rgb('#988878') if n > 0.5 else hex_to_rgb(C['DIRT'])
        if 32 <= x <= 34 and 15 <= y <= 17:
            return hex_to_rgb('#988878') if n > 0.5 else hex_to_rgb(C['DIRT'])
        if 15 <= x <= 17 and 24 <= y <= 25:
            return hex_to_rgb('#988878') if n > 0.5 else hex_to_rgb(C['DIRT'])
        if 22 <= x <= 26 and 24 <= y <= 25:
            return hex_to_rgb('#988878') if n > 0.5 else hex_to_rgb(C['DIRT'])

        # 建筑物周围脏雪
        for b in BUILDINGS:
            bx1, by1 = b['x'] - 1, b['y'] - 1
            bx2, by2 = b['x'] + b['w'], b['y'] + b['h']
            if bx1 <= x <= bx2 and by1 <= y <= by2:
                if x == bx1 or x == bx2 or y == by1 or y == by2:
                    return hex_to_rgb('#C8C4BC') if n > 0.5 else hex_to_rgb('#D0CCC4')

        # 安全区默认 — 基于噪声的平滑雪地渐变（消除棋盘格）
        if n < 0.25:
            return hex_to_rgb(C['GRASS_LIGHT'])
        if n > 0.75:
            return hex_to_rgb(C['GRASS_DARK'])
        # 中间区域：使用噪声插值出柔和的中间色
        return lerp_color(hex_to_rgb(C['GRASS']), hex_to_rgb(C['GRASS_DARK']), n * 0.3)

    # 围墙线上 — 地面仍为雪地，围墙线条由 draw_wall() 叠加绘制
    # （不再返回 FENCE 色，避免整格 32px 都变成暗色）
    if (x == wb['x1'] or x == wb['x2']) and wb['y1'] <= y <= wb['y2']:
        return lerp_color(hex_to_rgb(C['GRASS']), hex_to_rgb(C['GRASS_DARK']), get_tile_noise(x, y) * 0.3)
    if (y == wb['y1'] or y == wb['y2']) and wb['x1'] <= x <= wb['x2']:
        return lerp_color(hex_to_rgb(C['GRASS']), hex_to_rgb(C['GRASS_DARK']), get_tile_noise(x, y) * 0.3)

    # 户外资源区域
    for area in RESOURCE_AREAS:
        if area['x'] <= x < area['x'] + area['w'] and area['y'] <= y < area['y'] + area['h']:
            if area['id'] == 'frozen_lake':
                cx = area['x'] + area['w'] / 2
                cy = area['y'] + area['h'] / 2
                dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                return hex_to_rgb(C['WATER_DEEP']) if dist < 2 else hex_to_rgb(C['WATER'])
            return hex_to_rgb('#988070') if n > 0.6 else hex_to_rgb(C['DIRT'])

    # 外围雪原 — 基于噪声的平滑渐变（消除棋盘格）
    if n < 0.2:
        return hex_to_rgb(C['GRASS_LIGHT'])  # 新鲜积雪
    if n > 0.8:
        return hex_to_rgb(C['GRASS_DARK'])   # 被风吹过的深色雪
    # 中间区域用噪声插值，避免棋盘格
    return lerp_color(hex_to_rgb(C['GRASS']), hex_to_rgb(C['GRASS_DARK']), n * 0.4)


def draw_ground(img):
    """绘制地面纹理层"""
    print('  🏔 绘制地面纹理...')
    random.seed(SEED)

    for y in range(MAP_H):
        for x in range(MAP_W):
            base_color = get_tile_color(x, y)
            px, py = x * TILE, y * TILE
            n = get_tile_noise(x, y)

            # 逐像素填充tile + 噪声纹理
            for ty in range(TILE):
                for tx in range(TILE):
                    c = noise_color(base_color, 4)
                    img.putpixel((px + tx, py + ty), c + (255,))

            # 雪地纹理叠加
            color_hex = None
            for key in ['GRASS', 'GRASS_DARK', 'GRASS_LIGHT']:
                if base_color == hex_to_rgb(C[key]):
                    color_hex = key
                    break

            if color_hex:
                draw = ImageDraw.Draw(img)
                if n > 0.7:
                    sx = int((n * 20) % 24)
                    sy = int((n * 37) % 24)
                    draw.rectangle([px + sx, py + sy, px + sx + 5, py + sy + 3],
                                   fill=(255, 255, 255, 40))
                if n < 0.2:
                    draw.rectangle([px + 4, py + 12, px + 13, py + 17],
                                   fill=(180, 190, 200, 30))

            # 道路纹理
            path_color = None
            for key in ['PATH', 'PATH_DARK']:
                if base_color == hex_to_rgb(C[key]):
                    path_color = key
                    break

            if path_color:
                draw = ImageDraw.Draw(img)
                if n > 0.5:
                    draw.rectangle([px + 6, py + 10, px + 25, py + 21],
                                   fill=(140, 130, 120, 30))
                if n > 0.8:
                    draw.rectangle([px + 14, py + 20, px + 17, py + 22],
                                   fill=(120, 110, 100, 50))

            # 冰面纹理
            ice_color = None
            for key in ['WATER', 'WATER_DEEP']:
                if base_color == hex_to_rgb(C[key]):
                    ice_color = key
                    break

            if ice_color:
                draw = ImageDraw.Draw(img)
                if n > 0.6:
                    draw.line([(px + 4, py + int(n * 28)),
                               (px + 28, py + int((1 - n) * 28))],
                              fill=(200, 220, 240, 50), width=1)
                if n < 0.15:
                    draw.rectangle([px + 8, py + 8, px + 23, py + 15],
                                   fill=(220, 240, 255, 40))


def draw_wall(img):
    """绘制围墙（石砖纹理 + 瞭望塔 + 门楼）"""
    print('  🧱 绘制围墙...')
    draw = ImageDraw.Draw(img)
    wb = WALL_BOUNDS
    ng = NORTH_GATE
    sg = SOUTH_GATE

    wall_color = hex_to_rgb('#706858')
    wall_top_color = hex_to_rgb('#5A4A3A')
    snow_color = (230, 234, 240, 140)
    line_w = 4

    def draw_wall_segment(x1, y1, w, h):
        """绘制一段围墙"""
        # 主墙体
        draw.rectangle([x1, y1, x1 + w - 1, y1 + h - 1],
                        fill=wall_color + (255,))
        # 砖缝纹理
        if w > h:
            for bx in range(x1, x1 + w, 12):
                draw.line([(bx, y1), (bx, y1 + h - 1)], fill=(0, 0, 0, 25), width=1)
        else:
            for by in range(y1, y1 + h, 12):
                draw.line([(x1, by), (x1 + w - 1, by)], fill=(0, 0, 0, 25), width=1)
        # 顶部积雪
        if w > h:
            draw.rectangle([x1, y1 - 2, x1 + w - 1, y1], fill=snow_color)
        else:
            draw.rectangle([x1 - 1, y1, x1 + 1, y1 + h - 1], fill=snow_color)

    lw = line_w + 4

    # 北墙（留北门）
    draw_wall_segment(wb['x1'] * TILE, wb['y1'] * TILE - 2,
                      (ng['x'] - wb['x1']) * TILE, lw)
    draw_wall_segment((ng['x'] + ng['w']) * TILE, wb['y1'] * TILE - 2,
                      (wb['x2'] - ng['x'] - ng['w']) * TILE, lw)
    # 南墙（留南门）
    draw_wall_segment(wb['x1'] * TILE, wb['y2'] * TILE - 2,
                      (sg['x'] - wb['x1']) * TILE, lw)
    draw_wall_segment((sg['x'] + sg['w']) * TILE, wb['y2'] * TILE - 2,
                      (wb['x2'] - sg['x'] - sg['w']) * TILE, lw)
    # 西墙
    draw_wall_segment(wb['x1'] * TILE - 2, wb['y1'] * TILE, lw,
                      (wb['y2'] - wb['y1']) * TILE)
    # 东墙
    draw_wall_segment(wb['x2'] * TILE - 2, wb['y1'] * TILE, lw,
                      (wb['y2'] - wb['y1']) * TILE)

    # 围墙柱子（每隔3格）
    for x in range(wb['x1'], wb['x2'] + 1, 3):
        # 北墙柱
        if x < ng['x'] or x >= ng['x'] + ng['w']:
            px = x * TILE - 3
            py = wb['y1'] * TILE - 8
            draw.rectangle([px, py, px + 7, py + 13],
                            fill=wall_top_color + (255,))
            draw.rectangle([px, py - 2, px + 7, py], fill=snow_color)
        # 南墙柱
        if x < sg['x'] or x >= sg['x'] + sg['w']:
            px = x * TILE - 3
            py = wb['y2'] * TILE - 8
            draw.rectangle([px, py, px + 7, py + 13],
                            fill=wall_top_color + (255,))
            draw.rectangle([px, py - 2, px + 7, py], fill=snow_color)

    for y in range(wb['y1'], wb['y2'] + 1, 3):
        # 西墙柱
        px = wb['x1'] * TILE - 8
        py = y * TILE - 3
        draw.rectangle([px, py, px + 13, py + 7],
                        fill=wall_top_color + (255,))
        # 东墙柱
        px = wb['x2'] * TILE - 6
        draw.rectangle([px, py, px + 13, py + 7],
                        fill=wall_top_color + (255,))

    # 四角瞭望塔
    def draw_tower(tx, ty):
        draw.rectangle([tx - 8, ty - 8, tx + 9, ty + 9],
                        fill=(96, 88, 72, 255))
        draw.rectangle([tx - 10, ty - 12, tx + 11, ty - 6],
                        fill=(80, 72, 56, 255))
        draw.rectangle([tx - 10, ty - 14, tx + 11, ty - 12], fill=snow_color)
        # 垛口
        for i in range(3):
            bx = tx - 8 + i * 7
            draw.rectangle([bx, ty - 16, bx + 3, ty - 12],
                            fill=(80, 72, 56, 255))

    draw_tower(wb['x1'] * TILE, wb['y1'] * TILE)
    draw_tower(wb['x2'] * TILE, wb['y1'] * TILE)
    draw_tower(wb['x1'] * TILE, wb['y2'] * TILE)
    draw_tower(wb['x2'] * TILE, wb['y2'] * TILE)

    # 北门门楼
    ngPx = ng['x'] * TILE
    ngPy = wb['y1'] * TILE
    gw = ng['w'] * TILE
    draw.rectangle([ngPx - 4, ngPy - 14, ngPx + 5, ngPy + 5],
                    fill=wall_top_color + (255,))
    draw.rectangle([ngPx + gw - 2, ngPy - 14, ngPx + gw + 5, ngPy + 5],
                    fill=wall_top_color + (255,))
    draw.rectangle([ngPx - 4, ngPy - 16, ngPx + gw + 7, ngPy - 11],
                    fill=wall_top_color + (255,))
    draw.rectangle([ngPx - 4, ngPy - 18, ngPx + gw + 7, ngPy - 16], fill=snow_color)
    draw.rectangle([ngPx, ngPy - 4, ngPx + gw - 1, ngPy + 3],
                    fill=hex_to_rgb('#8B6830') + (255,))
    # 门铁条
    for gx in range(ngPx + 4, ngPx + gw, 8):
        draw.line([(gx, ngPy - 4), (gx, ngPy + 3)], fill=(80, 70, 60, 100), width=1)

    # 南门门楼
    sgPx = sg['x'] * TILE
    sgPy = wb['y2'] * TILE
    gw = sg['w'] * TILE
    draw.rectangle([sgPx - 4, sgPy - 6, sgPx + 5, sgPy + 13],
                    fill=wall_top_color + (255,))
    draw.rectangle([sgPx + gw - 2, sgPy - 6, sgPx + gw + 5, sgPy + 13],
                    fill=wall_top_color + (255,))
    draw.rectangle([sgPx - 4, sgPy - 8, sgPx + gw + 7, sgPy - 3],
                    fill=wall_top_color + (255,))
    draw.rectangle([sgPx - 4, sgPy - 10, sgPx + gw + 7, sgPy - 8], fill=snow_color)
    draw.rectangle([sgPx, sgPy - 4, sgPx + gw - 1, sgPy + 3],
                    fill=hex_to_rgb('#8B6830') + (255,))
    for gx in range(sgPx + 4, sgPx + gw, 8):
        draw.line([(gx, sgPy - 4), (gx, sgPy + 3)], fill=(80, 70, 60, 100), width=1)


def draw_decorations(img):
    """绘制所有装饰物"""
    print('  🌲 绘制装饰物...')
    draw = ImageDraw.Draw(img)
    random.seed(SEED + 1)

    # 枯树
    for (x, y) in TREE_POSITIONS:
        px, py = x * TILE, y * TILE
        # 树影
        draw.ellipse([px + 6, py + 25, px + 30, py + 35], fill=(60, 70, 80, 40))
        # 树干
        draw.rectangle([px + 12, py + 16, px + 19, py + 31], fill=hex_to_rgba(C['TREE_TRUNK']))
        draw.rectangle([px + 14, py + 18, px + 16, py + 29], fill=hex_to_rgba(C['TREE_TRUNK_LIGHT']))
        # 树冠
        draw.ellipse([px + 2, py - 4, px + 30, py + 16], fill=hex_to_rgba(C['TREE_CROWN2']))
        # 积雪层
        draw.ellipse([px + 5, py - 6, px + 25, py + 6], fill=(224, 228, 234, 180))
        # 枝条
        draw.line([(px + 16, py + 8), (px + 6, py + 2)], fill=(90, 70, 50, 100), width=1)
        draw.line([(px + 16, py + 8), (px + 26, py)], fill=(90, 70, 50, 100), width=1)

    # 雪堆
    for (x, y) in SNOW_PILES:
        px, py = x * TILE, y * TILE
        draw.ellipse([px + 1, py + 10, px + 31, py + 30], fill=(224, 228, 234, 255))
        draw.ellipse([px + 4, py + 8, px + 28, py + 24], fill=(232, 236, 242, 255))
        draw.ellipse([px + 8, py + 6, px + 20, py + 14], fill=(255, 255, 255, 100))

    # 冰锥
    for (x, y) in ICICLES:
        px, py = x * TILE, y * TILE
        for i in range(4):
            ix = px + 4 + i * 7
            n = get_tile_noise(x * 10 + i, y)
            ilen = int(8 + n * 8)
            draw.polygon([(ix, py), (ix + 3, py), (ix + 1, py + ilen)],
                          fill=(180, 220, 240, 160))
            draw.polygon([(ix, py + 1), (ix + 2, py + 1), (ix + 1, py + ilen // 2)],
                          fill=(220, 240, 255, 100))

    # 废墟碎石
    for (x, y) in DEBRIS:
        px, py = x * TILE, y * TILE
        draw.rectangle([px + 4, py + 26, px + 27, py + 29], fill=(60, 50, 40, 30))
        draw.rectangle([px + 2, py + 16, px + 13, py + 23], fill=hex_to_rgba('#8A7A6A'))
        draw.rectangle([px + 8, py + 12, px + 23, py + 17], fill=hex_to_rgba('#6A5A4A'))
        draw.rectangle([px + 16, py + 10, px + 21, py + 13], fill=hex_to_rgba('#9A8A7A'))
        draw.rectangle([px + 3, py + 14, px + 12, py + 15], fill=(220, 224, 230, 100))

    # 路灯
    for (x, y) in LAMPPOSTS:
        px, py = x * TILE, y * TILE
        draw.rectangle([px + 14, py + 8, px + 17, py + 31], fill=hex_to_rgba(C['LAMPPOST']))
        draw.rectangle([px + 11, py + 4, px + 20, py + 7], fill=(64, 64, 64, 255))
        draw.ellipse([px + 9, py, px + 23, py + 12], fill=(255, 232, 128, 120))
        draw.rectangle([px + 10, py + 30, px + 21, py + 32], fill=(60, 70, 80, 25))

    # 告示牌
    sx, sy = SIGN_POS
    px, py = sx * TILE, sy * TILE
    draw.rectangle([px + 14, py + 18, px + 17, py + 31], fill=hex_to_rgba(C['FENCE']))
    draw.rectangle([px + 4, py + 8, px + 27, py + 19], fill=hex_to_rgba(C['SIGN']))
    draw.line([(px + 8, py + 11), (px + 23, py + 11)], fill=(60, 40, 20, 80), width=1)
    draw.line([(px + 8, py + 15), (px + 19, py + 15)], fill=(60, 40, 20, 80), width=1)
    draw.rectangle([px + 3, py + 6, px + 28, py + 8], fill=(230, 234, 240, 140))


def draw_furnace_plaza(img):
    """绘制暖炉广场地面（不含火焰动画）"""
    print('  🔥 绘制暖炉广场...')
    draw = ImageDraw.Draw(img)
    fp = FURNACE_PLAZA
    px, py = fp['x'] * TILE, fp['y'] * TILE
    pw, ph = fp['w'] * TILE, fp['h'] * TILE

    # 石砖纹理（地面已在getTileColor中绘制，这里加纹理线）
    for by in range(py, py + ph, 16):
        draw.line([(px, by), (px + pw, by)], fill=(0, 0, 0, 15), width=1)
        offset = 8 if ((by - py) // 16 % 2) else 0
        for bx in range(px + offset, px + pw, 16):
            draw.line([(bx, by), (bx, by + 16)], fill=(0, 0, 0, 15), width=1)

    # 边缘装饰线（虚线模拟）
    for i in range(0, pw - 8, 9):
        draw.line([(px + 4 + i, py + 4), (px + 4 + i + 6, py + 4)],
                  fill=(120, 110, 100, 50), width=1)
        draw.line([(px + 4 + i, py + ph - 5), (px + 4 + i + 6, py + ph - 5)],
                  fill=(120, 110, 100, 50), width=1)
    for i in range(0, ph - 8, 9):
        draw.line([(px + 4, py + 4 + i), (px + 4, py + 4 + i + 6)],
                  fill=(120, 110, 100, 50), width=1)
        draw.line([(px + pw - 5, py + 4 + i), (px + pw - 5, py + 4 + i + 6)],
                  fill=(120, 110, 100, 50), width=1)

    # 暖炉底座（静态部分）
    cx, cy = px + pw // 2, py + ph // 2
    draw.rectangle([cx - 24, cy - 18, cx + 23, cy + 17], fill=(72, 72, 72, 255))
    draw.rectangle([cx - 20, cy - 14, cx + 19, cy + 13], fill=(58, 58, 58, 255))
    draw.rectangle([cx - 22, cy - 18, cx + 21, cy - 12], fill=(80, 80, 80, 255))
    # 排气管
    draw.rectangle([cx + 10, cy - 26, cx + 15, cy - 14], fill=(68, 68, 68, 255))
    # 铆钉
    for (rx, ry) in [(-16, -10), (-16, 6), (16, -10), (16, 6)]:
        draw.ellipse([cx + rx - 2, cy + ry - 2, cx + rx + 2, cy + ry + 2],
                      fill=(112, 112, 112, 255))
    # 暖炉开口
    draw.rectangle([cx - 12, cy - 6, cx + 11, cy + 11], fill=(42, 26, 10, 255))
    # 静态火焰（不用动画，用渐变色表示）
    draw.ellipse([cx - 10, cy - 4, cx + 9, cy + 9], fill=(200, 60, 10, 90))
    draw.ellipse([cx - 7, cy - 3, cx + 6, cy + 7], fill=(255, 120, 20, 140))
    draw.ellipse([cx - 4, cy - 2, cx + 3, cy + 5], fill=(255, 200, 50, 190))
    draw.ellipse([cx - 2, cy - 1, cx + 1, cy + 3], fill=(255, 240, 200, 130))


def draw_resource_areas(img):
    """绘制资源区域的装饰物"""
    print('  ⛏️ 绘制资源区域装饰...')
    draw = ImageDraw.Draw(img)
    random.seed(SEED + 2)

    for area in RESOURCE_AREAS:
        px, py = area['x'] * TILE, area['y'] * TILE
        pw, ph = area['w'] * TILE, area['h'] * TILE
        area_rgb = hex_to_rgb(area['color'])

        # 区域底色径向渐变（模拟）
        for dx in range(pw):
            for dy in range(ph):
                cx, cy = pw // 2, ph // 2
                dist = ((dx - cx) ** 2 + (dy - cy) ** 2) ** 0.5
                max_dist = max(pw, ph) * 0.6
                if dist < max_dist:
                    alpha = int(max(0, (1 - dist / max_dist) * 60))
                    if alpha > 0:
                        ox, oy = px + dx, py + dy
                        if 0 <= ox < IMG_W and 0 <= oy < IMG_H:
                            old = img.getpixel((ox, oy))
                            blended = tuple(int(old[i] * (1 - alpha / 255) + area_rgb[i] * alpha / 255)
                                            for i in range(3)) + (255,)
                            img.putpixel((ox, oy), blended)

        # 虚线边框
        for i in range(0, pw - 6, 10):
            draw.line([(px + 3 + i, py + 3), (px + 3 + i + 6, py + 3)],
                      fill=area_rgb + (180,), width=1)
            draw.line([(px + 3 + i, py + ph - 4), (px + 3 + i + 6, py + ph - 4)],
                      fill=area_rgb + (180,), width=1)
        for i in range(0, ph - 6, 10):
            draw.line([(px + 3, py + 3 + i), (px + 3, py + 3 + i + 6)],
                      fill=area_rgb + (180,), width=1)
            draw.line([(px + pw - 4, py + 3 + i), (px + pw - 4, py + 3 + i + 6)],
                      fill=area_rgb + (180,), width=1)

        # 角落标记
        corner_color = area_rgb + (100,)
        draw.rectangle([px + 2, py + 2, px + 9, py + 3], fill=corner_color)
        draw.rectangle([px + 2, py + 2, px + 3, py + 9], fill=corner_color)
        draw.rectangle([px + pw - 10, py + 2, px + pw - 3, py + 3], fill=corner_color)
        draw.rectangle([px + pw - 4, py + 2, px + pw - 3, py + 9], fill=corner_color)
        draw.rectangle([px + 2, py + ph - 4, px + 9, py + ph - 3], fill=corner_color)
        draw.rectangle([px + 2, py + ph - 10, px + 3, py + ph - 3], fill=corner_color)
        draw.rectangle([px + pw - 10, py + ph - 4, px + pw - 3, py + ph - 3], fill=corner_color)
        draw.rectangle([px + pw - 4, py + ph - 10, px + pw - 3, py + ph - 3], fill=corner_color)

        # 区域特色装饰
        if area['id'] == 'lumber_camp':
            _draw_lumber_camp(draw, px, py, pw, ph)
        elif area['id'] == 'ruins_site':
            _draw_ruins_site(draw, px, py, pw, ph)
        elif area['id'] == 'frozen_lake':
            _draw_frozen_lake(draw, img, px, py, pw, ph)
        elif area['id'] == 'ore_pile':
            _draw_ore_pile(draw, px, py, pw, ph)


def _draw_lumber_camp(draw, px, py, pw, ph):
    """伐木场装饰"""
    trunk_rgb = hex_to_rgb(C['TREE_TRUNK'])
    for i in range(4):
        sx = px + 16 + (i % 2) * 60
        sy = py + 20 + (i // 2) * 50
        draw.ellipse([sx - 4, sy + 10, sx + 20, sy + 18], fill=(60, 50, 40, 30))
        draw.rectangle([sx, sy, sx + 15, sy + 11], fill=trunk_rgb + (255,))
        draw.ellipse([sx - 2, sy - 6, sx + 18, sy + 6], fill=(184, 160, 136, 255))
        draw.ellipse([sx + 2, sy - 3, sx + 14, sy + 3], fill=(184, 160, 136, 200))
        draw.ellipse([sx + 5, sy - 1, sx + 11, sy + 1], fill=(184, 160, 136, 150))
        draw.ellipse([sx - 2, sy - 8, sx + 14, sy - 2], fill=(230, 234, 240, 100))
    # 原木堆
    draw.rectangle([px + pw - 60, py + 20, px + pw - 21, py + 33], fill=(123, 88, 40, 255))
    draw.rectangle([px + pw - 58, py + 34, px + pw - 23, py + 45], fill=(107, 72, 32, 255))
    draw.rectangle([px + pw - 60, py + 18, px + pw - 21, py + 20], fill=(230, 234, 240, 80))


def _draw_ruins_site(draw, px, py, pw, ph):
    """废墟装饰"""
    draw.rectangle([px + 20, py + 20, px + 59, py + 39], fill=hex_to_rgba('#8A7A6A'))
    draw.rectangle([px + 80, py + 40, px + 119, py + 64], fill=hex_to_rgba('#8A7A6A'))
    draw.rectangle([px + 50, py + 10, px + 69, py + 39], fill=hex_to_rgba('#6A5A4A'))
    # 断墙
    draw.rectangle([px + 120, py + 15, px + 127, py + 54], fill=hex_to_rgba('#7A726A'))
    draw.rectangle([px + 128, py + 25, px + 133, py + 44], fill=hex_to_rgba('#6A625A'))
    # 钢筋
    draw.line([(px + 126, py + 15), (px + 130, py + 5)], fill=(128, 128, 128, 255), width=1)
    draw.line([(px + 122, py + 12), (px + 118, py + 2)], fill=(128, 128, 128, 255), width=1)
    # 积雪
    draw.rectangle([px + 22, py + 18, px + 57, py + 20], fill=(220, 224, 230, 90))
    draw.rectangle([px + 82, py + 38, px + 117, py + 40], fill=(220, 224, 230, 90))
    draw.rectangle([px + 120, py + 13, px + 127, py + 15], fill=(220, 224, 230, 90))


def _draw_frozen_lake(draw, img, px, py, pw, ph):
    """冰湖装饰"""
    cx, cy = px + pw // 2, py + ph // 2
    rx, ry = pw // 2 - 4, ph // 2 - 4
    # 湖岸
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(160, 170, 180, 50))
    # 冰面主体
    irx, iry = pw // 2 - 8, ph // 2 - 8
    draw.ellipse([cx - irx, cy - iry, cx + irx, cy + iry], fill=hex_to_rgba('#B8D4E8'))
    # 冰面高光
    draw.ellipse([cx - 35, cy - 27, cx - 5, cy - 9], fill=(220, 240, 255, 65))
    # 冰裂纹
    draw.line([(cx - 30, cy + 5), (cx + 25, cy - 15)], fill=(180, 210, 230, 80), width=1)
    draw.line([(cx - 5, cy - 20), (cx + 15, cy + 20)], fill=(180, 210, 230, 80), width=1)
    draw.line([(cx + 10, cy - 10), (cx + 30, cy + 5)], fill=(180, 210, 230, 80), width=1)
    # 冰钓洞
    draw.ellipse([cx + 16, cy + 6, cx + 24, cy + 14], fill=(112, 128, 144, 255))


def _draw_ore_pile(draw, px, py, pw, ph):
    """矿渣堆装饰"""
    ore_colors = [(106,106,106), (122,122,106), (90,106,106), (106,90,90), (122,106,90)]
    for i in range(6):
        ox = px + 18 + (i * 42) % (pw - 36)
        oy = py + 22 + (i // 3) * 44
        r = 8 + (i % 3) * 3
        draw.ellipse([ox - r - 2, oy + r - 1, ox + r + 2, oy + r + 5], fill=(40, 40, 40, 25))
        draw.ellipse([ox - r, oy - r, ox + r, oy + r],
                      fill=ore_colors[i % len(ore_colors)] + (255,))
        draw.ellipse([ox - r * 4 // 10 - 2, oy - r * 4 // 10 - 2,
                       ox - r * 4 // 10 + int(r * 0.4), oy - r * 4 // 10 + int(r * 0.4)],
                      fill=(200, 200, 200, 40))
    # 矿车
    draw.rectangle([px + pw - 50, py + ph - 30, px + pw - 21, py + ph - 15], fill=(80, 80, 80, 255))
    draw.rectangle([px + pw - 48, py + ph - 28, px + pw - 23, py + ph - 17], fill=(96, 96, 96, 255))
    draw.ellipse([px + pw - 48, py + ph - 16, px + pw - 40, py + ph - 8], fill=(64, 64, 64, 255))
    draw.ellipse([px + pw - 30, py + ph - 16, px + pw - 22, py + ph - 8], fill=(64, 64, 64, 255))


# ============================================================
# 建筑标注层
# ============================================================
def draw_annotations(img):
    """在底图上绘制建筑位置标注（半透明方框 + 名称标签 + 门标记）"""
    print('  📝 绘制建筑标注...')
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 尝试加载字体
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 11)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9)
    except (IOError, OSError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", 11)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", 9)
        except (IOError, OSError):
            font = ImageFont.load_default()
            font_small = font

    for b in BUILDINGS:
        bx, by = b['x'] * TILE, b['y'] * TILE
        bw, bh = b['w'] * TILE, b['h'] * TILE
        roof_rgb = hex_to_rgb(b['roofColor'])

        # 半透明底色方框
        draw.rectangle([bx, by, bx + bw - 1, by + bh - 1],
                        fill=roof_rgb + (76,))  # opacity 0.3

        # 白色虚线边框
        for i in range(0, bw, 8):
            draw.line([(bx + i, by), (bx + min(i + 5, bw - 1), by)],
                      fill=(255, 255, 255, 200), width=1)
            draw.line([(bx + i, by + bh - 1), (bx + min(i + 5, bw - 1), by + bh - 1)],
                      fill=(255, 255, 255, 200), width=1)
        for i in range(0, bh, 8):
            draw.line([(bx, by + i), (bx, by + min(i + 5, bh - 1))],
                      fill=(255, 255, 255, 200), width=1)
            draw.line([(bx + bw - 1, by + i), (bx + bw - 1, by + min(i + 5, bh - 1))],
                      fill=(255, 255, 255, 200), width=1)

        # 建筑名称标签
        label = f"{b['name']} {b['id']} {b['w']}x{b['h']}"
        # 标签背景
        bbox = font.getbbox(label)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        lx = bx + bw // 2 - tw // 2 - 3
        ly = by + bh // 2 - th // 2 - 3
        draw.rectangle([lx, ly, lx + tw + 6, ly + th + 6],
                        fill=(0, 0, 0, 160))
        draw.text((lx + 3, ly + 3), label, fill=(255, 255, 255, 230), font=font)

        # 门位置红色箭头标记 ↓
        door_px = b['doorX'] * TILE + TILE // 2
        door_py = b['doorY'] * TILE
        # 红色箭头
        draw.polygon([(door_px - 6, door_py - 4),
                       (door_px + 6, door_py - 4),
                       (door_px, door_py + 6)],
                      fill=(255, 60, 60, 200))
        # "门" 标签
        draw.text((door_px - 4, door_py - 14), "门",
                  fill=(255, 100, 100, 220), font=font_small)

    # 暖炉广场标注
    fp = FURNACE_PLAZA
    fpx, fpy = fp['x'] * TILE, fp['y'] * TILE
    fpw, fph = fp['w'] * TILE, fp['h'] * TILE
    draw.rectangle([fpx, fpy, fpx + fpw - 1, fpy + fph - 1],
                    fill=(255, 180, 60, 50))
    for i in range(0, fpw, 8):
        draw.line([(fpx + i, fpy), (fpx + min(i + 5, fpw - 1), fpy)],
                  fill=(255, 200, 80, 180), width=1)
        draw.line([(fpx + i, fpy + fph - 1), (fpx + min(i + 5, fpw - 1), fpy + fph - 1)],
                  fill=(255, 200, 80, 180), width=1)
    fp_label = f"🔥主暖炉 furnace {fp['w']}x{fp['h']}"
    bbox = font.getbbox(fp_label)
    tw = bbox[2] - bbox[0]
    lx = fpx + fpw // 2 - tw // 2 - 3
    ly = fpy - 18
    draw.rectangle([lx, ly, lx + tw + 6, ly + 16], fill=(0, 0, 0, 140))
    draw.text((lx + 3, ly + 2), fp_label, fill=(255, 200, 80, 230), font=font)

    # 合并标注层
    img.paste(Image.alpha_composite(img, overlay))


# ============================================================
# 建筑素材独立生成
# ============================================================
def generate_building_sprite(b, force=False):
    """为单个建筑生成透明背景 PNG 素材"""
    bid = b['id']
    pw = b['w'] * TILE
    ph = b['h'] * TILE + TILE  # 额外空间给屋顶

    out_path = os.path.join(BASE, 'asset', 'buildings', f'{bid}.png')
    if os.path.exists(out_path) and not force:
        return out_path, False  # 已存在，跳过

    random.seed(SEED + hash(bid))
    img = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    wall_rgb = hex_to_rgb(b['wallColor'])
    roof_rgb = hex_to_rgb(b['roofColor'])

    roof_h = int(ph * 0.35)
    wall_top = roof_h

    # === 建筑投影 ===
    draw.polygon([(6, ph - 1), (pw - 1, ph - 1), (pw + 4, ph + 4), (10, ph + 4)],
                  fill=(40, 50, 60, 46))

    # === 墙体（逐像素带噪声） ===
    for y in range(wall_top, ph):
        for x in range(pw):
            c = noise_color(wall_rgb, 8)
            img.putpixel((x, y), c + (255,))

    # 砖缝线
    for ly in range(wall_top + 8, ph, 8):
        draw.line([(2, ly), (pw - 3, ly)], fill=(0, 0, 0, 15), width=1)
    for ly in range(wall_top + 8, ph, 8):
        offset = 0 if ((ly - wall_top) // 8) % 2 == 0 else 8
        for lx in range(offset, pw, 16):
            draw.line([(lx, ly), (lx, ly + 8)], fill=(0, 0, 0, 10), width=1)

    # 墙体右侧阴影
    draw.rectangle([pw - 6, wall_top, pw - 1, ph - 1], fill=(0, 0, 0, 20))
    # 墙基线
    draw.rectangle([0, ph - 3, pw - 1, ph - 1], fill=(60, 50, 40, 64))

    # === 屋顶（三角形 + 积雪） ===
    for y in range(roof_h):
        ratio = y / max(roof_h, 1)
        left = int(pw / 2 * (1 - ratio)) - 6
        right = pw - left + 6
        for x in range(max(0, left), min(pw, right)):
            c = noise_color(roof_rgb, 10)
            old = img.getpixel((x, y))
            if old[3] == 0:
                img.putpixel((x, y), c + (255,))

    # 积雪层
    for y in range(max(0, roof_h // 3), roof_h * 2 // 3):
        ratio = y / max(roof_h, 1)
        left = int(pw / 2 * (1 - ratio)) - 2
        right = pw - left + 2
        for x in range(max(0, left + 2), min(pw, right - 2)):
            old = img.getpixel((x, y))
            if old[3] > 0:
                snow = noise_color((228, 232, 240), 6)
                blended = tuple(int(old[i] * 0.4 + snow[i] * 0.6) for i in range(3)) + (255,)
                img.putpixel((x, y), blended)

    # 屋顶边缘线
    draw.line([(-6, wall_top + 4), (pw // 2, -4)], fill=(60, 50, 40, 50), width=1)
    draw.line([(pw // 2, -4), (pw + 6, wall_top + 4)], fill=(60, 50, 40, 50), width=1)
    # 屋檐阴影
    draw.rectangle([0, wall_top, pw - 1, wall_top + 2], fill=(0, 0, 0, 25))

    # === 烟囱 ===
    chx = int(pw * 0.7)
    chy = max(0, roof_h // 3)
    draw.rectangle([chx, chy, chx + 9, chy + 15], fill=hex_to_rgba(C['CHIMNEY']))
    draw.rectangle([chx - 1, chy - 2, chx + 10, chy + 2], fill=hex_to_rgba(C['CHIMNEY_TOP']))
    draw.rectangle([chx, chy - 3, chx + 9, chy - 1], fill=(230, 234, 240, 140))

    # === 门（带门框） ===
    # 门相对于建筑左上角的位置
    door_rel_x = (b['doorX'] - b['x']) * TILE
    door_rel_y = ph - TILE  # 建筑底部
    # 门框
    draw.rectangle([door_rel_x + 6, door_rel_y - 2, door_rel_x + 25, door_rel_y + TILE - 1],
                    fill=hex_to_rgba(C['DOOR_FRAME']))
    # 门
    draw.rectangle([door_rel_x + 8, door_rel_y, door_rel_x + 23, door_rel_y + TILE - 1],
                    fill=hex_to_rgba(C['DOOR']))
    # 门把手
    draw.rectangle([door_rel_x + 20, door_rel_y + 14, door_rel_x + 22, door_rel_y + 16],
                    fill=(192, 160, 96, 255))
    # 门上方小窗
    draw.rectangle([door_rel_x + 11, door_rel_y + 2, door_rel_x + 20, door_rel_y + 7],
                    fill=(120, 184, 216, 80))

    # === 窗户 ===
    win_count = max(1, b['w'] // 3)
    win_spacing = pw // (win_count + 1)
    win_y = wall_top + int((ph - wall_top) * 0.25)
    wf_rgb = hex_to_rgb(C['WINDOW_FRAME'])
    wg_rgb = hex_to_rgb(C['WINDOW'])

    for i in range(1, win_count + 1):
        wx = win_spacing * i - 6
        # 窗框
        draw.rectangle([wx - 1, win_y - 1, wx + 12, win_y + 10], fill=wf_rgb + (255,))
        # 窗玻璃
        draw.rectangle([wx, win_y, wx + 11, win_y + 9], fill=wg_rgb + (255,))
        # 十字窗格
        draw.line([(wx + 5, win_y), (wx + 5, win_y + 9)], fill=wf_rgb + (255,), width=1)
        draw.line([(wx, win_y + 4), (wx + 11, win_y + 4)], fill=wf_rgb + (255,), width=1)
        # 窗台
        draw.rectangle([wx - 2, win_y + 10, wx + 13, win_y + 12], fill=(200, 196, 190, 180))
        # 窗台积雪
        draw.rectangle([wx - 1, win_y + 9, wx + 12, win_y + 10], fill=(230, 234, 240, 160))

    img.save(out_path)
    return out_path, True  # 新生成


def generate_all_buildings(force=False):
    """生成所有建筑的独立素材"""
    print('\n🏠 生成建筑素材...')
    results = []
    for b in BUILDINGS:
        path, is_new = generate_building_sprite(b, force)
        pw, ph = b['w'] * TILE, b['h'] * TILE + TILE
        results.append({
            'id': b['id'],
            'name': b['name'],
            'path': path,
            'size': (pw, ph),
            'is_new': is_new,
        })
        status = '✓ 新生成' if is_new else '⏭ 已存在，跳过'
        print(f'  {status} buildings/{b["id"]}.png ({pw}×{ph})')
    return results


# ============================================================
# 更新 sprite-manifest.json
# ============================================================
def update_manifest():
    """更新 sprite-manifest.json，新增 maps 分类"""
    print('\n📋 更新素材清单...')
    manifest_path = os.path.join(BASE, 'asset', 'sprite-manifest.json')

    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    else:
        manifest = {}

    # 添加/更新 maps 分类
    manifest['maps'] = {
        'village_base': {
            'file': 'asset/map/village_base_clean.png',
            'file_annotated': 'asset/map/village_base.png',
            'size': [IMG_W, IMG_H],
            'grid': [MAP_W, MAP_H],
            'desc': '末日据点主地图底图（含地面/围墙/装饰物，不含建筑和NPC）'
        }
    }

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f'  ✓ sprite-manifest.json 已更新（新增 maps 分类）')


# ============================================================
# 输出报告
# ============================================================
def print_report(results, base_clean_path, base_annotated_path, elapsed):
    """输出生成报告"""
    print('\n' + '=' * 60)
    print('📊 生成报告')
    print('=' * 60)

    def file_size_str(path):
        if os.path.exists(path):
            size = os.path.getsize(path)
            if size > 1024 * 1024:
                return f'{size / 1024 / 1024:.1f} MB'
            return f'{size / 1024:.1f} KB'
        return '不存在'

    print(f'\n  底图（无标注版）: {os.path.relpath(base_clean_path, BASE)}')
    print(f'    尺寸: {IMG_W}×{IMG_H}px | 文件: {file_size_str(base_clean_path)}')

    print(f'\n  底图（带标注版）: {os.path.relpath(base_annotated_path, BASE)}')
    print(f'    尺寸: {IMG_W}×{IMG_H}px | 文件: {file_size_str(base_annotated_path)}')

    if results:
        print(f'\n  建筑素材:')
        for r in results:
            status = '新生成' if r['is_new'] else '跳过（已存在）'
            fsize = file_size_str(r['path'])
            print(f'    {r["name"]} ({r["id"]}) — {r["size"][0]}×{r["size"][1]}px | {fsize} | {status}')

    print(f'\n  ⏱ 总耗时: {elapsed:.1f}秒')
    print('=' * 60)


# ============================================================
# 主入口
# ============================================================
def main():
    parser = argparse.ArgumentParser(description='福音雪镇 — 地图底图+建筑素材生成器')
    parser.add_argument('--force', action='store_true',
                        help='强制覆盖已存在的建筑素材文件')
    parser.add_argument('--annotate-only', action='store_true',
                        help='仅生成带标注版底图，不生成/覆盖建筑素材')
    args = parser.parse_args()

    start_time = time.time()
    print('\n🏔 福音雪镇 — 地图底图生成器')
    print(f'  地图: {MAP_W}×{MAP_H} 格 = {IMG_W}×{IMG_H} 像素\n')

    # 创建目录
    make_dirs()

    # ---- 生成底图 ----
    print('📐 生成底图...')
    img = Image.new('RGBA', (IMG_W, IMG_H), (0, 0, 0, 0))

    # 1. 地面纹理
    draw_ground(img)

    # 2. 资源区域装饰
    draw_resource_areas(img)

    # 3. 围墙
    draw_wall(img)

    # 4. 装饰物
    draw_decorations(img)

    # 5. 暖炉广场
    draw_furnace_plaza(img)

    # ---- 输出无标注版 ----
    clean_path = os.path.join(BASE, 'asset', 'map', 'village_base_clean.png')
    img.save(clean_path)
    print(f'\n  ✅ 无标注版底图: {os.path.relpath(clean_path, BASE)}')

    # ---- 生成带标注版 ----
    annotated = img.copy()
    draw_annotations(annotated)
    annotated_path = os.path.join(BASE, 'asset', 'map', 'village_base.png')
    annotated.save(annotated_path)
    print(f'  ✅ 带标注版底图: {os.path.relpath(annotated_path, BASE)}')

    # ---- 建筑素材 ----
    building_results = []
    if not args.annotate_only:
        building_results = generate_all_buildings(force=args.force)
    else:
        print('\n  ⏭ --annotate-only 模式，跳过建筑素材生成')

    # ---- 更新 manifest ----
    if not args.annotate_only:
        update_manifest()

    # ---- 输出报告 ----
    elapsed = time.time() - start_time
    print_report(building_results, clean_path, annotated_path, elapsed)

    print('\n✅ 全部完成！')
    print('📌 你可以用 PS / Aseprite 编辑以下文件来美化地图:')
    print(f'   底图: asset/map/village_base_clean.png')
    print(f'   建筑: asset/buildings/*.png')
    print(f'   参考: asset/map/village_base.png（带建筑位置标注）')


if __name__ == '__main__':
    main()