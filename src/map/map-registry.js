/**
 * 福音镇 - MapRegistry 地图注册中心
 * 所有地图实例通过注册表获取（DIP原则）
 */
(function() {
    'use strict';
    const GST = window.GST;

    /**
     * 地图注册中心
     * 所有地图通过此注册表获取，game.js 不直接 new 具体地图类
     */
    class MapRegistry {
        constructor() {
            this._maps = {};
        }

        register(key, mapInstance) {
            this._maps[key] = mapInstance;
        }

        get(key) {
            return this._maps[key] || null;
        }

        getAll() {
            return { ...this._maps };
        }

        keys() {
            return Object.keys(this._maps);
        }
    }

    // 创建全局注册表实例
    const registry = new MapRegistry();

    // 注册所有地图
    registry.register('village', new GST.VillageMap());
    registry.register('dorm_a', new GST.DormAMap());
    registry.register('dorm_b', new GST.DormBMap());
    registry.register('medical', new GST.MedicalMap());
    registry.register('warehouse', new GST.WarehouseMap());
    registry.register('workshop', new GST.WorkshopMap());
    registry.register('kitchen', new GST.KitchenMap());
    registry.register('command', new GST.CommandMap());

    GST.MapRegistry = registry;
})();
