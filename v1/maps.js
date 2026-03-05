/**
 * 福音镇 - 地图系统
 * 包含 BaseMap 基类 + VillageMap 主地图 + 室内场景
 */

const TILE = 32; // 与 NPC sprite 一致 (32×32)

// ============ 配色方案（冬季末日风） ============
const C = {
    // 地面 — 白雪覆盖
    GRASS:        '#D8DDE4',   // 雪地（浅灰白）
    GRASS_DARK:   '#C4CAD2',   // 深色雪地
    GRASS_LIGHT:  '#E8ECF0',   // 亮色雪地
    PATH:         '#B8B0A0',   // 踩过的雪路
    PATH_DARK:    '#A8A090',   // 深色雪路
    PLAZA:        '#C0BAB0',   // 广场积雪
    DIRT:         '#A09080',   // 冻土
    WATER:        '#B8D4E8',   // 结冰水面
    WATER_DEEP:   '#A0C0D8',   // 深色冰面
    SAND:         '#D8D0C0',   // 雪覆盖沙地

    // 建筑外观 — 不变，但增添寒冷感
    WALL_WOOD:    '#8B7050',
    WALL_STONE:   '#8E8A82',
    WALL_WHITE:   '#D8D2C4',
    ROOF_RED:     '#A03828',
    ROOF_BLUE:    '#405880',
    ROOF_GREEN:   '#406840',
    ROOF_BROWN:   '#7B5830',
    ROOF_PURPLE:  '#6B4080',
    DOOR:         '#7B5010',
    DOOR_OPEN:    '#5B3A0A',
    WINDOW:       '#78B8D8',
    WINDOW_LIT:   '#FFE880',

    // 室内 — 不变
    FLOOR_WOOD:   '#D0A060',
    FLOOR_TILE:   '#E0D8C8',
    FLOOR_STONE:  '#B8B0A0',
    WALL_INT:     '#F0E8D8',
    WALL_INT2:    '#E8DCC8',

    // 自然 — 枯枝积雪
    TREE_TRUNK:   '#6B4820',   // 深色树干
    TREE_CROWN:   '#8A9098',   // 枯枝+积雪（灰色调）
    TREE_CROWN2:  '#7A8088',   // 深色枯枝积雪
    BUSH:         '#8A9880',   // 雪覆盖灌木
    FLOWER_PINK:  '#E0E0E0',  // 积雪覆盖（白）
    FLOWER_YELLOW:'#D8D8D0',  // 积雪覆盖（白黄）
    FLOWER_BLUE:  '#C8D0E0',  // 积雪覆盖（白蓝）
    FENCE:        '#807060',

    // 家具 — 不变
    BED:          '#6888B0',
    BED_RED:      '#B06050',
    TABLE:        '#B08040',
    CHAIR:        '#A07030',
    SHELF:        '#8B5520',
    STOVE:        '#606060',
    COUNTER:      '#D0B880',
    BARREL:       '#8B6830',
    RUG:          '#B05050',

    // 特殊
    FOUNTAIN:     '#A0D8E8',   // 结冰喷泉
    LAMPPOST:     '#505050',
    SIGN:         '#B09050',
    WELL:         '#707070',

    // UI / 玩家
    PLAYER:       '#E04040',
    NPC:          '#4080E0',
    TEXT:         '#2C2C2C',
};

// ============ BaseMap 基类 ============
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

    /** 绘制地面（仅绘制视口内的 tile） */
    drawGrid(ctx, camera) {
        const sx = Math.floor(camera.x / TILE);
        const sy = Math.floor(camera.y / TILE);
        const ex = Math.ceil((camera.x + camera.width) / TILE);
        const ey = Math.ceil((camera.y + camera.height) / TILE);

        for (let y = sy; y < Math.min(ey, this.height); y++) {
            for (let x = sx; x < Math.min(ex, this.width); x++) {
                if (x < 0 || y < 0) continue;
                const color = this.getTileColor(x, y);
                ctx.fillStyle = color;
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
            }
        }

        // 绘制装饰物
        this.drawDecorations(ctx, camera);
    }

    /** 绘制装饰物 */
    drawDecorations(ctx, camera) {
        for (const d of this.decorations) {
            const px = d.x * TILE;
            const py = d.y * TILE;
            // 视口裁剪
            if (px + TILE * 2 < camera.x || px - TILE > camera.x + camera.width) continue;
            if (py + TILE * 2 < camera.y || py - TILE > camera.y + camera.height) continue;
            this.drawDecoration(ctx, d, px, py);
        }
    }

    /** 绘制单个装饰 */
    drawDecoration(ctx, d, px, py) {
        switch (d.type) {
            case 'tree':
                // 树干
                ctx.fillStyle = C.TREE_TRUNK;
                ctx.fillRect(px + 12, py + 16, 8, 16);
                // 树冠（画在偏上位置，给 Y-sort 用）
                ctx.fillStyle = d.color || C.TREE_CROWN;
                ctx.beginPath();
                ctx.arc(px + 16, py + 8, 14, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'bush':
                ctx.fillStyle = d.color || C.BUSH;
                ctx.beginPath();
                ctx.arc(px + 16, py + 20, 10, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'flower':
                ctx.fillStyle = d.color || C.FLOWER_PINK;
                ctx.beginPath();
                ctx.arc(px + 16, py + 22, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFE060';
                ctx.beginPath();
                ctx.arc(px + 16, py + 22, 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'bench':
                ctx.fillStyle = C.FENCE;
                ctx.fillRect(px + 2, py + 20, 28, 4);
                ctx.fillRect(px + 4, py + 24, 4, 6);
                ctx.fillRect(px + 24, py + 24, 4, 6);
                ctx.fillRect(px + 2, py + 14, 28, 6);
                break;
            case 'lamppost':
                ctx.fillStyle = C.LAMPPOST;
                ctx.fillRect(px + 14, py + 8, 4, 24);
                // 灯光 — 夜间更亮
                let lampIsNight = false;
                if (typeof window !== 'undefined' && window.game) {
                    const h = window.game.getHour();
                    lampIsNight = h >= 18 || h < 6;
                }
                ctx.fillStyle = lampIsNight ? '#FFE880' : 'rgba(255,232,128,0.4)';
                ctx.beginPath();
                ctx.arc(px + 16, py + 6, lampIsNight ? 7 : 5, 0, Math.PI * 2);
                ctx.fill();
                if (lampIsNight) {
                    ctx.fillStyle = 'rgba(255,232,128,0.12)';
                    ctx.beginPath();
                    ctx.arc(px + 16, py + 10, 24, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            case 'sign':
                ctx.fillStyle = C.FENCE;
                ctx.fillRect(px + 14, py + 18, 4, 14);
                ctx.fillStyle = C.SIGN;
                ctx.fillRect(px + 4, py + 8, 24, 12);
                break;
            case 'well':
                ctx.fillStyle = C.WELL;
                ctx.fillRect(px + 4, py + 10, 24, 18);
                ctx.fillStyle = '#5090C0';
                ctx.fillRect(px + 8, py + 14, 16, 10);
                ctx.fillStyle = C.FENCE;
                ctx.fillRect(px + 6, py + 6, 4, 4);
                ctx.fillRect(px + 22, py + 6, 4, 4);
                ctx.fillRect(px + 6, py + 4, 20, 3);
                break;
        }
    }

    getTileColor(x, y) { return C.GRASS; }
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
        const px = Math.floor((player.x + 16) / TILE);
        const py = Math.floor((player.y + 24) / TILE);
        return this.triggers.find(t =>
            px >= t.x && px < (t.x + t.w) &&
            py >= t.y && py < (t.y + t.h)
        );
    }

    getCirclePush(px, py, playerR) {
        const gx = px / TILE;
        const gy = py / TILE;
        const gridR = playerR / TILE;
        for (const obs of this.circleObstacles) {
            const dx = gx - obs.cx;
            const dy = gy - obs.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = obs.r + gridR;
            if (dist < minDist && dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minDist - dist;
                return { nx, ny, px: nx * overlap * TILE, py: ny * overlap * TILE };
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


// ======================================================================
//  VillageMap - 末日据点主地图 (50×40)
//  以主暖炉为中心，围墙内为安全区，外围为危险资源采集区
// ======================================================================
class VillageMap extends BaseMap {
    constructor() {
        super(50, 40, '末日据点');

        // ---- 户外资源采集区域 ----
        this.resourceAreas = [
            { id: 'lumber_camp', name: '🌲伐木场', x: 2, y: 2, w: 8, h: 6, color: '#5A6B50', resource: 'wood', danger: '中' },
            { id: 'ruins_site',  name: '🏔️废墟',   x: 38, y: 2, w: 10, h: 6, color: '#7A6A5A', resource: 'material', danger: '高' },
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
            { id: 'warehouse', name: '📦仓库',     x: 13, y: 11, w: 6, h: 4, wallColor: C.WALL_WOOD,  roofColor: C.ROOF_BROWN, doorX: 16, doorY: 15, target: 'warehouse' },
            { id: 'medical',   name: '🏥医疗站',   x: 30, y: 11, w: 6, h: 4, wallColor: C.WALL_WHITE, roofColor: C.ROOF_RED,   doorX: 33, doorY: 15, target: 'medical' },
            { id: 'dorm_a',    name: '🏠宿舍A',    x: 13, y: 18, w: 7, h: 5, wallColor: C.WALL_WOOD,  roofColor: C.ROOF_BLUE,  doorX: 16, doorY: 23, target: 'dorm_a' },
            { id: 'dorm_b',    name: '🏠宿舍B',    x: 30, y: 18, w: 7, h: 5, wallColor: C.WALL_WOOD,  roofColor: C.ROOF_GREEN, doorX: 33, doorY: 23, target: 'dorm_b' },
            { id: 'kitchen',   name: '🍳炊事房',   x: 13, y: 26, w: 5, h: 4, wallColor: C.WALL_STONE, roofColor: C.ROOF_RED,   doorX: 15, doorY: 30, target: 'kitchen' },
            { id: 'workshop',  name: '🔧工坊',     x: 21, y: 26, w: 7, h: 4, wallColor: C.WALL_STONE, roofColor: C.ROOF_BROWN, doorX: 24, doorY: 30, target: 'workshop' },
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
                color: C.TREE_CROWN2, // 枯枝积雪
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

    /** 绘制单个装饰物（重写父类以支持末日新类型） */
    drawDecoration(ctx, d, px, py) {
        switch (d.type) {
            case 'snowpile':
                ctx.fillStyle = '#E8ECF0';
                ctx.beginPath();
                ctx.ellipse(px + 16, py + 24, 14, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#D0D4D8';
                ctx.beginPath();
                ctx.ellipse(px + 12, py + 22, 8, 5, -0.3, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'icicle':
                ctx.fillStyle = '#C0E0F0';
                for (let i = 0; i < 3; i++) {
                    const ix = px + 6 + i * 10;
                    ctx.beginPath();
                    ctx.moveTo(ix, py);
                    ctx.lineTo(ix + 3, py);
                    ctx.lineTo(ix + 1.5, py + 10 + Math.random() * 4);
                    ctx.closePath();
                    ctx.fill();
                }
                break;
            case 'debris':
                ctx.fillStyle = '#8A7A6A';
                ctx.fillRect(px + 2, py + 16, 12, 8);
                ctx.fillRect(px + 8, py + 12, 16, 6);
                ctx.fillStyle = '#6A5A4A';
                ctx.fillRect(px + 6, py + 20, 8, 6);
                break;
            default:
                // 调用父类的装饰绘制
                super.drawDecoration(ctx, d, px, py);
                break;
        }
    }

    _makeBuildingObj(b) {
        return {
            b,
            getSortY() { return (this.b.y + this.b.h) * TILE; },
            draw(ctx) {
                const px = this.b.x * TILE;
                const py = this.b.y * TILE;
                const pw = this.b.w * TILE;
                const ph = this.b.h * TILE;

                // 墙体
                ctx.fillStyle = this.b.wallColor;
                ctx.fillRect(px, py + ph * 0.3, pw, ph * 0.7);

                // 屋顶 (梯形)
                ctx.fillStyle = this.b.roofColor;
                ctx.beginPath();
                ctx.moveTo(px - 4, py + ph * 0.35);
                ctx.lineTo(px + pw / 2, py);
                ctx.lineTo(px + pw + 4, py + ph * 0.35);
                ctx.closePath();
                ctx.fill();

                // 门
                const doorPx = this.b.doorX * TILE;
                const doorPy = (this.b.y + this.b.h - 1) * TILE;
                ctx.fillStyle = C.DOOR;
                ctx.fillRect(doorPx + 8, doorPy, 16, TILE);

                // 窗户 — 夜间亮灯
                const winY = py + ph * 0.45;
                const winCount = Math.max(1, Math.floor(this.b.w / 3));
                const winSpacing = pw / (winCount + 1);
                
                let isNight = false;
                if (typeof window !== 'undefined' && window.game) {
                    const hour = window.game.getHour();
                    isNight = hour >= 19 || hour < 6;
                }

                ctx.fillStyle = isNight ? C.WINDOW_LIT : C.WINDOW;
                for (let i = 1; i <= winCount; i++) {
                    ctx.fillRect(px + winSpacing * i - 6, winY, 12, 10);
                }

                if (isNight) {
                    ctx.fillStyle = 'rgba(255,232,128,0.15)';
                    for (let i = 1; i <= winCount; i++) {
                        ctx.beginPath();
                        ctx.arc(px + winSpacing * i, winY + 5, 16, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // 建筑名（小字）
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(this.b.name, px + pw / 2, py - 4);
                ctx.textAlign = 'left';
            }
        };
    }

    /** 主暖炉广场渲染对象 */
    _makeFurnacePlazaObj() {
        const fp = this.furnacePlaza;
        return {
            fp,
            isGround: true, // 【标记为地面级对象】在NPC下方绘制，不参与Y-sort
            getSortY() { return (this.fp.y + this.fp.h) * TILE; },
            draw(ctx) {
                const px = this.fp.x * TILE;
                const py = this.fp.y * TILE;
                const pw = this.fp.w * TILE;
                const ph = this.fp.h * TILE;

                // 广场底座
                ctx.fillStyle = C.PLAZA;
                ctx.fillRect(px, py, pw, ph);

                // 暖炉主体 (中心偏大)
                const cx = px + pw / 2;
                const cy = py + ph / 2;
                ctx.fillStyle = '#505050';
                ctx.fillRect(cx - 20, cy - 16, 40, 32);
                ctx.fillStyle = '#3A3A3A';
                ctx.fillRect(cx - 16, cy - 12, 32, 24);

                // 火焰动画（简化：橙黄色渐变圆）
                const t = Date.now() / 200;
                const flicker = Math.sin(t) * 3;
                // 外焰
                ctx.fillStyle = 'rgba(255,120,20,0.6)';
                ctx.beginPath();
                ctx.ellipse(cx, cy - 4, 14 + flicker, 18 + flicker, 0, 0, Math.PI * 2);
                ctx.fill();
                // 内焰
                ctx.fillStyle = 'rgba(255,200,50,0.8)';
                ctx.beginPath();
                ctx.ellipse(cx, cy - 2, 8 + flicker * 0.5, 12 + flicker * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();

                // 暖光辐射
                const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
                grad.addColorStop(0, 'rgba(255,180,60,0.18)');
                grad.addColorStop(1, 'rgba(255,180,60,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(cx - 80, cy - 80, 160, 160);

                // 标签
                ctx.fillStyle = 'rgba(255,200,80,0.9)';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🔥 主暖炉', cx, py - 6);
                ctx.textAlign = 'left';
            }
        };
    }

    /** 户外资源区域渲染对象 */
    _makeResourceAreaObj(area) {
        return {
            area,
            isGround: true, // 【标记为地面级对象】在NPC下方绘制，不参与Y-sort
            getSortY() { return (this.area.y + this.area.h) * TILE; },
            draw(ctx) {
                const px = this.area.x * TILE;
                const py = this.area.y * TILE;
                const pw = this.area.w * TILE;
                const ph = this.area.h * TILE;

                // 区域底色
                ctx.fillStyle = this.area.color;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(px, py, pw, ph);
                ctx.globalAlpha = 1;

                // 虚线边框
                ctx.strokeStyle = this.area.color;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
                ctx.setLineDash([]);

                // 区域特色装饰
                if (this.area.id === 'lumber_camp') {
                    // 伐木场 — 树桩
                    for (let i = 0; i < 4; i++) {
                        const sx = px + 16 + (i % 2) * 60;
                        const sy = py + 16 + Math.floor(i / 2) * 50;
                        ctx.fillStyle = C.TREE_TRUNK;
                        ctx.fillRect(sx, sy, 16, 12);
                        ctx.fillStyle = '#A09080';
                        ctx.beginPath();
                        ctx.ellipse(sx + 8, sy, 10, 6, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (this.area.id === 'ruins_site') {
                    // 废墟 — 碎石堆
                    ctx.fillStyle = '#8A7A6A';
                    ctx.fillRect(px + 20, py + 20, 40, 20);
                    ctx.fillRect(px + 60, py + 40, 30, 25);
                    ctx.fillStyle = '#6A5A4A';
                    ctx.fillRect(px + 40, py + 10, 20, 30);
                } else if (this.area.id === 'frozen_lake') {
                    // 冰湖 — 冰面
                    ctx.fillStyle = C.WATER;
                    ctx.beginPath();
                    ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2 - 8, ph / 2 - 8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 冰裂纹
                    ctx.strokeStyle = '#A0D0E8';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(px + pw / 2 - 20, py + ph / 2);
                    ctx.lineTo(px + pw / 2 + 20, py + ph / 2 - 10);
                    ctx.moveTo(px + pw / 2, py + ph / 2 - 15);
                    ctx.lineTo(px + pw / 2 + 10, py + ph / 2 + 15);
                    ctx.stroke();
                } else if (this.area.id === 'ore_pile') {
                    // 矿渣堆 — 石堆
                    ctx.fillStyle = '#6A6A6A';
                    for (let i = 0; i < 5; i++) {
                        const ox = px + 16 + (i * 40) % (pw - 32);
                        const oy = py + 20 + Math.floor(i / 3) * 40;
                        ctx.beginPath();
                        ctx.arc(ox, oy, 10 + i * 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // 区域名称
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(this.area.name, px + pw / 2, py + ph + 12);
                // 危险等级
                const dangerColor = this.area.danger === '高' ? '#E06060' : '#F0C050';
                ctx.fillStyle = dangerColor;
                ctx.font = '8px sans-serif';
                ctx.fillText(`危险:${this.area.danger}`, px + pw / 2, py + ph + 22);
                ctx.textAlign = 'left';
            }
        };
    }

    /** 围墙渲染对象 */
    _makeWallObj() {
        const wb = this.wallBounds;
        const ng = this.northGate;
        const sg = this.southGate;
        const self = this;
        return {
            getSortY() { return wb.y2 * TILE; },
            draw(ctx) {
                const wallColor = '#807060';
                const wallTopColor = '#6A5A4A';
                const lineW = 3;

                // 绘制围墙四边（留出大门）
                ctx.fillStyle = wallColor;

                // 北墙 (上边) — 留北门
                ctx.fillRect(wb.x1 * TILE, wb.y1 * TILE - 2, (ng.x - wb.x1) * TILE, lineW + 4);
                ctx.fillRect((ng.x + ng.w) * TILE, wb.y1 * TILE - 2, (wb.x2 - ng.x - ng.w) * TILE, lineW + 4);

                // 南墙 (下边) — 留南门
                ctx.fillRect(wb.x1 * TILE, wb.y2 * TILE - 2, (sg.x - wb.x1) * TILE, lineW + 4);
                ctx.fillRect((sg.x + sg.w) * TILE, wb.y2 * TILE - 2, (wb.x2 - sg.x - sg.w) * TILE, lineW + 4);

                // 西墙 (左边)
                ctx.fillRect(wb.x1 * TILE - 2, wb.y1 * TILE, lineW + 4, (wb.y2 - wb.y1) * TILE);

                // 东墙 (右边)
                ctx.fillRect(wb.x2 * TILE - 2, wb.y1 * TILE, lineW + 4, (wb.y2 - wb.y1) * TILE);

                // 栅栏柱子 (每隔3格一个)
                ctx.fillStyle = wallTopColor;
                for (let x = wb.x1; x <= wb.x2; x += 3) {
                    // 北墙柱子（跳过门位置）
                    if (x < ng.x || x >= ng.x + ng.w) {
                        ctx.fillRect(x * TILE - 2, wb.y1 * TILE - 6, 6, 12);
                    }
                    // 南墙柱子（跳过门位置）
                    if (x < sg.x || x >= sg.x + sg.w) {
                        ctx.fillRect(x * TILE - 2, wb.y2 * TILE - 6, 6, 12);
                    }
                }
                for (let y = wb.y1; y <= wb.y2; y += 3) {
                    ctx.fillRect(wb.x1 * TILE - 6, y * TILE - 2, 12, 6);
                    ctx.fillRect(wb.x2 * TILE - 6, y * TILE - 2, 12, 6);
                }

                // 大门渲染
                const gateColor = self.gatesClosed ? '#5A3020' : '#8B6830';
                const gateLabel = self.gatesClosed ? '🔒' : '🚪';
                // 北门
                ctx.fillStyle = gateColor;
                ctx.fillRect(ng.x * TILE, wb.y1 * TILE - 4, ng.w * TILE, 8);
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${gateLabel}北门`, (ng.x + ng.w / 2) * TILE, wb.y1 * TILE - 8);
                // 南门
                ctx.fillStyle = gateColor;
                ctx.fillRect(sg.x * TILE, wb.y2 * TILE - 4, sg.w * TILE, 8);
                ctx.fillText(`${gateLabel}南门`, (sg.x + sg.w / 2) * TILE, wb.y2 * TILE - 8);
                ctx.textAlign = 'left';
            }
        };
    }

    getTileColor(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return C.GRASS_DARK;

        const wb = this.wallBounds;

        // 围墙内 — 安全区
        if (x >= wb.x1 && x <= wb.x2 && y >= wb.y1 && y <= wb.y2) {
            // 主暖炉广场区域
            const fp = this.furnacePlaza;
            if (x >= fp.x && x < fp.x + fp.w && y >= fp.y && y < fp.y + fp.h) return C.PLAZA;

            // 安全区内道路 — 十字主路
            // 东西主路 (y=20 广场中线)
            if (y >= 20 && y <= 21 && x >= wb.x1 + 1 && x <= wb.x2 - 1) return C.PATH;
            // 南北主路 (x=25 中轴)
            if (x >= 24 && x <= 26 && y >= wb.y1 + 1 && y <= wb.y2 - 1) return C.PATH;

            // 通往各建筑的小路
            if (x >= 15 && x <= 17 && y >= 15 && y <= 17) return C.DIRT; // 仓库→宿舍A
            if (x >= 32 && x <= 34 && y >= 15 && y <= 17) return C.DIRT; // 医疗站→宿舍B
            if (x >= 15 && x <= 17 && y >= 24 && y <= 25) return C.DIRT; // 宿舍A→炊事房
            if (x >= 22 && x <= 26 && y >= 24 && y <= 25) return C.DIRT; // 广场→工坊

            // 安全区内默认
            return ((x + y) % 5 === 0) ? C.GRASS_DARK : C.GRASS;
        }

        // 围墙线上
        if ((x === wb.x1 || x === wb.x2) && y >= wb.y1 && y <= wb.y2) return C.FENCE;
        if ((y === wb.y1 || y === wb.y2) && x >= wb.x1 && x <= wb.x2) return C.FENCE;

        // 户外资源区域
        for (const area of this.resourceAreas) {
            if (x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h) {
                if (area.id === 'frozen_lake') return C.WATER;
                return C.DIRT;
            }
        }

        // 外围雪原
        return ((x + y) % 3 === 0) ? C.GRASS_DARK : C.GRASS;
    }

    isSolid(px, py) {
        const gx = px / TILE;
        const gy = py / TILE;

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


// ======================================================================
//  室内场景基类
// ======================================================================
class IndoorMap extends BaseMap {
    constructor(w, h, name, exitTarget, exitSpawn) {
        super(w, h, name);
        this.exitTarget = exitTarget;
        this.exitSpawn = exitSpawn; // { x, y } 在主地图上出门后的位置
        // 默认出口在底部中间
        this.triggers.push({
            x: Math.floor(w / 2) - 1, y: h - 1, w: 2, h: 1,
            target: 'village',
            name: '出门',
            spawnX: exitSpawn ? exitSpawn.x : 40,
            spawnY: exitSpawn ? exitSpawn.y : 25
        });
    }

    getTileColor(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return '#000';
        // 墙壁
        if (y === 0) return C.WALL_INT;
        if (x === 0 || x === this.width - 1) return C.WALL_INT2;
        // 出口
        if (y === this.height - 1 && x >= Math.floor(this.width / 2) - 1 && x <= Math.floor(this.width / 2)) return C.DOOR;
        if (y === this.height - 1) return C.WALL_INT2;
        // 地板
        return this.floorColor || C.FLOOR_WOOD;
    }

    isSolid(px, py) {
        const gx = px / TILE;
        const gy = py / TILE;
        if (gx < 1 || gy < 1 || gx >= this.width - 1 || gy >= this.height) return true;
        // 出口可通行
        if (Math.floor(gy) === this.height - 1) {
            const doorX = Math.floor(this.width / 2);
            if (Math.floor(gx) >= doorX - 1 && Math.floor(gx) <= doorX) return false;
            return true;
        }
        // 子类覆盖家具碰撞
        return this._isFurnitureSolid(Math.floor(gx), Math.floor(gy));
    }

    _isFurnitureSolid(gx, gy) { return false; }

    describe(gx, gy) {
        return `你在${this.name}里面。出口在南边。`;
    }

    /** 获取当前场景中的其他人名列表（供 describe 使用） */
    _getOtherPeopleHere() {
        if (typeof window === 'undefined' || !window.game) return [];
        const game = window.game;
        // 找出所有在这个场景中的 NPC
        const sceneName = this._getSceneName();
        if (!sceneName) return [];
        const people = [];
        for (const npc of game.npcs) {
            if (npc.currentScene === sceneName && !npc.isSleeping) {
                people.push(npc.name);
            }
        }
        // 也检查玩家是否在这个场景中
        if (game.currentScene === sceneName) {
            people.push('玩家');
        }
        return people;
    }

    /** 获取当前地图对应的场景 key */
    _getSceneName() {
        if (typeof window === 'undefined' || !window.game) return null;
        const game = window.game;
        for (const [key, map] of Object.entries(game.maps)) {
            if (map === this) return key;
        }
        return null;
    }

    getInterestPoints(gx, gy) {
        return [{
            x: Math.floor(this.width / 2), y: this.height - 1,
            name: '出门',
            desc: '离开' + this.name,
            walkTo: { x: Math.floor(this.width / 2), y: this.height - 1 }
        }];
    }
}


// ============ 宿舍A (12×8) — 赵铁柱/王策/苏岩/陆辰 ============
class DormAMap extends IndoorMap {
    constructor() {
        super(12, 8, '宿舍A', 'village', { x: 16, y: 24 });
        this.floorColor = C.FLOOR_WOOD;
        // 4张床铺（每张2x1）+ 取暖火盆 + 简易桌椅
        this.furniture = [
            { x: 1, y: 1, w: 2, h: 1, color: C.BED,     name: '赵铁柱的床' },
            { x: 4, y: 1, w: 2, h: 1, color: C.BED,     name: '王策的床' },
            { x: 7, y: 1, w: 2, h: 1, color: C.BED_RED, name: '苏岩的床' },
            { x: 10, y: 1, w: 1, h: 1, color: C.BED_RED, name: '陆辰的床' },
            { x: 5,  y: 4, w: 2, h: 2, color: '#A05030', name: '取暖火盆' },
            { x: 1,  y: 5, w: 2, h: 1, color: C.TABLE,  name: '简易桌' },
            { x: 9,  y: 5, w: 2, h: 1, color: C.TABLE,  name: '杂物桌' },
        ];
        this.beds = [
            { npc: '赵铁柱', x: 1, y: 2 },
            { npc: '王策',   x: 4, y: 2 },
            { npc: '苏岩',   x: 7, y: 2 },
            { npc: '陆辰',   x: 10, y: 2 },
        ];
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.2) * TILE);
            ctx.textAlign = 'left';
        }
        // 火盆火焰效果
        const t = Date.now() / 300;
        const cx = 6 * TILE, cy = 5 * TILE;
        ctx.fillStyle = `rgba(255,120,30,${0.4 + Math.sin(t) * 0.15})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在宿舍A里。这里住着赵铁柱、王策、苏岩、陆辰。';
        if (gy <= 2) desc += '靠近床铺区域。';
        if (gx >= 4 && gx <= 7 && gy >= 3 && gy <= 5) desc += '火盆散发着微弱的暖意。';
        if (others.length > 0) desc += `房间里有${others.join('、')}。`;
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 2, y: 2, name: '床边', desc: '休息', walkTo: { x: 2, y: 2 } },
            { x: 6, y: 6, name: '火盆旁', desc: '取暖', walkTo: { x: 6, y: 6 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }

    getRoomForNPC(npcName) {
        const bed = this.beds.find(b => b.npc === npcName);
        if (bed) return { x: bed.x, y: bed.y };
        return { x: 6, y: 4 };
    }
}


// ============ 宿舍B (12×8) — 李婶/老钱/凌玥/清璇 + 第二暖炉预留区 ============
class DormBMap extends IndoorMap {
    constructor() {
        super(12, 8, '宿舍B', 'village', { x: 33, y: 24 });
        this.floorColor = C.FLOOR_WOOD;
        this.secondFurnaceBuilt = false; // 第二暖炉是否已建成
        this.furniture = [
            { x: 1, y: 1, w: 2, h: 1, color: C.BED,     name: '李婶的床' },
            { x: 4, y: 1, w: 2, h: 1, color: C.BED_RED, name: '老钱的床' },
            { x: 7, y: 1, w: 2, h: 1, color: '#E080A0', name: '凌玥的床' },
            { x: 10, y: 1, w: 1, h: 1, color: '#4090B0', name: '清璇的床' },
            { x: 1,  y: 4, w: 2, h: 2, color: '#A05030', name: '取暖火盆' },
            { x: 5,  y: 5, w: 2, h: 1, color: C.TABLE,  name: '简易桌' },
            // 第二暖炉预留区域 (9,4) ~ (11,6)
        ];
        this.beds = [
            { npc: '李婶', x: 1, y: 2 },
            { npc: '老钱', x: 4, y: 2 },
            { npc: '凌玥', x: 7, y: 2 },
            { npc: '清璇', x: 10, y: 2 },
        ];
        this.furnaceSlot = { x: 9, y: 4, w: 2, h: 2 }; // 第二暖炉预留位置
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.2) * TILE);
            ctx.textAlign = 'left';
        }
        // 火盆
        const t = Date.now() / 300;
        const cx = 2 * TILE, cy = 5 * TILE;
        ctx.fillStyle = `rgba(255,120,30,${0.4 + Math.sin(t) * 0.15})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();

        // 第二暖炉预留区域
        const fs = this.furnaceSlot;
        if (this.secondFurnaceBuilt) {
            // 已建成 — 渲染暖炉
            ctx.fillStyle = '#505050';
            ctx.fillRect(fs.x * TILE, fs.y * TILE, fs.w * TILE, fs.h * TILE);
            ctx.fillStyle = `rgba(255,150,40,${0.5 + Math.sin(t * 1.2) * 0.2})`;
            ctx.beginPath();
            ctx.arc((fs.x + fs.w / 2) * TILE, (fs.y + fs.h / 2) * TILE, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFE080';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🔥第二暖炉', (fs.x + fs.w / 2) * TILE, (fs.y - 0.3) * TILE);
            ctx.textAlign = 'left';
        } else {
            // 未建成 — 虚线标注"可建造"
            ctx.strokeStyle = 'rgba(255,200,80,0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(fs.x * TILE + 2, fs.y * TILE + 2, fs.w * TILE - 4, fs.h * TILE - 4);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,200,80,0.6)';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📐可建造', (fs.x + fs.w / 2) * TILE, (fs.y + fs.h / 2) * TILE + 3);
            ctx.textAlign = 'left';
        }
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        // 第二暖炉建成后也是碰撞体
        if (this.secondFurnaceBuilt) {
            const fs = this.furnaceSlot;
            if (gx >= fs.x && gx < fs.x + fs.w && gy >= fs.y && gy < fs.y + fs.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在宿舍B里。这里住着李婶、老钱、凌玥、清璇。';
        if (this.secondFurnaceBuilt) desc += '第二暖炉已经建成，房间温暖了许多。';
        else desc += '角落有一块空地，标注着"可建造第二暖炉"。';
        if (others.length > 0) desc += `房间里有${others.join('、')}。`;
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 2, y: 2, name: '床边', desc: '休息', walkTo: { x: 2, y: 2 } },
            { x: 2, y: 5, name: '火盆旁', desc: '取暖', walkTo: { x: 2, y: 5 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }

    getRoomForNPC(npcName) {
        const bed = this.beds.find(b => b.npc === npcName);
        if (bed) return { x: bed.x, y: bed.y };
        return { x: 6, y: 4 };
    }
}


// ============ 医疗站 (10×8) — 苏岩坐诊 + 清璇制药 ============
class MedicalMap extends IndoorMap {
    constructor() {
        super(10, 8, '医疗站', 'village', { x: 33, y: 16 });
        this.floorColor = C.FLOOR_TILE;
        this.furniture = [
            { x: 1, y: 1, w: 2, h: 2, color: C.BED,     name: '病床1' },
            { x: 4, y: 1, w: 2, h: 2, color: C.BED,     name: '病床2' },
            { x: 7, y: 1, w: 2, h: 2, color: C.BED_RED, name: '病床3' },
            { x: 1, y: 4, w: 2, h: 1, color: C.COUNTER, name: '药柜' },
            { x: 4, y: 4, w: 3, h: 2, color: C.TABLE,   name: '诊疗台' },
            { x: 8, y: 4, w: 1, h: 3, color: C.SHELF,   name: '草药架' },
        ];
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.2) * TILE);
            ctx.textAlign = 'left';
        }
        // 药柜红十字标记
        ctx.fillStyle = '#E06060';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('➕', 2 * TILE, 4.7 * TILE);
        ctx.textAlign = 'left';
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在医疗站里，空气中弥漫着草药的味道。这里有3张病床、药柜和草药架。';
        if (others.length > 0) desc += `医疗站里有${others.join('、')}。`;
        else desc += '医疗站目前空无一人。';
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 5, y: 6, name: '诊疗台旁', desc: '接受治疗', walkTo: { x: 5, y: 6 } },
            { x: 8, y: 6, name: '草药架旁', desc: '查看草药', walkTo: { x: 8, y: 6 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }
}


// ============ 仓库 (10×8) — 李婶管理物资 ============
class WarehouseMap extends IndoorMap {
    constructor() {
        super(10, 8, '仓库', 'village', { x: 16, y: 16 });
        this.floorColor = C.FLOOR_STONE;
        // 4个储物分区
        this.furniture = [
            { x: 1, y: 1, w: 3, h: 2, color: '#8B5520', name: '🪵木柴区', zone: 'wood' },
            { x: 6, y: 1, w: 3, h: 2, color: '#A09050', name: '🍖食物区', zone: 'food' },
            { x: 1, y: 4, w: 3, h: 2, color: '#7A7A7A', name: '🧱建材区', zone: 'material' },
            { x: 6, y: 4, w: 3, h: 2, color: '#6A5A4A', name: '📦杂物区', zone: 'misc' },
        ];
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);

            // 资源量视觉堆叠（根据实际资源量动态调整）
            let fillPct = 0.5; // 默认50%
            if (typeof window !== 'undefined' && window.game && window.game.resourceSystem) {
                const rs = window.game.resourceSystem;
                if (f.zone === 'wood') fillPct = Math.min(1, rs.woodFuel / 80);
                else if (f.zone === 'food') fillPct = Math.min(1, rs.food / 60);
                else if (f.zone === 'material') fillPct = Math.min(1, rs.material / 60);
                else fillPct = 0.3;
            }
            // 堆叠高度
            const stackH = f.h * TILE * fillPct;
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(f.x * TILE, (f.y + f.h) * TILE - stackH, f.w * TILE, stackH);

            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.3) * TILE);
            ctx.textAlign = 'left';
        }
        // 分区分隔线
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5 * TILE, 1 * TILE);
        ctx.lineTo(5 * TILE, 6 * TILE);
        ctx.moveTo(1 * TILE, 3.5 * TILE);
        ctx.lineTo(9 * TILE, 3.5 * TILE);
        ctx.stroke();
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在仓库里。四个储物区分别存放着木柴、食物、建材和杂物。';
        if (typeof window !== 'undefined' && window.game && window.game.resourceSystem) {
            const rs = window.game.resourceSystem;
            desc += `木柴:${Math.round(rs.woodFuel)} 食物:${Math.round(rs.food)} 建材:${Math.round(rs.material)}。`;
        }
        if (others.length > 0) desc += `仓库里有${others.join('、')}。`;
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 2, y: 3, name: '木柴区', desc: '查看木柴储量', walkTo: { x: 2, y: 3 } },
            { x: 7, y: 3, name: '食物区', desc: '查看食物储量', walkTo: { x: 7, y: 3 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }
}


// ============ 工坊 (12×8) — 王策维修+清璇修无线电 ============
class WorkshopMap extends IndoorMap {
    constructor() {
        super(12, 8, '工坊', 'village', { x: 24, y: 31 });
        this.floorColor = C.FLOOR_STONE;
        this.radioRepaired = false; // 无线电是否已修好
        this.furniture = [
            { x: 1, y: 1, w: 3, h: 2, color: C.TABLE,   name: '工作台' },
            { x: 5, y: 1, w: 3, h: 2, color: '#606060', name: '发电机' },
            { x: 9, y: 1, w: 2, h: 3, color: C.SHELF,   name: '工具架' },
            { x: 1, y: 4, w: 3, h: 2, color: '#7A7A7A', name: '建材堆' },
            { x: 5, y: 4, w: 3, h: 2, color: '#5A6A5A', name: '无线电台' },
        ];
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.2) * TILE);
            ctx.textAlign = 'left';
        }
        // 发电机运行指示灯
        const t = Date.now() / 500;
        ctx.fillStyle = `rgba(80,255,80,${0.4 + Math.sin(t) * 0.3})`;
        ctx.beginPath();
        ctx.arc(6.5 * TILE, 1.5 * TILE, 4, 0, Math.PI * 2);
        ctx.fill();

        // 无线电台状态
        const radioX = 6.5 * TILE, radioY = 5 * TILE;
        if (this.radioRepaired) {
            ctx.fillStyle = 'rgba(80,200,255,0.6)';
            ctx.beginPath();
            ctx.arc(radioX, radioY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#80C8FF';
            ctx.font = '7px sans-serif';
            ctx.fillText('📡已修复', radioX - 16, radioY + 16);
        } else {
            ctx.fillStyle = 'rgba(255,80,80,0.4)';
            ctx.beginPath();
            ctx.arc(radioX, radioY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FF8080';
            ctx.font = '7px sans-serif';
            ctx.fillText('⚠️待修理', radioX - 16, radioY + 16);
        }
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在工坊里。这里有工作台、发电机、工具架和建材堆。';
        if (this.radioRepaired) desc += '无线电台已经修好了，绿灯闪烁着。';
        else desc += '角落的无线电台还在等待修理，红灯警示着故障状态。';
        if (others.length > 0) desc += `工坊里有${others.join('、')}。`;
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 2, y: 3, name: '工作台', desc: '在工作台工作', walkTo: { x: 2, y: 3 } },
            { x: 6, y: 3, name: '发电机', desc: '检查发电机', walkTo: { x: 6, y: 3 } },
            { x: 6, y: 6, name: '无线电台', desc: '查看无线电', walkTo: { x: 6, y: 6 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }
}


// ============ 炊事房 (8×8) — 李婶烹饪+全员用餐 ============
class KitchenMap extends IndoorMap {
    constructor() {
        super(8, 8, '炊事房', 'village', { x: 15, y: 31 });
        this.floorColor = C.FLOOR_TILE;
        this.furniture = [
            { x: 1, y: 1, w: 3, h: 1, color: C.STOVE,   name: '灶台' },
            { x: 5, y: 1, w: 2, h: 2, color: C.SHELF,   name: '食材架' },
            { x: 2, y: 4, w: 4, h: 2, color: C.TABLE,   name: '餐桌' },
        ];
        // 餐桌座位（可坐6人）
        this.seats = [
            { x: 1, y: 4 }, { x: 1, y: 5 },   // 左侧
            { x: 6, y: 4 }, { x: 6, y: 5 },   // 右侧
            { x: 3, y: 3 }, { x: 4, y: 3 },   // 上方
        ];
    }

    drawGrid(ctx, camera) {
        super.drawGrid(ctx, camera);
        for (const f of this.furniture) {
            ctx.fillStyle = f.color;
            ctx.fillRect(f.x * TILE, f.y * TILE, f.w * TILE, f.h * TILE);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(f.name, (f.x + f.w / 2) * TILE, (f.y - 0.2) * TILE);
            ctx.textAlign = 'left';
        }
        // 灶台火焰
        const t = Date.now() / 250;
        ctx.fillStyle = `rgba(255,140,40,${0.3 + Math.sin(t) * 0.2})`;
        ctx.beginPath();
        ctx.arc(2.5 * TILE, 1.5 * TILE, 8, 0, Math.PI * 2);
        ctx.fill();

        // 座位标记
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (const s of this.seats) {
            ctx.fillRect(s.x * TILE + 4, s.y * TILE + 4, TILE - 8, TILE - 8);
        }
    }

    _isFurnitureSolid(gx, gy) {
        for (const f of this.furniture) {
            if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
        }
        return false;
    }

    describe(gx, gy) {
        const others = this._getOtherPeopleHere();
        let desc = '你在炊事房里。灶台上冒着热气，餐桌可以坐6个人。';
        if (others.length > 0) desc += `这里有${others.join('、')}。`;
        else desc += '目前空无一人。';
        desc += '出口在南边。';
        return desc;
    }

    getInterestPoints(gx, gy) {
        return [
            { x: 2, y: 2, name: '灶台', desc: '做饭', walkTo: { x: 2, y: 2 } },
            { x: 3, y: 6, name: '餐桌旁', desc: '坐下吃饭', walkTo: { x: 3, y: 6 } },
            ...super.getInterestPoints(gx, gy)
        ];
    }
}



// ============ A* 寻路 ============
function findPath(startX, startY, goalX, goalY, map, extraBlocked) {
    const start = { x: Math.floor(startX), y: Math.floor(startY) };
    let goal = { x: Math.floor(goalX), y: Math.floor(goalY) };

    // extraBlocked: Set of "x,y" strings，额外标记为不可通行的格子（如其他NPC占据的位置）
    const blockedSet = extraBlocked || null;

    // 目标修正：如果目标不可通行，搜索最近可通行点
    const goalCx = goal.x * TILE + TILE / 2;
    const goalCy = goal.y * TILE + TILE / 2;
    if (map.isSolid(goalCx, goalCy)) {
        let best = null, bestDist = Infinity;
        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const nx = goal.x + dx, ny = goal.y + dy;
                if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
                if (map.isSolid(nx * TILE + TILE / 2, ny * TILE + TILE / 2)) continue;
                const d = Math.abs(dx) + Math.abs(dy);
                if (d < bestDist) { bestDist = d; best = { x: nx, y: ny }; }
            }
        }
        if (best) goal = best;
        else return null;
    }

    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const key = n => `${n.x},${n.y}`;

    const openSet = [{ node: start, f: 0, g: 0 }];
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(key(start), 0);

    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        const ck = key(current.node);

        if (current.node.x === goal.x && current.node.y === goal.y) {
            const path = [];
            let temp = current.node;
            while (temp) { path.unshift(temp); temp = cameFrom.get(key(temp)); }
            return path;
        }

        closedSet.add(ck);

        const neighbors = [
            { x: current.node.x + 1, y: current.node.y },
            { x: current.node.x - 1, y: current.node.y },
            { x: current.node.x, y: current.node.y + 1 },
            { x: current.node.x, y: current.node.y - 1 }
        ];

        for (const nb of neighbors) {
            const nk = key(nb);
            if (nb.x < 0 || nb.y < 0 || nb.x >= map.width || nb.y >= map.height || closedSet.has(nk)) continue;
            if (map.isSolid(nb.x * TILE + TILE / 2, nb.y * TILE + TILE / 2)) continue;
            // 额外障碍物检查（其他NPC占据的格子）
            if (blockedSet && blockedSet.has(`${nb.x},${nb.y}`)) continue;

            // 圆形碰撞额外检查
            if (map.circleObstacles) {
                const ngx = nb.x + 0.5, ngy = nb.y + 0.5;
                let blocked = false;
                for (const obs of map.circleObstacles) {
                    if (Math.sqrt(Math.pow(ngx - obs.cx, 2) + Math.pow(ngy - obs.cy, 2)) < obs.r + 0.3) {
                        blocked = true; break;
                    }
                }
                if (blocked) continue;
            }

            const tg = current.g + 1;
            if (!gScore.has(nk) || tg < gScore.get(nk)) {
                cameFrom.set(nk, current.node);
                gScore.set(nk, tg);
                const f = tg + heuristic(nb, goal);
                if (!openSet.find(n => key(n.node) === nk)) {
                    openSet.push({ node: nb, f, g: tg });
                }
            }
        }
    }
    return null;
}
