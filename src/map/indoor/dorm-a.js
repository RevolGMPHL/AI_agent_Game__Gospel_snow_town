/**
 * 福音镇 - DormAMap 宿舍A
 */
(function() {
    'use strict';
    const GST = window.GST;

    class DormAMap extends GST.IndoorMap {
        constructor() {
            super(12, 8, '宿舍A', 'village', { x: 16, y: 24 });
            this.indoorMapKey = 'dorm_a_indoor';
            this.floorColor = GST.C.FLOOR_WOOD;
            // 5张床铺（男生宿舍）+ 取暖火盆 + 简易桌椅
            this.furniture = [
                { x: 1, y: 1, w: 2, h: 1, color: GST.C.BED,     name: '赵铁柱的床' },
                { x: 3, y: 1, w: 2, h: 1, color: GST.C.BED,     name: '王策的床' },
                { x: 5, y: 1, w: 2, h: 1, color: GST.C.BED_RED, name: '苏岩的床' },
                { x: 7, y: 1, w: 2, h: 1, color: GST.C.BED_RED, name: '陆辰的床' },
                { x: 9, y: 1, w: 2, h: 1, color: GST.C.BED,     name: '老钱的床' },
                { x: 5,  y: 4, w: 2, h: 2, color: '#A05030', name: '取暖火盆' },
                { x: 1,  y: 5, w: 2, h: 1, color: GST.C.TABLE,  name: '简易桌' },
                { x: 9,  y: 5, w: 2, h: 1, color: GST.C.TABLE,  name: '杂物桌' },
            ];
            this.beds = [
                { npc: '赵铁柱', x: 1, y: 2 },
                { npc: '王策',   x: 3, y: 2 },
                { npc: '苏岩',   x: 5, y: 2 },
                { npc: '陆辰',   x: 7, y: 2 },
                { npc: '老钱',   x: 9, y: 2 },
            ];
        }
    
        drawGrid(ctx, camera) {
            super.drawGrid(ctx, camera);
            // 底图模式下跳过家具色块（已烘焙进底图），只绘制动态效果
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
            // 火盆火焰效果（底图模式下跳过，底图已包含火盆视觉）
            if (!this._hasBaseMap) {
                const t = Date.now() / 300;
                const cx = 6 * GST.TILE, cy = 5 * GST.TILE;
                ctx.fillStyle = `rgba(255,120,30,${0.4 + Math.sin(t) * 0.15})`;
                ctx.beginPath();
                ctx.arc(cx, cy, 10, 0, Math.PI * 2);
                ctx.fill();
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
            let desc = '你在宿舍A里。这里住着赵铁柱、王策、苏岩、陆辰、老钱。';
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

    GST.DormAMap = DormAMap;
})();
