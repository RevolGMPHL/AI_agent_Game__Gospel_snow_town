/**
 * 福音镇 - 渲染引擎
 * Canvas 分层渲染、日夜交替、雨雪效果、HUD、小地图
 * 通过 mixin 模式挂载到 Game.prototype
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.Game.prototype;

    proto._drawDayNightOverlay = function() {
        const ctx = this.ctx;
        const hour = (this.gameTimeSeconds / 3600) % 24;
        let alpha = 0;
        let r = 0, g = 0, b = 0;

        if (hour >= 0 && hour < 5) {
            // 深夜 0:00~5:00 —— 深蓝色遮罩
            alpha = 0.55;
            r = 10; g = 15; b = 50;
        } else if (hour >= 5 && hour < 7) {
            // 黎明 5:00~7:00 —— 从深蓝渐变到暖橙
            const t = (hour - 5) / 2; // 0~1
            alpha = 0.55 * (1 - t) + 0.05 * t;
            r = Math.floor(10 + (255 - 10) * t * 0.5);
            g = Math.floor(15 + (180 - 15) * t * 0.5);
            b = Math.floor(50 + (80 - 50) * t * 0.3);
        } else if (hour >= 7 && hour < 17) {
            // 白天 7:00~17:00 —— 几乎无遮罩
            alpha = 0.0;
        } else if (hour >= 17 && hour < 19) {
            // 黄昏 17:00~19:00 —— 暖橙渐变
            const t = (hour - 17) / 2; // 0~1
            alpha = 0.02 + 0.2 * t;
            r = Math.floor(180 * t);
            g = Math.floor(100 * t);
            b = Math.floor(30 * t);
        } else if (hour >= 19 && hour < 21) {
            // 入夜 19:00~21:00 —— 从橙到蓝
            const t = (hour - 19) / 2; // 0~1
            alpha = 0.22 + 0.25 * t;
            r = Math.floor(180 * (1 - t) + 10 * t);
            g = Math.floor(100 * (1 - t) + 15 * t);
            b = Math.floor(30 * (1 - t) + 50 * t);
        } else {
            // 深夜 21:00~24:00
            alpha = 0.5;
            r = 10; g = 15; b = 50;
        }

        if (alpha > 0.01) {
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        }

        // 多云/雨天额外加暗 —— 使用WeatherSystem的天气
        const wsWeather = this.weatherSystem ? this.weatherSystem.currentWeather : this.weather;
        if (wsWeather === '多云') {
            ctx.fillStyle = 'rgba(80,80,90,0.1)';
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        } else if (wsWeather === '小雨') {
            ctx.fillStyle = 'rgba(60,65,80,0.15)';
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        } else if (wsWeather === '大雨' || wsWeather === '大雪') {
            ctx.fillStyle = 'rgba(40,45,60,0.25)';
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        } else if (wsWeather === '极寒暴风雪') {
            ctx.fillStyle = 'rgba(30,35,50,0.35)';
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        }
    }

    /** 绘制雨滴效果 */;

    proto._drawDebugGrid = function(map) {
        const ctx = this.ctx;
        const sx = Math.floor(this.camera.x / GST.TILE);
        const sy = Math.floor(this.camera.y / GST.TILE);
        const ex = sx + Math.ceil(this.canvas.width / GST.TILE) + 1;
        const ey = sy + Math.ceil(this.canvas.height / GST.TILE) + 1;

        ctx.strokeStyle = 'rgba(255,255,0,0.2)';
        ctx.lineWidth = 0.5;
        for (let x = sx; x <= ex; x++) {
            ctx.beginPath();
            ctx.moveTo(x * GST.TILE, sy * GST.TILE);
            ctx.lineTo(x * GST.TILE, ey * GST.TILE);
            ctx.stroke();
        }
        for (let y = sy; y <= ey; y++) {
            ctx.beginPath();
            ctx.moveTo(sx * GST.TILE, y * GST.TILE);
            ctx.lineTo(ex * GST.TILE, y * GST.TILE);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,0,0,0.15)';
        for (let x = sx; x <= Math.min(ex, map.width - 1); x++) {
            for (let y = sy; y <= Math.min(ey, map.height - 1); y++) {
                if (x >= 0 && y >= 0 && map.isSolid(x * GST.TILE + GST.TILE / 2, y * GST.TILE + GST.TILE / 2)) {
                    ctx.fillRect(x * GST.TILE, y * GST.TILE, GST.TILE, GST.TILE);
                }
            }
        }

        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,255,0,0.4)';
        for (let x = sx; x <= ex; x++) {
            for (let y = sy; y <= ey; y++) {
                if (x % 5 === 0 && y % 5 === 0 && x >= 0 && y >= 0) {
                    ctx.fillText(`${x},${y}`, x * GST.TILE + 1, y * GST.TILE + 9);
                }
            }
        }
    };

    proto._drawHUD = function() {
        const ctx = this.ctx;
        const hours = Math.floor((this.gameTimeSeconds / 3600) % 24);
        const minutes = Math.floor((this.gameTimeSeconds / 60) % 60);
        // 【修复】统一使用 WeatherSystem 的天气信息
        const ws = this.weatherSystem;
        const wEmoji = ws ? ws.weatherEmoji : '☀️';
        const wName = ws ? ws.currentWeather : this.weather;
        const timeStr = `第 ${this.dayCount} 天  ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}  ${wEmoji} ${wName}`;

        // 右下角时间
        ctx.save();
        ctx.font = 'bold 14px -apple-system, sans-serif';
        const tw = ctx.measureText(timeStr).width;
        const px = 12;
        const bw = tw + px * 2;
        const bh = 30;
        const bx = this.viewW - bw - 16;
        const by = this.viewH - bh - 12;

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 8);
        ctx.fill();

        ctx.fillStyle = (hours >= 6 && hours < 18) ? '#FFE8A0' : '#A0C8FF';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, bx + bw / 2, by + 20);
        ctx.textAlign = 'left';
        ctx.restore();

        // 左上角：当前跟随 NPC 名（AI 模式）
        if (this.isAgentMode && this.followTarget) {
            ctx.save();
            const name = `📷 ${this.followTarget.name}`;
            ctx.font = 'bold 12px -apple-system, sans-serif';
            const nw = ctx.measureText(name).width + 20;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.roundRect(12, 12, nw, 26, 6);
            ctx.fill();
            ctx.fillStyle = '#4A9F6E';
            ctx.fillText(name, 22, 30);
            ctx.restore();
        }
    };

    proto._drawMinimap = function() {
        const map = this.maps[this.currentScene];
        const scale = 2;
        const pad = 14;
        const mw = map.width * scale;
        const mh = map.height * scale;
        const mx = pad;
        const my = this.viewH - mh - pad;

        const ctx = this.ctx;

        // 小地图外框（毛玻璃风）
        ctx.fillStyle = 'rgba(6,10,16,0.6)';
        ctx.beginPath();
        ctx.roundRect(mx - 5, my - 18, mw + 10, mh + 23, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(136,221,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx - 5, my - 18, mw + 10, mh + 23, 8);
        ctx.stroke();

        // 小地图标题
        ctx.fillStyle = 'rgba(136,221,255,0.6)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(map.name, mx + mw / 2, my - 7);
        ctx.textAlign = 'left';

        // 地图内容
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 3);
        ctx.clip();
        for (let gy = 0; gy < map.height; gy++) {
            for (let gx = 0; gx < map.width; gx++) {
                ctx.fillStyle = map.getTileColor(gx, gy);
                ctx.fillRect(mx + gx * scale, my + gy * scale, scale, scale);
            }
        }
        ctx.restore();

        // NPC 点（带辉光）
        for (const npc of this.npcs) {
            if (npc.currentScene !== this.currentScene) continue;
            if (npc.isDead) continue;
            const np = npc.getGridPos();
            // 辉光
            ctx.fillStyle = (npc.color || GST.C.NPC).replace(')', ',0.3)').replace('rgb', 'rgba');
            ctx.beginPath();
            ctx.arc(mx + np.x * scale, my + np.y * scale, 3, 0, Math.PI * 2);
            ctx.fill();
            // 实点
            ctx.fillStyle = npc.color || GST.C.NPC;
            ctx.fillRect(mx + np.x * scale - 1, my + np.y * scale - 1, 3, 3);
        }

        // 跟随高亮（脉冲环）
        if (this.followTarget && this.followTarget.currentScene === this.currentScene) {
            const fp = this.followTarget.getGridPos();
            const pulse = Math.sin(Date.now() / 400) * 0.3 + 0.7;
            ctx.strokeStyle = `rgba(0,191,255,${pulse})`;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(mx + fp.x * scale - 3, my + fp.y * scale - 3, 7, 7);
        }

        // 视口框（冰霜色）
        ctx.strokeStyle = 'rgba(136,221,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            mx + (this.camera.x / GST.TILE) * scale,
            my + (this.camera.y / GST.TILE) * scale,
            (this.viewW / GST.TILE) * scale,
            (this.viewH / GST.TILE) * scale
        );
    }

    // ---- 轮回重生 ----;

    proto._drawRain = function() {
        const ctx = this.ctx;
        const w = this.viewW;
        const h = this.viewH;
        const count = Math.floor(this.rainIntensity * 120);

        // 维护雨滴粒子
        while (this.rainDrops.length < count) {
            this.rainDrops.push({
                x: Math.random() * w,
                y: Math.random() * h,
                speed: 400 + Math.random() * 300,
                length: 8 + Math.random() * 12
            });
        }
        while (this.rainDrops.length > count) {
            this.rainDrops.pop();
        }

        ctx.strokeStyle = this.weather === '大雨' 
            ? 'rgba(180,195,220,0.5)' 
            : 'rgba(180,195,220,0.3)';
        ctx.lineWidth = this.weather === '大雨' ? 1.5 : 1;

        const gameDt = 1 / 60; // 近似帧时间
        for (const drop of this.rainDrops) {
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x - 2, drop.y + drop.length);
            ctx.stroke();

            drop.y += drop.speed * gameDt;
            drop.x -= 30 * gameDt; // 微微偏斜
            if (drop.y > h) {
                drop.y = -drop.length;
                drop.x = Math.random() * w;
            }
        }
    };

    proto.draw = function() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.viewW, this.viewH);

        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        const map = this.maps[this.currentScene];

        // 1. 地面 + 装饰
        map.drawGrid(ctx, this.camera);

        // 1.5 【地面级对象】先绘制暖炉广场、资源区域等地面物体，确保NPC始终显示在其上方
        for (const obj of map.objects) {
            if (obj.isGround) obj.draw(ctx);
        }

        // 2. Y-sort（建筑对象 + 同场景 NPC）—— 排除已绘制的地面对象
        const entities = [];
        for (const obj of map.objects) {
            if (!obj.isGround) entities.push(obj);
        }
        for (const npc of this.npcs) {
            // 【渲染保障】只渲染存活且在当前场景的NPC，确保不跳过存活NPC
            if (!npc.isDead && npc.currentScene === this.currentScene) entities.push(npc);
        }
        entities.sort((a, b) => (a.getSortY() - b.getSortY()));
        for (const e of entities) e.draw(ctx);

        // 2.5 对话气泡层 —— 在所有实体之上单独绘制，确保说话内容不被遮挡
        for (const npc of this.npcs) {
            if (!npc.isDead && npc.currentScene === this.currentScene) {
                npc.drawBubbleLayer(ctx);
            }
        }

        // 3. 当前跟随高亮（AI 模式下绘制跟随指示框）
        if (this.isAgentMode && this.followTarget && this.followTarget.currentScene === this.currentScene) {
            const ft = this.followTarget;
            const pulse = Math.sin(Date.now() / 300) * 0.15 + 0.65;
            ctx.strokeStyle = `rgba(0,191,255,${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(ft.x - 2, ft.y - 2, GST.TILE + 4, GST.TILE + 4);
            ctx.setLineDash([]);
        }

        // 4. Debug 网格
        if (this.showGrid) this._drawDebugGrid(map);

        ctx.restore();

        // 5. UI 层
        this._drawHUD();
        this._drawMinimap();

        // 6. 暂停遮罩
        if (this.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(0, 0, this.viewW, this.viewH);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⏸ 已暂停', this.viewW / 2, this.viewH / 2);
            ctx.font = '13px sans-serif';
            ctx.fillText('按 空格 继续', this.viewW / 2, this.viewH / 2 + 28);
            ctx.textAlign = 'left';
        }

        // 7. 昼夜光照遮罩 — 使用WeatherSystem替代原有昼夜系统
        if (this.weatherSystem) {
            this.weatherSystem.drawDayNightOverlay(this.ctx);
        } else {
            this._drawDayNightOverlay();
        }

        // 8. 天气效果（雪花/暴风雪 替代 雨滴）
        if (this.weatherSystem) {
            this.weatherSystem.drawSnow(this.ctx);
        } else if (this.rainIntensity > 0) {
            this._drawRain();
        }

        // 8.5. 墓碑渲染
        if (this.deathSystem) {
            const map = this.maps[this.currentScene];
            this.deathSystem.renderGraves(this.ctx, this.camera.x - this.viewW / 2, this.camera.y - this.viewH / 2);
        }

        // 9. 淡入淡出
        if (this.fadeAlpha > 0) {
            ctx.fillStyle = `rgba(0,0,0,${this.fadeAlpha})`;
            ctx.fillRect(0, 0, this.viewW, this.viewH);
        }
    }

    /** 昼夜光照遮罩 */;

})();
