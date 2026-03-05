/**
 * 福音镇 - 全局常量
 * 包含 TILE 大小、配色方案、纹理噪声和颜色混合辅助函数
 * 挂载到 window.GST 命名空间
 */
(function() {
    'use strict';

    const GST = window.GST || (window.GST = {});

    // ============ 基础常量 ============
    GST.TILE = 32; // 与 NPC sprite 一致 (32×32)

    // ============ 配色方案（冬季末日风 — 升级版） ============
    GST.C = {
        // 地面 — 白雪覆盖（更丰富的层次）
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

        // 建筑外观 — 更丰富
        WALL_WOOD:    '#8B7050',
        WALL_STONE:   '#8E8A82',
        WALL_WHITE:   '#D8D2C4',
        WALL_WOOD_DARK: '#6B5030', // 深色木墙（阴影面）
        WALL_STONE_DARK: '#6E6A62',// 深色石墙
        ROOF_RED:     '#A03828',
        ROOF_BLUE:    '#405880',
        ROOF_GREEN:   '#406840',
        ROOF_BROWN:   '#7B5830',
        ROOF_PURPLE:  '#6B4080',
        ROOF_SNOW:    '#E4E8F0',   // 屋顶积雪
        DOOR:         '#7B5010',
        DOOR_OPEN:    '#5B3A0A',
        DOOR_FRAME:   '#5A3A08',   // 门框
        WINDOW:       '#78B8D8',
        WINDOW_LIT:   '#FFE880',
        WINDOW_FRAME: '#606058',   // 窗框
        CHIMNEY:      '#5A5450',   // 烟囱
        CHIMNEY_TOP:  '#484440',   // 烟囱顶

        // 室内 — 更温馨
        FLOOR_WOOD:   '#D0A060',
        FLOOR_TILE:   '#E0D8C8',
        FLOOR_STONE:  '#B8B0A0',
        WALL_INT:     '#F0E8D8',
        WALL_INT2:    '#E8DCC8',

        // 自然 — 枯枝积雪（更多层次）
        TREE_TRUNK:   '#6B4820',   // 深色树干
        TREE_TRUNK_LIGHT: '#8B6830',// 浅色树干
        TREE_CROWN:   '#8A9098',   // 枯枝+积雪（灰色调）
        TREE_CROWN2:  '#7A8088',   // 深色枯枝积雪
        TREE_SNOW:    '#E0E4EA',   // 树冠积雪高光
        BUSH:         '#8A9880',   // 雪覆盖灌木
        FLOWER_PINK:  '#E0E0E0',
        FLOWER_YELLOW:'#D8D8D0',
        FLOWER_BLUE:  '#C8D0E0',
        FENCE:        '#807060',
        FENCE_DARK:   '#604838',   // 深色栅栏

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
        FOUNTAIN:     '#A0D8E8',
        LAMPPOST:     '#505050',
        SIGN:         '#B09050',
        WELL:         '#707070',

        // UI / 玩家
        PLAYER:       '#E04040',
        NPC:          '#4080E0',
        TEXT:         '#2C2C2C',
    };

    // ============ 地面纹理缓存（伪随机雪地纹理） ============
    const _tileNoiseCache = {};

    GST.getTileNoise = function(x, y) {
        const key = x * 10000 + y;
        if (_tileNoiseCache[key] !== undefined) return _tileNoiseCache[key];
        // 简易伪随机哈希 — 稳定的、基于坐标的噪声
        let h = (x * 374761393 + y * 668265263) ^ 0x55555555;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = (h >> 16) ^ h;
        const v = (h & 0xFF) / 255; // 0~1
        _tileNoiseCache[key] = v;
        return v;
    };

    /** 混合两个hex颜色 (0~1 blend) */
    GST.blendColors = function(c1, c2, t) {
        const r1 = parseInt(c1.slice(1, 3), 16);
        const g1 = parseInt(c1.slice(3, 5), 16);
        const b1 = parseInt(c1.slice(5, 7), 16);
        const r2 = parseInt(c2.slice(1, 3), 16);
        const g2 = parseInt(c2.slice(3, 5), 16);
        const b2 = parseInt(c2.slice(5, 7), 16);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };


    // 【全局聊天开关】设为 false 时完全禁止所有 NPC 间聊天
    GST.CHAT_ENABLED = false;

})();
