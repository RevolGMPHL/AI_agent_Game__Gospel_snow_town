/**
 * 福音镇 - EventSystem
 * 挂载到 GST.EventSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 事件系统 - 条件触发的随机事件与冲突机制
 * 管理食物冲突、暴力事件、悲痛恐慌等
 * 依赖: game.js, npc.js, resource-system.js, furnace-system.js, weather-system.js, death-system.js
 */

// ============ 事件类型 ============
const EVENT_TYPES = {
    FOOD_CONFLICT:     'FOOD_CONFLICT',     // 食物分配冲突
    VIOLENCE:          'VIOLENCE',           // 暴力事件
    GRIEF:             'GRIEF',              // 悲痛事件
    PANIC:             'PANIC',              // 恐慌事件
    MORALE_BOOST:      'MORALE_BOOST',      // 士气鼓舞
    MEDIATION:         'MEDIATION',          // 调解事件
    FROSTBITE:         'FROSTBITE',          // 户外冻伤
    RESCUE:            'RESCUE',             // 晕倒救援
    LOCKDOWN:          'LOCKDOWN',           // 建筑锁定（第4天）
    FAMINE:            'FAMINE',             // 饥荒触发
};

class EventSystem {
    constructor(game) {
        this.game = game;

        // 事件历史记录
        this.eventHistory = [];

        // 事件冷却计时器（防止同类事件连续触发）
        this.cooldowns = {};

        // 系统tick计时
        this._tick = 0;
        this._checkInterval = 5.0; // 每5游戏秒检查一次

        // 第4天锁定状态
        this._day4Locked = false;

        // 歆玥自动演出冷却
        this._moraleCooldown = 0;

        // 老钱调解冷却
        this._mediationCooldown = 0;

        // 老钱主动安抚冷却（独立于调解）
        this._qianMoraleCooldown = 0;

        console.log('[EventSystem] 初始化完成');
    }

    // ============ 主更新循环 ============

    update(gameDt) {
        this._tick += gameDt;
        this._moraleCooldown = Math.max(0, this._moraleCooldown - gameDt);
        this._mediationCooldown = Math.max(0, this._mediationCooldown - gameDt);
        this._qianMoraleCooldown = Math.max(0, this._qianMoraleCooldown - gameDt);

        // 更新冷却
        for (const key in this.cooldowns) {
            this.cooldowns[key] = Math.max(0, this.cooldowns[key] - gameDt);
        }

        if (this._tick < this._checkInterval) return;
        this._tick = 0;

        const ws = this.game.weatherSystem;
        const rs = this.game.resourceSystem;
        const fs = this.game.furnaceSystem;
        const ds = this.game.deathSystem;
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);

        if (aliveNpcs.length === 0) return;

        // ---- 食物分配冲突 ----
        this._checkFoodConflict(rs, aliveNpcs);

        // ---- 暴力事件（San<10） ----
        // 已在npc.js中实现，这里做额外检测和记录

        // ---- 悲痛/恐慌事件 ----
        this._checkGriefPanic(ds, aliveNpcs);

        // ---- 歆玥自动鼓舞士气 ----
        this._checkMoraleBoost(aliveNpcs);

        // ---- 老钱主动安抚（独立于调解） ----
        this._checkQianMoraleBoost(aliveNpcs);

        // ---- 老钱自动调解 ----
        this._checkMediation(aliveNpcs);

        // ---- 第2天户外冻伤检测 ----
        this._checkFrostbite(ws, aliveNpcs);

        // ---- 第2天晕倒救援 ----
        this._checkRescue(aliveNpcs);

        // ---- 第4天特殊机制 ----
        this._checkDay4Special(ws, rs, fs, aliveNpcs);
    }

    // ============ 事件检测 ============

    /** 食物分配冲突：食物<8时触发 */
    _checkFoodConflict(rs, aliveNpcs) {
        if (!rs || rs.food >= 8) return;
        if (this._isOnCooldown('food_conflict', 3600)) return; // 1小时冷却

        // 饥饿且San值低的NPC更容易引发冲突
        const hungryNpcs = aliveNpcs.filter(n => (n.hunger || 50) < 30 && n.sanity < 50);
        if (hungryNpcs.length < 2) return;

        this._setCooldown('food_conflict', 3600);

        // 随机选两个饥饿NPC发生冲突
        const shuffled = hungryNpcs.sort(() => Math.random() - 0.5);
        const npc1 = shuffled[0];
        const npc2 = shuffled[1];

        // 冲突效果：双方San-8，好感-15
        npc1.sanity = Math.max(0, npc1.sanity - 8);
        npc2.sanity = Math.max(0, npc2.sanity - 8);
        const aff1 = npc1.getAffinity(npc2.id);
        npc1.affinity[npc2.id] = Math.max(0, aff1 - 15);
        const aff2 = npc2.getAffinity(npc1.id);
        npc2.affinity[npc1.id] = Math.max(0, aff2 - 15);

        const lines = [
            `${npc1.name}和${npc2.name}为最后的食物发生了争吵！`,
            `${npc1.name}抢走了${npc2.name}的食物份额，两人大吵一架！`,
            `${npc1.name}和${npc2.name}因食物分配不公而激烈争论！`,
        ];
        const line = lines[Math.floor(Math.random() * lines.length)];

        this._recordEvent(EVENT_TYPES.FOOD_CONFLICT, line, [npc1.id, npc2.id]);

        if (this.game.addEvent) {
            this.game.addEvent(`🍞⚔️ ${line}（双方San-8, 好感-15）`);
        }

        // 其他NPC目睹冲突San-3
        for (const npc of aliveNpcs) {
            if (npc.id !== npc1.id && npc.id !== npc2.id && npc.currentScene === npc1.currentScene) {
                npc.sanity = Math.max(0, npc.sanity - 3);
            }
        }
    }

    /** 暖炉争抢：第4天仅1暖炉时 */
    _checkFurnaceScramble(ws, fs, aliveNpcs) {
        if (!ws || ws.currentDay !== 4) return;
        if (!fs || fs.furnaces.length >= 2) return;
        if (this._isOnCooldown('furnace_scramble', 1800)) return;

        // 统计暖炉旁人数
        const furnace = fs.furnaces[0];
        if (!furnace || !furnace.active) return;

        const npcsNear = aliveNpcs.filter(n => fs.isNearActiveFurnace(n));
        if (npcsNear.length <= furnace.capacity) return;

        // 拥挤！San最低的NPC推搡他人
        const sorted = [...npcsNear].sort((a, b) => a.sanity - b.sanity);
        const aggressor = sorted[0];
        if (aggressor.sanity >= 30) return; // San>30不会争抢

        this._setCooldown('furnace_scramble', 1800);

        // 被推搡的是另一个较弱的NPC
        const victim = sorted.find(n => n.id !== aggressor.id && n.stamina < 50) || sorted[1];
        if (!victim) return;

        // 效果
        victim.stamina = Math.max(0, victim.stamina - 8);
        victim.sanity = Math.max(0, victim.sanity - 5);
        aggressor.sanity = Math.max(0, aggressor.sanity - 3);
        const aff = aggressor.getAffinity(victim.id);
        aggressor.affinity[victim.id] = Math.max(0, aff - 10);
        const victimAff = victim.getAffinity(aggressor.id);
        victim.affinity[aggressor.id] = Math.max(0, victimAff - 15);

        const line = `${aggressor.name}推搡了${victim.name}，争抢暖炉旁的位置！"滚开！让我烤火！"`;
        this._recordEvent(EVENT_TYPES.FURNACE_SCRAMBLE, line, [aggressor.id, victim.id]);

        if (this.game.addEvent) {
            this.game.addEvent(`🔥⚔️ ${line}`);
        }

        // 旁观者San-2
        for (const npc of npcsNear) {
            if (npc.id !== aggressor.id && npc.id !== victim.id) {
                npc.sanity = Math.max(0, npc.sanity - 2);
            }
        }
    }

    /** 悲痛/恐慌检测 */
    _checkGriefPanic(ds, aliveNpcs) {
        if (!ds) return;

        // 检查是否有新的死亡事件触发恐慌
        const recentDeaths = ds.deathRecords.filter(d => {
            const elapsed = Date.now() - d.time;
            return elapsed < 60000; // 1分钟内的死亡
        });

        if (recentDeaths.length === 0) return;
        if (this._isOnCooldown('panic', 600)) return;
        this._setCooldown('panic', 600);

        // 全体恐慌
        const avgSan = aliveNpcs.reduce((s, n) => s + n.sanity, 0) / aliveNpcs.length;
        if (avgSan < 40) {
            // 集体恐慌
            for (const npc of aliveNpcs) {
                npc.sanity = Math.max(0, npc.sanity - 5);
            }

            this._recordEvent(EVENT_TYPES.PANIC,
                `恐慌蔓延！全镇居民陷入恐惧…`,
                aliveNpcs.map(n => n.id));

            if (this.game.addEvent) {
                this.game.addEvent(`😱 恐慌蔓延！有人死了…全镇居民陷入恐惧！（全体San-5）`);
            }
        }
    }

    /** 歆玥自动鼓舞士气：当多人San<30时（基于morale_inspire专长） */
    _checkMoraleBoost(aliveNpcs) {
        if (this._moraleCooldown > 0) return;

        const lingYue = aliveNpcs.find(n => n.id === 'ling_yue');
        if (!lingYue || lingYue.isDead || lingYue.stamina < 20) return;

        const lowSanCount = aliveNpcs.filter(n => n.sanity < 30).length;
        if (lowSanCount < 3) return;

        // 歆玥自动触发鼓舞
        this._moraleCooldown = 7200; // 2小时冷却

        // 同场景所有NPC恢复San
        const sameScene = aliveNpcs.filter(n => n.currentScene === lingYue.currentScene);
        for (const npc of sameScene) {
            npc.sanity = Math.min(100, npc.sanity + 10);
        }
        lingYue.stamina = Math.max(0, lingYue.stamina - 15); // 鼓舞消耗体力

        const line = `歆玥鼓励了大家，温暖了所有人的心灵…`;
        this._recordEvent(EVENT_TYPES.MORALE_BOOST, line, sameScene.map(n => n.id));

        if (this.game.addEvent) {
            this.game.addEvent(`🎵✨ ${line}（同场景所有人San+10）`);
        }
    }

    /** 老钱主动安抚：当同场景有NPC的San<40时自动触发，独立冷却1小时 */
    _checkQianMoraleBoost(aliveNpcs) {
        if (this._qianMoraleCooldown > 0) return;

        const oldQian = aliveNpcs.find(n => n.id === 'old_qian');
        if (!oldQian || oldQian.isDead || oldQian.stamina < 15) return;

        // 同场景有NPC的San<40才触发
        const sameScene = aliveNpcs.filter(n => n.currentScene === oldQian.currentScene && n.id !== oldQian.id);
        const lowSanInScene = sameScene.filter(n => n.sanity < 40);
        if (lowSanInScene.length === 0) return;

        // 触发安抚：1小时冷却
        this._qianMoraleCooldown = 3600;

        // 同场景所有NPC（含老钱自己）San+8
        const allInScene = aliveNpcs.filter(n => n.currentScene === oldQian.currentScene);
        for (const npc of allInScene) {
            npc.sanity = Math.min(100, npc.sanity + 8);
        }

        // 老钱体力消耗
        oldQian.stamina = Math.max(0, oldQian.stamina - 10);

        const line = `老钱安抚了大家的情绪："大家别慌，我们一定能撑过去的！"`;
        this._recordEvent(EVENT_TYPES.MORALE_BOOST, line, allInScene.map(n => n.id));

        if (this.game.addEvent) {
            this.game.addEvent(`💬 ${line}（同场景所有人San+8）`);
        }
    }

    /** 老钱自动调解冲突 */
    _checkMediation(aliveNpcs) {
        if (this._mediationCooldown > 0) return;

        const oldQian = aliveNpcs.find(n => n.id === 'old_qian');
        if (!oldQian || oldQian.isDead || oldQian.stamina < 15) return;

        // 检查是否有最近的冲突事件
        const recentConflicts = this.eventHistory.filter(e =>
            (e.type === EVENT_TYPES.FOOD_CONFLICT || e.type === EVENT_TYPES.FURNACE_SCRAMBLE || e.type === EVENT_TYPES.VIOLENCE) &&
            (Date.now() - e.time) < 300000 // 5分钟内
        );

        if (recentConflicts.length === 0) return;

        this._mediationCooldown = 3600; // 1小时冷却

        // 调解效果：相关NPC好感+10、San+5
        const lastConflict = recentConflicts[recentConflicts.length - 1];
        for (const npcId of lastConflict.involvedNpcs) {
            const npc = aliveNpcs.find(n => n.id === npcId);
            if (npc) {
                npc.sanity = Math.min(100, npc.sanity + 5);
                // 恢复对冲突方的好感
                for (const otherId of lastConflict.involvedNpcs) {
                    if (otherId !== npcId) {
                        const aff = npc.getAffinity(otherId);
                        npc.affinity[otherId] = Math.min(100, aff + 10);
                    }
                }
            }
        }

        oldQian.stamina = Math.max(0, oldQian.stamina - 5);

        const line = `老钱站出来调解："大家冷静！我们是一家人，吵架解决不了问题！"`;
        this._recordEvent(EVENT_TYPES.MEDIATION, line, [oldQian.id, ...lastConflict.involvedNpcs]);

        if (this.game.addEvent) {
            this.game.addEvent(`🕊️ ${line}（相关NPC San+5, 好感+10）`);
        }
    }

    /** 第2天户外冻伤检测 */
    _checkFrostbite(ws, aliveNpcs) {
        if (!ws || ws.currentDay !== 2) return;

        for (const npc of aliveNpcs) {
            if (npc.currentScene !== 'village') continue;

            const outdoorTime = ws.outdoorTime[npc.id] || 0;
            // 超过1.5小时开始冻伤警告
            if (outdoorTime > 5400 && !npc.isFrostbitten) {
                npc.isFrostbitten = true;
                npc.health = Math.max(0, npc.health - 10);

                const line = `${npc.name}在户外待了太久，手脚开始冻伤！`;
                this._recordEvent(EVENT_TYPES.FROSTBITE, line, [npc.id]);

                if (this.game.addEvent) {
                    this.game.addEvent(`🥶 ${line}（健康-10）`);
                }
            }

            // 超过2小时严重冻伤
            if (outdoorTime > 7200) {
                npc.health = Math.max(0, npc.health - 0.5);
                npc.stamina = Math.max(0, npc.stamina - 0.3);
            }
        }
    }

    /** 晕倒救援检测 */
    _checkRescue(aliveNpcs) {
        for (const npc of aliveNpcs) {
            if (!npc._rescueNeeded || !npc.isSevereHypothermic) continue;

            // 寻找同场景的其他NPC来救援
            const rescuers = aliveNpcs.filter(n =>
                n.id !== npc.id &&
                n.currentScene === npc.currentScene &&
                n.stamina > 30 &&
                !n.isSevereHypothermic
            );

            if (rescuers.length > 0) {
                const rescuer = rescuers[0];

                // 救援成功！体温小幅恢复
                npc.bodyTemp = Math.min(36.5, npc.bodyTemp + 0.5);
                npc._rescueTimer = 0; // 重置救援计时器
                rescuer.stamina = Math.max(0, rescuer.stamina - 10); // 救援消耗体力

                // 好感增加
                const aff = npc.getAffinity(rescuer.id);
                npc.affinity[rescuer.id] = Math.min(100, aff + 15);

                const line = `${rescuer.name}发现${npc.name}倒在地上，赶紧扶起来取暖！`;
                this._recordEvent(EVENT_TYPES.RESCUE, line, [rescuer.id, npc.id]);

                if (this.game.addEvent) {
                    this.game.addEvent(`🆘 ${line}（${npc.name}体温+0.5°C，${rescuer.name}好感+15）`);
                }
            }
        }
    }

    /** 第4天特殊机制 */
    _checkDay4Special(ws, rs, fs, aliveNpcs) {
        if (!ws || ws.currentDay !== 4) return;

        // 锁定建筑出口
        if (!this._day4Locked) {
            this._day4Locked = true;

            this._recordEvent(EVENT_TYPES.LOCKDOWN,
                `大极寒来临！所有建筑出口已锁定，严禁外出！`,
                aliveNpcs.map(n => n.id));

            if (this.game.addEvent) {
                this.game.addEvent(`🔒 大极寒！所有建筑出口已锁定，严禁外出！`);
            }

            // 强制所有户外NPC回室内
            for (const npc of aliveNpcs) {
                if (npc.currentScene === 'village') {
                    // 这里应该触发NPC自动导航回室内
                    // 通过直接设置场景来实现紧急撤退
                    if (this.game.addEvent) {
                        this.game.addEvent(`🚨 ${npc.name}被紧急召回室内！`);
                    }
                }
            }
        }

        // 饥荒触发检测
        if (rs && rs.food <= 0) {
            if (!this._isOnCooldown('famine', 3600)) {
                this._setCooldown('famine', 3600);

                this._recordEvent(EVENT_TYPES.FAMINE,
                    `饥荒！储备食物已全部耗尽！`,
                    aliveNpcs.map(n => n.id));

                if (this.game.addEvent) {
                    this.game.addEvent(`🚨🍞 饥荒来临！储备食物已全部耗尽！所有人将挨饿！`);
                }

                // 全体San-10
                for (const npc of aliveNpcs) {
                    npc.sanity = Math.max(0, npc.sanity - 10);
                }
            }
        }

        // 全灭危机判定
        if (aliveNpcs.length <= 2 && !this._isOnCooldown('wipe_warning', 7200)) {
            this._setCooldown('wipe_warning', 7200);

            if (this.game.addEvent) {
                this.game.addEvent(`🚨🚨 全灭危机！仅剩${aliveNpcs.length}人存活！`);
            }
        }
    }

    // ============ 工具方法 ============

    _isOnCooldown(key, defaultCD) {
        return (this.cooldowns[key] || 0) > 0;
    }

    _setCooldown(key, seconds) {
        this.cooldowns[key] = seconds;
    }

    _recordEvent(type, desc, involvedNpcs) {
        this.eventHistory.push({
            type: type,
            desc: desc,
            involvedNpcs: involvedNpcs || [],
            time: Date.now(),
            gameDay: this.game.dayCount,
            gameTime: this.game.getTimeStr(),
        });
    }

    // ============ 查询接口 ============

    /** 获取最近N个事件 */
    getRecentEvents(count = 5) {
        return this.eventHistory.slice(-count);
    }

    /** 获取事件摘要（给AI prompt用） */
    getEventSummaryForPrompt() {
        const recent = this.getRecentEvents(3);
        if (recent.length === 0) return '';
        return '最近发生的事件: ' + recent.map(e => e.desc).join('; ');
    }

    /** 获取今日事件数量 */
    getTodayEventCount() {
        const today = this.game.dayCount;
        return this.eventHistory.filter(e => e.gameDay === today).length;
    }

    // ============ 序列化 ============

    serialize() {
        return {
            eventHistory: this.eventHistory,
            cooldowns: { ...this.cooldowns },
            day4Locked: this._day4Locked,
            moraleCooldown: this._moraleCooldown,
            mediationCooldown: this._mediationCooldown,
            qianMoraleCooldown: this._qianMoraleCooldown,
        };
    }

    deserialize(data) {
        if (!data) return;
        this.eventHistory = data.eventHistory || [];
        this.cooldowns = data.cooldowns || {};
        this._day4Locked = data.day4Locked || false;
        this._moraleCooldown = data.moraleCooldown || 0;
        this._mediationCooldown = data.mediationCooldown || 0;
        this._qianMoraleCooldown = data.qianMoraleCooldown || 0;
    }
}

    GST.EventSystem = EventSystem;
})();
