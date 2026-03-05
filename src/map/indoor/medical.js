/**
 * 福音镇 - MedicalMap 医疗站
 */
(function() {
    'use strict';
    const GST = window.GST;

    class MedicalMap extends GST.IndoorMap {
        constructor() {
            super(10, 8, '医疗站', 'village', { x: 33, y: 16 });
            this.indoorMapKey = 'medical_indoor';
            this.floorColor = GST.C.FLOOR_TILE;
            this.furniture = [
                { x: 1, y: 1, w: 2, h: 2, color: GST.C.BED,     name: '病床1' },
                { x: 4, y: 1, w: 2, h: 2, color: GST.C.BED,     name: '病床2' },
                { x: 7, y: 1, w: 2, h: 2, color: GST.C.BED_RED, name: '病床3' },
                { x: 1, y: 4, w: 2, h: 1, color: GST.C.COUNTER, name: '药柜' },
                { x: 4, y: 4, w: 3, h: 2, color: GST.C.TABLE,   name: '诊疗台' },
                { x: 8, y: 4, w: 1, h: 3, color: GST.C.SHELF,   name: '草药架' },
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
                // 药柜红十字标记
                ctx.fillStyle = '#E06060';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('➕', 2 * GST.TILE, 4.7 * GST.TILE);
                ctx.textAlign = 'left';
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
            let desc = '你在医疗站里，空气中弥漫着草药的味道。这里有3张病床、药柜和草药架。';
            if (others.length > 0) desc += `医疗站里有${others.join('、')}。`;
            else desc += '医疗站目前空无一人。';
            desc += '出口在南边。';
            return desc;
        }
    
        getInterestPoints(gx, gy) {
            return [
                { x: 5, y: 6, name: '诊疗台旁', desc: '接受治疗', walkTo: { x: 5, y: 6 } },
                { x: 8, y: 6, name: '草药架旁', desc: '查看草药', walkTo: { x: 8, y: 6 } },
                ...super.getInterestPoints(gx, gy)
            ];
        }
    }

    GST.MedicalMap = MedicalMap;
})();
