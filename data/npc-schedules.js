/**
 * 福音镇 - NPC 日程数据
 * 日程目标位置映射 + 室内座位定义
 * 挂载到 GST.SCHEDULE_LOCATIONS, GST.INDOOR_SEATS
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.SCHEDULE_LOCATIONS = {
    // ---- 建筑门口（村庄地图） ----
    warehouse_door:  { scene: 'village', x: 16, y: 16 },  // 仓库门口
    medical_door:    { scene: 'village', x: 33, y: 16 },  // 医疗站门口
    dorm_a_door:     { scene: 'village', x: 16, y: 24 },  // 宿舍A门口
    dorm_b_door:     { scene: 'village', x: 33, y: 24 },  // 宿舍B门口
    kitchen_door:    { scene: 'village', x: 15, y: 30 },  // 炊事房门口（doorY=30，y=31是南围墙会卡住）
    workshop_door:   { scene: 'village', x: 24, y: 30 },  // 工坊门口（doorY=30，y=31是南围墙/南门位置）

    // ---- 室内默认位置 ----
    warehouse_inside:{ scene: 'warehouse', x: 5,  y: 6 },
    medical_inside:  { scene: 'medical',   x: 5,  y: 6 },
    dorm_a_inside:   { scene: 'dorm_a',    x: 6,  y: 4 },
    dorm_b_inside:   { scene: 'dorm_b',    x: 6,  y: 4 },
    kitchen_inside:  { scene: 'kitchen',   x: 3,  y: 3 },
    workshop_inside: { scene: 'workshop',  x: 4,  y: 6 },

    // ---- 宿舍床位 ----
    dorm_a_bed_0:    { scene: 'dorm_a',    x: 1,  y: 2 },  // 赵铁柱
    dorm_a_bed_1:    { scene: 'dorm_a',    x: 3,  y: 2 },  // 王策
    dorm_a_bed_2:    { scene: 'dorm_a',    x: 5,  y: 2 },  // 苏岩
    dorm_a_bed_3:    { scene: 'dorm_a',    x: 7,  y: 2 },  // 陆辰
    dorm_a_bed_4:    { scene: 'dorm_a',    x: 9,  y: 2 },  // 老钱
    dorm_b_bed_0:    { scene: 'dorm_b',    x: 1,  y: 2 },  // 李婶
    dorm_b_bed_1:    { scene: 'dorm_b',    x: 4,  y: 2 },  // 歆玥
    dorm_b_bed_2:    { scene: 'dorm_b',    x: 7,  y: 2 },  // 清璇

    // ---- 户外地标 ----
    furnace_plaza:   { scene: 'village', x: 25, y: 22 },  // 主暖炉广场（南侧，避开暖炉碰撞区）
    north_gate:      { scene: 'village', x: 25, y: 10 },  // 北门
    south_gate:      { scene: 'village', x: 25, y: 30 },  // 南门

    // ---- 户外资源采集区 ----
    lumber_camp:     { scene: 'village', x: 6,  y: 5 },   // 伐木场中心
    ruins_site:      { scene: 'village', x: 43, y: 5 },   // 废墟采集场中心
    frozen_lake:     { scene: 'village', x: 6,  y: 35 },  // 冰湖中心
    ore_pile:        { scene: 'village', x: 43, y: 35 },  // 矿渣堆中心

    // ---- 室内门口位置（底部出口） ----
    warehouse_indoor_door: { scene: 'warehouse', x: 4,  y: 7 },
    medical_indoor_door:   { scene: 'medical',   x: 4,  y: 7 },
    dorm_a_indoor_door:    { scene: 'dorm_a',    x: 5,  y: 7 },
    dorm_b_indoor_door:    { scene: 'dorm_b',    x: 5,  y: 7 },
    kitchen_indoor_door:   { scene: 'kitchen',   x: 3,  y: 7 },
    workshop_indoor_door:  { scene: 'workshop',  x: 5,  y: 7 },
};


    GST.INDOOR_SEATS = {
    // 宿舍A：火盆旁 + 桌边 + 床边
    dorm_a: [
        { x: 5,  y: 6, name: '火盆旁左' },
        { x: 7,  y: 6, name: '火盆旁右' },
        { x: 2,  y: 5, name: '简易桌旁' },
        { x: 10, y: 5, name: '杂物桌旁' },
        { x: 2,  y: 2, name: '赵铁柱床边' },
        { x: 4,  y: 2, name: '王策床边' },
        { x: 6,  y: 2, name: '苏岩床边' },
        { x: 8,  y: 2, name: '陆辰床边' },
        { x: 10, y: 2, name: '老钱床边' },
    ],
    // 宿舍B：火盆旁 + 桌边（女生宿舍）
    dorm_b: [
        { x: 1,  y: 6, name: '火盆旁' },
        { x: 3,  y: 5, name: '火盆前' },
        { x: 6,  y: 5, name: '桌旁' },
        { x: 2,  y: 2, name: '李婶床边' },
        { x: 5,  y: 2, name: '歆玥床边' },
        { x: 8,  y: 2, name: '清璇床边' },
    ],
    medical: [
        { x: 5,  y: 6, name: '诊疗台前' },
        { x: 7,  y: 6, name: '诊疗台旁' },
        { x: 2,  y: 3, name: '病床1旁' },
        { x: 5,  y: 3, name: '病床2旁' },
        { x: 8,  y: 3, name: '病床3旁' },
        { x: 8,  y: 6, name: '草药架旁' },
    ],
    // 仓库：各区域旁
    warehouse: [
        { x: 2,  y: 3, name: '木柴区旁' },
        { x: 7,  y: 3, name: '食物区旁' },
        { x: 2,  y: 6, name: '电力区旁' },
        { x: 7,  y: 6, name: '杂物区旁' },
        { x: 5,  y: 4, name: '仓库中央' },
    ],
    // 工坊：工作台旁 + 发电机旁 + 无线电台旁
    workshop: [
        { x: 2,  y: 3, name: '工作台前' },
        { x: 6,  y: 3, name: '发电机旁' },
        { x: 10, y: 3, name: '工具架旁' },
        { x: 2,  y: 6, name: '备件堆旁' },
        { x: 6,  y: 6, name: '无线电台旁' },
        { x: 8,  y: 6, name: '工坊南侧' },
    ],
    // 炊事房：灶台旁 + 餐桌座位
    kitchen: [
        { x: 2,  y: 2, name: '灶台旁' },
        { x: 6,  y: 2, name: '食材架旁' },
        { x: 1,  y: 4, name: '餐桌左1' },
        { x: 1,  y: 5, name: '餐桌左2' },
        { x: 6,  y: 4, name: '餐桌右1' },
        { x: 6,  y: 5, name: '餐桌右2' },
    ],
};


})();
