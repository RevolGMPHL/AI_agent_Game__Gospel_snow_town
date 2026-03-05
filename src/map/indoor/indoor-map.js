/**
 * 福音镇 - IndoorMap 室内地图基类
 * 所有室内场景的通用基类，含底图PNG渲染、出口trigger
 */
(function() {
    'use strict';
    const GST = window.GST;

    class IndoorMap extends GST.BaseMap {
        constructor(w, h, name, exitTarget, exitSpawn) {
            super(w, h, name);
            this.exitTarget = exitTarget;
            this.exitSpawn = exitSpawn; // { x, y } 在主地图上出门后的位置
            this.indoorMapKey = null; // 子类设置，用于加载底图PNG（如 'warehouse_indoor'）
            // 默认出口在底部中间
            this.triggers.push({
                x: Math.floor(w / 2) - 1, y: h - 1, w: 2, h: 1,
                target: 'village',
                name: '出门',
                spawnX: exitSpawn ? exitSpawn.x : 40,
                spawnY: exitSpawn ? exitSpawn.y : 25
            });
        }
    
        /** ★ 室内底图渲染：优先用PNG底图，无底图时 fallback 到逐格着色 */
        drawGrid(ctx, camera) {
            if (this.indoorMapKey && typeof SpriteLoader !== 'undefined' && SpriteLoader.enabled) {
                const baseMap = SpriteLoader.getMap(this.indoorMapKey);
                if (baseMap) {
                    // 底图一次绘制，覆盖整个室内区域
                    ctx.drawImage(baseMap, 0, 0, this.width * GST.TILE, this.height * GST.TILE);
                    this._hasBaseMap = true;
                    return;
                }
            }
            this._hasBaseMap = false;
            // fallback: 逐格纯色绘制
            super.drawGrid(ctx, camera);
        }
    
        getTileColor(x, y) {
            if (x < 0 || y < 0 || x >= this.width || y >= this.height) return '#000';
            // 墙壁
            if (y === 0) return GST.C.WALL_INT;
            if (x === 0 || x === this.width - 1) return GST.C.WALL_INT2;
            // 出口
            if (y === this.height - 1 && x >= Math.floor(this.width / 2) - 1 && x <= Math.floor(this.width / 2)) return GST.C.DOOR;
            if (y === this.height - 1) return GST.C.WALL_INT2;
            // 地板
            return this.floorColor || GST.C.FLOOR_WOOD;
        }
    
        isSolid(px, py) {
            const gx = px / GST.TILE;
            const gy = py / GST.TILE;
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

    GST.IndoorMap = IndoorMap;
})();
