/**
 * 福音镇 - BaseMap 基类
 * 所有地图的通用基类，提供网格绘制、碰撞检测、装饰物渲染等
 */
(function() {
    'use strict';
    const GST = window.GST;

    class BaseMap {
        constructor(w, h, name) {
            this.width = w;
            this.height = h;
            this.name = name || '未知';
            this.objects = [];     // 绘制对象 (带 draw/getSortY)
            this.triggers = [];    // 门/传送点
            this.landmarks = [];   // 地标 (AI 感知用)
            this.decorations = []; // 纯装饰 (花/树/灯/长椅)
            this.circleObstacles = [];
        }
    
        /** 颜色→素材名映射（用于图片绘制） */
        static _colorToSprite = {
            [GST.C.GRASS]:       'snow',
            [GST.C.GRASS_DARK]:  'snow_dark',
            [GST.C.GRASS_LIGHT]: 'snow_light',
            [GST.C.PATH]:        'path',
            [GST.C.PATH_DARK]:   'path_dark',
            [GST.C.PLAZA]:       'plaza',
            [GST.C.DIRT]:        'dirt',
            [GST.C.WATER]:       'ice',
            [GST.C.WATER_DEEP]:  'ice_deep',
            [GST.C.SAND]:        'sand',
        };
    
        /** 绘制地面（仅绘制视口内的 tile，带雪地纹理） */
        drawGrid(ctx, camera) {
            // ★ 优先使用底图 PNG 渲染（一次 drawImage 替代逐格绘制）
            // 仅限设置了 useBaseImage 标记的地图（VillageMap），室内场景不走此路径
            if (this.useBaseImage && typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled) {
                const baseMap = SpriteLoader.getMap('village_base');
                if (baseMap) {
                    // 先用纯白底色清除视口区域，防止残留
                    ctx.fillStyle = '#E6EAF0';
                    ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
                    // 计算视口在底图上的裁剪区域
                    const srcX = Math.max(0, Math.floor(camera.x));
                    const srcY = Math.max(0, Math.floor(camera.y));
                    const srcW = Math.min(baseMap.width - srcX, Math.ceil(camera.width));
                    const srcH = Math.min(baseMap.height - srcY, Math.ceil(camera.height));
                    const dstX = srcX;
                    const dstY = srcY;
                    if (srcW > 0 && srcH > 0) {
                        ctx.drawImage(baseMap, srcX, srcY, srcW, srcH, dstX, dstY, srcW, srcH);
                    }
                    // 底图已包含地面+围墙+装饰物+资源区域，无需再绘制
                    // 注意：不调用 drawDecorations，因为装饰物已烘焙进底图
                    return;
                }
            }
    
            const sx = Math.floor(camera.x / GST.TILE);
            const sy = Math.floor(camera.y / GST.TILE);
            const ex = Math.ceil((camera.x + camera.width) / GST.TILE);
            const ey = Math.ceil((camera.y + camera.height) / GST.TILE);
            // 注意：不使用逐格 tile 素材渲染（tile PNG 拼接边缘不连续导致视觉噪声）
            // 只使用底图 PNG（大图无拼接问题）或纯色 fallback
    
            for (let y = sy; y < Math.min(ey, this.height); y++) {
                for (let x = sx; x < Math.min(ex, this.width); x++) {
                    if (x < 0 || y < 0) continue;
                    const color = this.getTileColor(x, y);
    
                    // 纯色绘制（简洁干净）
                    {
                        ctx.fillStyle = color;
                        ctx.fillRect(x * GST.TILE, y * GST.TILE, GST.TILE, GST.TILE);
    
                        // 雪地纹理叠加（仅户外雪地类tile）
                        if (color === GST.C.GRASS || color === GST.C.GRASS_DARK || color === GST.C.GRASS_LIGHT) {
                            const n = GST.getTileNoise(x, y);
                            // 柔和的白色雪花高光（极少量，低透明度）
                            if (n > 0.85) {
                                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                                ctx.fillRect(x * GST.TILE + (n * 20) % 24, y * GST.TILE + ((n * 37) % 24), 4, 3);
                            }
                        }
                        // 道路纹理
                        else if (color === GST.C.PATH || color === GST.C.PATH_DARK) {
                            const n = GST.getTileNoise(x, y);
                            // 柔和踩踏痕迹（更低对比度）
                            if (n > 0.65) {
                                ctx.fillStyle = 'rgba(140,130,120,0.06)';
                                ctx.fillRect(x * GST.TILE + 6, y * GST.TILE + 10, 20, 12);
                            }
                        }
                        // 冰面纹理
                        else if (color === GST.C.WATER || color === GST.C.WATER_DEEP) {
                            const n = GST.getTileNoise(x, y);
                            // 冰裂纹
                            ctx.strokeStyle = 'rgba(200,220,240,0.2)';
                            ctx.lineWidth = 0.5;
                            if (n > 0.6) {
                                ctx.beginPath();
                                ctx.moveTo(x * GST.TILE + 4, y * GST.TILE + n * 28);
                                ctx.lineTo(x * GST.TILE + 28, y * GST.TILE + (1-n) * 28);
                                ctx.stroke();
                            }
                        // 冰面高光
                            if (n < 0.15) {
                                ctx.fillStyle = 'rgba(220,240,255,0.15)';
                                ctx.fillRect(x * GST.TILE + 8, y * GST.TILE + 8, 16, 8);
                            }
                        }
                    } // end 纯色绘制
                }
            }
    
            // 绘制装饰物
            this.drawDecorations(ctx, camera);
        }
    
        /** 绘制装饰物 */
        drawDecorations(ctx, camera) {
            for (const d of this.decorations) {
                const px = d.x * GST.TILE;
                const py = d.y * GST.TILE;
                // 视口裁剪
                if (px + GST.TILE * 2 < camera.x || px - GST.TILE > camera.x + camera.width) continue;
                if (py + GST.TILE * 2 < camera.y || py - GST.TILE > camera.y + camera.height) continue;
                this.drawDecoration(ctx, d, px, py);
            }
        }
    
        /** 绘制单个装饰 — 升级版（优先使用图片素材，fallback 到代码绘制） */
        drawDecoration(ctx, d, px, py) {
            // 装饰物已烘焙到底图 PNG 中，此处始终使用代码绘制（作为 fallback）
            // 不再使用 SpriteLoader 加载单个装饰物小图（质量差、拼接效果不好）
            switch (d.type) {
                case 'tree':
                    // 树影
                    ctx.fillStyle = 'rgba(60,70,80,0.15)';
                    ctx.beginPath();
                    ctx.ellipse(px + 18, py + 30, 12, 5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 树干（带纹理）
                    ctx.fillStyle = GST.C.TREE_TRUNK;
                    ctx.fillRect(px + 12, py + 16, 8, 16);
                    ctx.fillStyle = GST.C.TREE_TRUNK_LIGHT;
                    ctx.fillRect(px + 14, py + 18, 3, 12); // 高光面
                    // 树冠层1（底层深色枯枝）
                    ctx.fillStyle = d.color || GST.C.TREE_CROWN;
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 10, 14, 0, Math.PI * 2);
                    ctx.fill();
                    // 树冠层2（浅色积雪覆盖）
                    ctx.fillStyle = GST.C.TREE_SNOW;
                    ctx.beginPath();
                    ctx.arc(px + 15, py + 6, 10, Math.PI * 1.2, Math.PI * 1.9);
                    ctx.fill();
                    // 枝条细节
                    ctx.strokeStyle = 'rgba(90,70,50,0.4)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px + 16, py + 12);
                    ctx.lineTo(px + 6, py + 6);
                    ctx.moveTo(px + 16, py + 12);
                    ctx.lineTo(px + 26, py + 4);
                    ctx.stroke();
                    break;
                case 'bush':
                    // 灌木阴影
                    ctx.fillStyle = 'rgba(60,70,80,0.12)';
                    ctx.beginPath();
                    ctx.ellipse(px + 16, py + 28, 10, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 灌木主体
                    ctx.fillStyle = d.color || GST.C.BUSH;
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 20, 10, 0, Math.PI * 2);
                    ctx.fill();
                    // 积雪覆盖顶部
                    ctx.fillStyle = '#E0E4EA';
                    ctx.beginPath();
                    ctx.arc(px + 15, py + 16, 7, Math.PI * 1.1, Math.PI * 2.0);
                    ctx.fill();
                    break;
                case 'flower':
                    ctx.fillStyle = d.color || GST.C.FLOWER_PINK;
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 22, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#FFE060';
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 22, 2, 0, Math.PI * 2);
                    ctx.fill();
                    // 积雪小点
                    ctx.fillStyle = 'rgba(240,244,250,0.5)';
                    ctx.fillRect(px + 14, py + 19, 4, 2);
                    break;
                case 'bench':
                    // 长椅阴影
                    ctx.fillStyle = 'rgba(60,70,80,0.12)';
                    ctx.fillRect(px + 3, py + 30, 26, 3);
                    // 长椅
                    ctx.fillStyle = GST.C.FENCE;
                    ctx.fillRect(px + 2, py + 20, 28, 4);
                    ctx.fillRect(px + 4, py + 24, 4, 6);
                    ctx.fillRect(px + 24, py + 24, 4, 6);
                    ctx.fillStyle = GST.C.FENCE_DARK;
                    ctx.fillRect(px + 2, py + 14, 28, 6);
                    // 积雪
                    ctx.fillStyle = 'rgba(230,234,240,0.4)';
                    ctx.fillRect(px + 4, py + 13, 24, 2);
                    break;
                case 'lamppost':
                    // 灯柱
                    ctx.fillStyle = GST.C.LAMPPOST;
                    ctx.fillRect(px + 14, py + 8, 4, 24);
                    // 灯台头
                    ctx.fillStyle = '#404040';
                    ctx.fillRect(px + 11, py + 5, 10, 4);
                    // 灯光 — 夜间更亮更温暖
                    let lampIsNight = false;
                    if (typeof window !== 'undefined' && window.game) {
                        const h = window.game.getHour();
                        lampIsNight = h >= 18 || h < 6;
                    }
                    // 灯光圆
                    ctx.fillStyle = lampIsNight ? '#FFE880' : 'rgba(255,232,128,0.4)';
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 6, lampIsNight ? 7 : 5, 0, Math.PI * 2);
                    ctx.fill();
                    if (lampIsNight) {
                        // 多层光晕
                        const grad = ctx.createRadialGradient(px + 16, py + 10, 4, px + 16, py + 10, 36);
                        grad.addColorStop(0, 'rgba(255,232,128,0.2)');
                        grad.addColorStop(0.4, 'rgba(255,200,80,0.08)');
                        grad.addColorStop(1, 'rgba(255,180,60,0)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(px - 20, py - 20, 72, 60);
                    }
                    // 灯柱阴影
                    ctx.fillStyle = 'rgba(60,70,80,0.1)';
                    ctx.fillRect(px + 10, py + 30, 12, 3);
                    break;
                case 'sign':
                    // 告示牌支柱
                    ctx.fillStyle = GST.C.FENCE;
                    ctx.fillRect(px + 14, py + 18, 4, 14);
                    // 告示牌面
                    ctx.fillStyle = GST.C.SIGN;
                    ctx.fillRect(px + 4, py + 8, 24, 12);
                    // 文字痕迹
                    ctx.fillStyle = 'rgba(60,40,20,0.3)';
                    ctx.fillRect(px + 8, py + 11, 16, 2);
                    ctx.fillRect(px + 8, py + 15, 12, 2);
                    // 积雪
                    ctx.fillStyle = 'rgba(230,234,240,0.5)';
                    ctx.fillRect(px + 3, py + 6, 26, 3);
                    break;
                case 'well':
                    // 井阴影
                    ctx.fillStyle = 'rgba(60,70,80,0.12)';
                    ctx.beginPath();
                    ctx.ellipse(px + 16, py + 30, 14, 5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 井壁
                    ctx.fillStyle = GST.C.WELL;
                    ctx.fillRect(px + 4, py + 10, 24, 18);
                    // 井水/冰面
                    ctx.fillStyle = '#90B8D0';
                    ctx.fillRect(px + 8, py + 14, 16, 10);
                    // 冰面高光
                    ctx.fillStyle = 'rgba(200,220,240,0.3)';
                    ctx.fillRect(px + 10, py + 16, 8, 4);
                    // 支柱
                    ctx.fillStyle = GST.C.FENCE;
                    ctx.fillRect(px + 6, py + 6, 4, 4);
                    ctx.fillRect(px + 22, py + 6, 4, 4);
                    ctx.fillRect(px + 6, py + 4, 20, 3);
                    // 积雪
                    ctx.fillStyle = 'rgba(230,234,240,0.4)';
                    ctx.fillRect(px + 6, py + 2, 20, 3);
                    break;
            }
        }
    
        getTileColor(x, y) { return GST.C.GRASS; }
        isSolid(px, py) { return false; }
    
        describe(gx, gy) { return `${this.name} (${this.width}×${this.height}), 你在 (${gx}, ${gy}).`; }
        getInterestPoints(gx, gy) { return []; }
    
        getExits() {
            return this.triggers.map(t => ({
                x: Math.floor(t.x + t.w / 2),
                y: Math.floor(t.y + t.h / 2),
                target: t.target,
                name: t.name || t.target
            }));
        }
    
        scanNearby(gx, gy, radius) {
            const found = [];
            // 扫描附近的装饰物
            for (const d of this.decorations) {
                const dist = Math.abs(d.x - gx) + Math.abs(d.y - gy);
                if (dist <= radius && dist > 0) {
                    found.push({ x: d.x, y: d.y, type: d.type, name: d.label || d.type });
                }
            }
            return found;
        }
    
        getTrigger(player) {
            const px = Math.floor((player.x + 16) / GST.TILE);
            const py = Math.floor((player.y + 24) / GST.TILE);
            return this.triggers.find(t =>
                px >= t.x && px < (t.x + t.w) &&
                py >= t.y && py < (t.y + t.h)
            );
        }
    
        getCirclePush(px, py, playerR) {
            const gx = px / GST.TILE;
            const gy = py / GST.TILE;
            const gridR = playerR / GST.TILE;
            for (const obs of this.circleObstacles) {
                const dx = gx - obs.cx;
                const dy = gy - obs.cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = obs.r + gridR;
                if (dist < minDist && dist > 0.001) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;
                    return { nx, ny, px: nx * overlap * GST.TILE, py: ny * overlap * GST.TILE };
                }
            }
            return null;
        }
    
        /** 辅助：获取方向描述 */
        _dir(fromX, fromY, toX, toY) {
            const dx = toX - fromX, dy = toY - fromY;
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return '附近';
            let dir = '';
            if (dy < -3) dir += '北'; else if (dy > 3) dir += '南';
            if (dx < -3) dir += '西'; else if (dx > 3) dir += '东';
            return dir || '附近';
        }
    }

    GST.BaseMap = BaseMap;
})();
