/**
 * 福音镇 - NPC 行动效果模块
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：行动效果应用（产出资源、建造进度、制药等）
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._updateActionEffect = function(dt, game) {
        if (this.isDead || this.isSleeping || this.isEating || this.state === 'CHATTING') return;

        // 获取当前日程描述
        const schedIdx = this.currentScheduleIdx;
        if (schedIdx < 0 || !this.scheduleTemplate[schedIdx]) return;
        const scheduleDesc = this.scheduleTemplate[schedIdx].desc || '';
        const currentDesc = this.stateDesc || scheduleDesc;

        // 【投票决策保护】如果NPC有投票分配的stateDesc且未过期，优先使用它
        const councilDesc = this._councilStateDesc || '';

        // 在ACTION_EFFECT_MAP中查找匹配的效果
        // 优先使用 taskOverride 显式 effectKey，避免“建造发电机 / 人工发电”这类关键词互相串台
        // 【P0修复】同时匹配 stateDesc 和日程原始 desc，防止 LLM 行动决策覆盖 stateDesc 后关键词丢失
        // 【投票修复】额外匹配 _councilStateDesc，确保投票决策的行动效果一定能触发
        let matchedEffect = null;
        const explicitEffectKey = this._taskOverride && this._taskOverride.isActive
            ? this._taskOverride.effectKey || null
            : null;
        if (explicitEffectKey) {
            matchedEffect = GST.ACTION_EFFECT_MAP.find(entry => entry.effectKey === explicitEffectKey) || null;
        }
        if (!matchedEffect) {
            for (const entry of GST.ACTION_EFFECT_MAP) {
                for (const keyword of entry.keywords) {
                    if (currentDesc.includes(keyword) || scheduleDesc.includes(keyword) || councilDesc.includes(keyword)) {
                        matchedEffect = entry;
                        break;
                    }
                }
                if (matchedEffect) break;
            }
        }

        if (!matchedEffect) {
            // 空转检测：输出警告日志
            this._logDebug?.(`[⚠️ 空转] ${this.name} 的行为 "${currentDesc}" 未匹配到任何效果`);
            // 累计空转计时
            this._idleEffectTimer = (this._idleEffectTimer || 0) + dt * (game.timeSpeed || 60);
            // 超过1游戏小时自动回退到角色默认生产行为
            if (this._idleEffectTimer > 3600) {
                this._logDebug?.(`[⚠️ 空转回退] ${this.name} 空转超过1小时，自动切换到默认生产行为`);
                this._idleEffectTimer = 0;
                this._fallbackToRoleDefaultAction(game);
            }
            this._currentActionEffect = null;
            return;
        }

        // 检查场景是否匹配（null表示不限场景）
        if (matchedEffect.requiredScene && this.currentScene !== matchedEffect.requiredScene) {
            this._currentActionEffect = null;
            return;
        }

        // 匹配成功，重置空转计时
        this._idleEffectTimer = 0;

        // 记录当前效果（用于UI显示）
        this._currentActionEffect = matchedEffect;

        // 计算效率系数
        const staminaEfficiency = Math.max(0.1, this.stamina / 100); // 体力效率
        const specialtyMultiplier = this._getSpecialtyMultiplier(matchedEffect); // 专长倍率

        // 根据effectType执行不同效果
        const rs = game.resourceSystem;
        switch (matchedEffect.effectType) {
            case 'produce_resource': {
                // 产出资源（每游戏小时 = ratePerHour）
                // 【修复】dt 是 gameDt（真实秒），需乘以 timeSpeed 转为游戏秒，与消耗侧保持一致
                if (rs && matchedEffect.resourceType) {
                    const gameSeconds = dt * (game.timeSpeed || 60);
                    // 【新增】电力效率加成：工坊/医疗站受电力状态影响
                    const powerBonus = rs.getPowerEfficiencyBonus ? rs.getPowerEfficiencyBonus(this.currentScene) : 1.0;
                    const rate = matchedEffect.ratePerHour / 3600 * staminaEfficiency * specialtyMultiplier * powerBonus;
                    const produced = rate * gameSeconds;
                    // 【修复】改用addResource方法，让产出被正确统计到dailyCollected
                    // 旧代码直接写rs[type]会绕过统计和电力恢复检测
                    if (rs.addResource) {
                        rs.addResource(matchedEffect.resourceType, produced);
                    } else {
                        rs[matchedEffect.resourceType] = (rs[matchedEffect.resourceType] || 0) + produced;
                    }
                    // 【任务10】更新目标追踪计数器
                    if (this._goalTrackers) {
                        if (matchedEffect.resourceType === 'woodFuel') {
                            this._goalTrackers.woodChopped = (this._goalTrackers.woodChopped || 0) + produced;
                        }
                        this._goalTrackers.gatherCount = (this._goalTrackers.gatherCount || 0) + produced;
                    }

                    // 【任务8】工作产出累计统计与定期日志
                    if (!this._productionStats) this._productionStats = {};
                    const resType = matchedEffect.resourceType;
                    if (!this._productionStats[resType]) {
                        this._productionStats[resType] = { total: 0, sessionTotal: 0, lastLogTime: 0 };
                    }
                    this._productionStats[resType].total += produced;
                    this._productionStats[resType].sessionTotal += produced;
                    // 每游戏小时（3600游戏秒）输出一次产出日志
                    const gameTime = game.gameTimeSeconds || 0;
                    if (gameTime - this._productionStats[resType].lastLogTime >= 3600) {
                        this._productionStats[resType].lastLogTime = gameTime;
                        const hourlyTotal = this._productionStats[resType].sessionTotal;
                        if (hourlyTotal > 0.01) {
                            this._logDebug && this._logDebug('production',
                                `[产出统计] ${this.name} 本小时产出 ${resType}: +${hourlyTotal.toFixed(2)}` +
                                ` (效率: 体力${(staminaEfficiency*100).toFixed(0)}% 专长x${specialtyMultiplier} 电力x${powerBonus.toFixed(1)})` +
                                ` 累计: ${this._productionStats[resType].total.toFixed(2)}`
                            );
                            if (game.addEvent) {
                                game.addEvent(`📦 ${this.name}产出${resType} +${hourlyTotal.toFixed(1)}（累计${this._productionStats[resType].total.toFixed(1)}）`);
                            }
                        }
                        this._productionStats[resType].sessionTotal = 0;
                    }
                }
                break;
            }
            case 'build_progress': {
                // 推进暖炉建造进度
                const fs = game.furnaceSystem;
                if (fs) {
                    // 如果满足建造条件且还没开始建造，自动触发
                    if (!fs.isBuildingSecondFurnace && !fs.secondFurnaceBuilt && fs.checkBuildCondition()) {
                        // 只有王策（furnace_build专长）在工坊时才自动启动建造
                        if (this.config.id === 'wang_teacher' || this.config.specialties?.furnace_build) {
                            fs.startBuildSecondFurnace();
                            this._logDebug('action', `[效果] 触发暖炉建造启动！`);
                        }
                    }
                    // 如果正在建造中，作为工人贡献进度
                    if (fs.isBuildingSecondFurnace && !fs.secondFurnaceBuilt) {
                        if (!fs.buildWorkers.includes(this.id)) {
                            fs.buildWorkers.push(this.id);
                        }
                    }
                }
                break;
            }
            case 'build_machine': {
                // 建造自动化机器（发电机/伐木机）
                const ms = game.machineSystem;
                if (ms && matchedEffect.machineType) {
                    const mType = matchedEffect.machineType;
                    const machine = ms[mType];
                    if (machine && !machine.built) {
                        if (!machine.building) {
                            // 尚未开始建造，自动启动
                            ms.startBuild(mType, [this.id]);
                        } else {
                            // 已在建造中，作为工人加入
                            if (!machine.buildWorkers.includes(this.id)) {
                                machine.buildWorkers.push(this.id);
                            }
                        }
                    }
                }
                break;
            }
            case 'craft_medkit': {
                // 制作急救包（由任务5实现具体逻辑，这里标记状态）
                // 【修复】dt 需转为游戏秒
                if (!game._medkitCraftProgress) game._medkitCraftProgress = 0;
                const craftGameSeconds = dt * (game.timeSpeed || 60);
                const craftPowerBonus = rs ? (rs.getPowerEfficiencyBonus ? rs.getPowerEfficiencyBonus(this.currentScene) : 1.0) : 1.0;
                const craftRate = staminaEfficiency * specialtyMultiplier * craftPowerBonus;
                game._medkitCraftProgress += (craftGameSeconds / 7200) * craftRate; // 7200游戏秒(2游戏小时)产出1份
                // 【任务8】制作进度日志（每25%通知一次）
                const medkitPct = Math.floor(game._medkitCraftProgress * 100);
                if (!this._lastMedkitPctLog) this._lastMedkitPctLog = 0;
                if (medkitPct >= this._lastMedkitPctLog + 25 && medkitPct < 100) {
                    this._lastMedkitPctLog = Math.floor(medkitPct / 25) * 25;
                    this._logDebug && this._logDebug('production', `[进度] ${this.name}制作急救包 ${this._lastMedkitPctLog}%`);
                }
                if (game._medkitCraftProgress >= 1) {
                    game._medkitCraftProgress -= 1;
                    game._medkitCount = (game._medkitCount || 0) + 1;
                    // 【任务10】更新目标追踪
                    if (this._goalTrackers) {
                        this._goalTrackers.medkitsCrafted = (this._goalTrackers.medkitsCrafted || 0) + 1;
                    }
                    if (game.addEvent) {
                        game.addEvent(`💊 ${this.name}制作了1份急救包（共${game._medkitCount}份）`);
                    }
                    this._logDebug('action', `[效果] 制作急救包完成，总数:${game._medkitCount}`);
                }
                break;
            }
            // repair_radio 已移除（v4.5）
            case 'reduce_waste': {
                // 设置食物浪费减少标记（在用餐系统中使用）
                game._foodWasteReduction = true;
                game._foodWasteReductionTimer = 3600; // 标记持续1游戏小时
                // 【新增】设置木柴浪费减少标记（在资源消耗系统中使用，减少10%木柴消耗）
                game._woodWasteReduction = true;
                game._woodWasteReductionTimer = 3600; // 标记持续1游戏小时
                // 【优化】减少浪费等同于食物产出（+3食物/游戏小时）
                if (rs) {
                    const wasteGameSeconds = dt * (game.timeSpeed || 60);
                    const wasteRate = (3 / 3600) * wasteGameSeconds * specialtyMultiplier;
                    rs.food = (rs.food || 0) + Math.min(wasteRate, 0.05);
                }
                break;
            }
            case 'medical_heal': {
                // 【v2.1重构】医疗效果：同场景NPC健康恢复（降低速率，让急救包有存在价值）
                // 修改：同场景恢复从0.01降为0.005/游戏秒，移除全局光环
                const healGameSeconds = dt * (game.timeSpeed || 60);
                const healPowerBonus = rs ? (rs.getPowerEfficiencyBonus ? rs.getPowerEfficiencyBonus(this.currentScene) : 1.0) : 1.0;
                const npcsInScene = game.npcs.filter(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene
                );
                for (const npc of npcsInScene) {
                    if (npc.health < 100) {
                        // 【v2.1】同场景健康恢复从0.01降为0.005（让急救包有用）
                        npc.health = Math.min(100, npc.health + 0.005 * healGameSeconds * specialtyMultiplier * healPowerBonus);
                    }
                    // 同场景NPC San值恢复（心理疏导）
                    if (npc.sanity < 100) {
                        npc.sanity = Math.min(100, npc.sanity + 0.005 * healGameSeconds * specialtyMultiplier);
                    }
                }
                // 【v2.1】移除全局健康恢复光环（原+0.005/秒太强，导致急救包永远用不上）
                // 急救包触发阈值从健康<50提高到<60，让急救包更容易触发
                if (game._medkitCount > 0) {
                    const critical = npcsInScene.filter(n => n.health < 60).sort((a, b) => a.health - b.health);
                    if (critical.length > 0 && !this._medkitUseCooldown) {
                        const target = critical[0];
                        game._medkitCount--;
                        // 苏岩（medical_treatment专长）恢复翻倍为+50，其他为+25
                        const isMedicalExpert = !!(this.config.specialties && this.config.specialties.medical_treatment);
                        const healAmount = isMedicalExpert ? 50 : 25;
                        target.health = Math.min(100, target.health + healAmount);
                        this._medkitUseCooldown = 30; // 30秒冷却
                        if (game.addEvent) {
                            game.addEvent(`🩹 ${this.name}使用急救包治疗了${target.name}（健康+${healAmount}→${Math.round(target.health)}）${isMedicalExpert ? '（专业加成）' : ''}`);
                        }
                        this._logDebug('action', `[效果] 苏岩增强路径：使用急救包治疗${target.name}，恢复+${healAmount}`);
                    }
                }
                if (this._medkitUseCooldown > 0) this._medkitUseCooldown -= dt * (game.timeSpeed || 60);
                break;
            }
            case 'explore_ruins': {
                // 废墟探索——每1游戏小时触发一次随机探索
                // 【修复】当天已exhausted时不再反复触发fallback，避免废墟↔矿渣堆来回跑
                const curDay = game.dayCount || 1;
                if (this._ruinsExhaustedDay === curDay) {
                    // 当天废墟已搜刮干净，不再执行探索逻辑
                    // 如果还没fallback过，执行一次fallback
                    if (!this._ruinsFallbackDone) {
                        this._ruinsFallbackDone = true;
                        // 【修复】废墟耗尽后取消taskOverride，否则taskOverride持续把NPC拉回ruins_site
                        if (this._taskOverride && this._taskOverride.isActive &&
                            this._taskOverride.targetLocation === 'ruins_site') {
                            this.deactivateTaskOverride();
                        }
                        this._fallbackToRoleDefaultAction(game);
                    }
                    break;
                }
                if (!this._ruinsExploreTimer) this._ruinsExploreTimer = 0;
                const exploreGameSeconds = dt * (game.timeSpeed || 60);
                this._ruinsExploreTimer += exploreGameSeconds;
                if (this._ruinsExploreTimer >= 3600) { // 每游戏小时一次
                    this._ruinsExploreTimer -= 3600;
                    if (rs && rs.performRuinsExploration) {
                        const result = rs.performRuinsExploration(this);
                        if (result && result.type === 'exhausted') {
                            // 标记当天已exhausted，防止重复触发
                            this._ruinsExhaustedDay = curDay;
                            this._ruinsFallbackDone = true;
                            // 【修复】废墟耗尽后取消taskOverride，否则taskOverride持续把NPC拉回ruins_site
                            if (this._taskOverride && this._taskOverride.isActive &&
                                this._taskOverride.targetLocation === 'ruins_site') {
                                this.deactivateTaskOverride();
                            }
                            this._fallbackToRoleDefaultAction(game);
                        }
                    }
                }
                break;
            }
            // furnace_maintain 已移除（v4.13: 暖炉是被动系统，自动燃烧消耗木柴，不需要专人维护）
            case 'patrol_bonus': {
                // 巡逻/警戒——全队San恢复加成+10%
                game._patrolBonus = true;
                game._patrolBonusTimer = 3600;
                // 【优化】巡逻为同场景NPC提供San恢复加成（+0.005/游戏秒）
                // 【修复】排除自身，巡逻效果只给同场景其他NPC加San
                const patrolGameSeconds = dt * (game.timeSpeed || 60);
                const patrolNpcs = game.npcs.filter(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene
                );
                for (const npc of patrolNpcs) {
                    if (npc.sanity < 100) {
                        npc.sanity = Math.min(100, npc.sanity + 0.005 * patrolGameSeconds * specialtyMultiplier);
                    }
                }
                break;
            }
            case 'morale_boost': {
                // 安抚鼓舞——当前场景内NPC San值恢复
                // 【增强】基础速率从0.005提升至0.10，老钱专长×2.0后=0.20/秒，接近歆玥演出水平
                // 【修复】dt 需转为游戏秒
                const moraleGameSeconds = dt * (game.timeSpeed || 60);

                // 【新增】体力下限保护：体力<15时停止安抚效果
                if (this.stamina < 15) {
                    if (!this._moraleBoostTiredNotified) {
                        this._moraleBoostTiredNotified = true;
                        this.expression = '太累了…安抚不动了';
                        this.expressionTimer = 3;
                    }
                    break;
                }
                this._moraleBoostTiredNotified = false;

                // 【新增】安抚消耗体力：约-5/游戏小时（0.002 * 游戏秒）
                this.stamina = Math.max(0, this.stamina - 0.002 * moraleGameSeconds);

                const npcsInScene2 = game.npcs.filter(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene
                );
                for (const npc of npcsInScene2) {
                    if (npc.sanity < 100) {
                        npc.sanity = Math.min(100, npc.sanity + 0.003 * moraleGameSeconds * specialtyMultiplier);
                    }
                }
                break;
            }
        }

        // 【新增】动态气泡文本：为所有效果类型添加实时数值信息（含体力效率、专长倍率）
        let dynamicBubble = matchedEffect.bubbleText || '';
        switch (matchedEffect.effectType) {
            case 'produce_resource': {
                // 动态计算实际产出速率（ratePerHour × 体力效率 × 专长倍率 × 电力加成）
                const bubblePowerBonus = rs && rs.getPowerEfficiencyBonus ? rs.getPowerEfficiencyBonus(this.currentScene) : 1.0;
                const actualRate = (matchedEffect.ratePerHour || 0) * staminaEfficiency * specialtyMultiplier * bubblePowerBonus;
                const rateDisplay = actualRate.toFixed(1);
                if (matchedEffect.resourceType === 'woodFuel') {
                    dynamicBubble = `🪓 砍柴中（木柴+${rateDisplay}/h）`;
                } else if (matchedEffect.resourceType === 'food') {
                    dynamicBubble = `🎣 采集食物中（食物+${rateDisplay}/h）`;
                } else if (matchedEffect.resourceType === 'power') {
                    // 区分人工发电和修理工具
                    const isRepairTool = (this.stateDesc || '').includes('修理工具');
                    const isOutdoorMining = this.currentScene === 'village';
                    if (isOutdoorMining) {
                        dynamicBubble = `⛏️ 采矿中（⚡+${rateDisplay}/h）`;
                    } else {
                        dynamicBubble = isRepairTool
                            ? `🔧 修理工具（⚡+${rateDisplay}/h）`
                            : `⚡ 人工发电中（⚡+${rateDisplay}/h）`;
                    }
                }
                break;
            }
            case 'craft_medkit': {
                // 计算制作进度百分比和库存数量
                const medkitProgress = Math.min(100, Math.floor((game._medkitCraftProgress || 0) * 100));
                const medkitStock = game._medkitCount || 0;
                dynamicBubble = `💊 制药中（进度${medkitProgress}% 库存×${medkitStock}）`;
                break;
            }
            // repair_radio bubble 已移除（v4.5）
            case 'explore_ruins': {
                // 废墟探索气泡
                const rs2 = game.resourceSystem;
                const remaining = rs2 ? rs2.getRuinsExploresRemaining() : 0;
                dynamicBubble = remaining > 0
                    ? `🔍 探索废墟中…（今日剩${remaining}次）`
                    : `🔍 废墟已搜刮干净`;
                break;
            }
            case 'build_progress': {
                // 读取暖炉建造进度
                const fs = game.furnaceSystem;
                if (fs && fs.isBuildingSecondFurnace && !fs.secondFurnaceBuilt) {
                    const buildPct = Math.min(100, Math.floor((fs.buildProgress || 0) * 100));
                    dynamicBubble = `🔨 暖炉扩建中（进度${buildPct}%）`;
                } else if (fs && fs.secondFurnaceBuilt) {
                    dynamicBubble = `🔨 暖炉已建成！`;
                } else {
                    dynamicBubble = `🔨 暖炉扩建设计中`;
                }
                break;
            }
            case 'build_machine': {
                // 读取机器建造进度
                const ms2 = game.machineSystem;
                if (ms2 && matchedEffect.machineType) {
                    const mach = ms2[matchedEffect.machineType];
                    const mConf = GST.MACHINE_CONFIG ? GST.MACHINE_CONFIG[matchedEffect.machineType] : null;
                    const machName = mConf ? mConf.name : matchedEffect.machineType;
                    if (mach && mach.building && !mach.built) {
                        const machPct = Math.min(100, Math.floor((mach.buildProgress || 0) * 100));
                        dynamicBubble = `🏗️ ${machName}建造中（进度${machPct}%，${mach.buildWorkers.length}人）`;
                    } else if (mach && mach.built) {
                        dynamicBubble = `🏗️ ${machName}已建成！`;
                    } else {
                        dynamicBubble = `🏗️ 准备建造${machName}…`;
                    }
                }
                break;
            }
            case 'reduce_waste': {
                // 动态计算食物产出（3/h × 专长倍率）
                const wasteFood = (3 * specialtyMultiplier).toFixed(1);
                const wasteFuelPct = Math.round(10 * specialtyMultiplier);
                dynamicBubble = `📦 管理仓库中（食物+${wasteFood}/h，柴耗-${wasteFuelPct}%）`;
                break;
            }
            case 'medical_heal': {
                // 【v4.4.3】更新气泡文本：显示具体治疗对象
                const healPerHour = (0.005 * 3600 * specialtyMultiplier).toFixed(0);
                const medkitInfo = (game._medkitCount || 0) > 0 ? `💊×${game._medkitCount}` : '⚠️无急救包';
                // 找出同场景中HP最低的NPC作为显示对象
                const healTargets = game.npcs.filter(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene && n.health < 100
                ).sort((a, b) => a.health - b.health);
                if (healTargets.length > 0) {
                    const mainTarget = healTargets[0];
                    const othersCount = healTargets.length - 1;
                    const targetInfo = othersCount > 0
                        ? `${mainTarget.name}等${healTargets.length}人`
                        : mainTarget.name;
                    dynamicBubble = `🏥 医疗救治中（HP+${healPerHour}/h ${medkitInfo}）\n   → 治疗对象: ${targetInfo}`;
                } else {
                    dynamicBubble = `🏥 医疗待命中（${medkitInfo}）\n   → 同场景无需治疗的伤员`;
                }
                break;
            }
            case 'morale_boost': {
                // 【v4.4.3】动态计算San恢复速率 + 显示安抚对象
                const sanPerHour = (0.003 * 3600 * specialtyMultiplier).toFixed(1);
                const moraleTargets = game.npcs.filter(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene && n.sanity < 100
                ).sort((a, b) => a.sanity - b.sanity);
                if (moraleTargets.length > 0) {
                    const mainMTarget = moraleTargets[0];
                    const mOthersCount = moraleTargets.length - 1;
                    const mTargetInfo = mOthersCount > 0
                        ? `${mainMTarget.name}等${moraleTargets.length}人`
                        : mainMTarget.name;
                    dynamicBubble = `💬 安抚鼓舞中（San+${sanPerHour}/h）\n   → 安抚对象: ${mTargetInfo}`;
                } else {
                    dynamicBubble = `💬 安抚鼓舞待命中\n   → 同场景无需安抚的人`;
                }
                break;
            }
            case 'patrol_bonus': {
                // 动态计算San恢复速率（修正后0.005/游戏秒 × 3600 × 专长倍率）
                const patrolSanPerHour = (0.005 * 3600 * specialtyMultiplier).toFixed(1);
                // 【修复】检查同场景是否有San未满的NPC
                const hasLowSanNpc = game.npcs.some(n =>
                    !n.isDead && n.id !== this.id && n.currentScene === this.currentScene && n.sanity < 100
                );
                dynamicBubble = hasLowSanNpc
                    ? `🛡️ 巡逻警戒中（全队San恢复+10%, 同伴San+${patrolSanPerHour}/h）`
                    : `🛡️ 巡逻警戒中（全队San恢复+10%）`;
                break;
            }
            // furnace_maintain 已移除（v4.13）
        }        // 仅在NPC当前没有更重要的表情时设置气泡
        if (!this.expression || this.expressionTimer <= 0) {
            this.expression = dynamicBubble;
            this.expressionTimer = 3;
        }

        // 【优化】NPC离开辅助效果对应场景时，清除全局标记
        if (matchedEffect.effectType === 'reduce_waste' || matchedEffect.effectType === 'patrol_bonus') {
            // 上面的 requiredScene 检查已确保NPC在正确场景时才执行效果
            // 这里额外处理：检查是否有NPC仍在执行该辅助效果，如果没有则清除标记
            // （由于每帧都会执行，标记会被在场NPC重新设置，所以无需额外检查）
        }

    }

    /**
     * 【新增】独立的全局急救包自动使用检查
     * 不限于苏岩坐诊，任何NPC的update周期都会触发检查
     * 条件：有急救包库存 + 有NPC健康<50 + 无冷却
     */;

})();
