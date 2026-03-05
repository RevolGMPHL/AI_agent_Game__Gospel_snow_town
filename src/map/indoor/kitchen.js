/**
 * 福音镇 - KitchenMap 炊事房
 */
(function() {
    'use strict';
    const GST = window.GST;

    class KitchenMap extends GST.IndoorMap {
        constructor() {
            super(8, 8, '炊事房', 'village', { x: 15, y: 31 });
            this.indoorMapKey = 'kitchen_indoor';
            this.floorColor = GST.C.FLOOR_TILE;
            this.furniture = [
                { x: 1, y: 1, w: 3, h: 1, color: GST.C.STOVE,   name: '灶台' },
                { x: 5, y: 1, w: 2, h: 2, color: GST.C.SHELF,   name: '食材架' },
                { x: 2, y: 4, w: 4, h: 2, color: GST.C.TABLE,   name: '餐桌' },
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
            if (!this._hasBaseMap) {
                for (const f of this.furniture) {
                    ctx.fillStyle = f.color;
                    ctx.fillRect(f.x * GST.TILE, f.y * GST.TILE, f.w * GST.TILE, f.h * GST.TILE);
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = '7px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(f.name, (f.x + f.w / 2) * GST.TILE, (f.y - 0.2) * GST.TILE);
                    ctx.textAlign = 'left';
                }
            }
            // 灶台火焰（底图模式下跳过）
            if (!this._hasBaseMap) {
                const t = Date.now() / 250;
                ctx.fillStyle = `rgba(255,140,40,${0.3 + Math.sin(t) * 0.2})`;
                ctx.beginPath();
                ctx.arc(2.5 * GST.TILE, 1.5 * GST.TILE, 8, 0, Math.PI * 2);
                ctx.fill();
            }
    
            // 座位标记（fallback模式下绘制）
            if (!this._hasBaseMap) {
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                for (const s of this.seats) {
                    ctx.fillRect(s.x * GST.TILE + 4, s.y * GST.TILE + 4, GST.TILE - 8, GST.TILE - 8);
                }
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

    GST.KitchenMap = KitchenMap;
})();
