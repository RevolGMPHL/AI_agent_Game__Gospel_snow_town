/**
 * 福音镇 - ReincarnationSystem
 * 挂载到 GST.ReincarnationSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 轮回系统 — ReincarnationSystem
 * 管理轮回记忆的存储、摘要生成、教训推断、Prompt注入
 * 依赖: game.js, death-system.js, resource-system.js, task-system.js
 */

const REINCARNATION_STORAGE_KEY = 'gospel_reincarnation';
const REINCARNATION_LIFE_NUM_KEY = 'gospel_reincarnation_life_num'; // 独立存储世数，不受pastLives上限影响
const MAX_PAST_LIVES = 20; // 最多保留最近20世记忆

class ReincarnationSystem {
    constructor(game) {
        this.game = game;

        // 非轮回模式（agent/debug）不加载历史轮回数据，强制第1世
        if (game.mode !== 'reincarnation') {
            this.pastLives = [];
            this.currentLifeNumber = 1;
            console.log(`[ReincarnationSystem] 非轮回模式(${game.mode})，强制第1世，不加载历史记忆`);
            return;
        }

        // 轮回模式：从 localStorage 加载历史轮回记忆
        this.pastLives = this.loadPastLives();

        // 从独立存储读取世数（不再从pastLives.length推导，因为pastLives有上限裁剪）
        this.currentLifeNumber = this._loadLifeNumber();

        console.log(`[ReincarnationSystem] 轮回模式初始化完成，当前第${this.currentLifeNumber}世，历史${this.pastLives.length}条记忆`);
    }

    // ============ localStorage 读写 ============

    /** 从 localStorage 加载历史轮回记忆 */
    loadPastLives() {
        try {
            const raw = localStorage.getItem(REINCARNATION_STORAGE_KEY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return [];
            return data;
        } catch (e) {
            console.warn('[ReincarnationSystem] 加载轮回记忆失败:', e);
            return [];
        }
    }

    /** 保存当前世的轮回记忆摘要到 localStorage */
    savePastLife() {
        const summary = this.generateReincarnationSummary();
        if (!summary) {
            console.warn('[ReincarnationSystem] 无法生成轮回摘要');
            return;
        }

        this.pastLives.push(summary);

        // 上限管理：最多保留最近5世
        while (this.pastLives.length > MAX_PAST_LIVES) {
            this.pastLives.shift(); // 丢弃最早的记录
        }

        try {
            localStorage.setItem(REINCARNATION_STORAGE_KEY, JSON.stringify(this.pastLives));
            // 同时保存当前世数到独立key
            this._saveLifeNumber(this.currentLifeNumber);
            console.log(`[ReincarnationSystem] 第${this.currentLifeNumber}世记忆已保存`);
        } catch (e) {
            console.error('[ReincarnationSystem] 保存轮回记忆失败:', e);
        }
    }

    /** 清除所有轮回记忆（彻底重来） */
    clearAllMemories() {
        this.pastLives = [];
        this.currentLifeNumber = 1;
        try {
            localStorage.removeItem(REINCARNATION_STORAGE_KEY);
            localStorage.removeItem(REINCARNATION_LIFE_NUM_KEY);
            console.log('[ReincarnationSystem] 所有轮回记忆已清除');
        } catch (e) {
            console.error('[ReincarnationSystem] 清除轮回记忆失败:', e);
        }
    }

    // ============ 世数管理 ============

    /** 获取当前世数 */
    getLifeNumber() {
        return this.currentLifeNumber;
    }

    /** 轮回后更新世数（在 game.reincarnate() 中调用） */
    advanceLife() {
        this.pastLives = this.loadPastLives(); // 重新从 localStorage 加载
        // 直接递增世数，不从pastLives.length推导（因为pastLives有MAX_PAST_LIVES上限裁剪）
        this.currentLifeNumber++;
        this._saveLifeNumber(this.currentLifeNumber);
        console.log(`[ReincarnationSystem] 进入第${this.currentLifeNumber}世`);
    }

    /** 从 localStorage 读取独立存储的世数 */
    _loadLifeNumber() {
        try {
            const raw = localStorage.getItem(REINCARNATION_LIFE_NUM_KEY);
            if (raw) {
                const num = parseInt(raw, 10);
                if (!isNaN(num) && num >= 1) return num;
            }
        } catch (e) {
            console.warn('[ReincarnationSystem] 读取世数失败:', e);
        }
        // 兼容旧版：如果没有独立存储的世数，从pastLives.length推导
        return this.pastLives.length + 1;
    }

    /** 保存世数到 localStorage */
    _saveLifeNumber(num) {
        try {
            localStorage.setItem(REINCARNATION_LIFE_NUM_KEY, String(num));
        } catch (e) {
            console.warn('[ReincarnationSystem] 保存世数失败:', e);
        }
    }

    // ============ 轮回记忆摘要生成 ============

    /** 在结局触发时，从各子系统收集数据，生成结构化摘要 */
    generateReincarnationSummary() {
        const game = this.game;
        const ds = game.deathSystem;
        const rs = game.resourceSystem;
        const ts = game.taskSystem;
        const ws = game.weatherSystem;
        const fs = game.furnaceSystem;

        // 存活/死亡统计
        const aliveCount = game.npcs.filter(n => !n.isDead).length;
        const deadCount = game.npcs.filter(n => n.isDead).length;

        // 结局类型
        let endingType = 'unknown';
        if (ds && ds.currentEnding) {
            endingType = ds.currentEnding.id;
        } else if (aliveCount >= 8) {
            endingType = 'perfect';
        } else if (aliveCount >= 5) {
            endingType = 'normal';
        } else if (aliveCount >= 2) {
            endingType = 'bleak';
        } else {
            endingType = 'extinction';
        }

        // 死亡记录
        const deathRecords = ds ? ds.getDeathRecords().map(r => ({
            name: r.npcName,
            cause: r.cause,
            day: r.dayNum,
            time: r.time,
            location: r.location,
        })) : [];

        // 资源快照（当前剩余）
        const resourceSnapshot = rs ? {
            woodFuel: Math.round(rs.woodFuel),
            food: Math.round(rs.food),
            power: Math.round(rs.power),
            totalConsumed: { ...rs.totalConsumed },
            totalCollected: { ...rs.totalCollected },
        } : null;

        // 第二暖炉状态
        const secondFurnaceBuilt = fs ? fs.secondFurnaceBuilt : false;

        // 未完成任务
        const unfinishedTasks = ts ? ts.unfinishedTaskLog.map(log => ({
            day: log.day,
            tasks: log.tasks.map(t => ({
                name: t.name,
                progress: t.progress,
                target: t.target,
            })),
        })) : [];

        // 关键事件（冲突和危机）
        const keyEvents = ds ? ds.timeline
            .filter(e => e.type === 'conflict' || e.type === 'crisis' || e.type === 'death')
            .map(e => ({
                day: e.dayNum,
                time: e.time,
                text: e.text,
                type: e.type,
            })) : [];

        // NPC最终状态
        const npcFinalStates = game.npcs.map(npc => ({
            id: npc.id,
            name: npc.name,
            isDead: npc.isDead,
            sanity: Math.round(npc.sanity || 0),
            stamina: Math.round(npc.stamina || 0),
            health: Math.round(npc.health || 0),
            bodyTemp: npc.bodyTemp ? parseFloat(npc.bodyTemp.toFixed(1)) : 36.5,
        }));

        // 教训总结
        const lessons = this.generateLessons(deathRecords, resourceSnapshot, secondFurnaceBuilt, aliveCount);

        // 【修复A】保存当世的分工方案，供后续世复用成功方案
        let savedWorkPlan = null;
        const holder = this.game.reincarnationSystem ? this.game.reincarnationSystem.getWorkPlanHolder() : null;
        if (holder && holder.workPlan) {
            savedWorkPlan = JSON.parse(JSON.stringify(holder.workPlan)); // 深拷贝
        }

        const summary = {
            lifeNumber: this.currentLifeNumber,
            endingType: endingType,
            aliveCount: aliveCount,
            deadCount: deadCount,
            deathRecords: deathRecords,
            resourceSnapshot: resourceSnapshot,
            secondFurnaceBuilt: secondFurnaceBuilt,
            unfinishedTasks: unfinishedTasks,
            keyEvents: keyEvents.slice(-10), // 最多保留10条关键事件
            npcFinalStates: npcFinalStates,
            lessons: lessons,
            workPlan: savedWorkPlan, // 【修复A】保存成功方案
            timestamp: Date.now(),
        };

        return summary;
    }

    // ============ 教训推断 ============

    /** 基于数据自动推断教训 */
    generateLessons(deathRecords, resourceSnapshot, secondFurnaceBuilt, aliveCount) {
        const lessons = [];

        // 1. 木柴不足
        if (resourceSnapshot && resourceSnapshot.woodFuel < 20) {
            lessons.push('木柴储备严重不足，第1天应多安排人手砍柴，目标至少80单位');
        }

        // 2. 食物不足
        if (resourceSnapshot && resourceSnapshot.food < 10) {
            lessons.push('食物储备不足，需更积极收集食物，目标至少50单位');
        }

        // 3. 有人冻死
        const frozenDeaths = deathRecords.filter(r => r.cause === '冻死');
        if (frozenDeaths.length > 0) {
            const outdoorDeaths = frozenDeaths.filter(r => r.location === 'village');
            if (outdoorDeaths.length > 0) {
                lessons.push(`${outdoorDeaths.map(r => r.name).join('、')}在户外冻死，应严格控制外出时间，尤其第2天`);
            }
            if (frozenDeaths.some(r => r.day >= 4)) {
                lessons.push('第4天有人冻死，暖炉供暖和木柴储备不够，需提前准备更多木柴');
            }
        }

        // 4. 有人饿死
        const starvedDeaths = deathRecords.filter(r => r.cause === '饿死');
        if (starvedDeaths.length > 0) {
            lessons.push('有人饿死，食物收集严重不足，第1天应优先大量收集食物');
        }

        // 5. 精神崩溃致死
        const mentalDeaths = deathRecords.filter(r => r.cause === '精神崩溃致死');
        if (mentalDeaths.length > 0) {
            lessons.push('有人精神崩溃致死，需更重视San值维护，多安排鼓舞和心理疏导');
        }

        // 6. 第二暖炉未建好
        if (!secondFurnaceBuilt) {
            lessons.push('第二暖炉未能建好，Day3解锁后应立即派2人去工坊修复');
        }

        // 7. 全员存活
        if (aliveCount >= 8) {
            lessons.push('策略成功！保持当前分配方案，关注资源节约');
        }

        // 8. 电力不足
        if (resourceSnapshot && resourceSnapshot.power < 10) {
            lessons.push('电力不足，需安排人手维护发电机');
        }

        return lessons;
    }

    // ============ Prompt 生成方法 ============

    /**
     * 生成对话用的前世记忆提示（≤300字符）
     * @param {boolean} isReincarnationMode - 是否轮回模式，轮回模式下记忆更清晰直接
    /**
     * 生成对话用的前世记忆提示（≤400字符）
     * 【修复C】综合多世记忆，不再只看上一世
     * @param {boolean} isReincarnationMode - 是否轮回模式，轮回模式下记忆更清晰直接
     */
    getPastLifeHintForDialogue(isReincarnationMode = false) {
        if (this.currentLifeNumber <= 1 || this.pastLives.length === 0) {
            return ''; // 第1世不注入
        }

        const lastLife = this.pastLives[this.pastLives.length - 1];
        // 【修复C】找到历史上最好的一世
        const bestLife = this._findBestLife();
        let hint = '';

        if (isReincarnationMode) {
            // 轮回模式：记忆清晰直接，不用模糊化
            hint += `【前世记忆(清晰)·第${this.currentLifeNumber}世】你清楚地记得所有${this.pastLives.length}次轮回的经历。`;

            // 上一世结局
            const endingNames = { perfect: '全员存活', normal: '大部分人存活', bleak: '只有少数人活下来', extinction: '全员死亡' };
            hint += `上一世${endingNames[lastLife.endingType] || '结局不明'}（${lastLife.aliveCount}/8人存活）。`;

            // 【修复C】如果历史上有更好的世代，提及成功经验
            if (bestLife && bestLife !== lastLife && bestLife.aliveCount > lastLife.aliveCount) {
                hint += `但第${bestLife.lifeNumber}世最好(${bestLife.aliveCount}/8存活)，那一世的策略更好！`;
            }

            // 关键死亡记忆
            if (lastLife.deathRecords && lastLife.deathRecords.length > 0) {
                const deaths = lastLife.deathRecords.slice(0, 3);
                hint += `上世${deaths.map(d => `${d.name}在第${d.day}天${d.cause}`).join('，')}。`;
            }

            // 关键教训（更具体）
            if (lastLife.lessons && lastLife.lessons.length > 0) {
                hint += `教训：${lastLife.lessons.slice(0, 2).join('；')}。`;
            }

            // 对话规则
            hint += '说话时可以直接引用前世经验，主动提出具体的生存策略和分工建议。';
        } else {
            // 非轮回模式：模糊语言
            if (this.currentLifeNumber === 2) {
                hint += '【前世记忆(模糊)】你好像做了一个很长的噩梦…';
            } else {
                hint += `【前世记忆(模糊)】你有一种强烈的既视感，好像经历过${this.currentLifeNumber - 1}次了…`;
            }

            const endingNames = { perfect: '全员存活', normal: '大部分人存活', bleak: '只有少数人活下来', extinction: '全员死亡' };
            hint += `梦里${endingNames[lastLife.endingType] || '结局模糊'}。`;

            if (lastLife.deathRecords && lastLife.deathRecords.length > 0) {
                const deaths = lastLife.deathRecords.slice(0, 3);
                hint += `隐约记得${deaths.map(d => `${d.name}好像${d.cause === '冻死' ? '被冻僵了' : d.cause === '饿死' ? '饿倒了' : '出了事'}`).join('，')}。`;
            }

            if (lastLife.lessons && lastLife.lessons.length > 0) {
                hint += `总觉得${lastLife.lessons[0]}。`;
            }

            hint += '说话时可隐晦提及前世感觉，但保持模糊（用"隐约记得"、"总觉得"、"好像梦到过"等词）。';
        }

        // 截断到400字符
        if (hint.length > 400) {
            hint = hint.substring(0, 397) + '…';
        }

        return hint;
    }    /**
     * 生成思考/行动决策用的前世经验参考
     * 【修复C】综合多世记忆，引用历史最好成绩和成功方案
     * @param {boolean} isReincarnationMode - 是否轮回模式，轮回模式下给出更具体的行动指令
     */
    getPastLifeHintForThinking(isReincarnationMode = false) {
        if (this.currentLifeNumber <= 1 || this.pastLives.length === 0) {
            return ''; // 第1世不注入
        }

        const lastLife = this.pastLives[this.pastLives.length - 1];
        // 【修复C】找到历史最好的一世 + 综合多世分析
        const bestLife = this._findBestLife();
        const multiAnalysis = this.analyzeMultiLifePatterns();
        let hint = '';

        if (isReincarnationMode) {
            // 轮回模式：记忆完全清晰，给出精确指令
            hint += `【前世清晰记忆 — 第${this.currentLifeNumber}世·已轮回${this.pastLives.length}次】`;
            hint += `你完全记得所有${this.pastLives.length}次轮回的经历。`;

            // 结局
            const endingNames = { perfect: '完美结局', normal: '普通结局', bleak: '惨淡结局', extinction: '全灭结局' };
            hint += `上世结果：${endingNames[lastLife.endingType] || '未知'}，${lastLife.aliveCount}/8人存活。`;

            // 【修复C】历史最好成绩
            if (bestLife && bestLife.aliveCount > lastLife.aliveCount) {
                hint += `🏆历史最好：第${bestLife.lifeNumber}世(${bestLife.aliveCount}/8存活,${bestLife.endingType})，应复用那一世的策略！`;
            }

            // 详细死亡信息
            if (lastLife.deathRecords && lastLife.deathRecords.length > 0) {
                hint += '上世死亡:';
                for (const d of lastLife.deathRecords.slice(0, 5)) {
                    hint += `${d.name}第${d.day}天${d.time}在${d.location}${d.cause};`;
                }
            }

            // 资源状况
            if (lastLife.resourceSnapshot) {
                const rs = lastLife.resourceSnapshot;
                hint += `上世最终资源:木柴${rs.woodFuel}食物${rs.food}电力${rs.power}。`;
            }

            // 暖炉状态
            if (!lastLife.secondFurnaceBuilt) {
                hint += '❗上世第二暖炉未建成！';
            }

            // 【修复D】多世综合失败模式
            if (multiAnalysis.failurePatterns.length > 0) {
                hint += '🔴多世反复出现的问题:' + multiAnalysis.failurePatterns.slice(0, 3).join('；') + '。';
            }

            // 教训
            if (lastLife.lessons && lastLife.lessons.length > 0) {
                hint += '必须牢记的教训:' + lastLife.lessons.slice(0, 3).join('；') + '。';
            }

            // 策略建议
            hint += this._generateStrategyAdvice(lastLife);

            // 轮回模式专属指令
            hint += '【重要】你完全记得所有轮回的细节，应主动复用历史最好一世的策略，并根据反复出现的失败模式调整。第1天开始就应明确知道优先做什么。';

        } else {
            // 非轮回模式：原有的半模糊经验
            hint += `【前世经验(第${lastLife.lifeNumber}世)】`;

            const endingNames = { perfect: '完美结局', normal: '普通结局', bleak: '惨淡结局', extinction: '全灭结局' };
            hint += `上世${endingNames[lastLife.endingType] || '未知'}，存活${lastLife.aliveCount}/8人。`;

            if (lastLife.deathRecords && lastLife.deathRecords.length > 0) {
                hint += '死亡:';
                for (const d of lastLife.deathRecords.slice(0, 4)) {
                    hint += `${d.name}第${d.day}天${d.cause}(${d.location});`;
                }
            }

            if (lastLife.resourceSnapshot) {
                const rs = lastLife.resourceSnapshot;
                hint += `最终资源:木柴${rs.woodFuel}食物${rs.food}电力${rs.power}。`;
            }

            if (!lastLife.secondFurnaceBuilt) {
                hint += '第二暖炉未建好！';
            }

            if (lastLife.lessons && lastLife.lessons.length > 0) {
                hint += '教训:' + lastLife.lessons.slice(0, 3).join('；') + '。';
            }

            hint += this._generateStrategyAdvice(lastLife);
        }

        // 截断到700字符（轮回模式允许更长，因为综合了多世信息）
        const maxLen = isReincarnationMode ? 700 : 400;
        if (hint.length > maxLen) {
            hint = hint.substring(0, maxLen - 3) + '…';
        }

        return hint;
    }

    /** 根据前世数据生成具体策略建议 */
    _generateStrategyAdvice(lastLife) {
        let advice = '策略建议:';

        const rs = lastLife.resourceSnapshot;
        if (rs) {
            // 木柴建议
            if (rs.woodFuel < 30) {
                const needed = Math.max(80, Math.round(rs.totalConsumed.woodFuel * 1.2));
                advice += `第1天至少收集${needed}单位木柴;`;
            }
            // 食物建议
            if (rs.food < 15) {
                const needed = Math.max(50, Math.round(rs.totalConsumed.food * 1.1));
                advice += `食物目标至少${needed}单位;`;
            }
        }

        // 暖炉建议
        if (!lastLife.secondFurnaceBuilt) {
            advice += 'Day3解锁第二暖炉后立即派2人去工坊修复;';
        }

        // 户外安全
        const frozenOutdoor = (lastLife.deathRecords || []).filter(d => d.cause === '冻死' && d.location === 'village');
        if (frozenOutdoor.length > 0) {
            advice += `第2天严格限制户外时间，${frozenOutdoor.map(d => d.name).join('、')}上世在户外冻死;`;
        }

        return advice;
    }

    // ============ 前世记忆淡化处理 ============

    /**
     * 获取多世综合记忆（含淡化）
     * 最近1世详细，更早世代模糊，3世以上压缩为一句话
     */
    getCompositePastLifeHint(forDialogue = true, isReincarnationMode = false) {
        if (this.pastLives.length === 0) return '';

        let hint = '';

        for (let i = this.pastLives.length - 1; i >= 0; i--) {
            const life = this.pastLives[i];
            const age = this.pastLives.length - i; // 1=最近，2=上上世...

            if (age === 1) {
                // 最近1世：详细记忆
                if (forDialogue) {
                    hint += this.getPastLifeHintForDialogue(isReincarnationMode);
                } else {
                    hint += this.getPastLifeHintForThinking(isReincarnationMode);
                }
            } else if (age === 2) {
                // 上上世：模糊概要
                const endingNames = { perfect: '成功了', normal: '勉强活下来', bleak: '很惨', extinction: '全灭了' };
                hint += `更早的记忆更模糊：似乎还有一世${endingNames[life.endingType] || '记不清了'}。`;
            } else {
                // 3世以上：一句话
                hint += '很久以前似乎经历过更惨烈的失败。';
                break; // 更早的不再添加
            }
        }

        return hint;
    }

    // ============ 查询接口 ============

    /** 获取上一世的数据（供其他系统读取） */
    getLastLifeData() {
        if (this.pastLives.length === 0) return null;
        return this.pastLives[this.pastLives.length - 1];
    }

    /** 获取上一世的死亡记录 */
    getLastLifeDeathRecords() {
        const last = this.getLastLifeData();
        if (!last) return [];
        return last.deathRecords || [];
    }

    /** 获取上一世的资源快照 */
    getLastLifeResourceSnapshot() {
        const last = this.getLastLifeData();
        if (!last) return null;
        return last.resourceSnapshot || null;
    }

    /** 获取上一世的教训列表 */
    getLastLifeLessons() {
        const last = this.getLastLifeData();
        if (!last) return [];
        return last.lessons || [];
    }

    /** 获取上一世的关键事件（冲突） */
    getLastLifeConflictEvents() {
        const last = this.getLastLifeData();
        if (!last) return [];
        return (last.keyEvents || []).filter(e => e.type === 'conflict');
    }

    /** 获取上一世的存活数量 */
    getLastLifeAliveCount() {
        const last = this.getLastLifeData();
        if (!last) return null;
        return last.aliveCount;
    }

    /** 获取上一世的结局类型 */
    getLastLifeEndingType() {
        const last = this.getLastLifeData();
        if (!last) return null;
        return last.endingType;
    }

    /** 检查某个NPC在上一世是否死亡 */
    wasNpcDeadLastLife(npcId) {
        const last = this.getLastLifeData();
        if (!last) return false;
        const finalState = (last.npcFinalStates || []).find(s => s.id === npcId);
        return finalState ? finalState.isDead : false;
    }

    /** 获取上一世NPC的死因 */
    getNpcDeathCauseLastLife(npcId) {
        const deathRecords = this.getLastLifeDeathRecords();
        const record = deathRecords.find(r => {
            // deathRecords中存的是name不是id，需要通过game.npcs反查
            const npc = this.game.npcs.find(n => n.id === npcId);
            return npc && r.name === npc.name;
        });
        return record ? record.cause : null;
    }

    // ============ 【需求1】轮回经验自动生成分工方案 ============

    /**
     * 基于前世数据生成本世分工方案
     * 在每世开始时由game.js调用，结果存储到老钱的workPlan属性
     * @returns {{ dayPlans: Object, summary: string, workPlanSummary: string }} 分工方案
     */
    generateWorkPlan() {
        const pastLives = this.pastLives;
        const lifeNum = this.currentLifeNumber;

        // 第1世无前世记忆：返回默认方案
        if (lifeNum <= 1 || pastLives.length === 0) {
            return this._getDefaultWorkPlan();
        }

        const lastLife = pastLives[pastLives.length - 1];
        const multiLifeAnalysis = this.analyzeMultiLifePatterns();

        // 【修复A】查找历史上最好的一世，优先复用其成功方案
        const bestLife = this._findBestLife();

        // 如果历史上有完美结局的世代且保存了分工方案 → 直接复用成功方案
        if (bestLife && bestLife.aliveCount >= 8 && bestLife.workPlan) {
            console.log(`[WorkPlan] 第${lifeNum}世：复用第${bestLife.lifeNumber}世的完美方案`);
            const reusedPlan = JSON.parse(JSON.stringify(bestLife.workPlan));
            reusedPlan.strategy = 'reuse_perfect';
            reusedPlan.summary = `第${lifeNum}世(复用第${bestLife.lifeNumber}世完美方案):直接沿用成功策略`;
            reusedPlan.workPlanSummary = this._generateWorkPlanSummary(reusedPlan);
            return reusedPlan;
        }

        // 如果历史上有较好的世代（存活>=7）且保存了方案，以它为基础微调
        if (bestLife && bestLife.aliveCount >= 7 && bestLife.workPlan && bestLife.aliveCount > lastLife.aliveCount) {
            console.log(`[WorkPlan] 第${lifeNum}世：以第${bestLife.lifeNumber}世(${bestLife.aliveCount}存活)的方案为基础微调`);
            return this._generateOptimizedPlanFromBase(bestLife, lastLife, multiLifeAnalysis);
        }

        // 前世全员存活：基本保持不变，微调过剩资源
        if (lastLife.aliveCount >= 8) {
            return this._generateOptimizedPlan(lastLife, multiLifeAnalysis, 'maintain');
        }

        // 存活人数下降：激进调整
        return this._generateOptimizedPlan(lastLife, multiLifeAnalysis, 'aggressive');
    }

    /** 第1世默认分工方案（等价于task-system的硬编码） */
    _getDefaultWorkPlan() {
        const plan = {
            dayPlans: {
                1: [
                    { npcId: 'zhao_chef', task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: '默认：砍柴' },
                    { npcId: 'lu_chen', task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: '默认：砍柴' },
                    { npcId: 'li_shen', task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: '默认：采食物' },
                    { npcId: 'wang_teacher', task: 'MAINTAIN_POWER', targetLocation: 'workshop_door', reason: '默认：维护电力' },
                    { npcId: 'old_qian', task: 'COORDINATE', targetLocation: 'furnace_plaza', reason: '默认：统筹协调' },
                    { npcId: 'su_doctor', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '默认：医疗准备' },
                    { npcId: 'ling_yue', task: 'SCOUT_RUINS', targetLocation: 'ruins_site', reason: '默认：废墟侦察' },
{ npcId: 'qing_xuan', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '默认：医疗救治' },
                ],
                2: [
                    { npcId: 'zhao_chef', task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: '冒险砍柴(限2h)' },
                    { npcId: 'lu_chen', task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: '冒险采食(限2h)' },
                    { npcId: 'li_shen', task: 'DISTRIBUTE_FOOD', targetLocation: 'kitchen_door', reason: '分配食物' },
                    { npcId: 'wang_teacher', task: 'MAINTAIN_POWER', targetLocation: 'workshop_door', reason: '维护电力' },
                    { npcId: 'old_qian', task: 'MAINTAIN_ORDER', targetLocation: 'furnace_plaza', reason: '安抚情绪' },
                    { npcId: 'su_doctor', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '医疗待命' },
                    { npcId: 'ling_yue', task: 'BOOST_MORALE', targetLocation: 'furnace_plaza', reason: '鼓舞士气' },
{ npcId: 'qing_xuan', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '医疗救治' },
                ],
                3: [
                    { npcId: 'zhao_chef', task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: '补充木柴为第4天' },
                    { npcId: 'lu_chen', task: 'BUILD_FURNACE', targetLocation: 'dorm_b_door', reason: '建第二暖炉' },
                    { npcId: 'li_shen', task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: '补充食物' },
                    { npcId: 'wang_teacher', task: 'BUILD_FURNACE', targetLocation: 'dorm_b_door', reason: '建第二暖炉' },
                    { npcId: 'old_qian', task: 'COORDINATE', targetLocation: 'furnace_plaza', reason: '统筹第4天准备' },
                    { npcId: 'su_doctor', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '医疗准备' },
                    { npcId: 'ling_yue', task: 'SCOUT_RUINS', targetLocation: 'ruins_site', reason: '最后侦察' },
                    { npcId: 'qing_xuan', task: 'REPAIR_RADIO', targetLocation: 'workshop_door', reason: '修无线电' },
                ],
                4: [
                    { npcId: 'zhao_chef', task: 'MAINTAIN_FURNACE', targetLocation: 'furnace_plaza', reason: '维护暖炉(室内)' },
                    { npcId: 'lu_chen', task: 'MAINTAIN_FURNACE', targetLocation: 'furnace_plaza', reason: '维护暖炉(室内)' },
                    { npcId: 'li_shen', task: 'DISTRIBUTE_FOOD', targetLocation: 'kitchen_door', reason: '分配食物(室内)' },
                    { npcId: 'wang_teacher', task: 'MAINTAIN_POWER', targetLocation: 'workshop_door', reason: '维护电力(室内)' },
                    { npcId: 'old_qian', task: 'MAINTAIN_ORDER', targetLocation: 'furnace_plaza', reason: '维持秩序(室内)' },
                    { npcId: 'su_doctor', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '医疗待命(室内)' },
                    { npcId: 'ling_yue', task: 'BOOST_MORALE', targetLocation: 'furnace_plaza', reason: '鼓舞士气(室内)' },
{ npcId: 'qing_xuan', task: 'PREPARE_MEDICAL', targetLocation: 'medical_door', reason: '医疗救治(室内)' },
                ],
            },
            strategy: 'default',
            summary: '第1世：默认分工方案',
            workPlanSummary: '第1世默认:赵砍柴,陆砍柴,李食物,王电力,钱统筹,苏医疗,玥侦察,璇制药',
        };
        return plan;
    }

    /** 基于前世数据优化分工方案 */
    _generateOptimizedPlan(lastLife, multiLifeAnalysis, mode) {
        // 从默认方案开始，然后根据前世数据调整
        const plan = this._getDefaultWorkPlan();
        plan.strategy = mode;

        const rs = lastLife.resourceSnapshot;
        const deaths = lastLife.deathRecords || [];
        const lessons = this._generateDeepLessons(lastLife);

        // ===== 资源瓶颈分析 =====
        const bottlenecks = this._analyzeResourceBottlenecks(rs);

        // ===== Day 1 调整 =====
        if (bottlenecks.woodFuel === 'critical') {
            // 木柴严重不足：增派陆辰也去砍柴
            plan.dayPlans[1] = plan.dayPlans[1].map(a => {
                if (a.npcId === 'lu_chen') return { ...a, task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: `前世木柴仅剩${rs.woodFuel}，增派砍柴` };
                return a;
            });
        }
        if (bottlenecks.food === 'critical') {
            // 食物严重不足：歆玥改为采集食物
            plan.dayPlans[1] = plan.dayPlans[1].map(a => {
                if (a.npcId === 'ling_yue') return { ...a, task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: `前世食物仅剩${rs.food}，增派采食物` };
                return a;
            });
        }
        if (bottlenecks.power === 'critical') {
            // 电力不足：第1天就让歆玥去矿渣堆采矿
            plan.dayPlans[1] = plan.dayPlans[1].map(a => {
                if (a.npcId === 'ling_yue') return { ...a, task: 'COLLECT_POWER', targetLocation: 'ore_pile', reason: `前世电力仅剩${rs.power}，增派采矿` };
                return a;
            });
        }

        // ===== Day 2 调整（户外限2h）=====
        const day2FrozenDeaths = deaths.filter(d => d.cause === '冻死' && d.day <= 2);
        if (day2FrozenDeaths.length > 0 && mode === 'aggressive') {
            // 前世第2天有人冻死：减少户外工作，全部转室内
            plan.dayPlans[2] = plan.dayPlans[2].map(a => {
                if (a.task === 'COLLECT_WOOD' || a.task === 'COLLECT_FOOD' || a.task === 'SCOUT_RUINS') {
                    return { ...a, task: 'MAINTAIN_FURNACE', targetLocation: 'furnace_plaza', reason: `前世${day2FrozenDeaths.map(d => d.name).join('、')}第2天冻死，改为室内维护` };
                }
                return a;
            });
        }

        // ===== Day 3 调整 =====
        if (!lastLife.secondFurnaceBuilt) {
            // 前世暖炉未建：增派赵铁柱也去建暖炉
            plan.dayPlans[3] = plan.dayPlans[3].map(a => {
                if (a.npcId === 'zhao_chef') return { ...a, task: 'BUILD_FURNACE', targetLocation: 'dorm_b_door', reason: '前世暖炉未建！全力建造' };
                return a;
            });
        }
        if (bottlenecks.power === 'critical') {
            // 电力不足：第3天清璇也去维护电力
            plan.dayPlans[3] = plan.dayPlans[3].map(a => {
                if (a.npcId === 'qing_xuan') return { ...a, task: 'MAINTAIN_POWER', targetLocation: 'workshop_door', reason: `前世电力仅剩${rs.power}，增派维护` };
                return a;
            });
        }

        // ===== 应用多世模式分析 =====
        if (multiLifeAnalysis && multiLifeAnalysis.failurePatterns.length > 0) {
            for (const pattern of multiLifeAnalysis.failurePatterns) {
                if (pattern.includes('木柴') && pattern.includes('连续')) {
                    // 连续多世木柴不足：第1天派3人砍柴
                    plan.dayPlans[1] = plan.dayPlans[1].map(a => {
                        if (a.npcId === 'ling_yue') return { ...a, task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: '🔴连续多世木柴不足！全力砍柴' };
                        return a;
                    });
                }
                if (pattern.includes('食物') && pattern.includes('连续')) {
                    plan.dayPlans[1] = plan.dayPlans[1].map(a => {
                        if (a.npcId === 'ling_yue') return { ...a, task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: '🔴连续多世食物不足！全力采集' };
                        return a;
                    });
                }
            }
        }

        // ===== 前世全员存活时的微调 =====
        if (mode === 'maintain' && rs) {
            // 找过剩资源，将对应人力转到最缺的资源
            const surplus = [];
            const deficit = [];
            if (rs.woodFuel > 80) surplus.push('woodFuel');
            else if (rs.woodFuel < 30) deficit.push('woodFuel');
            if (rs.food > 40) surplus.push('food');
            else if (rs.food < 15) deficit.push('food');
            if (rs.power > 50) surplus.push('power');
            else if (rs.power < 15) deficit.push('power');

            // 如果有过剩且有缺口，调整Day1
            if (surplus.length > 0 && deficit.length > 0) {
                const surplusTask = surplus[0] === 'woodFuel' ? 'COLLECT_WOOD' : surplus[0] === 'food' ? 'COLLECT_FOOD' : 'MAINTAIN_POWER';
                const deficitTask = deficit[0] === 'woodFuel' ? 'COLLECT_WOOD' : deficit[0] === 'food' ? 'COLLECT_FOOD' : 'MAINTAIN_POWER';
                const deficitLoc = deficit[0] === 'woodFuel' ? 'lumber_camp' : deficit[0] === 'food' ? 'frozen_lake' : 'workshop_door';
                // 找第一个做过剩资源的NPC改为做缺口资源
                for (let i = 0; i < plan.dayPlans[1].length; i++) {
                    if (plan.dayPlans[1][i].task === surplusTask) {
                        plan.dayPlans[1][i] = { ...plan.dayPlans[1][i], task: deficitTask, targetLocation: deficitLoc, reason: `前世${surplus[0]}过剩(${rs[surplus[0]]}),调去补${deficit[0]}` };
                        break;
                    }
                }
            }
        }

        // 生成摘要（≤200字符）
        plan.summary = `第${this.currentLifeNumber}世(${mode}):基于前世${lastLife.aliveCount}/8存活调整`;
        plan.workPlanSummary = this._generateWorkPlanSummary(plan);

        console.log(`[WorkPlan] 第${this.currentLifeNumber}世分工方案生成:`, plan.summary);
        return plan;
    }

    /** 分析资源瓶颈 */
    _analyzeResourceBottlenecks(rs) {
        if (!rs) return {};
        const result = {};
        // 木柴
        if (rs.woodFuel < 15) result.woodFuel = 'critical';
        else if (rs.woodFuel < 40) result.woodFuel = 'warning';
        else result.woodFuel = 'ok';
        // 食物
        if (rs.food < 8) result.food = 'critical';
        else if (rs.food < 20) result.food = 'warning';
        else result.food = 'ok';
        // 电力
        if (rs.power < 10) result.power = 'critical';
        else if (rs.power < 25) result.power = 'warning';
        else result.power = 'ok';
        return result;
    }

    /** 生成工作安排摘要（≤200字符） */
    _generateWorkPlanSummary(plan) {
        const nameMap = { zhao_chef: '赵', lu_chen: '陆', li_shen: '李', wang_teacher: '王', old_qian: '钱', su_doctor: '苏', ling_yue: '玥', qing_xuan: '璇' };
        const taskShort = { COLLECT_WOOD: '砍柴', COLLECT_FOOD: '采食', COLLECT_MATERIAL: '探索', MAINTAIN_POWER: '电力', COORDINATE: '统筹', PREPARE_MEDICAL: '医疗', SCOUT_RUINS: '侦察', BOOST_MORALE: '鼓舞', BUILD_FURNACE: '建炉', MAINTAIN_FURNACE: '维炉', MAINTAIN_ORDER: '秩序', DISTRIBUTE_FOOD: '分食', REPAIR_RADIO: '电台', REST_RECOVER: '休息' };
        // 只输出Day1的安排
        const day1 = (plan.dayPlans[1] || []).map(a => `${nameMap[a.npcId] || '?'}${taskShort[a.task] || a.task}`).join(',');
        let summary = `D1:${day1}`;
        if (summary.length > 200) summary = summary.substring(0, 197) + '…';
        return summary;
    }

    // ============ 【需求3】前世教训深度分析 ============

    /** 深度教训生成（分层：战略/战术/执行） */
    _generateDeepLessons(lastLife) {
        const strategic = [];  // 战略层
        const tactical = [];   // 战术层（与特定NPC相关）
        const execution = [];  // 执行层（具体行动建议）

        const rs = lastLife.resourceSnapshot;
        const deaths = lastLife.deathRecords || [];
        const npcStates = lastLife.npcFinalStates || [];
        const unfinished = lastLife.unfinishedTasks || [];

        // ===== 资源比例分析 =====
        if (rs && rs.totalCollected) {
            const tc = rs.totalCollected;
        const total = (tc.woodFuel || 0) + (tc.food || 0) + (tc.power || 0);
            if (total > 0) {
                const woodRatio = (tc.woodFuel || 0) / total;
                const foodRatio = (tc.food || 0) / total;
                const powerRatio = (tc.power || 0) / total;
                // 检测偏科
                if (woodRatio > 0.5) strategic.push(`资源分配偏科：木柴占采集总量${Math.round(woodRatio * 100)}%，其他资源被忽视`);
                if (foodRatio < 0.15 && rs.food < 20) strategic.push(`食物采集严重不足，仅占总采集量${Math.round(foodRatio * 100)}%`);
                if (powerRatio < 0.1 && rs.power < 15) strategic.push(`电力维护不足，仅占总采集量${Math.round(powerRatio * 100)}%`);
            }
        }

        // ===== 人力分配分析 =====
        for (const state of npcStates) {
            if (state.isDead) continue;
            // 体力还很高的NPC → 可能没充分利用
            if (state.stamina > 70) {
                tactical.push(`${state.name}体力剩余${state.stamina}%，劳动力未充分利用，可增加工作量`);
            }
            // San值极低但未死 → 缺乏精神维护
            if (state.sanity < 20) {
                tactical.push(`${state.name}精神濒危(San:${state.sanity})，需要更多安抚和休息`);
            }
        }

        // ===== 时序分析 =====
        const deathsByDay = {};
        for (const d of deaths) {
            if (!deathsByDay[d.day]) deathsByDay[d.day] = [];
            deathsByDay[d.day].push(d);
        }
        for (const [day, dayDeaths] of Object.entries(deathsByDay)) {
            if (dayDeaths.length >= 2) {
                strategic.push(`第${day}天有${dayDeaths.length}人死亡(${dayDeaths.map(d => d.name + d.cause).join('、')})，该天安排严重失误`);
            }
        }

        // ===== 因果链推导 =====
        const frozenDeaths = deaths.filter(d => d.cause === '冻死');
        if (frozenDeaths.length > 0) {
            if (rs && rs.woodFuel < 20) {
                execution.push(`因果链：木柴不足(剩${rs.woodFuel}) → ${frozenDeaths.map(d => d.name).join('、')}冻死 → 赵铁柱+陆辰应专注砍柴`);
            }
            const outdoorFrozen = frozenDeaths.filter(d => d.location === 'village');
            if (outdoorFrozen.length > 0) {
                execution.push(`因果链：${outdoorFrozen.map(d => d.name).join('、')}在户外冻死 → 第${outdoorFrozen[0].day}天必须限制户外时间`);
            }
        }

        const starvedDeaths = deaths.filter(d => d.cause === '饿死');
        if (starvedDeaths.length > 0) {
            execution.push(`因果链：食物不足(剩${rs ? rs.food : '?'}) → ${starvedDeaths.map(d => d.name).join('、')}饿死 → 李婶+陆辰应多采集食物`);
        }

        // 暖炉未建因果链
        if (!lastLife.secondFurnaceBuilt) {
            const day4Deaths = deaths.filter(d => d.day >= 4);
            if (day4Deaths.length > 0) {
                execution.push(`因果链：第二暖炉未建 → 第4天供暖不足 → ${day4Deaths.map(d => d.name).join('、')}死亡 → 第3天必须全力建暖炉`);
            } else {
                execution.push(`第二暖炉未建成，第3天必须优先安排赵铁柱+陆辰+王策建造`);
            }
        }

    // ===== 【修复D】扫描所有历史记录，识别长期反复出现的问题 =====
        if (this.pastLives.length >= 2) {
            // 统计所有历史中各问题出现的次数
            let woodShortCount = 0;
            let foodShortCount = 0;
            let furnaceFailCount = 0;
            const dayDeathCounts = { 1: 0, 2: 0, 3: 0, 4: 0 }; // 每天大量死亡的世数
            let consecutiveWoodShort = 0;
            let consecutiveFoodShort = 0;
            let consecutiveFurnaceFail = 0;

            for (let i = this.pastLives.length - 1; i >= 0; i--) {
                const life = this.pastLives[i];
                const rs = life.resourceSnapshot;
                // 木柴不足
                if (rs && rs.woodFuel < 30) {
                    woodShortCount++;
                    if (i === this.pastLives.length - 1 - (this.pastLives.length - 1 - i)) consecutiveWoodShort++;
                }
                // 食物不足
                if (rs && rs.food < 15) {
                    foodShortCount++;
                    if (i === this.pastLives.length - 1 - (this.pastLives.length - 1 - i)) consecutiveFoodShort++;
                }
                // 暖炉未建
                if (!life.secondFurnaceBuilt) {
                    furnaceFailCount++;
                    if (i === this.pastLives.length - 1 - (this.pastLives.length - 1 - i)) consecutiveFurnaceFail++;
                }
                // 某天大量死亡
                for (let day = 1; day <= 4; day++) {
                    const dayD = (life.deathRecords || []).filter(d => d.day === day).length;
                    if (dayD >= 2) dayDeathCounts[day]++;
                }
            }

            // 计算真正的连续次数（从最近一世往回数）
            consecutiveWoodShort = 0;
            consecutiveFoodShort = 0;
            consecutiveFurnaceFail = 0;
            for (let i = this.pastLives.length - 1; i >= 0; i--) {
                const life = this.pastLives[i];
                const rs = life.resourceSnapshot;
                if (rs && rs.woodFuel < 30) consecutiveWoodShort++; else break;
            }
            for (let i = this.pastLives.length - 1; i >= 0; i--) {
                const life = this.pastLives[i];
                const rs = life.resourceSnapshot;
                if (rs && rs.food < 15) consecutiveFoodShort++; else break;
            }
            for (let i = this.pastLives.length - 1; i >= 0; i--) {
                if (!this.pastLives[i].secondFurnaceBuilt) consecutiveFurnaceFail++; else break;
            }

            // 生成严重警告
            if (consecutiveWoodShort >= 3) {
                strategic.unshift(`🔴🔴 连续${consecutiveWoodShort}世木柴严重不足！历史共${woodShortCount}/${this.pastLives.length}世木柴不够，必须彻底改变砍柴策略——第1天至少3人砍柴！`);
            } else if (consecutiveWoodShort >= 2) {
                strategic.unshift(`🔴 连续${consecutiveWoodShort}世木柴不足！增加砍柴人手`);
            }

            if (consecutiveFoodShort >= 3) {
                strategic.unshift(`🔴🔴 连续${consecutiveFoodShort}世食物严重不足！历史共${foodShortCount}/${this.pastLives.length}世食物不够，必须大幅增加食物采集！`);
            } else if (consecutiveFoodShort >= 2) {
                strategic.unshift(`🔴 连续${consecutiveFoodShort}世食物不足！增加食物采集`);
            }

            if (consecutiveFurnaceFail >= 3) {
                strategic.unshift(`🔴🔴 连续${consecutiveFurnaceFail}世暖炉未建成！历史共${furnaceFailCount}/${this.pastLives.length}世失败，Day3必须立即派2人去工坊修复！`);
            } else if (consecutiveFurnaceFail >= 2) {
                strategic.unshift(`🔴 连续${consecutiveFurnaceFail}世暖炉未建！Day3必须立即修复`);
            }

            for (let day = 1; day <= 4; day++) {
                if (dayDeathCounts[day] >= 3) {
                    strategic.unshift(`🔴🔴 历史上有${dayDeathCounts[day]}世在第${day}天大量死亡！该天策略完全失败，需彻底改变`);
                } else if (dayDeathCounts[day] >= 2) {
                    strategic.unshift(`🔴 有${dayDeathCounts[day]}世在第${day}天大量死亡，需重点防范`);
                }
            }
        }

        return { strategic, tactical, execution };
    }

    // ============ 【需求6】多世学习演进 ============

    /** 综合多世数据识别成功/失败模式
     *  【修复B】扩大分析视野：从最近3世→全部历史
     */
    analyzeMultiLifePatterns() {
        if (this.pastLives.length < 2) {
            return { successPatterns: [], failurePatterns: [], trends: {} };
        }

        const lives = this.pastLives; // 【修复B】分析全部历史，不再限制3世
        const successPatterns = [];
        const failurePatterns = [];
        const trends = { aliveCount: [], woodFuel: [], food: [], power: [] };

        // 收集趋势数据
        for (const life of lives) {
            trends.aliveCount.push(life.aliveCount);
            if (life.resourceSnapshot) {
                trends.woodFuel.push(life.resourceSnapshot.woodFuel);
                trends.food.push(life.resourceSnapshot.food);
                trends.power.push(life.resourceSnapshot.power);
            }
        }

        // 分析存活趋势
        if (trends.aliveCount.length >= 2) {
            const last = trends.aliveCount[trends.aliveCount.length - 1];
            const prev = trends.aliveCount[trends.aliveCount.length - 2];
            if (last > prev) {
                successPatterns.push(`存活人数从${prev}提升到${last}，策略在改善`);
            } else if (last < prev) {
                failurePatterns.push(`存活人数从${prev}下降到${last}，策略在退步`);
            }
        }

        // 资源趋势
        for (const [resName, values] of Object.entries(trends)) {
            if (resName === 'aliveCount' || values.length < 2) continue;
            const last = values[values.length - 1];
            const prev = values[values.length - 2];
            if (last < prev * 0.5) {
                failurePatterns.push(`${resName}连续下降(${Math.round(prev)}→${Math.round(last)})，需增加采集`);
            } else if (last > prev * 1.5) {
                successPatterns.push(`${resName}大幅提升(${Math.round(prev)}→${Math.round(last)})，采集策略有效`);
            }
        }

        // 检测反复死亡模式
        const deathCauseCounts = {};
        const deathDayCounts = {};
        for (const life of lives) {
            for (const d of (life.deathRecords || [])) {
                deathCauseCounts[d.cause] = (deathCauseCounts[d.cause] || 0) + 1;
                const key = `day${d.day}_${d.cause}`;
                deathDayCounts[key] = (deathDayCounts[key] || 0) + 1;
            }
        }
        for (const [cause, count] of Object.entries(deathCauseCounts)) {
            if (count >= lives.length) {
                failurePatterns.push(`连续${count}世有人${cause}，该问题从未解决`);
            }
        }
        for (const [key, count] of Object.entries(deathDayCounts)) {
            if (count >= 2) {
                failurePatterns.push(`连续多世在${key.replace('_', '天')}，需重点防范`);
            }
        }

        // 检测成功世代的分配特征
        for (const life of lives) {
            if (life.aliveCount >= 7 && life.resourceSnapshot) {
                const rs = life.resourceSnapshot;
                if (rs.woodFuel > 50) successPatterns.push(`第${life.lifeNumber}世木柴充足(${Math.round(rs.woodFuel)})，砍柴策略可复用`);
                if (life.secondFurnaceBuilt) successPatterns.push(`第${life.lifeNumber}世暖炉建成，建造时机可复用`);
            }
        }

        return { successPatterns, failurePatterns, trends };
    }

    // ============ 【需求2】老钱指挥中心辅助方法 ============

    /** 获取当前工作安排持有者（老钱→王策→李婶→歆玥） */
    getWorkPlanHolder() {
        const game = this.game;
        const succession = ['old_qian', 'wang_teacher', 'li_shen', 'ling_yue'];
        for (const id of succession) {
            const npc = game.npcs.find(n => n.id === id && !n.isDead);
            if (npc) return npc;
        }
        // 所有继任者都死了，返回任意存活NPC
        return game.npcs.find(n => !n.isDead) || null;
    }

    /** 获取给特定NPC看的工作安排摘要 */
    getWorkPlanSummaryForNpc(npcId) {
        const holder = this.getWorkPlanHolder();
        if (!holder || !holder.workPlan) return '';

        const plan = holder.workPlan;
        const day = this.game.dayCount || 1;
        const dayPlan = plan.dayPlans[day];
        if (!dayPlan) return '';

        const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
        const taskShort = { COLLECT_WOOD: '砍柴', COLLECT_FOOD: '采食物', COLLECT_MATERIAL: '探索废墟', MAINTAIN_POWER: '维护电力', COORDINATE: '统筹协调', PREPARE_MEDICAL: '医疗', SCOUT_RUINS: '侦察', BOOST_MORALE: '鼓舞士气', BUILD_FURNACE: '建暖炉', MAINTAIN_FURNACE: '维护暖炉', MAINTAIN_ORDER: '维持秩序', DISTRIBUTE_FOOD: '分配食物', REPAIR_RADIO: '修无线电', REST_RECOVER: '休息' };

        let summary = `【${nameMap[holder.id] || holder.name}的工作安排·第${day}天】\n`;
        for (const assignment of dayPlan) {
            const name = nameMap[assignment.npcId] || assignment.npcId;
            const task = taskShort[assignment.task] || assignment.task;
            const isMe = assignment.npcId === npcId;
            summary += isMe ? `→★${name}:${task}(${assignment.reason})★\n` : `  ${name}:${task}\n`;
        }
        // 截断到200字符
        if (summary.length > 200) summary = summary.substring(0, 197) + '…';
        return summary;
    }

    /** 获取与特定NPC相关的教训 */
    getLessonsForNpc(npcId) {
        if (this.pastLives.length === 0) return '';
        const lastLife = this.pastLives[this.pastLives.length - 1];
        const deepLessons = this._generateDeepLessons(lastLife);

        const npc = this.game.npcs.find(n => n.id === npcId);
        if (!npc) return '';

        // 筛选与该NPC相关的战术和执行层教训
        const relevantLessons = [];
        const npcName = npc.name;
        for (const lesson of [...deepLessons.tactical, ...deepLessons.execution]) {
            if (lesson.includes(npcName) || lesson.includes(npc.id)) {
                relevantLessons.push(lesson);
            }
        }
        // 也加入战略层前2条
        relevantLessons.push(...deepLessons.strategic.slice(0, 2));

        if (relevantLessons.length === 0) return '';
        let text = relevantLessons.slice(0, 3).join('；');
        if (text.length > 300) text = text.substring(0, 297) + '…';
        return text;
    }

    // ============ 【修复A】查找历史最好的一世 ============

    /** 从所有历史记忆中找到存活人数最多的那一世 */
    _findBestLife() {
        if (this.pastLives.length === 0) return null;
        let best = this.pastLives[0];
        for (const life of this.pastLives) {
            if (life.aliveCount > best.aliveCount) {
                best = life;
            } else if (life.aliveCount === best.aliveCount && life.endingType === 'perfect') {
                best = life; // 同分时优先完美结局
            }
        }
        return best;
    }

    // ============ 【修复A】基于历史最好方案微调 ============

    /** 以历史最好世代的分工方案为基础，结合最近一世的失败教训微调 */
    _generateOptimizedPlanFromBase(bestLife, lastLife, multiLifeAnalysis) {
        // 从最好世代的方案深拷贝
        const plan = JSON.parse(JSON.stringify(bestLife.workPlan));
        plan.strategy = 'optimize_from_best';

        const deaths = lastLife.deathRecords || [];
        const rs = lastLife.resourceSnapshot;

        // 针对最近一世的失败做针对性微调
        // 如果最近一世有人冻死且是木柴不足导致的
        const frozenDeaths = deaths.filter(d => d.cause === '冻死');
        if (frozenDeaths.length > 0 && rs && rs.woodFuel < 30) {
            // Day1加派一人砍柴
            if (plan.dayPlans && plan.dayPlans[1]) {
                for (let i = 0; i < plan.dayPlans[1].length; i++) {
                    const a = plan.dayPlans[1][i];
                    if (a.task === 'SCOUT_RUINS' || a.task === 'PREPARE_MEDICAL') {
                        plan.dayPlans[1][i] = { ...a, task: 'COLLECT_WOOD', targetLocation: 'lumber_camp', reason: `基于最好方案微调:上世木柴仅剩${rs.woodFuel}导致冻死` };
                        break;
                    }
                }
            }
        }

        // 如果最近一世有人饿死
        const starvedDeaths = deaths.filter(d => d.cause === '饿死');
        if (starvedDeaths.length > 0 && rs && rs.food < 15) {
            if (plan.dayPlans && plan.dayPlans[1]) {
                for (let i = 0; i < plan.dayPlans[1].length; i++) {
                    const a = plan.dayPlans[1][i];
                    if (a.task === 'SCOUT_RUINS' || a.task === 'PREPARE_MEDICAL') {
                        plan.dayPlans[1][i] = { ...a, task: 'COLLECT_FOOD', targetLocation: 'frozen_lake', reason: `基于最好方案微调:上世食物仅剩${rs.food}导致饿死` };
                        break;
                    }
                }
            }
        }

        // 如果最近一世暖炉未建
        if (!lastLife.secondFurnaceBuilt && plan.dayPlans && plan.dayPlans[3]) {
            for (let i = 0; i < plan.dayPlans[3].length; i++) {
                const a = plan.dayPlans[3][i];
                if (a.task !== 'BUILD_FURNACE' && a.npcId === 'zhao_chef') {
                    plan.dayPlans[3][i] = { ...a, task: 'BUILD_FURNACE', targetLocation: 'dorm_b_door', reason: '基于最好方案微调:上世暖炉未建！全力建造' };
                    break;
                }
            }
        }

        plan.summary = `第${this.currentLifeNumber}世(基于第${bestLife.lifeNumber}世最优方案微调):结合上世失败教训调整`;
        plan.workPlanSummary = this._generateWorkPlanSummary(plan);

        console.log(`[WorkPlan] 第${this.currentLifeNumber}世:以第${bestLife.lifeNumber}世(${bestLife.aliveCount}存活)方案为基础微调`);
        return plan;
    }

    // ============ 序列化 ============

    serialize() {
        return {
            pastLives: this.pastLives,
            currentLifeNumber: this.currentLifeNumber,
        };
    }

    deserialize(data) {
        if (!data) return;
        this.pastLives = data.pastLives || [];
        this.currentLifeNumber = data.currentLifeNumber || (this.pastLives.length + 1);
    }
}

    GST.ReincarnationSystem = ReincarnationSystem;
})();
