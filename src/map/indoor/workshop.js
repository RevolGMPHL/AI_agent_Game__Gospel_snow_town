/**
 * 福音镇 - WorkshopMap 工坊
 */
(function() {
    'use strict';
    const GST = window.GST;

    class WorkshopMap extends GST.IndoorMap {
        constructor() {
            super(12, 8, '工坊', 'village', { x: 24, y: 31 });
            this.indoorMapKey = 'workshop_indoor';
            this.floorColor = GST.C.FLOOR_STONE;
            this.radioRepaired = false; // 无线电是否已修好
            this.furniture = [
                { x: 1, y: 1, w: 3, h: 2, color: GST.C.TABLE,   name: '工作台' },
                { x: 5, y: 1, w: 3, h: 2, color: '#606060', name: '发电机' },
                { x: 9, y: 1, w: 2, h: 3, color: GST.C.SHELF,   name: '工具架' },
                { x: 1, y: 4, w: 3, h: 2, color: '#7A7A7A', name: '建材堆' },
                { x: 5, y: 4, w: 3, h: 2, color: '#5A6A5A', name: '无线电台' },
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
            // 发电机指示灯 + 无线电台状态（底图模式下跳过）
            if (!this._hasBaseMap) {
                const t = Date.now() / 500;
                ctx.fillStyle = `rgba(80,255,80,${0.4 + Math.sin(t) * 0.3})`;
                ctx.beginPath();
                ctx.arc(6.5 * GST.TILE, 1.5 * GST.TILE, 4, 0, Math.PI * 2);
                ctx.fill();
    
                const radioX = 6.5 * GST.TILE, radioY = 5 * GST.TILE;
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

    GST.WorkshopMap = WorkshopMap;
})();
