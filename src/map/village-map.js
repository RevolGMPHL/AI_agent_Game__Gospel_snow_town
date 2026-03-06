/**
 * 福音镇 - VillageMap 村庄主地图 (50×40)
 * 末日据点主地图，含围墙、建筑、资源区
 */
(function() {
    'use strict';
    const GST = window.GST;

    class VillageMap extends GST.BaseMap {
        constructor() {
            super(50, 40, '末日据点');
            this.useBaseImage = true; // 使用预烘焙底图 PNG 渲染，室内场景不设此标记
    
            // ---- 户外资源采集区域 ----
            this.resourceAreas = [
                { id: 'lumber_camp', name: '🌲伐木场', x: 2, y: 2, w: 8, h: 6, color: '#5A6B50', resource: 'wood', danger: '中' },
                { id: 'ruins_site',  name: '🔍废墟',   x: 38, y: 2, w: 10, h: 6, color: '#7A6A5A', resource: 'explore', danger: '高' },
                { id: 'frozen_lake', name: '🎣冰湖',   x: 2, y: 32, w: 8, h: 6, color: '#90B8D0', resource: 'food', danger: '中' },
                { id: 'ore_pile',    name: '⛏️矿渣堆', x: 38, y: 32, w: 10, h: 6, color: '#8A7A6A', resource: 'power', danger: '中' },
            ];
    
            // ---- 围墙定义 ----
            this.wallBounds = { x1: 11, y1: 9, x2: 39, y2: 31 };
            this.northGate = { x: 24, y: 9, w: 2 };  // 北门
            this.southGate = { x: 24, y: 31, w: 2 }; // 南门
            this.gatesClosed = false; // 第4天关闭
    
            // ---- 建筑定义 (安全区内) ----
            this.buildings = [
                { id: 'warehouse', name: '📦仓库',     x: 13, y: 11, w: 6, h: 4, wallColor: GST.C.WALL_WOOD,  roofColor: GST.C.ROOF_BROWN, doorX: 16, doorY: 15, target: 'warehouse' },
                { id: 'medical',   name: '🏥医疗站',   x: 30, y: 11, w: 6, h: 4, wallColor: GST.C.WALL_WHITE, roofColor: GST.C.ROOF_RED,   doorX: 33, doorY: 15, target: 'medical' },
                { id: 'dorm_a',    name: '🏠宿舍A',    x: 13, y: 18, w: 7, h: 5, wallColor: GST.C.WALL_WOOD,  roofColor: GST.C.ROOF_BLUE,  doorX: 16, doorY: 23, target: 'dorm_a' },
                { id: 'dorm_b',    name: '🏠宿舍B',    x: 30, y: 18, w: 7, h: 5, wallColor: GST.C.WALL_WOOD,  roofColor: GST.C.ROOF_GREEN, doorX: 33, doorY: 23, target: 'dorm_b' },
                { id: 'kitchen',   name: '🍳炊事房',   x: 13, y: 26, w: 5, h: 4, wallColor: GST.C.WALL_STONE, roofColor: GST.C.ROOF_RED,   doorX: 15, doorY: 30, target: 'kitchen' },
                { id: 'workshop',  name: '🔧工坊',     x: 21, y: 26, w: 7, h: 4, wallColor: GST.C.WALL_STONE, roofColor: GST.C.ROOF_BROWN, doorX: 24, doorY: 30, target: 'workshop' },
                { id: 'command',   name: '🏛️指挥所',   x: 33, y: 26, w: 4, h: 3, wallColor: GST.C.WALL_STONE, roofColor: GST.C.ROOF_BROWN, doorX: 35, doorY: 29, target: 'command' },
            ];
    
            // 用建筑数据生成 objects (绘制用)
            for (const b of this.buildings) {
                this.objects.push(this._makeBuildingObj(b));
            }
    
            // 主暖炉广场 (露天，中心位置)
            this.furnacePlaza = { x: 22, y: 18, w: 6, h: 4 };
            this.objects.push(this._makeFurnacePlazaObj());
    
            // 户外资源区域渲染对象
            for (const area of this.resourceAreas) {
                this.objects.push(this._makeResourceAreaObj(area));
            }
    
            // 围墙渲染对象
            this.objects.push(this._makeWallObj());
    
            // ---- 门/传送点 ----
            for (const b of this.buildings) {
                if (b.target) {
                    this.triggers.push({
                        x: b.doorX, y: b.doorY, w: 1, h: 1,
                        target: b.target,
                        name: b.name,
                        spawnX: b.doorX, spawnY: b.doorY + 1
                    });
                }
            }
    
            // ---- 地标 (AI 感知用) ----
            this.landmarks = [
                { name: '主暖炉广场', cx: 25, cy: 20, type: 'rect', x1: 22, y1: 18, x2: 28, y2: 22 },
                ...this.buildings.map(b => ({
                    name: b.name.replace(/[^\u4e00-\u9fa5A-Za-z]/g, ''),
                    cx: b.x + b.w / 2,
                    cy: b.y + b.h / 2,
                    type: 'rect',
                    x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h
                })),
                ...this.resourceAreas.map(a => ({
                    name: a.name,
                    cx: a.x + a.w / 2,
                    cy: a.y + a.h / 2,
                    type: 'rect',
                    x1: a.x, y1: a.y, x2: a.x + a.w, y2: a.y + a.h
                })),
                { name: '北门', cx: 25, cy: 9, type: 'rect', x1: 24, y1: 9, x2: 26, y2: 10 },
                { name: '南门', cx: 25, cy: 31, type: 'rect', x1: 24, y1: 31, x2: 26, y2: 32 },
            ];
    
            // ---- 装饰物 ----
            this._addDecorations();
        }
    
        _addDecorations() {
            // 枯树 — 外围雪原散布
            const treePositions = [
                [1,1],[9,1],[1,8],[10,8],
                [39,1],[47,1],[48,7],
                [1,33],[8,37],[1,38],
                [39,38],[47,33],[48,38],
                // 围墙外散落
                [10,15],[10,25],[40,15],[40,25],
            ];
            for (const [x, y] of treePositions) {
                this.decorations.push({
                    type: 'tree', x, y,
                    color: GST.C.TREE_CROWN2, // 枯枝积雪
                    solid: true
                });
            }
    
            // 雪堆 — 围墙内外
            const snowPiles = [
                [20,16],[29,16],[20,24],[29,24],
                [12,20],[37,20],[25,10],[25,30],
            ];
            for (const [x, y] of snowPiles) {
                this.decorations.push({ type: 'snowpile', x, y, label: '雪堆' });
            }
    
            // 冰锥 — 建筑屋檐装饰（纯视觉）
            const icicles = [[14,11],[17,11],[31,11],[34,11],[14,18],[17,18],[31,18],[34,18]];
            for (const [x, y] of icicles) {
                this.decorations.push({ type: 'icicle', x, y });
            }
    
            // 废墟碎片 — 外围区域
            const debris = [[5,10],[44,10],[5,30],[44,30],[15,2],[35,2],[15,37],[35,37]];
            for (const [x, y] of debris) {
                this.decorations.push({ type: 'debris', x, y, label: '废墟碎片', solid: true });
            }
    
            // 围墙内道路旁的路灯 (简易火把)
            const torches = [[20,20],[29,20],[25,16],[25,24]];
            for (const [x, y] of torches) {
                this.decorations.push({ type: 'lamppost', x, y, label: '火把' });
            }
    
            // 告示牌
            this.decorations.push({ type: 'sign', x: 23, y: 16, label: '任务告示栏', solid: true });
        }
    
        /** 绘制单个装饰物（重写父类以支持末日新类型 — 升级版） */
        drawDecoration(ctx, d, px, py) {
            switch (d.type) {
                case 'snowpile':
                    // 雪堆阴影
                    ctx.fillStyle = 'rgba(160,170,185,0.15)';
                    ctx.beginPath();
                    ctx.ellipse(px + 17, py + 28, 15, 4, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 雪堆主体（多层）
                    ctx.fillStyle = '#E0E4EA';
                    ctx.beginPath();
                    ctx.ellipse(px + 16, py + 22, 14, 8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#E8ECF2';
                    ctx.beginPath();
                    ctx.ellipse(px + 14, py + 20, 10, 6, -0.2, 0, Math.PI * 2);
                    ctx.fill();
                    // 雪堆高光
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    ctx.beginPath();
                    ctx.ellipse(px + 12, py + 18, 6, 3, -0.3, 0, Math.PI * 2);
                    ctx.fill();
                    // 雪堆上的细碎冰晶
                    ctx.fillStyle = 'rgba(200,220,240,0.3)';
                    ctx.fillRect(px + 8, py + 16, 2, 2);
                    ctx.fillRect(px + 20, py + 19, 2, 2);
                    break;
                case 'icicle':
                    // 冰锥（更精致，带透明折射效果）
                    for (let i = 0; i < 4; i++) {
                        const ix = px + 4 + i * 7;
                        const ilen = 8 + GST.getTileNoise(d.x * 10 + i, d.y) * 8;
                        // 冰锥主体
                        ctx.fillStyle = 'rgba(180,220,240,0.6)';
                        ctx.beginPath();
                        ctx.moveTo(ix, py);
                        ctx.lineTo(ix + 3, py);
                        ctx.lineTo(ix + 1.5, py + ilen);
                        ctx.closePath();
                        ctx.fill();
                        // 高光
                        ctx.fillStyle = 'rgba(220,240,255,0.4)';
                        ctx.beginPath();
                        ctx.moveTo(ix + 0.5, py + 1);
                        ctx.lineTo(ix + 2, py + 1);
                        ctx.lineTo(ix + 1.5, py + ilen * 0.5);
                        ctx.closePath();
                        ctx.fill();
                    }
                    break;
                case 'debris':
                    // 废墟阴影
                    ctx.fillStyle = 'rgba(60,50,40,0.12)';
                    ctx.fillRect(px + 4, py + 26, 24, 4);
                    // 碎石主体
                    ctx.fillStyle = '#8A7A6A';
                    ctx.fillRect(px + 2, py + 16, 12, 8);
                    ctx.fillRect(px + 8, py + 12, 16, 6);
                    ctx.fillStyle = '#6A5A4A';
                    ctx.fillRect(px + 6, py + 20, 8, 6);
                    // 碎石细节
                    ctx.fillStyle = '#9A8A7A';
                    ctx.fillRect(px + 16, py + 10, 6, 4);
                    // 积雪覆盖
                    ctx.fillStyle = 'rgba(220,224,230,0.4)';
                    ctx.fillRect(px + 3, py + 14, 10, 2);
                    ctx.fillRect(px + 10, py + 10, 12, 2);
                    break;
                default:
                    super.drawDecoration(ctx, d, px, py);
                    break;
            }
        }
    
        _makeBuildingObj(b) {
            return {
                b,
                getSortY() { return (this.b.y + this.b.h) * GST.TILE; },
                draw(ctx) {
                    const px = this.b.x * GST.TILE;
                    const py = this.b.y * GST.TILE;
                    const pw = this.b.w * GST.TILE;
                    const ph = this.b.h * GST.TILE;
    
                    // ★ 优先使用图片素材绘制建筑
                    if (typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled) {
                        // 尝试通过建筑id查找素材
                        const spriteId = this.b.spriteId || this.b.id;
                        if (spriteId && SpriteLoader.drawBuilding(ctx, spriteId, px - 4, py - GST.TILE, pw + 8, ph + GST.TILE)) {
                            // 图片绘制成功，只绘制标签
                            ctx.font = 'bold 9px sans-serif';
                            ctx.textAlign = 'center';
                            const nameText = this.b.name;
                            const nameWidth = ctx.measureText(nameText).width;
                            ctx.fillStyle = 'rgba(0,0,0,0.35)';
                            ctx.beginPath();
                            ctx.roundRect(px + pw / 2 - nameWidth/2 - 4, py - GST.TILE - 8, nameWidth + 8, 12, 3);
                            ctx.fill();
                            ctx.fillStyle = 'rgba(255,255,255,0.85)';
                            ctx.fillText(nameText, px + pw / 2, py - GST.TILE);
                            ctx.textAlign = 'left';
                            return;
                        }
                    }
    
                    // === fallback: 代码绘制 ===
    
                    // === 建筑投影 ===
                    ctx.fillStyle = 'rgba(40,50,60,0.18)';
                    ctx.beginPath();
                    ctx.moveTo(px + 6, py + ph + 2);
                    ctx.lineTo(px + pw + 8, py + ph + 2);
                    ctx.lineTo(px + pw + 12, py + ph + 8);
                    ctx.lineTo(px + 10, py + ph + 8);
                    ctx.closePath();
                    ctx.fill();
    
                    // === 墙体（带纹理） ===
                    const wallTop = py + ph * 0.3;
                    const wallH = ph * 0.7;
                    ctx.fillStyle = this.b.wallColor;
                    ctx.fillRect(px, wallTop, pw, wallH);
                    // 墙体横线纹理（砖/木缝）
                    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                    ctx.lineWidth = 0.5;
                    for (let ly = wallTop + 8; ly < wallTop + wallH - 4; ly += 8) {
                        ctx.beginPath();
                        ctx.moveTo(px + 2, ly);
                        ctx.lineTo(px + pw - 2, ly);
                        ctx.stroke();
                    }
                    // 墙体右侧阴影面
                    ctx.fillStyle = 'rgba(0,0,0,0.08)';
                    ctx.fillRect(px + pw - 6, wallTop, 6, wallH);
                    // 墙基线
                    ctx.fillStyle = 'rgba(60,50,40,0.25)';
                    ctx.fillRect(px, py + ph - 3, pw, 3);
    
                    // === 屋顶（梯形 + 积雪 + 边缘线） ===
                    // 屋顶主体
                    ctx.fillStyle = this.b.roofColor;
                    ctx.beginPath();
                    ctx.moveTo(px - 6, wallTop + 4);
                    ctx.lineTo(px + pw / 2, py - 4);
                    ctx.lineTo(px + pw + 6, wallTop + 4);
                    ctx.closePath();
                    ctx.fill();
                    // 屋顶积雪层
                    ctx.fillStyle = GST.C.ROOF_SNOW;
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.moveTo(px - 2, wallTop);
                    ctx.lineTo(px + pw / 2, py - 2);
                    ctx.lineTo(px + pw + 2, wallTop);
                    ctx.lineTo(px + pw / 2 + 8, py + 6);
                    ctx.lineTo(px + pw / 2 - 8, py + 6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    // 屋顶边缘线
                    ctx.strokeStyle = 'rgba(60,50,40,0.2)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px - 6, wallTop + 4);
                    ctx.lineTo(px + pw / 2, py - 4);
                    ctx.lineTo(px + pw + 6, wallTop + 4);
                    ctx.stroke();
                    // 屋檐底部阴影
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.fillRect(px - 4, wallTop + 2, pw + 8, 3);
    
                    // === 烟囱 ===
                    const chimneyX = px + pw * 0.7;
                    const chimneyY = py + 4;
                    ctx.fillStyle = GST.C.CHIMNEY;
                    ctx.fillRect(chimneyX, chimneyY, 10, 16);
                    ctx.fillStyle = GST.C.CHIMNEY_TOP;
                    ctx.fillRect(chimneyX - 1, chimneyY - 2, 12, 4);
                    // 积雪
                    ctx.fillStyle = 'rgba(230,234,240,0.5)';
                    ctx.fillRect(chimneyX, chimneyY - 3, 10, 2);
                    // 烟雾（动画）
                    let isNight = false;
                    if (typeof window !== 'undefined' && window.game) {
                        const hour = window.game.getHour();
                        isNight = hour >= 19 || hour < 6;
                    }
                    const t = Date.now() / 1000;
                    const smokeAlpha = 0.12 + Math.sin(t * 2) * 0.04;
                    ctx.fillStyle = `rgba(180,190,200,${smokeAlpha})`;
                    ctx.beginPath();
                    ctx.arc(chimneyX + 5 + Math.sin(t) * 3, chimneyY - 8, 5 + Math.sin(t*1.5)*2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = `rgba(180,190,200,${smokeAlpha * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(chimneyX + 3 + Math.sin(t*0.8) * 5, chimneyY - 16, 4 + Math.cos(t)*2, 0, Math.PI * 2);
                    ctx.fill();
    
                    // === 门（带门框） ===
                    const doorPx = this.b.doorX * GST.TILE;
                    const doorPy = (this.b.y + this.b.h - 1) * GST.TILE;
                    // 门框
                    ctx.fillStyle = GST.C.DOOR_FRAME || '#5A3A08';
                    ctx.fillRect(doorPx + 6, doorPy - 2, 20, GST.TILE + 2);
                    // 门
                    ctx.fillStyle = GST.C.DOOR;
                    ctx.fillRect(doorPx + 8, doorPy, 16, GST.TILE);
                    // 门把手
                    ctx.fillStyle = '#C0A060';
                    ctx.fillRect(doorPx + 20, doorPy + 14, 3, 3);
                    // 门上方小窗
                    ctx.fillStyle = isNight ? 'rgba(255,232,128,0.4)' : 'rgba(120,184,216,0.3)';
                    ctx.fillRect(doorPx + 11, doorPy + 2, 10, 6);
    
                    // === 窗户（带窗框 + 窗台） ===
                    const winY = py + ph * 0.45;
                    const winCount = Math.max(1, Math.floor(this.b.w / 3));
                    const winSpacing = pw / (winCount + 1);
    
                    for (let i = 1; i <= winCount; i++) {
                        const wx = px + winSpacing * i - 7;
                        // 窗框
                        ctx.fillStyle = GST.C.WINDOW_FRAME || '#606058';
                        ctx.fillRect(wx - 1, winY - 1, 14, 12);
                        // 窗玻璃
                        ctx.fillStyle = isNight ? GST.C.WINDOW_LIT : GST.C.WINDOW;
                        ctx.fillRect(wx, winY, 12, 10);
                        // 十字窗格
                        ctx.strokeStyle = GST.C.WINDOW_FRAME || '#606058';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(wx + 6, winY);
                        ctx.lineTo(wx + 6, winY + 10);
                        ctx.moveTo(wx, winY + 5);
                        ctx.lineTo(wx + 12, winY + 5);
                        ctx.stroke();
                        // 窗台
                        ctx.fillStyle = 'rgba(200,196,190,0.6)';
                        ctx.fillRect(wx - 2, winY + 10, 16, 3);
                        // 窗台积雪
                        ctx.fillStyle = 'rgba(230,234,240,0.5)';
                        ctx.fillRect(wx - 1, winY + 9, 14, 2);
                    }
    
                    // 夜间窗户灯光溢出
                    if (isNight) {
                        for (let i = 1; i <= winCount; i++) {
                            const grad = ctx.createRadialGradient(
                                px + winSpacing * i, winY + 5, 2,
                                px + winSpacing * i, winY + 5, 20
                            );
                            grad.addColorStop(0, 'rgba(255,232,128,0.15)');
                            grad.addColorStop(1, 'rgba(255,232,128,0)');
                            ctx.fillStyle = grad;
                            ctx.fillRect(px + winSpacing * i - 20, winY - 15, 40, 40);
                        }
                        // 门口灯光
                        const doorGrad = ctx.createRadialGradient(
                            doorPx + 16, doorPy + GST.TILE, 2,
                            doorPx + 16, doorPy + GST.TILE + 8, 24
                        );
                        doorGrad.addColorStop(0, 'rgba(255,220,120,0.12)');
                        doorGrad.addColorStop(1, 'rgba(255,220,120,0)');
                        ctx.fillStyle = doorGrad;
                        ctx.fillRect(doorPx - 8, doorPy + 8, 48, 32);
                    }
    
                    // === 建筑名标签（带背景） ===
                    ctx.font = 'bold 9px sans-serif';
                    ctx.textAlign = 'center';
                    const nameText = this.b.name;
                    const nameWidth = ctx.measureText(nameText).width;
                    // 标签底板
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    const labelX = px + pw / 2;
                    const labelY = py - 8;
                    ctx.beginPath();
                    ctx.roundRect(labelX - nameWidth/2 - 4, labelY - 8, nameWidth + 8, 12, 3);
                    ctx.fill();
                    // 标签文字
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.fillText(nameText, labelX, labelY);
                    ctx.textAlign = 'left';
                }
            };
        }
    
        /** 主暖炉广场渲染对象 — 升级版 */
        _makeFurnacePlazaObj() {
            const fp = this.furnacePlaza;
            return {
                fp,
                isGround: true,
                getSortY() { return (this.fp.y + this.fp.h) * GST.TILE; },
                draw(ctx) {
                    const px = this.fp.x * GST.TILE;
                    const py = this.fp.y * GST.TILE;
                    const pw = this.fp.w * GST.TILE;
                    const ph = this.fp.h * GST.TILE;
    
                    // ★ 底图模式：静态部分已烘焙进底图，只绘制动态火焰+光晕
                    const _hasBaseMap = typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled && SpriteLoader.getMap('village_base');
                    if (_hasBaseMap) {
                        const cx = px + pw / 2;
                        const cy = py + ph / 2;
                        // 火焰动画
                        const t = Date.now() / 200;
                        const flicker = Math.sin(t) * 3;
                        const flicker2 = Math.cos(t * 1.3) * 2;
                        ctx.fillStyle = 'rgba(200,60,10,0.35)';
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, 16 + flicker, 20 + flicker, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(255,120,20,0.55)';
                        ctx.beginPath();
                        ctx.ellipse(cx, cy - 2, 12 + flicker * 0.8, 16 + flicker * 0.8, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(255,200,50,0.75)';
                        ctx.beginPath();
                        ctx.ellipse(cx, cy - 2, 7 + flicker2, 10 + flicker2, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(255,240,200,0.5)';
                        ctx.beginPath();
                        ctx.ellipse(cx, cy - 1, 3, 5, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 火星
                        ctx.fillStyle = 'rgba(255,180,60,0.6)';
                        for (let i = 0; i < 3; i++) {
                            const sx = cx + Math.sin(t * 2 + i * 2) * 8;
                            const sy = cy - 10 - Math.abs(Math.sin(t * 3 + i)) * 12;
                            ctx.beginPath();
                            ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // 暖光辐射
                        const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 100);
                        grad.addColorStop(0, 'rgba(255,180,60,0.2)');
                        grad.addColorStop(0.5, 'rgba(255,150,40,0.06)');
                        grad.addColorStop(1, 'rgba(255,180,60,0)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(cx - 100, cy - 100, 200, 200);
                        return; // 跳过完整绘制
                    }
    
                    // 广场石砖底座
                    ctx.fillStyle = GST.C.PLAZA;
                    ctx.fillRect(px, py, pw, ph);
                    // 石砖纹理
                    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                    ctx.lineWidth = 0.5;
                    for (let by = py; by < py + ph; by += 16) {
                        ctx.beginPath();
                        ctx.moveTo(px, by);
                        ctx.lineTo(px + pw, by);
                        ctx.stroke();
                        const offset = ((by - py) / 16 % 2) * 8;
                        for (let bx = px + offset; bx < px + pw; bx += 16) {
                            ctx.beginPath();
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx, by + 16);
                            ctx.stroke();
                        }
                    }
                    // 广场边缘装饰线
                    ctx.strokeStyle = 'rgba(120,110,100,0.2)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 3]);
                    ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
                    ctx.setLineDash([]);
    
                    // 暖炉主体（更丰富的结构）
                    const cx = px + pw / 2;
                    const cy = py + ph / 2;
                    // 暖炉底座
                    ctx.fillStyle = '#484848';
                    ctx.fillRect(cx - 24, cy - 18, 48, 36);
                    // 暖炉主体
                    ctx.fillStyle = '#3A3A3A';
                    ctx.fillRect(cx - 20, cy - 14, 40, 28);
                    // 暖炉顶盖
                    ctx.fillStyle = '#505050';
                    ctx.fillRect(cx - 22, cy - 18, 44, 6);
                    // 暖炉排气管
                    ctx.fillStyle = '#444';
                    ctx.fillRect(cx + 10, cy - 26, 6, 12);
                    // 暖炉铆钉装饰
                    ctx.fillStyle = '#707070';
                    const rivets = [[-16,-10],[-16,6],[16,-10],[16,6]];
                    for (const [rx,ry] of rivets) {
                        ctx.beginPath();
                        ctx.arc(cx + rx, cy + ry, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // 暖炉开口（火焰可见处）
                    ctx.fillStyle = '#2A1A0A';
                    ctx.fillRect(cx - 12, cy - 6, 24, 18);
    
                    // 火焰动画（多层，更丰富）
                    const t = Date.now() / 200;
                    const flicker = Math.sin(t) * 3;
                    const flicker2 = Math.cos(t * 1.3) * 2;
                    // 最外层——红焰
                    ctx.fillStyle = 'rgba(200,60,10,0.35)';
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, 16 + flicker, 20 + flicker, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 外焰——橙色
                    ctx.fillStyle = 'rgba(255,120,20,0.55)';
                    ctx.beginPath();
                    ctx.ellipse(cx, cy - 2, 12 + flicker * 0.8, 16 + flicker * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 内焰——黄色
                    ctx.fillStyle = 'rgba(255,200,50,0.75)';
                    ctx.beginPath();
                    ctx.ellipse(cx, cy - 2, 7 + flicker2, 10 + flicker2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 核心白热
                    ctx.fillStyle = 'rgba(255,240,200,0.5)';
                    ctx.beginPath();
                    ctx.ellipse(cx, cy - 1, 3, 5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 火星粒子
                    ctx.fillStyle = 'rgba(255,180,60,0.6)';
                    for (let i = 0; i < 3; i++) {
                        const sx = cx + Math.sin(t * 2 + i * 2) * 8;
                        const sy = cy - 10 - Math.abs(Math.sin(t * 3 + i)) * 12;
                        ctx.beginPath();
                        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
    
                    // 暖光辐射（更大范围）
                    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 100);
                    grad.addColorStop(0, 'rgba(255,180,60,0.2)');
                    grad.addColorStop(0.5, 'rgba(255,150,40,0.06)');
                    grad.addColorStop(1, 'rgba(255,180,60,0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(cx - 100, cy - 100, 200, 200);
    
                    // 标签（带背景）
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    const label = '🔥 主暖炉';
                    const lw = ctx.measureText(label).width;
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath();
                    ctx.roundRect(cx - lw/2 - 4, py - 14, lw + 8, 14, 3);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,200,80,0.9)';
                    ctx.fillText(label, cx, py - 4);
                    ctx.textAlign = 'left';
                }
            };
        }
    
        /** 户外资源区域渲染对象 */
        _makeResourceAreaObj(area) {
            return {
                area,
                isGround: true,
                getSortY() { return (this.area.y + this.area.h) * GST.TILE; },
                draw(ctx) {
                    // ★ 底图模式：资源区域已烘焙进底图，跳过绘制
                    if (typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled && SpriteLoader.getMap('village_base')) return;
    
                    const px = this.area.x * GST.TILE;
                    const py = this.area.y * GST.TILE;
                    const pw = this.area.w * GST.TILE;
                    const ph = this.area.h * GST.TILE;
    
                    // 区域底色（渐变）
                    const areaGrad = ctx.createRadialGradient(
                        px + pw/2, py + ph/2, 10,
                        px + pw/2, py + ph/2, Math.max(pw, ph) * 0.6
                    );
                    areaGrad.addColorStop(0, this.area.color);
                    areaGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = areaGrad;
                    ctx.globalAlpha = 0.25;
                    ctx.fillRect(px, py, pw, ph);
                    ctx.globalAlpha = 1;
    
                    // 边框（带角装饰）
                    ctx.strokeStyle = this.area.color;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 4]);
                    ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
                    ctx.setLineDash([]);
                    // 角落标记
                    ctx.fillStyle = this.area.color;
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(px + 2, py + 2, 8, 2);
                    ctx.fillRect(px + 2, py + 2, 2, 8);
                    ctx.fillRect(px + pw - 10, py + 2, 8, 2);
                    ctx.fillRect(px + pw - 4, py + 2, 2, 8);
                    ctx.fillRect(px + 2, py + ph - 4, 8, 2);
                    ctx.fillRect(px + 2, py + ph - 10, 2, 8);
                    ctx.fillRect(px + pw - 10, py + ph - 4, 8, 2);
                    ctx.fillRect(px + pw - 4, py + ph - 10, 2, 8);
                    ctx.globalAlpha = 1;
    
                    // 区域特色装饰
                    if (this.area.id === 'lumber_camp') {
                        // 伐木场 — 树桩+斧头+原木堆
                        for (let i = 0; i < 4; i++) {
                            const sx = px + 16 + (i % 2) * 60;
                            const sy = py + 20 + Math.floor(i / 2) * 50;
                            // 树桩阴影
                            ctx.fillStyle = 'rgba(60,50,40,0.12)';
                            ctx.beginPath();
                            ctx.ellipse(sx + 8, sy + 14, 12, 4, 0, 0, Math.PI * 2);
                            ctx.fill();
                            // 树桩主体
                            ctx.fillStyle = GST.C.TREE_TRUNK;
                            ctx.fillRect(sx, sy, 16, 12);
                            // 年轮顶面
                            ctx.fillStyle = '#B8A088';
                            ctx.beginPath();
                            ctx.ellipse(sx + 8, sy, 10, 6, 0, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(100,80,60,0.3)';
                            ctx.lineWidth = 0.5;
                            ctx.beginPath();
                            ctx.ellipse(sx + 8, sy, 6, 3, 0, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.ellipse(sx + 8, sy, 3, 1.5, 0, 0, Math.PI * 2);
                            ctx.stroke();
                            // 积雪
                            ctx.fillStyle = 'rgba(230,234,240,0.4)';
                            ctx.beginPath();
                            ctx.ellipse(sx + 6, sy - 2, 6, 3, 0, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // 原木堆
                        ctx.fillStyle = '#7B5828';
                        ctx.fillRect(px + pw - 60, py + 20, 40, 14);
                        ctx.fillStyle = '#6B4820';
                        ctx.fillRect(px + pw - 58, py + 34, 36, 12);
                        ctx.fillStyle = 'rgba(230,234,240,0.3)';
                        ctx.fillRect(px + pw - 60, py + 18, 40, 3);
                    } else if (this.area.id === 'ruins_site') {
                        // 废墟 — 碎石堆+断墙+钢筋
                        ctx.fillStyle = '#8A7A6A';
                        ctx.fillRect(px + 20, py + 20, 40, 20);
                        ctx.fillRect(px + 80, py + 40, 40, 25);
                        ctx.fillStyle = '#6A5A4A';
                        ctx.fillRect(px + 50, py + 10, 20, 30);
                        // 断墙
                        ctx.fillStyle = '#7A726A';
                        ctx.fillRect(px + 120, py + 15, 8, 40);
                        ctx.fillStyle = '#6A625A';
                        ctx.fillRect(px + 128, py + 25, 6, 20);
                        // 钢筋
                        ctx.strokeStyle = '#808080';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(px + 126, py + 15);
                        ctx.lineTo(px + 130, py + 5);
                        ctx.moveTo(px + 122, py + 12);
                        ctx.lineTo(px + 118, py + 2);
                        ctx.stroke();
                        // 积雪
                        ctx.fillStyle = 'rgba(220,224,230,0.35)';
                        ctx.fillRect(px + 22, py + 18, 36, 3);
                        ctx.fillRect(px + 82, py + 38, 36, 3);
                        ctx.fillRect(px + 120, py + 13, 8, 3);
                    } else if (this.area.id === 'frozen_lake') {
                        // 冰湖 — 更丰富的冰面效果
                        // 湖岸
                        ctx.fillStyle = 'rgba(160,170,180,0.2)';
                        ctx.beginPath();
                        ctx.ellipse(px + pw/2, py + ph/2, pw/2 - 4, ph/2 - 4, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 冰面主体
                        const iceGrad = ctx.createRadialGradient(
                            px + pw/2 - 10, py + ph/2 - 10, 10,
                            px + pw/2, py + ph/2, pw/2 - 10
                        );
                        iceGrad.addColorStop(0, '#C8E0F0');
                        iceGrad.addColorStop(0.5, '#B8D4E8');
                        iceGrad.addColorStop(1, '#A0C0D8');
                        ctx.fillStyle = iceGrad;
                        ctx.beginPath();
                        ctx.ellipse(px + pw/2, py + ph/2, pw/2 - 8, ph/2 - 8, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 冰面高光
                        ctx.fillStyle = 'rgba(220,240,255,0.25)';
                        ctx.beginPath();
                        ctx.ellipse(px + pw/2 - 15, py + ph/2 - 15, 20, 12, -0.3, 0, Math.PI * 2);
                        ctx.fill();
                        // 冰裂纹（多条）
                        ctx.strokeStyle = 'rgba(180,210,230,0.3)';
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(px + pw/2 - 30, py + ph/2 + 5);
                        ctx.lineTo(px + pw/2 + 25, py + ph/2 - 15);
                        ctx.moveTo(px + pw/2 - 5, py + ph/2 - 20);
                        ctx.lineTo(px + pw/2 + 15, py + ph/2 + 20);
                        ctx.moveTo(px + pw/2 + 10, py + ph/2 - 10);
                        ctx.lineTo(px + pw/2 + 30, py + ph/2 + 5);
                        ctx.stroke();
                        // 冰钓洞（小）
                        ctx.fillStyle = '#708090';
                        ctx.beginPath();
                        ctx.arc(px + pw/2 + 20, py + ph/2 + 10, 4, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (this.area.id === 'ore_pile') {
                        // 矿渣堆 — 各色矿石+矿车
                        const oreColors = ['#6A6A6A', '#7A7A6A', '#5A6A6A', '#6A5A5A', '#7A6A5A'];
                        for (let i = 0; i < 6; i++) {
                            const ox = px + 18 + (i * 42) % (pw - 36);
                            const oy = py + 22 + Math.floor(i / 3) * 44;
                            const r = 8 + (i % 3) * 3;
                            // 阴影
                            ctx.fillStyle = 'rgba(40,40,40,0.1)';
                            ctx.beginPath();
                            ctx.ellipse(ox, oy + r + 2, r + 2, 3, 0, 0, Math.PI * 2);
                            ctx.fill();
                            // 石头
                            ctx.fillStyle = oreColors[i % oreColors.length];
                            ctx.beginPath();
                            ctx.arc(ox, oy, r, 0, Math.PI * 2);
                            ctx.fill();
                            // 高光
                            ctx.fillStyle = 'rgba(200,200,200,0.15)';
                            ctx.beginPath();
                            ctx.arc(ox - 2, oy - 2, r * 0.4, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // 小矿车轮廓
                        ctx.fillStyle = '#505050';
                        ctx.fillRect(px + pw - 50, py + ph - 30, 30, 16);
                        ctx.fillStyle = '#606060';
                        ctx.fillRect(px + pw - 48, py + ph - 28, 26, 12);
                        // 车轮
                        ctx.fillStyle = '#404040';
                        ctx.beginPath();
                        ctx.arc(px + pw - 44, py + ph - 12, 4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(px + pw - 26, py + ph - 12, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
    
                    // 区域名称标签（带背景板）
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    const nameText = this.area.name;
                    const nameW = ctx.measureText(nameText).width;
                    // 标签底板
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath();
                    ctx.roundRect(px + pw/2 - nameW/2 - 5, py + ph + 4, nameW + 10, 14, 3);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.fillText(nameText, px + pw / 2, py + ph + 14);
                    // 危险等级
                    const dangerColor = this.area.danger === '高' ? '#FF6060' : '#F0C050';
                    const dangerBg = this.area.danger === '高' ? 'rgba(255,60,60,0.15)' : 'rgba(240,192,80,0.12)';
                    const dangerText = `⚠ 危险:${this.area.danger}`;
                    const dangerW = ctx.measureText(dangerText).width;
                    ctx.fillStyle = dangerBg;
                    ctx.beginPath();
                    ctx.roundRect(px + pw/2 - dangerW/2 - 4, py + ph + 18, dangerW + 8, 12, 3);
                    ctx.fill();
                    ctx.fillStyle = dangerColor;
                    ctx.font = '9px sans-serif';
                    ctx.fillText(dangerText, px + pw / 2, py + ph + 27);
                    ctx.textAlign = 'left';
                }
            };
        }
    
        /** 围墙渲染对象 — 升级版（石砖纹理+积雪+瞭望塔） */
        _makeWallObj() {
            const wb = this.wallBounds;
            const ng = this.northGate;
            const sg = this.southGate;
            const self = this;
            return {
                getSortY() { return wb.y2 * GST.TILE; },
                draw(ctx) {
                    // ★ 底图模式：围墙已烘焙进底图，跳过绘制
                    if (typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled && SpriteLoader.getMap('village_base')) return;
    
                    const wallColor = '#706858';
                    const wallTopColor = '#5A4A3A';
                    const snowColor = 'rgba(230,234,240,0.5)';
                    const lineW = 4;
    
                    // 绘制围墙四边（留出大门）— 带石砖纹理
                    const drawWallSegment = (x1, y1, w, h) => {
                        // 主墙体
                        ctx.fillStyle = wallColor;
                        ctx.fillRect(x1, y1, w, h);
                        // 砖缝纹理
                        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                        ctx.lineWidth = 0.5;
                        if (w > h) {
                            // 水平墙
                            for (let bx = x1; bx < x1 + w; bx += 12) {
                                ctx.beginPath();
                                ctx.moveTo(bx, y1);
                                ctx.lineTo(bx, y1 + h);
                                ctx.stroke();
                            }
                        } else {
                            // 垂直墙
                            for (let by = y1; by < y1 + h; by += 12) {
                                ctx.beginPath();
                                ctx.moveTo(x1, by);
                                ctx.lineTo(x1 + w, by);
                                ctx.stroke();
                            }
                        }
                        // 顶部积雪
                        ctx.fillStyle = snowColor;
                        if (w > h) {
                            ctx.fillRect(x1, y1 - 2, w, 3);
                        } else {
                            ctx.fillRect(x1 - 1, y1, 2, h);
                        }
                    };
    
                    // 北墙 — 留北门
                    drawWallSegment(wb.x1 * GST.TILE, wb.y1 * GST.TILE - 2, (ng.x - wb.x1) * GST.TILE, lineW + 4);
                    drawWallSegment((ng.x + ng.w) * GST.TILE, wb.y1 * GST.TILE - 2, (wb.x2 - ng.x - ng.w) * GST.TILE, lineW + 4);
                    // 南墙 — 留南门
                    drawWallSegment(wb.x1 * GST.TILE, wb.y2 * GST.TILE - 2, (sg.x - wb.x1) * GST.TILE, lineW + 4);
                    drawWallSegment((sg.x + sg.w) * GST.TILE, wb.y2 * GST.TILE - 2, (wb.x2 - sg.x - sg.w) * GST.TILE, lineW + 4);
                    // 西墙
                    drawWallSegment(wb.x1 * GST.TILE - 2, wb.y1 * GST.TILE, lineW + 4, (wb.y2 - wb.y1) * GST.TILE);
                    // 东墙
                    drawWallSegment(wb.x2 * GST.TILE - 2, wb.y1 * GST.TILE, lineW + 4, (wb.y2 - wb.y1) * GST.TILE);
    
                    // 围墙柱子 (每隔3格) — 带积雪顶
                    ctx.fillStyle = wallTopColor;
                    for (let x = wb.x1; x <= wb.x2; x += 3) {
                        if (x < ng.x || x >= ng.x + ng.w) {
                            ctx.fillStyle = wallTopColor;
                            ctx.fillRect(x * GST.TILE - 3, wb.y1 * GST.TILE - 8, 8, 14);
                            ctx.fillStyle = snowColor;
                            ctx.fillRect(x * GST.TILE - 3, wb.y1 * GST.TILE - 10, 8, 3);
                        }
                        if (x < sg.x || x >= sg.x + sg.w) {
                            ctx.fillStyle = wallTopColor;
                            ctx.fillRect(x * GST.TILE - 3, wb.y2 * GST.TILE - 8, 8, 14);
                            ctx.fillStyle = snowColor;
                            ctx.fillRect(x * GST.TILE - 3, wb.y2 * GST.TILE - 10, 8, 3);
                        }
                    }
                    for (let y = wb.y1; y <= wb.y2; y += 3) {
                        ctx.fillStyle = wallTopColor;
                        ctx.fillRect(wb.x1 * GST.TILE - 8, y * GST.TILE - 3, 14, 8);
                        ctx.fillRect(wb.x2 * GST.TILE - 6, y * GST.TILE - 3, 14, 8);
                    }
    
                    // === 四角瞭望塔 ===
                    const drawTower = (tx, ty) => {
                        // 塔身
                        ctx.fillStyle = '#605848';
                        ctx.fillRect(tx - 8, ty - 8, 18, 18);
                        // 塔顶
                        ctx.fillStyle = '#504838';
                        ctx.fillRect(tx - 10, ty - 12, 22, 6);
                        // 积雪
                        ctx.fillStyle = snowColor;
                        ctx.fillRect(tx - 10, ty - 14, 22, 3);
                        // 垛口
                        ctx.fillStyle = '#504838';
                        for (let i = 0; i < 3; i++) {
                            ctx.fillRect(tx - 8 + i * 7, ty - 16, 4, 4);
                        }
                    };
                    drawTower(wb.x1 * GST.TILE, wb.y1 * GST.TILE);
                    drawTower(wb.x2 * GST.TILE, wb.y1 * GST.TILE);
                    drawTower(wb.x1 * GST.TILE, wb.y2 * GST.TILE);
                    drawTower(wb.x2 * GST.TILE, wb.y2 * GST.TILE);
    
                    // === 大门渲染（升级版：门楼结构） ===
                    const gateColor = self.gatesClosed ? '#5A3020' : '#8B6830';
                    const gateLabel = self.gatesClosed ? '🔒' : '🚪';
    
                    // 北门门楼
                    const ngPx = ng.x * GST.TILE;
                    const ngPy = wb.y1 * GST.TILE;
                    // 门楼柱
                    ctx.fillStyle = wallTopColor;
                    ctx.fillRect(ngPx - 4, ngPy - 14, 6, 20);
                    ctx.fillRect(ngPx + ng.w * GST.TILE - 2, ngPy - 14, 6, 20);
                    // 门楼横梁
                    ctx.fillStyle = wallTopColor;
                    ctx.fillRect(ngPx - 4, ngPy - 16, ng.w * GST.TILE + 8, 5);
                    // 积雪
                    ctx.fillStyle = snowColor;
                    ctx.fillRect(ngPx - 4, ngPy - 18, ng.w * GST.TILE + 8, 3);
                    // 门板
                    ctx.fillStyle = gateColor;
                    ctx.fillRect(ngPx, ngPy - 4, ng.w * GST.TILE, 8);
                    // 门铁条装饰
                    ctx.strokeStyle = 'rgba(80,70,60,0.4)';
                    ctx.lineWidth = 1;
                    for (let gx = ngPx + 4; gx < ngPx + ng.w * GST.TILE; gx += 8) {
                        ctx.beginPath();
                        ctx.moveTo(gx, ngPy - 4);
                        ctx.lineTo(gx, ngPy + 4);
                        ctx.stroke();
                    }
                    // 标签
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${gateLabel}北门`, (ng.x + ng.w / 2) * GST.TILE, ngPy - 22);
    
                    // 南门门楼 (同北门镜像)
                    const sgPx = sg.x * GST.TILE;
                    const sgPy = wb.y2 * GST.TILE;
                    ctx.fillStyle = wallTopColor;
                    ctx.fillRect(sgPx - 4, sgPy - 6, 6, 20);
                    ctx.fillRect(sgPx + sg.w * GST.TILE - 2, sgPy - 6, 6, 20);
                    ctx.fillStyle = wallTopColor;
                    ctx.fillRect(sgPx - 4, sgPy - 8, sg.w * GST.TILE + 8, 5);
                    ctx.fillStyle = snowColor;
                    ctx.fillRect(sgPx - 4, sgPy - 10, sg.w * GST.TILE + 8, 3);
                    ctx.fillStyle = gateColor;
                    ctx.fillRect(sgPx, sgPy - 4, sg.w * GST.TILE, 8);
                    ctx.strokeStyle = 'rgba(80,70,60,0.4)';
                    ctx.lineWidth = 1;
                    for (let gx = sgPx + 4; gx < sgPx + sg.w * GST.TILE; gx += 8) {
                        ctx.beginPath();
                        ctx.moveTo(gx, sgPy - 4);
                        ctx.lineTo(gx, sgPy + 4);
                        ctx.stroke();
                    }
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText(`${gateLabel}南门`, (sg.x + sg.w / 2) * GST.TILE, sgPy - 14);
                    ctx.textAlign = 'left';
                }
            };
        }
    
        getTileColor(x, y) {
            if (x < 0 || y < 0 || x >= this.width || y >= this.height) return GST.C.GRASS_DARK;
    
            const wb = this.wallBounds;
            const n = GST.getTileNoise(x, y);
    
            // 围墙内 — 安全区
            if (x >= wb.x1 && x <= wb.x2 && y >= wb.y1 && y <= wb.y2) {
                // 主暖炉广场区域
                const fp = this.furnacePlaza;
                if (x >= fp.x && x < fp.x + fp.w && y >= fp.y && y < fp.y + fp.h) return GST.C.PLAZA;
    
                // 安全区内道路 — 十字主路（踩踏痕迹变化）
                if (y >= 20 && y <= 21 && x >= wb.x1 + 1 && x <= wb.x2 - 1) {
                    return n > 0.6 ? GST.C.PATH_DARK : GST.C.PATH;
                }
                if (x >= 24 && x <= 26 && y >= wb.y1 + 1 && y <= wb.y2 - 1) {
                    return n > 0.6 ? GST.C.PATH_DARK : GST.C.PATH;
                }
    
                // 通往各建筑的小路
                if (x >= 15 && x <= 17 && y >= 15 && y <= 17) return n > 0.5 ? '#988878' : GST.C.DIRT;
                if (x >= 32 && x <= 34 && y >= 15 && y <= 17) return n > 0.5 ? '#988878' : GST.C.DIRT;
                if (x >= 15 && x <= 17 && y >= 24 && y <= 25) return n > 0.5 ? '#988878' : GST.C.DIRT;
                if (x >= 22 && x <= 26 && y >= 24 && y <= 25) return n > 0.5 ? '#988878' : GST.C.DIRT;
    
                // 建筑物周围 — 泥雪混合（靠近建筑的地面会有脏雪）
                for (const b of this.buildings) {
                    const bx1 = b.x - 1, by1 = b.y - 1, bx2 = b.x + b.w, by2 = b.y + b.h;
                    if (x >= bx1 && x <= bx2 && y >= by1 && y <= by2) {
                        // 在建筑紧邻一圈
                        if (x === bx1 || x === bx2 || y === by1 || y === by2) {
                            return n > 0.5 ? '#C8C4BC' : '#D0CCC4';
                        }
                    }
                }
    
                // 安全区内默认 — 基于噪声的平滑雪地渐变（消除棋盘格）
                if (n < 0.25) return GST.C.GRASS_LIGHT;
                if (n > 0.75) return GST.C.GRASS_DARK;
                // 中间区域：使用噪声插值出柔和的中间色
                return GST.blendColors(GST.C.GRASS, GST.C.GRASS_DARK, n * 0.3);
            }
    
            // 围墙线上 — 地面仍为雪地，围墙线条由 _makeWallObj.draw() 叠加绘制
            // （不再返回 GST.C.FENCE，避免整格 32px 都变成暗色造成脏乱感）
            if ((x === wb.x1 || x === wb.x2) && y >= wb.y1 && y <= wb.y2) {
                return GST.blendColors(GST.C.GRASS, GST.C.GRASS_DARK, GST.getTileNoise(x, y) * 0.3);
            }
            if ((y === wb.y1 || y === wb.y2) && x >= wb.x1 && x <= wb.x2) {
                return GST.blendColors(GST.C.GRASS, GST.C.GRASS_DARK, GST.getTileNoise(x, y) * 0.3);
            }
    
            // 户外资源区域
            for (const area of this.resourceAreas) {
                if (x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h) {
                    if (area.id === 'frozen_lake') {
                        // 冰面渐变
                        const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
                        const dist = Math.sqrt((x-cx)*(x-cx) + (y-cy)*(y-cy));
                        return dist < 2 ? GST.C.WATER_DEEP : GST.C.WATER;
                    }
                    // 其他资源区 — 冻土+碎石
                    return n > 0.6 ? '#988070' : GST.C.DIRT;
                }
            }
    
            // 外围雪原 — 基于噪声的平滑渐变
            if (n < 0.2) return GST.C.GRASS_LIGHT;  // 新鲜积雪
            if (n > 0.8) return GST.C.GRASS_DARK;   // 被风吹过的深色雪
            // 中间区域用噪声插值，避免棋盘格
            return GST.blendColors(GST.C.GRASS, GST.C.GRASS_DARK, n * 0.4);
        }
    
        isSolid(px, py) {
            const gx = px / GST.TILE;
            const gy = py / GST.TILE;
    
            // 地图边界
            if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return true;
    
            const igx = Math.floor(gx);
            const igy = Math.floor(gy);
            const wb = this.wallBounds;
    
            // 围墙碰撞（排除大门位置）
            // 北墙
            if (igy === wb.y1 && igx >= wb.x1 && igx <= wb.x2) {
                if (igx >= this.northGate.x && igx < this.northGate.x + this.northGate.w) {
                    if (this.gatesClosed) return true; // 大门关闭
                } else {
                    return true;
                }
            }
            // 南墙
            if (igy === wb.y2 && igx >= wb.x1 && igx <= wb.x2) {
                if (igx >= this.southGate.x && igx < this.southGate.x + this.southGate.w) {
                    if (this.gatesClosed) return true;
                } else {
                    return true;
                }
            }
            // 西墙
            if (igx === wb.x1 && igy >= wb.y1 && igy <= wb.y2) return true;
            // 东墙
            if (igx === wb.x2 && igy >= wb.y1 && igy <= wb.y2) return true;
    
            // 建筑碰撞 (不含门口那格)
            for (const b of this.buildings) {
                if (gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) {
                    if (Math.floor(gx) === b.doorX && Math.floor(gy) === b.doorY) continue;
                    return true;
                }
            }
    
            // 主暖炉广场中心（暖炉主体不可穿过，但周围可走）
            const fp = this.furnacePlaza;
            const furnaceCenterX = fp.x + fp.w / 2;
            const furnaceCenterY = fp.y + fp.h / 2;
            const dx = gx - furnaceCenterX;
            const dy = gy - furnaceCenterY;
            if (dx * dx + dy * dy < 1.8 * 1.8) return true;
    
            // 装饰物碰撞
            for (const dec of this.decorations) {
                if (dec.solid && igx === dec.x && igy === dec.y) return true;
            }
    
            return false;
        }
    
        /** 判断坐标是否在安全区内 */
        isInsideWalls(gx, gy) {
            const wb = this.wallBounds;
            return gx > wb.x1 && gx < wb.x2 && gy > wb.y1 && gy < wb.y2;
        }
    
        /** 判断坐标是否在暖炉附近 */
        isNearFurnace(gx, gy, radius) {
            radius = radius || 5;
            const fp = this.furnacePlaza;
            const cx = fp.x + fp.w / 2;
            const cy = fp.y + fp.h / 2;
            const dx = gx - cx;
            const dy = gy - cy;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        }
    
        describe(gx, gy) {
            let desc = '你在末日据点户外。';
            const wb = this.wallBounds;
    
            // 判断区域
            if (this.isInsideWalls(gx, gy)) {
                desc = '你在据点围墙内的安全区。';
                if (this.isNearFurnace(gx, gy, 4)) {
                    desc += '主暖炉就在旁边，温暖的火光驱散了一些寒意。';
                }
            } else {
                desc = '你在围墙外的危险区域，寒风刺骨！';
                // 检查是否在资源区
                for (const area of this.resourceAreas) {
                    if (gx >= area.x && gx < area.x + area.w && gy >= area.y && gy < area.y + area.h) {
                        desc = `你在${area.name}，正在进行资源采集。危险等级:${area.danger}。`;
                        break;
                    }
                }
            }
    
            // 找最近的地标
            const sorted = this.landmarks.map(lm => {
                const dist = Math.floor(Math.sqrt(Math.pow(gx - lm.cx, 2) + Math.pow(gy - lm.cy, 2)));
                const dir = this._dir(gx, gy, lm.cx, lm.cy);
                return { name: lm.name, dist, dir };
            }).sort((a, b) => a.dist - b.dist);
    
            if (sorted[0] && sorted[0].dist < 4) desc += `${sorted[0].name}就在附近。`;
            sorted.slice(1, 3).forEach(l => {
                if (l.dist < 20) desc += `${l.name}在${l.dir}方约${l.dist}格。`;
            });
    
            return desc;
        }
    
        getInterestPoints(gx, gy) {
            const pts = [];
            // 建筑门口
            for (const b of this.buildings) {
                if (b.target) {
                    pts.push({
                        x: b.doorX, y: b.doorY + 1,
                        name: b.name.replace(/[^\u4e00-\u9fa5A-Za-z]/g, ''),
                        desc: `进入${b.name}`,
                        walkTo: { x: b.doorX, y: b.doorY + 1 }
                    });
                }
            }
            // 暖炉广场
            pts.push({ x: 25, y: 21, name: '主暖炉', desc: '去暖炉旁取暖', walkTo: { x: 25, y: 21 } });
            // 大门
            pts.push({ x: 25, y: 10, name: '北门', desc: '前往北门', walkTo: { x: 25, y: 10 } });
            pts.push({ x: 25, y: 30, name: '南门', desc: '前往南门', walkTo: { x: 25, y: 30 } });
            // 户外资源区
            for (const area of this.resourceAreas) {
                pts.push({
                    x: area.x + Math.floor(area.w / 2),
                    y: area.y + Math.floor(area.h / 2),
                    name: area.name,
                    desc: `前往${area.name}采集`,
                    walkTo: { x: area.x + Math.floor(area.w / 2), y: area.y + Math.floor(area.h / 2) }
                });
            }
            return pts;
        }
    }

    GST.VillageMap = VillageMap;
})();
