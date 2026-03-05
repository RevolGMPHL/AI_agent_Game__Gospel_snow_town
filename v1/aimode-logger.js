/**
 * AI模式专用日志系统
 * 仅在 agent / reincarnation 模式下工作，自动记录关键游戏事件到 /log/aimode_log/ 目录
 */
class AIModeLogger {
    constructor(game) {
        this.game = game;

        // 生成会话文件名：session_YYYYMMDD_HHmmss.log
        const now = new Date();
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        this.sessionFilename = `session_${timestamp}.log`;

        // 缓冲区
        this._buffer = [];
        this._lastFlushTime = Date.now();
        this._flushInterval = 5000; // 5秒（真实时间）
        this._flushThreshold = 10;  // 10条

        // 快照定时器（游戏时间秒累积）
        this._snapshotTimer = 0;
        this._snapshotInterval = 60; // 每60游戏秒

        // 写入文件头
        this._writeHeader();
    }

    /**
     * 写入日志文件头信息
     */
    _writeHeader() {
        const now = new Date();
        const header = [
            '========================================',
            `  AI模式运行日志`,
            `  启动时间: ${now.toLocaleString('zh-CN')}`,
            `  游戏模式: ${this.game.mode}`,
            `  会话文件: ${this.sessionFilename}`,
            '========================================',
            ''
        ].join('\n');

        fetch('/api/save-aimode-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: this.sessionFilename, content: header })
        }).catch(err => console.warn('[AIModeLogger] 写入文件头失败:', err));
    }

    /**
     * 记录一条日志
     * @param {string} category - 日志分类，如 DEATH, SNAPSHOT, ALERT 等
     * @param {string} message - 日志内容
     */
    log(category, message) {
        const game = this.game;
        // 游戏时间
        const dayNum = game.dayCount || 1;
        const gameTimeStr = game.getTimeStr ? game.getTimeStr() : '??:??';
        // 真实时间
        const now = new Date();
        const realTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        const entry = `[D${dayNum} ${gameTimeStr}] [${realTime}] [${category}] ${message}`;
        this._buffer.push(entry);

        // 检查是否需要自动刷新
        if (this._buffer.length >= this._flushThreshold) {
            this._flush();
        }
    }

    /**
     * 批量发送缓冲区日志到服务端
     */
    _flush() {
        if (this._buffer.length === 0) return;

        const content = this._buffer.join('\n') + '\n';
        this._buffer = [];
        this._lastFlushTime = Date.now();

        fetch('/api/append-aimode-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: this.sessionFilename, content: content })
        }).catch(err => console.warn('[AIModeLogger] 日志写入失败:', err));
    }

    /**
     * 立即刷新缓冲区（结局时调用，确保数据完整性）
     */
    forceFlush() {
        this._flush();
    }

    /**
     * 每帧更新，驱动缓冲区定时刷新和定期快照
     * @param {number} gameDt - 游戏时间增量（秒，已乘以timeSpeed之前的原始dt）
     */
    update(gameDt) {
        // 1. 检查缓冲区定时刷新（基于真实时间）
        if (this._buffer.length > 0 && (Date.now() - this._lastFlushTime) >= this._flushInterval) {
            this._flush();
        }

        // 2. 快照定时器累积（基于游戏时间）
        this._snapshotTimer += gameDt;
        if (this._snapshotTimer >= this._snapshotInterval) {
            this._snapshotTimer -= this._snapshotInterval;
            this._takeSnapshot();
            this._takeResourceSnapshot();
        }
    }

    /**
     * NPC属性定期快照 + 危险阈值告警
     */
    _takeSnapshot() {
        const game = this.game;
        if (!game.npcs || game.npcs.length === 0) return;

        const aliveNpcs = game.npcs.filter(n => !n.isDead);
        if (aliveNpcs.length === 0) return;

        // 快照日志：每个NPC一行
        const lines = aliveNpcs.map(npc => {
            const hp = npc.health != null ? npc.health.toFixed(1) : '?';
            const sta = npc.stamina != null ? npc.stamina.toFixed(1) : '?';
            const hun = npc.hunger != null ? npc.hunger.toFixed(1) : '?';
            const san = npc.sanity != null ? npc.sanity.toFixed(1) : '?';
            const temp = npc.bodyTemp != null ? npc.bodyTemp.toFixed(1) : '?';
            return `  ${npc.name} | ${npc.state || '?'}/${npc.stateDesc || '?'} | HP:${hp} STA:${sta} HUN:${hun} SAN:${san} TEMP:${temp} | ${npc.currentScene || '?'} | sleep:${npc.isSleeping} sick:${npc.isSick} crazy:${npc.isCrazy}`;
        });
        this.log('SNAPSHOT', `存活${aliveNpcs.length}人:\n${lines.join('\n')}`);

        // 危险阈值告警
        for (const npc of aliveNpcs) {
            const alerts = [];
            if (npc.health != null && npc.health < 30) alerts.push(`HP:${npc.health.toFixed(1)}<30`);
            if (npc.stamina != null && npc.stamina < 10) alerts.push(`STA:${npc.stamina.toFixed(1)}<10`);
            if (npc.hunger != null && npc.hunger < 10) alerts.push(`HUN:${npc.hunger.toFixed(1)}<10`);
            if (npc.sanity != null && npc.sanity < 15) alerts.push(`SAN:${npc.sanity.toFixed(1)}<15`);
            if (npc.bodyTemp != null && npc.bodyTemp < 33) alerts.push(`TEMP:${npc.bodyTemp.toFixed(1)}<33`);
            if (alerts.length > 0) {
                this.log('ALERT', `${npc.name} 属性告警: ${alerts.join(', ')}`);
            }
        }
    }

    /**
     * 资源快照（与NPC快照同步，每60游戏秒）
     */
    _takeResourceSnapshot() {
        const game = this.game;
        const rs = game.resourceSystem;
        if (!rs) return;

        // 四项资源当前储量
        const woodFuel = rs.woodFuel != null ? rs.woodFuel.toFixed(1) : '?';
        const food = rs.food != null ? rs.food.toFixed(1) : '?';
        const power = rs.power != null ? rs.power.toFixed(1) : '?';
        const material = rs.material != null ? rs.material.toFixed(1) : '?';

        // 本日累计消耗/采集
        const dc = rs.dailyConsumed || {};
        const dg = rs.dailyCollected || {};
        const consumedStr = `木柴:${(dc.woodFuel || 0).toFixed(1)} 食物:${(dc.food || 0).toFixed(1)} 电力:${(dc.power || 0).toFixed(1)} 建材:${(dc.material || 0).toFixed(1)}`;
        const collectedStr = `木柴:${(dg.woodFuel || 0).toFixed(1)} 食物:${(dg.food || 0).toFixed(1)} 电力:${(dg.power || 0).toFixed(1)} 建材:${(dg.material || 0).toFixed(1)}`;

        // 暖炉状态
        let furnaceInfo = '暖炉:N/A';
        const fs = game.furnaceSystem;
        if (fs && fs.furnaces) {
            const furnaceArr = Array.isArray(fs.furnaces) ? fs.furnaces : Object.values(fs.furnaces);
            if (furnaceArr.length > 0) {
                const f = furnaceArr[0];
                furnaceInfo = `暖炉火焰:${f.fireLevel != null ? f.fireLevel : '?'} 室温:${f.indoorTemp != null ? f.indoorTemp.toFixed(1) : (fs.indoorTemp != null ? fs.indoorTemp.toFixed(1) : '?')}`;
            }
        }

        this.log('RESOURCE', `储量 木柴:${woodFuel} 食物:${food} 电力:${power} 建材:${material} | 今日消耗[${consumedStr}] 采集[${collectedStr}] | ${furnaceInfo}`);
    }

    /**
     * 生成NPC属性快照字符串（供外部调用，如死亡日志、睡眠日志等）
     * @param {object} npc - NPC对象
     * @returns {string} 属性快照字符串
     */
    static npcAttrSnapshot(npc) {
        const hp = npc.health != null ? npc.health.toFixed(1) : '?';
        const sta = npc.stamina != null ? npc.stamina.toFixed(1) : '?';
        const hun = npc.hunger != null ? npc.hunger.toFixed(1) : '?';
        const san = npc.sanity != null ? npc.sanity.toFixed(1) : '?';
        const temp = npc.bodyTemp != null ? npc.bodyTemp.toFixed(1) : '?';
        return `HP:${hp} STA:${sta} HUN:${hun} SAN:${san} TEMP:${temp}`;
    }
}
