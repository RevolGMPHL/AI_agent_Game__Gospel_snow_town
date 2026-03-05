/**
 * 福音镇 - CommandMap 指挥所
 */
(function() {
    'use strict';
    const GST = window.GST;

    class CommandMap extends GST.IndoorMap {
        constructor() {
            super(8, 6, '指挥所', 'village', { x: 35, y: 30 });
            this.floorColor = GST.C.FLOOR_STONE;
            this.furniture = [
                { x: 1, y: 1, w: 3, h: 2, color: GST.C.TABLE,   name: '指挥桌' },
                { x: 5, y: 1, w: 2, h: 2, color: GST.C.SHELF,   name: '资料架' },
                { x: 1, y: 4, w: 2, h: 1, color: '#5A6A5A', name: '通讯台' },
                { x: 5, y: 4, w: 2, h: 1, color: '#7A7A7A', name: '物资箱' },
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
            // 通讯台指示灯（底图模式下跳过）
            if (!this._hasBaseMap) {
                const t = Date.now() / 600;
                ctx.fillStyle = `rgba(80,200,255,${0.3 + Math.sin(t) * 0.25})`;
                ctx.beginPath();
                ctx.arc(2 * GST.TILE, 4.5 * GST.TILE, 4, 0, Math.PI * 2);
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
            let desc = '你在指挥所里。墙上挂着据点地图，指挥桌上散落着各种文件和报告。角落的通讯台发出微弱的电流声。';
            if (others.length > 0) desc += `指挥所里有${others.join('、')}。`;
            desc += '出口在南边。';
            return desc;
        }
    
        getInterestPoints(gx, gy) {
            return [
                { x: 2, y: 3, name: '指挥桌', desc: '查看指令', walkTo: { x: 2, y: 3 } },
                { x: 2, y: 4, name: '通讯台', desc: '使用通讯台', walkTo: { x: 2, y: 4 } },
                ...super.getInterestPoints(gx, gy)
            ];
        }
    }

    GST.CommandMap = CommandMap;
})();
