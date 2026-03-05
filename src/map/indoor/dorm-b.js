/**
 * 福音镇 - DormBMap 宿舍B
 */
(function() {
    'use strict';
    const GST = window.GST;

    class DormBMap extends GST.IndoorMap {
        constructor() {
            super(12, 8, '宿舍B', 'village', { x: 33, y: 24 });
            this.indoorMapKey = 'dorm_b_indoor';
            this.floorColor = GST.C.FLOOR_WOOD;
            this.secondFurnaceBuilt = false; // 第二暖炉是否已建成
            this.furniture = [
                { x: 1, y: 1, w: 2, h: 1, color: GST.C.BED,     name: '李婶的床' },
                { x: 4, y: 1, w: 2, h: 1, color: '#E080A0', name: '歆玥的床' },
                { x: 7, y: 1, w: 2, h: 1, color: '#4090B0', name: '清璇的床' },
                { x: 10, y: 1, w: 1, h: 1, color: '#E0A0B0', name: '空床位' },
                { x: 1,  y: 4, w: 2, h: 2, color: '#A05030', name: '取暖火盆' },
                { x: 5,  y: 5, w: 2, h: 1, color: GST.C.TABLE,  name: '简易桌' },
                // 第二暖炉预留区域 (9,4) ~ (11,6)
            ];
            this.beds = [
                { npc: '李婶', x: 1, y: 2 },
                { npc: '歆玥', x: 4, y: 2 },
                { npc: '清璇', x: 7, y: 2 },
            ];
            this.furnaceSlot = { x: 9, y: 4, w: 2, h: 2 }; // 第二暖炉预留位置
        }
    
        drawGrid(ctx, camera) {
            super.drawGrid(ctx, camera);
            // 底图模式下跳过家具色块
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
            // 火盆 + 第二暖炉预留区域（底图模式下全部跳过）
            if (!this._hasBaseMap) {
                const t = Date.now() / 300;
                const cx = 2 * GST.TILE, cy = 5 * GST.TILE;
                ctx.fillStyle = `rgba(255,120,30,${0.4 + Math.sin(t) * 0.15})`;
                ctx.beginPath();
                ctx.arc(cx, cy, 10, 0, Math.PI * 2);
                ctx.fill();
    
                const fs = this.furnaceSlot;
                if (this.secondFurnaceBuilt) {
                    ctx.fillStyle = '#505050';
                    ctx.fillRect(fs.x * GST.TILE, fs.y * GST.TILE, fs.w * GST.TILE, fs.h * GST.TILE);
                    ctx.fillStyle = `rgba(255,150,40,${0.5 + Math.sin(t * 1.2) * 0.2})`;
                    ctx.beginPath();
                    ctx.arc((fs.x + fs.w / 2) * GST.TILE, (fs.y + fs.h / 2) * GST.TILE, 12, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#FFE080';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('🔥第二暖炉', (fs.x + fs.w / 2) * GST.TILE, (fs.y - 0.3) * GST.TILE);
                    ctx.textAlign = 'left';
                } else {
                    // 未建成 — 虚线标注"可建造"
                    ctx.strokeStyle = 'rgba(255,200,80,0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.strokeRect(fs.x * GST.TILE + 2, fs.y * GST.TILE + 2, fs.w * GST.TILE - 4, fs.h * GST.TILE - 4);
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(255,200,80,0.6)';
                    ctx.font = '8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('📐可建造', (fs.x + fs.w / 2) * GST.TILE, (fs.y + fs.h / 2) * GST.TILE + 3);
                    ctx.textAlign = 'left';
                }
            }
        }
    
        _isFurnitureSolid(gx, gy) {
            for (const f of this.furniture) {
                if (gx >= f.x && gx < f.x + f.w && gy >= f.y && gy < f.y + f.h) return true;
            }
            // 第二暖炉建成后也是碰撞体
            if (this.secondFurnaceBuilt) {
                const fs = this.furnaceSlot;
                if (gx >= fs.x && gx < fs.x + fs.w && gy >= fs.y && gy < fs.y + fs.h) return true;
            }
            return false;
        }
    
        describe(gx, gy) {
            const others = this._getOtherPeopleHere();
            let desc = '你在宿舍B里。这里住着李婶、歆玥、清璇。';
            if (this.secondFurnaceBuilt) desc += '第二暖炉已经建成，房间温暖了许多。';
            else desc += '角落有一块空地，标注着"可建造第二暖炉"。';
            if (others.length > 0) desc += `房间里有${others.join('、')}。`;
            desc += '出口在南边。';
            return desc;
        }
    
        getInterestPoints(gx, gy) {
            return [
                { x: 2, y: 2, name: '床边', desc: '休息', walkTo: { x: 2, y: 2 } },
                { x: 2, y: 5, name: '火盆旁', desc: '取暖', walkTo: { x: 2, y: 5 } },
                ...super.getInterestPoints(gx, gy)
            ];
        }
    
        getRoomForNPC(npcName) {
            const bed = this.beds.find(b => b.npc === npcName);
            if (bed) return { x: bed.x, y: bed.y };
            return { x: 6, y: 4 };
        }
    }

    GST.DormBMap = DormBMap;
})();
