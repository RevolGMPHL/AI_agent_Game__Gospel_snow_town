/**
 * 福音镇 - WarehouseMap 仓库
 */
(function() {
    'use strict';
    const GST = window.GST;

    class WarehouseMap extends GST.IndoorMap {
        constructor() {
            super(10, 8, '仓库', 'village', { x: 16, y: 16 });
            this.indoorMapKey = 'warehouse_indoor';
            this.floorColor = GST.C.FLOOR_STONE;
            // 4个储物分区
            this.furniture = [
                { x: 1, y: 1, w: 3, h: 2, color: '#8B5520', name: '🪵木柴区', zone: 'wood' },
                { x: 6, y: 1, w: 3, h: 2, color: '#A09050', name: '🍖食物区', zone: 'food' },
                { x: 1, y: 4, w: 3, h: 2, color: '#7A7A7A', name: '⚡电力区', zone: 'power' },
                { x: 6, y: 4, w: 3, h: 2, color: '#6A5A4A', name: '📦杂物区', zone: 'misc' },
            ];
        }
    
        drawGrid(ctx, camera) {
            super.drawGrid(ctx, camera);
            if (!this._hasBaseMap) {
                for (const f of this.furniture) {
                    ctx.fillStyle = f.color;
                    ctx.fillRect(f.x * GST.TILE, f.y * GST.TILE, f.w * GST.TILE, f.h * GST.TILE);
    
                    // 资源量视觉堆叠（根据实际资源量动态调整）
                    let fillPct = 0.5; // 默认50%
                    if (typeof window !== 'undefined' && window.game && window.game.resourceSystem) {
                        const rs = window.game.resourceSystem;
                        if (f.zone === 'wood') fillPct = Math.min(1, rs.woodFuel / 80);
                        else if (f.zone === 'food') fillPct = Math.min(1, rs.food / 60);
                        else if (f.zone === 'power') fillPct = Math.min(1, rs.power / 60);
                        else fillPct = 0.3;
                    }
                    // 堆叠高度
                    const stackH = f.h * GST.TILE * fillPct;
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.fillRect(f.x * GST.TILE, (f.y + f.h) * GST.TILE - stackH, f.w * GST.TILE, stackH);
    
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(f.name, (f.x + f.w / 2) * GST.TILE, (f.y - 0.3) * GST.TILE);
                    ctx.textAlign = 'left';
                }
                // 分区分隔线
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(5 * GST.TILE, 1 * GST.TILE);
                ctx.lineTo(5 * GST.TILE, 6 * GST.TILE);
                ctx.moveTo(1 * GST.TILE, 3.5 * GST.TILE);
                ctx.lineTo(9 * GST.TILE, 3.5 * GST.TILE);
                ctx.stroke();
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
            let desc = '你在仓库里。四个储物区分别存放着木柴、食物、电力储备和杂物。';
            if (typeof window !== 'undefined' && window.game && window.game.resourceSystem) {
                const rs = window.game.resourceSystem;
                desc += `木柴:${Math.round(rs.woodFuel)} 食物:${Math.round(rs.food)} 电力:${Math.round(rs.power)}。`;
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

    GST.WarehouseMap = WarehouseMap;
})();
