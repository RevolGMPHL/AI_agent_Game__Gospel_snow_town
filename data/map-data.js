/**
 * 福音镇 - 地图配置数据
 * 村庄地图配置（网格定义、碰撞矩阵、装饰物坐标、建筑入口位置）
 * 注意：地图数据直接嵌入各地图类的构造函数中（VillageMap/IndoorMap子类），
 * 因为地图数据与地图类的 getTileColor/isSolid 逻辑紧密耦合，
 * 强行分离会导致过度拆分，不符合SRP原则。
 * 挂载到 GST.MAP_DATA
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.MAP_DATA = {
        // 地图级别的数据保留在各地图类中
        // 此文件仅提供地图相关的共享常量
        VILLAGE_SIZE: { width: 50, height: 40 },
        WALL_BOUNDS: { x1: 11, y1: 9, x2: 39, y2: 31 },
        NORTH_GATE: { x: 24, y: 9, w: 2 },
        SOUTH_GATE: { x: 24, y: 31, w: 2 },
    };

})();
