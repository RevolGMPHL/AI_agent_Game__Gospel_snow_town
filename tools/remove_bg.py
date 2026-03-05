#!/usr/bin/env python3
"""
建筑抠图脚本：移除裁剪建筑图的背景，使背景变为透明。

原理：
  1. 从图像边缘（四角 + 边缘均匀采样点）开始 flood fill
  2. 将与边缘连通的、颜色相近的像素标记为背景
  3. 把背景像素的 alpha 设为 0（透明）
  4. 对边缘做少量羽化处理，使过渡更自然
"""

import cv2
import numpy as np
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
GEN_DIR = os.path.join(BASE, 'asset', 'buildings', 'gen')
OUT_DIR = os.path.join(BASE, 'asset', 'buildings', 'gen', 'nobg')

# 每张图的 flood fill 容差（根据背景复杂度单独调整）
# 值越大，去背景越激进；值越小，保留的细节越多
FUZZ_MAP = {
    1: 18,  # warehouse - 深色天空背景，建筑也有暗色部分需要小容差
    2: 18,  # medical - 深色背景
    3: 20,  # dorm_a - 浅灰背景
    4: 20,  # dorm_b - 混合背景
    5: 20,  # kitchen - 浅灰背景
    6: 20,  # workshop - 浅灰背景
    7: 20,  # command - 灰色背景
}


def get_edge_seeds(w, h, step=20):
    """获取边缘种子点：四角 + 边缘上均匀分布的点"""
    seeds = set()
    # 四角
    seeds.add((0, 0))
    seeds.add((w - 1, 0))
    seeds.add((0, h - 1))
    seeds.add((w - 1, h - 1))
    # 上下边缘
    for x in range(0, w, step):
        seeds.add((x, 0))
        seeds.add((x, h - 1))
    # 左右边缘
    for y in range(0, h, step):
        seeds.add((0, y))
        seeds.add((w - 1, y))
    return list(seeds)


def remove_background(img_path, fuzz=25):
    """
    使用 flood fill 从边缘去除背景
    
    Args:
        img_path: 输入图片路径
        fuzz: 颜色容差 (0-255)
    
    Returns:
        BGRA 格式的抠图结果
    """
    # 读取图片
    img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f'  ❌ 无法读取: {img_path}')
        return None

    h, w = img.shape[:2]
    print(f'  尺寸: {w}x{h}, 通道: {img.shape[2] if len(img.shape) > 2 else 1}')

    # 确保有 4 通道 (BGRA)
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

    # 创建背景 mask（0=前景, 255=背景）
    bg_mask = np.zeros((h, w), dtype=np.uint8)

    # 用于 flood fill 的 mask（比原图大2像素）
    ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)

    # BGR 通道（不含 alpha）
    bgr = img[:, :, :3].copy()

    # 从边缘种子点进行 flood fill
    seeds = get_edge_seeds(w, h, step=15)
    print(f'  种子点: {len(seeds)} 个')

    fill_count = 0
    for (sx, sy) in seeds:
        # 检查这个种子点是否已经被填充过
        if ff_mask[sy + 1, sx + 1] != 0:
            continue

        # flood fill - 使用 FLOODFILL_MASK_ONLY 只修改 mask 不修改图片
        # loDiff 和 upDiff 定义颜色容差
        lo = (fuzz, fuzz, fuzz)
        hi = (fuzz, fuzz, fuzz)
        
        # 设置 flags：使用 4 连通，mask 填充值为 255
        # FLOODFILL_FIXED_RANGE: 每个像素与种子点颜色比较，而非与邻居比较
        # 这样可以避免颜色"漂移"导致 flood fill 穿过建筑
        flags = 4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE
        
        cv2.floodFill(bgr, ff_mask, (sx, sy), None, lo, hi, flags)
        fill_count += 1

    # 从 ff_mask 中提取背景区域（内部区域，去掉边框）
    bg_mask = ff_mask[1:-1, 1:-1]

    bg_pixels = np.sum(bg_mask > 0)
    total_pixels = w * h
    bg_ratio = bg_pixels / total_pixels
    print(f'  flood fill 轮次: {fill_count}')
    print(f'  背景像素: {bg_pixels}/{total_pixels} ({bg_ratio * 100:.1f}%)')

    # 安全检查：如果背景比例过高（>95%），说明可能抠过头了
    if bg_ratio > 0.95:
        print(f'  ⚠️ 背景比例过高 ({bg_ratio*100:.1f}%)，建筑可能被误删！')
        print(f'     建议降低容差值重试')

    # 对 mask 做轻微的腐蚀，避免去掉建筑边缘
    kernel = np.ones((2, 2), np.uint8)
    bg_mask_eroded = cv2.erode(bg_mask, kernel, iterations=1)

    # 应用 mask：背景区域 alpha 设为 0
    result = img.copy()
    result[:, :, 3] = np.where(bg_mask_eroded > 0, 0, 255)

    # 边缘羽化：对 alpha 通道做高斯模糊使过渡更平滑
    alpha = result[:, :, 3].astype(np.float32)
    # 只对边缘区域做模糊（通过 dilate mask 和原 mask 的差得到边缘）
    kernel_edge = np.ones((5, 5), np.uint8)
    edge_zone = cv2.dilate(bg_mask_eroded, kernel_edge, iterations=1) - bg_mask_eroded
    # 在边缘区域用模糊后的 alpha
    alpha_blurred = cv2.GaussianBlur(alpha, (3, 3), 0)
    alpha = np.where(edge_zone > 0, alpha_blurred, alpha)
    result[:, :, 3] = alpha.astype(np.uint8)

    return result


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print('🔪 开始建筑抠图...\n')

    for i in range(1, 8):
        src = os.path.join(GEN_DIR, f'building_crop_{i}.png')
        dst = os.path.join(OUT_DIR, f'building_crop_{i}.png')
        fuzz = FUZZ_MAP.get(i, 25)

        print(f'🏠 [{i}] building_crop_{i}.png (容差={fuzz})')
        
        if not os.path.exists(src):
            print(f'  ⚠️ 文件不存在，跳过')
            continue

        result = remove_background(src, fuzz=fuzz)
        if result is not None:
            cv2.imwrite(dst, result)
            print(f'  ✅ 保存到: {dst}')
        print()

    print('🎉 抠图完成！结果保存在: ' + OUT_DIR)
    print()
    print('请检查抠图效果，如果某些建筑的背景没去干净或去多了，')
    print('可以调整脚本中 FUZZ_MAP 的容差值：')
    print('  - 增大值 → 去更多背景（可能会误删建筑细节）')
    print('  - 减小值 → 保留更多细节（可能会残留背景）')
    print()
    print('确认效果满意后，运行以下命令用抠图结果替换原图：')
    print('  cp asset/buildings/gen/nobg/*.png asset/buildings/gen/')
    print('  python3 replace_buildings.py')


if __name__ == '__main__':
    main()