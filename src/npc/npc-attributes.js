/**
 * 福音镇 - NPC 属性更新模块
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：属性衰减/恢复、饥饿、体温、目标追踪、医疗、资源采集
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._checkAutoMedkit = function(dt, game) {
        const gameSeconds = dt * (game.timeSpeed || 60);

        // 更新当前NPC的急救包使用个人冷却（确保非medical_heal分支的NPC冷却也能递减）
        if (this._medkitUseCooldown > 0) this._medkitUseCooldown -= gameSeconds;

        // 更新检查冷却计时
        if (this._medkitCheckCooldown > 0) {
            this._medkitCheckCooldown -= gameSeconds;
            return;
        }

        // 无急救包则跳过
        if (!game._medkitCount || game._medkitCount <= 0) {
            return;
        }

        // 遍历所有存活NPC，找到健康<60且无个人冷却的NPC
        const criticalNpcs = game.npcs.filter(n =>
            !n.isDead && n.health < 60 && !(n._medkitUseCooldown > 0)
        ).sort((a, b) => a.health - b.health);

        if (criticalNpcs.length === 0) return;

        const target = criticalNpcs[0];

        // 消耗急救包
        game._medkitCount--;

        // 使用者为苏岩（medical_treatment专长）时恢复翻倍
        const isMedicalExpert = !!(this.config.specialties && this.config.specialties.medical_treatment);
        const healAmount = isMedicalExpert ? 50 : 25;
        target.health = Math.min(100, target.health + healAmount);

        // 设置目标NPC的个人冷却（防止连续消耗）
        target._medkitUseCooldown = 30;
        // 设置检查者的全局检查冷却
        this._medkitCheckCooldown = 10;

        // 生成事件日志和气泡文本
        if (game.addEvent) {
            game.addEvent(`💊 ${this.name}为${target.name}使用了急救包（健康+${healAmount}→${Math.round(target.health)}，剩余${game._medkitCount}份）`);
        }
        this.expression = `💊 给${target.name}用了急救包`;
        this.expressionTimer = 3;
        this._logDebug('action', `[急救包] 全局检查：为${target.name}使用急救包，恢复+${healAmount}，剩余${game._medkitCount}`);

        // 急救包耗尽且有重伤NPC时发出警告
        if (game._medkitCount <= 0) {
            const severeNpcs = game.npcs.filter(n => !n.isDead && n.health < 30);
            if (severeNpcs.length > 0 && game.addEvent) {
                game.addEvent(`⚠️ 急救包不足！需要药剂师制作急救包`);
            }
        }
    }

    /**
     * 获取NPC在特定行为上的专长倍率
     */;

    proto._checkResourceGatherNeed = function(game) {
        // 冷却递减（在update中每帧调用，冷却由dt在_updateResourceGatherOverride中处理）
        // 前置检查：不处于任何覆盖/特殊状态
        if (this._resourceGatherOverride) return;
        if (this._hungerOverride || this._stateOverride) return;
        if (this.isSleeping || this.isEating || this.isCrazy || this.isDead) return;
        if (this.stamina < 20) return;
        if (this._resourceGatherCooldown > 0) return;
        if (this._isDying || this._rescueNeeded) return;

        const rs = game.resourceSystem;
        if (!rs) return;

        // 人数限制：最多3个NPC同时出门采集
        const gatheringCount = game.npcs.filter(n => n._resourceGatherOverride && !n.isDead).length;
        if (gatheringCount >= 3) return;

        const role = this.config.role;
        const specs = this.config.specialties || {};
        let gatherType = null;
        let gatherTarget = null;
        let stateDescText = null;

        // 木柴检测：剩余<2小时，且NPC是体力型角色
        if (rs.getWoodFuelHoursRemaining() < 2) {
            const isPhysical = (role === 'worker' || specs.chopping || specs.hauling || specs.furnace_maintain);
            if (isPhysical) {
                gatherType = 'wood';
                gatherTarget = 'lumber_camp';
                stateDescText = '砍柴';
            }
        }

        // 食物检测：剩余<=1餐，且NPC不是医生/镇长
        if (!gatherType && rs.getFoodMealsRemaining() <= 1) {
            const isNotSpecialist = (this.config.id !== 'su_doctor' && this.config.id !== 'old_qian');
            if (isNotSpecialist) {
                gatherType = 'food';
                gatherTarget = 'frozen_lake';
                stateDescText = '采集食物';
            }
        }

        if (!gatherType) return;

        // 触发资源采集覆盖
        // 【覆盖快照】设置资源采集覆盖
        const oldOverrideR = this._activeOverride;
        this._activeOverride = 'resource';
        if (oldOverrideR !== 'resource') {
            this._logDebug('override', `[覆盖切换] ${oldOverrideR} → resource（原因: ${gatherType}采集）`);
        }
        this._resourceGatherOverride = true;
        this._resourceGatherTarget = gatherTarget;
        this._resourceGatherType = gatherType;
        this._resourceGatherTravelTimer = 0;
        this.stateDesc = stateDescText;
        this.mood = '紧迫';
        this.expression = gatherType === 'wood' ? '木柴不够了，赶紧去砍！' : '食物快没了，赶紧去采！';
        this.expressionTimer = 5;

        // 清除当前移动路径，重新导航
        this.currentPath = [];
        this.isMoving = false;
        this._pendingEnterScene = null;
        // 清除LLM行动覆盖，资源采集优先
        this._actionOverride = false;
        this._currentAction = null;
        this._pendingAction = null;

        this._navigateToScheduleTarget(gatherTarget, game);
        this.scheduleReached = false;

        if (game.addEvent) {
            const emoji = gatherType === 'wood' ? '🪓' : '🎣';
            game.addEvent(`${emoji} ${this.name} 资源紧缺，自动前往${gatherTarget === 'lumber_camp' ? '伐木场砍柴' : '冰湖采集食物'}！`);
        }
        this._logDebug && this._logDebug('resource_gather', `触发资源采集覆盖 type=${gatherType} target=${gatherTarget}`);
    }

    /** 更新资源采集覆盖状态（每帧调用） */;

    proto._checkSharedActivityBonus = function(game) {
        const companions = game.npcs.filter(n =>
            n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping && !n.isCrazy
        );
        if (companions.length === 0) return;

        for (const other of companions) {
            let bonusReason = null;
            let bonus = 0;

            // 一起吃饭（双方都在炊事房且至少一方在吃饭）
            if (this.currentScene === 'kitchen' &&
                (this.isEating || other.isEating)) {
                bonus = 1;
                bonusReason = '一起吃饭';
            }
            // 一起在医疗站（陪伴看病）
            else if (this.currentScene === 'medical') {
                if (this._isBeingTreated || other._isBeingTreated) {
                    bonus = 1.5;
                    bonusReason = '陪伴看病';
                } else {
                    bonus = 0.5;
                    bonusReason = '在医疗站偶遇';
                }
            }
            // 一起在工坊工作
            else if (this.currentScene === 'workshop') {
                bonus = 0.5;
                bonusReason = '一起在工坊';
            }
            // 一起在宿舍（邻居关系）
            else if (this.currentScene === 'dorm_a' || this.currentScene === 'dorm_b') {
                bonus = 0.5;
                bonusReason = '宿舍邻居';
            }
            // 一起在公园散步
            else if (this.currentScene === 'village') {
                // 两人都在公园区域（y>50）
                const myPos = this.getGridPos();
                const otherPos = other.getGridPos();
                if (myPos.y > 50 && otherPos.y > 50 &&
                    Math.abs(myPos.x - otherPos.x) + Math.abs(myPos.y - otherPos.y) < 10) {
                    bonus = 0.3;
                    bonusReason = '一起在公园散步';
                }
            }

            if (bonus > 0 && bonusReason) {
                // 【修复】冷淡期检测：吵架后一段时间内不会被动增加好感
                if (this._affinityCooldown && this._affinityCooldown[other.id] > 0) continue;
                if (other._affinityCooldown && other._affinityCooldown[this.id] > 0) continue;

                // 【修复】好感度越高，被动增长越慢（衰减因子）
                const currentAff = this.getAffinity(other.id);
                const diminishing = currentAff >= 80 ? 0.1 : (currentAff >= 60 ? 0.3 : (currentAff >= 40 ? 0.6 : 1.0));
                const finalBonus = bonus * diminishing;
                // 太小的增量忽略（防止无意义的高精度浮点累加）
                if (finalBonus < 0.05) continue;
                this.changeAffinity(other.id, finalBonus);
                // 双向关系：对方也获得加成（但稍弱一些）
                other.changeAffinity(this.id, finalBonus * 0.7);
            }
        }
    }

    // ============ 目标系统：进度检测 + 奖励发放 ============;

    proto._checkStateOverrideArrival = function(dt, game) {
        if (!this._stateOverride || !this._stateOverrideTarget) return;

        // 【关键修复】CHATTING状态下暂停状态覆盖的到达检测和传送，防止对话中被传送走导致隔空聊天
        if (this.state === 'CHATTING') return;

        const targetKey = this._stateOverrideTarget.target;

        // 根据覆盖类型决定到达后的行为
        if (this._stateOverride === 'exhausted') {
            // 目标：回宿舍 → 到达后直接入睡
            if (this.currentScene === this.homeName) {
                // 检查是否到达了床位（使用NPC专属床位坐标）
                const bedLoc = this._getBedLocation ? this._getBedLocation() : GST.SCHEDULE_LOCATIONS[this.homeName + '_inside'];
                if (bedLoc) {
                    const pos = this.getGridPos();
                    const dist = Math.abs(pos.x - bedLoc.x) + Math.abs(pos.y - bedLoc.y);
                    if (dist <= 3) {
                        // 到达房间 → 强制入睡，并修正坐标到精确床位
                        this._clearStateOverride();
                        // 【修复】修正坐标到精确床位位置
                        this.x = bedLoc.x * GST.TILE;
                        this.y = bedLoc.y * GST.TILE;
                        this.isSleeping = true;
                        this._forcedSleep = true;  // 【标记强制睡眠】防止被日程起床逻辑误唤醒
                        this._forcedSleepTimer = 0;
                        this.stateDesc = '累坏了，倒头就睡';
                        this._logDebug('sleep', `累坏倒头就睡 体力:${Math.round(this.stamina)} San:${Math.round(this.sanity)}`);
                        // AI模式日志：累坏入睡
                        if (this.game && this.game.aiModeLogger) {
                            const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                            this.game.aiModeLogger.log('SLEEP_START', `${this.name} 累坏倒头就睡 | ${snap} | ${this.currentScene || '?'}`);
                        }
                        this.expression = 'Zzz...';
                        this.expressionTimer = 8;
                        this.mood = '疲惫';
                        // 重置日程索引
                        this.currentScheduleIdx = -1;
                        this.scheduleReached = false;
                        if (game.addEvent) {
                            game.addEvent(`😴 ${this.name} 累坏了，提前回家睡觉 (体力:${Math.round(this.stamina)})`);
                        }
                        return;
                    }
                }
                // 在宿舍但还没到床位 → 导航到NPC专属床位
                if (!this.isMoving && this.currentPath.length === 0) {
                    const bedLoc2 = this._getBedLocation ? this._getBedLocation() : GST.SCHEDULE_LOCATIONS[this.homeName + '_inside'];
                    if (bedLoc2) {
                        this._pathTo(bedLoc2.x, bedLoc2.y, game);
                    }
                }
                return;
            }
        } else if (this._stateOverride === 'sick' || this._stateOverride === 'mental') {
            // 目标：去医疗站 → 到达后开始治疗
            if (this.currentScene === 'medical') {
                this._startTreatment(game);
                return;
            }
        }

        // 还在路上：检查是否卡住
        if (this.isMoving || this.currentPath.length > 0) {
            this._stateOverrideStuckTimer = 0;
            return;
        }

        // 不在移动也没到目标 → 可能卡住了
        this._stateOverrideStuckTimer += 1;
        if (this._stateOverrideStuckTimer > 2) {
            this._stateOverrideStuckTimer = 0;
            this._navigateToScheduleTarget(targetKey, game);
        }

        // 超时兜底：15秒还没到 → 传送
        this._stateOverrideTravelTimer += dt;
        if (this._stateOverrideTravelTimer > 15) {
            this._stateOverrideTravelTimer = 0;
            const overrideType = this._stateOverride;

            if (overrideType === 'exhausted') {
                // 传送到NPC所属宿舍
                const homeDoorLoc = GST.SCHEDULE_LOCATIONS[this.homeName + '_inside'];
                if (homeDoorLoc) {
                    this._teleportTo(this.homeName, homeDoorLoc.x, homeDoorLoc.y);
                } else {
                    this._teleportTo(this.homeName, 6, 4);
                }
            } else {
                // 传送到医疗站（直接进入座位）
                this._enterIndoor('medical', game);
            }
            if (game.addEvent) {
                game.addEvent(`⚡ ${this.name} 赶到了目的地（传送兜底）`);
            }
        }
    }

    /** 到达医院后开始治疗 */;

    proto._chooseEatTarget = function(hour) {
        // 【修复】如果NPC已在某个可用餐的室内场景，优先就地吃饭，避免来回跑
        const sceneToTarget = {
            kitchen: { target: 'kitchen_door', desc: '在炊事房吃饭' },
            warehouse: { target: 'warehouse_door', desc: '去仓库拿干粮' },
            dorm_a: { target: 'dorm_a_door', desc: '在宿舍吃点东西' },
            dorm_b: { target: 'dorm_b_door', desc: '在宿舍吃点东西' },
        };
        if (this.currentScene !== 'village' && sceneToTarget[this.currentScene]) {
            return sceneToTarget[this.currentScene];
        }

        // 在村庄/户外时加权随机选择
        const options = [];
        // 炊事房（主要餐饮场所）
        options.push({ target: 'kitchen_door', desc: '去炊事房吃饭', weight: hour >= 11 ? 3 : 2 });
        // 仓库（拿干粮）
        options.push({ target: 'warehouse_door', desc: '去仓库拿干粮', weight: 1 });
        // 回宿舍做饭（万能选项）
        options.push({ target: this.homeName + '_door', desc: '回宿舍做饭', weight: 1 });
        // 加权随机选择
        const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
        let rand = Math.random() * totalWeight;
        for (const opt of options) {
            rand -= opt.weight;
            if (rand <= 0) return opt;
        }
        return options[options.length - 1];
    }

    /** 检查是否到达吃饭地点并开始吃饭 */
    proto._checkEatingArrival = function(dt, game) {
        if (!this._hungerOverride || !this._hungerTarget) return;
        if (this.isEating) return;

        // 【关键修复】CHATTING状态下暂停饥饿覆盖的到达检测和传送，防止对话中被传送走导致隔空聊天
        if (this.state === 'CHATTING') return;

        // 判断是否到达了吃饭目标的场景
        const eatingScenes = {
            'kitchen_door': 'kitchen',
            'warehouse_door': 'warehouse',
            'dorm_a_door': 'dorm_a', 'dorm_b_door': 'dorm_b',
        };
        const targetScene = eatingScenes[this._hungerTarget.target];

        // 已经在目标室内场景中 → 直接开始吃饭
        if (this.currentScene === targetScene) {
            this._startEating(game);
            return;
        }

        // 【兜底】在村庄中已走到门口附近（5格内）但还没进入 → 强制传送进入
        if (this.currentScene === 'village' && !this.isMoving && this.currentPath.length === 0) {
            const loc = GST.SCHEDULE_LOCATIONS[this._hungerTarget.target];
            if (loc) {
                const pos = this.getGridPos();
                const dist = Math.abs(pos.x - loc.x) + Math.abs(pos.y - loc.y);
                if (dist <= 6) {
                    // 在门口附近了，直接进入室内座位
                    this._enterIndoor(targetScene, game);
                    // 不立即开始吃饭，等下一帧检测到 currentScene === targetScene 再开始
                    return;
                }
            }
        }

        // 【超时兜底】饥饿覆盖超15真实秒还没吃上饭 → 直接进入室内座位
        // 【修复】使用真实时间递减，避免5倍速下3秒就超时传送
        const _speedMultH = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
        const _realDtH = _speedMultH > 0 ? dt / _speedMultH : dt;
        this._hungerTravelTimer = (this._hungerTravelTimer || 0) + _realDtH;
        if (this._hungerTravelTimer > 15) {
            this._hungerTravelTimer = 0;
            this._enterIndoor(targetScene, game);
            // 下一帧会检测到 currentScene === targetScene 然后开始吃饭
            if (game.addEvent && this._hungerTarget) {
                game.addEvent(`⚡ ${this.name} 赶到了${this._hungerTarget.desc}（传送兆底）`);
            }
        }    }

    /** 开始吃饭 */;

    proto._clearResourceGatherOverride = function() {
        this._resourceGatherOverride = false;
        this._resourceGatherTarget = null;
        this._resourceGatherType = null;
        this._resourceGatherTravelTimer = 0;
        this._resourceGatherCooldown = 120; // 120秒冷却，避免反复触发
        // 【覆盖快照】清除时重置_activeOverride
        if (this._activeOverride === 'resource') {
            this._activeOverride = 'none';
            this._logDebug('override', `[覆盖切换] resource → none（原因: 资源采集覆盖清除）`);
            this._executePendingBehavior();
        }
        // 重置日程索引，让日程系统重新接管
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
    }

    // ============ 状态驱动行为覆盖系统 ============
    // 当NPC状态极差时，打断日程执行紧急行为（类似饥饿覆盖机制）

    /** 每帧检查是否需要触发状态覆盖行为 */;

    proto._clearStateOverride = function() {
        const wasType = this._stateOverride;
        this._stateOverride = null;
        this._stateOverrideTarget = null;
        this._stateOverrideStuckTimer = 0;
        this._stateOverrideTravelTimer = 0;
        this._stateOverrideMaxTimer = 0;
        // 【覆盖快照】清除时重置_activeOverride并检查pending队列
        if (wasType && this._activeOverride === 'state') {
            const old = this._activeOverride;
            this._activeOverride = 'none';
            this._logDebug('override', `[覆盖切换] ${old} → none（原因: 状态覆盖(${wasType})清除）`);
            this._executePendingBehavior();
        }
    }

    // ============ 发呆兜底检测系统 ============

    /**
     * 全局发呆兜底检测与自动恢复
     * 当NPC连续10秒处于"无任何系统驱动"的空闲状态时，强制恢复行为
     */;

    proto._finishTreatment = function(game) {
        const isMental = (this._stateOverride === 'mental');

        if (isMental) {
            // 心理咨询：恢复San值
            const sanBefore = this.sanity;
            this.sanity = Math.min(100, this.sanity + 30);
            this.mood = '平静';
            this.expression = '感觉好多了，谢谢苏医生';
            this.stateDesc = '咨询结束，精神好多了';
            this._logDebug('sanity', `💊 心理咨询结束! San: ${Math.round(sanBefore)}→${Math.round(this.sanity)} (+${Math.round(this.sanity - sanBefore)})`);
        } else {
            // 看病：恢复健康值，治愈疾病
            this.health = Math.min(100, this.health + 35);
            this.isSick = false;
            this.sickTimer = 0;
            this.mood = '满足';
            this.expression = '看完医生，身体舒服多了！';
            this.stateDesc = '看完病了，感觉好多了';
        }

        this.expressionTimer = 6;
        this._isBeingTreated = false;
        this._treatmentTimer = 0;

        // 找到苏医生（如果在同一场景），双方关系加成
        const doctor = game.npcs.find(n => n.name === '苏医生' && n.currentScene === this.currentScene);
        if (doctor && doctor.id !== this.id) {
            this.changeAffinity(doctor.id, 5);
            doctor.changeAffinity(this.id, 3);
            if (game.addEvent) {
                game.addEvent(`💕 ${this.name} 和苏医生的关系因${isMental ? '咨询' : '看病'}变好了`);
            }
        }

        if (game.addEvent) {
            game.addEvent(`✅ ${this.name} ${isMental ? '咨询' : '治疗'}结束 (健康:${Math.round(this.health)} San:${Math.round(this.sanity)})`);
        }

        this._clearStateOverride();
        // 重置日程索引，让日程系统重新接管
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
    }

    /** 清除状态覆盖 */;

    proto._grantGoalReward = function(goal, game) {
        if (goal.rewarded) return;
        goal.rewarded = true;

        const r = goal.reward;
        if (r.sanity) this.sanity = Math.min(100, this.sanity + r.sanity);
        if (r.health) this.health = Math.min(100, this.health + r.health);
        if (r.stamina) this.stamina = Math.min(100, this.stamina + r.stamina);

        // 完成目标时产生积极情绪
        this.mood = '满足';
        this.expression = goal.type === 'daily'
            ? `今天的目标完成啦！(${goal.desc})`
            : `终于达成了！(${goal.desc})`;
        this.expressionTimer = 8;

        // 记录到记忆
        this.addMemory(`[成就] 完成了目标「${goal.desc}」! 奖励: ${goal.rewardDesc}`);

        // 事件日志
        if (game.addEvent) {
            game.addEvent(`🎯 ${this.name} 完成了目标「${goal.desc}」! 奖励: ${goal.rewardDesc}`);
        }
        this._logDebug('goal', `完成目标: ${goal.desc} 奖励: ${goal.rewardDesc}`);
    }

    /** 记录一次聊天（用于目标追踪） */;

    proto._onEatingComplete = function() {
        this._logDebug('override', `[行为完成] 吃饭完成`);
        // 1. 恢复饱腹值已在调用前处理
        // 2. 清除所有饥饿相关状态
        this.isEating = false;
        this._hungerOverride = false;
        this._hungerTarget = null;
        this._hungerStuckTimer = 0;
        this._hungerTravelTimer = 0;
        // 3. 重置覆盖快照
        if (this._activeOverride === 'hunger') {
            this._activeOverride = 'none';
        }
        // 4. 释放行为锁（内部会检查pending队列）
        this._releaseBehaviorLock('eating');
        // 5. 如果pending队列为空，交还日程系统
        if (this._pendingBehaviors.length === 0) {
            this.currentScheduleIdx = -1;
            this.scheduleReached = false;
        }
    }

    /**
     * 休息行为完成的统一回调
     * 按需求6.2的顺序执行清理
     */;

    proto._onRestComplete = function() {
        this._logDebug('override', `[行为完成] 休息完成，体力${Math.round(this.stamina)}`);
        // 1. 清除行动覆盖相关状态
        this._clearActionOverride();
        // 2. 释放行为锁
        this._releaseBehaviorLock('resting');
        // 3. 重置日程索引，强制日程重新匹配
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
        // 4. pending队列已在_releaseBehaviorLock中检查
    }

    /**
     * 状态覆盖行为完成的统一回调
     * 按需求6.3的顺序执行清理
     */;

    proto._onStateOverrideComplete = function() {
        const type = this._stateOverride;
        this._logDebug('override', `[行为完成] 状态覆盖(${type})完成`);
        // 清除所有stateOverride相关字段
        this._clearStateOverride();
        // 重置日程
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
    }

    /**
     * 清除所有覆盖状态的兜底方法
     * 在极端情况下（NPC卡死>60秒）一键清除所有状态并恢复日程控制
     */;

    proto._startEating = function(game) {
        if (!this._hungerTarget) return; // 防御：饥饿目标已被清除
        // 【行为锁】获取吃饭行为锁（优先级3=基本需求），防止被低优先级系统打断
        this._acquireBehaviorLock('eating', GST.BEHAVIOR_PRIORITY.BASIC_NEED);
        this.isEating = true;
        this.eatingTimer = 20; // 吃饭持续 20 真实秒 ≈ 20 游戏分钟（dt 已含倍速，倍速下会更快吃完）
        this.stateDesc = `正在${this._hungerTarget.desc}`;
        this.expression = '开吃！🍜';
        this.expressionTimer = 4;
        this.mood = '期待';
        this._hungerStuckTimer = 0;
        this._hungerTravelTimer = 0;
        this.currentPath = []; // 停止移动
        this.isMoving = false;
        if (game.addEvent) {
            game.addEvent(`🍜 ${this.name} 开始吃饭`);
        }
    }

    // ============ 资源采集覆盖系统 ============
    // 参考饥饿覆盖(_hungerOverride)模式：资源紧缺时自动派NPC去采集

    /** 检查是否需要触发资源采集覆盖 */;

    proto._startTreatment = function(game) {
        this._isBeingTreated = true;
        this._treatmentTimer = 15; // 治疗持续15真实秒
        this.currentPath = [];
        this.isMoving = false;

        const isMental = (this._stateOverride === 'mental');
        this.stateDesc = isMental ? '正在接受心理咨询' : '正在看病治疗';
        this.expression = isMental ? '跟苏医生聊聊，感觉好多了…' : '苏医生在给我看病…';
        this.expressionTimer = 8;
        this.mood = '期待';

        if (game.addEvent) {
            game.addEvent(`🏥 ${this.name} 开始${isMental ? '心理咨询' : '看病'}`);
        }
    }

    /** 治疗结束 */;

    proto._triggerHungerBehavior = function(game) {
        // 【出门过程保护】NPC正在出门时不触发饥饿行为（致命紧急除外）
        if (this._walkingToDoor) {
            if (this.health >= 10 && (this.bodyTemp === undefined || this.bodyTemp >= 33)) {
                console.log(`[出门保护] ${this.name} 正在出门中，延迟饥饿行为触发`);
                return;
            }
        }
        // 【P0保护】P0紧急状态中且非极度饥饿时，不触发饥饿覆盖（让P0先完成）
        if (this._priorityOverride && this.hunger >= 10) {
            console.log(`[P0保护] ${this.name} 处于P0状态(${this._priorityOverride})，hunger=${Math.round(this.hunger)}>=10，跳过饥饿触发`);
            return;
        }
        // 【覆盖快照】设置饥饿覆盖
        const oldOverride = this._activeOverride;
        this._activeOverride = 'hunger';
        if (oldOverride !== 'hunger') {
            this._logDebug('override', `[覆盖切换] ${oldOverride} → hunger（原因: 饥饿触发）`);
        }
        this._hungerOverride = true;
        this._hungerStuckTimer = 0;
        this._logDebug('hunger', `触发饥饿行为 饱食度:${Math.round(this.hunger)}/100`);

        // 【任务4】饥饿触发时暂停/取消任务覆盖
        if (this._taskOverride && this._taskOverride.isActive) {
            if (this.hunger < 15) {
                // 极度饥饿：彻底取消任务
                console.log(`[饥饿优先] ${this.name} 极度饥饿(${Math.round(this.hunger)})，取消任务 ${this._taskOverride.taskId}`);
                this.deactivateTaskOverride();
            } else {
                // 一般饥饿：暂停任务
                console.log(`[饥饿优先] ${this.name} 饥饿(${Math.round(this.hunger)})，暂停任务 ${this._taskOverride.taskId} 先去吃饭`);
                this._taskOverride.isActive = false;
            }
        }

        // 根据角色和时间选择去哪吃
        const hour = game.getHour();
        const eatTargets = this._chooseEatTarget(hour);
        this._hungerTarget = eatTargets;

        this.stateDesc = `肚子饿了，去${eatTargets.desc}`;
        this.mood = '烦躁';
        this.expression = this.hunger < 15 ? '饿得不行了…' : '该去吃点东西了';
        this.expressionTimer = 6;

        if (game.addEvent) {
            game.addEvent(`🍽️ ${this.name} 饿了(${Math.round(this.hunger)})，去${eatTargets.desc}`);
        }

        // 清除当前移动路径，确保新导航不会被旧路径干扰
        this.currentPath = [];
        this.isMoving = false;
        this._pendingEnterScene = null;

        // 导航到目标
        // 【修复】先设 scheduleReached=false，再调用导航（导航内部可能把它改回 true，不能被覆盖）
        this.scheduleReached = false;
        this._navigateToScheduleTarget(eatTargets.target, game);
    }

    /** 根据时间和偏好选择吃饭地点 */;

    proto._triggerStateOverride = function(type, game) {
        // 【出门过程保护】NPC正在出门时不触发状态覆盖（致命紧急除外）
        if (this._walkingToDoor) {
            if (this.health >= 10 && (this.bodyTemp === undefined || this.bodyTemp >= 33)) {
                console.log(`[出门保护] ${this.name} 正在出门中，延迟状态覆盖(${type})触发`);
                return;
            }
        }
        // 【覆盖快照】设置_activeOverride
        const oldOverride = this._activeOverride;
        this._activeOverride = 'state';
        if (oldOverride !== 'state') {
            this._logDebug('override', `[覆盖切换] ${oldOverride} → state（原因: ${type}）`);
        }
        this._stateOverride = type;
        this._stateOverrideStuckTimer = 0;
        this._stateOverrideTravelTimer = 0;
        this._stateOverrideMaxTimer = 0; // 超时保护计时器
        this._stateOverrideCooldown = 30; // 30秒冷却，避免反复触发

        // 【修复】清除社交走路目标（状态覆盖优先于社交意愿）
        if (this._chatWalkTarget) {
            this._logDebug('chat', `状态覆盖(${type})打断了走向聊天目标的路径`);
            this._chatWalkTarget = null;
        }

        // 清除当前移动路径
        this.currentPath = [];
        this.isMoving = false;
        this._pendingEnterScene = null;

        let target, desc, expr, moodStr;
        switch (type) {
            case 'exhausted':
                target = { target: this.homeName + '_door', desc: '回宿舍休息' };
                desc = '累坏了，赶紧回家休息';
                expr = this.stamina < 5 ? '快…快撑不住了…' : '太累了，得回去歇歇…';
                moodStr = '疲惫';
                break;
            case 'sick':
                target = { target: 'medical_door', desc: '去医疗站看病' };
                desc = '身体不舒服，去医疗站看看';
                expr = this.health < 15 ? '难受…得赶紧看医生…' : '有点不舒服，去医疗站检查一下';
                moodStr = '难受';
                break;
            case 'mental':
                target = { target: 'medical_door', desc: '去医疗站看心理' };
                desc = '精神状态不好，去找医官聊聊';
                expr = '脑子里乱糟糟的…去找苏岩聊聊吧';
                moodStr = '焦虑';
                break;
            default:
                this._stateOverride = null;
                return;
        }

        this._stateOverrideTarget = target;
        this.stateDesc = desc;
        this.mood = moodStr;
        this.expression = expr;
        this.expressionTimer = 6;

        const emojiMap = { exhausted: '😴', sick: '🤒', mental: '😰' };
        if (game.addEvent) {
            game.addEvent(`${emojiMap[type]} ${this.name} ${desc} (体力:${Math.round(this.stamina)} 健康:${Math.round(this.health)} San:${Math.round(this.sanity)})`);
        }

        // 【Debug日志】记录状态覆盖触发
        this._logDebug('override', `触发状态覆盖:${type} → ${desc} (体力:${Math.round(this.stamina)} 健康:${Math.round(this.health)} San:${Math.round(this.sanity)})`);

        // 导航到目标
        this._navigateToScheduleTarget(target.target, game);
        this.scheduleReached = false;
    }

    /** 检查状态覆盖的到达逻辑（类似_checkEatingArrival） */;

    proto._updateAttributes = function(dt, game) {
        if (this.isSleeping) {
            // 睡觉时：体力恢复，San值恢复，健康微恢复（不消耗体力、不会饿醒）
            const sleepSanBefore = this.sanity;
            this.stamina = Math.min(100, this.stamina + 0.06 * dt);  // 体力恢复【已调整：从0.12降为0.06】
            this.sanity = Math.min(100, this.sanity + 0.04 * dt);    // 睡觉是恢复精神的主要途径【已调整：从0.06降为0.04】
            if (this.health < 80) this.health = Math.min(100, this.health + 0.02 * dt);
            // 【Debug】睡眠San恢复日志
            if (game.mode === 'debug') {
                if (!this._sanLogCounter) this._sanLogCounter = 0;
                this._sanLogCounter += dt;
                if (this._sanLogCounter >= 60) {
                    this._sanLogCounter = 0;
                    const d = this.sanity - sleepSanBefore;
                    if (Math.abs(d) > 0.1) {
                        this._logDebug('sanity', `San: ${Math.round(sleepSanBefore)}→${Math.round(this.sanity)} (+${d.toFixed(1)}) 来源:[睡眠恢复]`);
                    }
                }
            }
            return;
        }

        const hour = game.getHour();

        // ---- 饥饿自然衰减（清醒时持续缓慢下降）----
        // 基础衰减速率：0.5/游戏小时 = 0.000139/秒
        let hungerDecayRate = 0.000139;
        // 【难度系统】饱腹衰减乘以难度倍率
        const _diffHungerMult = game.getDifficultyMult ? game.getDifficultyMult('hungerDecayMult') : 1.0;
        hungerDecayRate *= _diffHungerMult;
        const ws = game.weatherSystem;
        const currentTemp = ws ? ws.getEffectiveTemp() : 0;
        // 户外寒冷环境（温度<-20°C）时衰减加速至2倍
        if (this.currentScene === 'village' && currentTemp < -20) {
            hungerDecayRate *= 2;
        }
        // 工作中衰减加速至1.5倍
        const isWorkingForHunger = this.workplaceName && this.currentScene === this.workplaceName;
        if (isWorkingForHunger) {
            hungerDecayRate *= 1.5;
        }
        this.hunger = Math.max(0, this.hunger - hungerDecayRate * dt);

        // ---- 体力消耗（清醒时持续缓慢下降）----
        // 工作中消耗更快（在工作场所时）【体力变化快】
        const isWorking = this.workplaceName && this.currentScene === this.workplaceName;
        // 【增强】健康低时体力消耗加快（身体虚弱更容易累）
        const healthPenalty = this.health < 30 ? 1.5 : (this.health < 50 ? 1.2 : 1.0);
        const baseStaminaDrain = (isWorking ? 0.10 : 0.05) * healthPenalty;
        // 【难度系统】体力衰减乘以难度倍率
        const _diffStaminaMult = game.getDifficultyMult ? game.getDifficultyMult('staminaDrainMult') : 1.0;
        const staminaDrain = baseStaminaDrain * _diffStaminaMult;
        this.stamina = Math.max(0, this.stamina - staminaDrain * dt);

        // 【v2.2】吃饭恢复体力/San/健康改为吃完后一次性给（见_updateHunger吃完逻辑）

        // 【v2.2】已删除：存款/魅力/智慧/情商变化（v1.0遗留，末日生存不需要）

        // ---- 健康变化【变化慢】----
        // ============ 【任务6】生命系统升级：饥饿/体力→健康→死亡链路 ============

        // 6-1: 饱腹=0 → 每秒扣健康（【v2.0】提升为0.15/秒 → 约11分钟从100降到0）
        if (this.hunger <= 0) {
            this.health = Math.max(0, this.health - 0.15 * dt);
        }

        // 6-2: 体力=0且非睡眠 → 每秒扣健康（0.025/秒）
        if (this.stamina <= 0 && !this.isSleeping) {
            this.health = Math.max(0, this.health - 0.025 * dt);
        }

        // 6-3: 生病状态 → 每秒额外扣健康（0.033/秒）
        if (this.isSick) {
            this.health = Math.max(0, this.health - 0.033 * dt);
        }

        // 6-4: 多条件叠加——饱腹=0 + 体力=0 = 双重惩罚，上面的三个条件是独立计算的

        // 6-5: 健康自然恢复——仅在暖炉旁 + 饱腹>0 时以低速率恢复
        const isNearFurnace = (
            this.currentScene !== 'village' || // 室内默认有暖炉覆盖
            (game.furnaceSystem && game.furnaceSystem._isInAnyFurnaceRange && game.furnaceSystem._isInAnyFurnaceRange(this))
        );
        if (isNearFurnace && this.hunger > 0 && this.health < 100 && !this.isSick) {
            this.health = Math.min(100, this.health + 0.01 * dt);
        }

        // 正常作息维持健康（保留原有逻辑但降低恢复量，避免与上面重复恢复过多）
        if (hour >= 6 && hour <= 22 && this.stamina >= 30 && this.hunger > 20) {
            this.health = Math.min(100, this.health + 0.003 * dt);
        }
        // 体力过低伤害健康
        if (this.stamina < 10) {
            this.health = Math.max(0, this.health - 0.02 * dt);
        }
        // 【v2.2】吃饭恢复健康改为吃完后一次性给（见_updateHunger吃完逻辑）
        // 淋雨伤害健康
        if (this.currentScene === 'village' && game.isRaining() && !this.hasUmbrella) {
            this.health = Math.max(0, this.health - 0.03 * dt);
        }
        // 老年人健康缓慢下降
        if (this.age >= 60) {
            this.health = Math.max(0, this.health - 0.003 * dt);
        }
        // 【增强】San值低时健康加速下降（精神差导致免疫力低下）
        if (this.sanity < 30) {
            this.health = Math.max(0, this.health - 0.015 * dt);
        }
        // 【增强】San值极低+健康不满时随机触发生病（身心俱疲容易发病）
        if (!this.isSick && this.sanity < 25 && this.health < 50 && Math.random() < 0.0005 * dt) {
            this.isSick = true;
            this.sickTimer = 300; // 生病持续一段时间
            this.mood = '难受';
            this.expression = '身体突然不舒服…';
            this.expressionTimer = 6;
            if (game.addEvent) {
                game.addEvent(`🤒 ${this.name} 因为精神压力大，身体也扛不住了！(San:${Math.round(this.sanity)} 健康:${Math.round(this.health)})`);
            }
            this._logDebug('health', `精神压力导致生病! San:${Math.round(this.sanity)} 健康:${Math.round(this.health)}`);
        }
        // 深夜不睡觉伤害健康 + San值急剧下降（通宵惩罚）
        if ((hour >= 23 || hour < 5) && !this.isSleeping) {
            this.health = Math.max(0, this.health - 0.01 * dt);
            const nightSanMult = (game.mode === 'debug') ? 5 : 1;
            const nightSanBefore = this.sanity;
            this.sanity = Math.max(0, this.sanity - 0.15 * nightSanMult * dt); // 通宵不睡精神崩溃
            // 【Debug】通宵惩罚日志
            if (game.mode === 'debug' && !this._nightSanLogged) {
                this._nightSanLogged = true;
                this._logDebug('sanity', `通宵惩罚开始! San:${Math.round(this.sanity)} 下降速率:${(0.15 * nightSanMult).toFixed(2)}/dt`);
            }
        } else {
            this._nightSanLogged = false;
        }

        // 【v2.2】已删除：情商变化（v1.0遗留，末日生存不需要）

        // ---- San值变化【变化快】----
        // debug模式下San值下降加速，方便测试低San值效果
        const baseSanDropMult = (game.mode === 'debug') ? 5 : 1;
        // 【难度系统】San值衰减乘以难度倍率
        const _diffSanMult = game.getDifficultyMult ? game.getDifficultyMult('sanDecayMult') : 1.0;
        const sanDropMult = baseSanDropMult * _diffSanMult;
        const sanBefore = this.sanity; // 【Debug】记录变化前的San值
        const sanSources = [];         // 【Debug】记录所有变化来源

        // 工作时San值下降（劳累消耗精神）
        if (isWorking) {
            this.sanity = Math.max(0, this.sanity - 0.08 * sanDropMult * dt);
            sanSources.push(`工作-${(0.08 * sanDropMult * dt).toFixed(2)}`);
        }
        // 社交恢复San值
        if (this.state === 'CHATTING') {
            this.sanity = Math.min(100, this.sanity + 0.12 * dt);
            sanSources.push(`社交+${(0.12 * dt).toFixed(2)}`);
        }
        // 【增强】San值低时额外加速下降（恶性循环：精神越差越难自控）
        if (this.sanity < 30 && this.sanity > 0) {
            const spiralRate = 0.03 * sanDropMult * dt;
            this.sanity = Math.max(0, this.sanity - spiralRate);
            sanSources.push(`恶性循环-${spiralRate.toFixed(2)}`);
        }
        // 【增强】健康低时也拖累San值（身体不好影响心情）
        if (this.health < 35) {
            const healthSanDrain = 0.03 * sanDropMult * dt;
            this.sanity = Math.max(0, this.sanity - healthSanDrain);
            sanSources.push(`健康差-${healthSanDrain.toFixed(2)}`);
        }
        // 【v2.2】吃饭恢复San改为吃完后一次性给（见_updateHunger吃完逻辑）
        // 在公园/广场散步恢复San值
        if (this.currentScene === 'village' && !isWorking) {
            this.sanity = Math.min(100, this.sanity + 0.02 * dt);
            sanSources.push(`散步+${(0.02 * dt).toFixed(2)}`);
        }
        // 体力极低时San值下降（疲惫导致精神差）
        if (this.stamina < 20) {
            this.sanity = Math.max(0, this.sanity - 0.06 * sanDropMult * dt);
            sanSources.push(`疲惫-${(0.06 * sanDropMult * dt).toFixed(2)}`);
        }
        // 生病时San值下降
        if (this.isSick) {
            this.sanity = Math.max(0, this.sanity - 0.05 * sanDropMult * dt);
            sanSources.push(`生病-${(0.05 * sanDropMult * dt).toFixed(2)}`);
        }
        // 饥饿时San值下降
        if (this.hunger < 30) {
            this.sanity = Math.max(0, this.sanity - 0.04 * sanDropMult * dt);
            sanSources.push(`饥饿-${(0.04 * sanDropMult * dt).toFixed(2)}`);
        }
        // ---- 看歆玥演出恢复San值（少量花钱）----
        // 必须NPC有主动观看标记（通过行动决策去的）或状态覆盖为entertainment
        // 歆玥演出时间：14:00-16:00广场、19:00-21:00酒馆驻唱
        const linYue = game.npcs.find(n => n.id === 'ling_yue');
        const linYuePerforming = linYue && (
            (linYue.currentScene === 'village' && hour >= 14 && hour < 16) ||  // 广场演出
            (linYue.currentScene === 'kitchen' && hour >= 19 && hour < 21)     // 炊事房驻唱
        );
        // 只有主动去看演出（通过_stateOverride=entertainment 或 行动决策到达同场景）才恢复San值
        const isActivelyWatching = this.id !== 'ling_yue' && linYuePerforming && linYue.currentScene === this.currentScene
            && (this._stateOverride === 'entertainment' || this._actionOverride === 'watch_show' || this.stateDesc?.includes('演出') || this.stateDesc?.includes('看戏'));
        if (isActivelyWatching) {
            this.isWatchingShow = true;
            this.sanity = Math.min(100, this.sanity + 0.20 * dt);  // 看演出大幅恢复San值
            sanSources.push(`看演出+${(0.20 * dt).toFixed(2)}`);
            // 歆玥获得演出收入（v2.2已移除存款系统）
            if (linYue) {
                // 【目标追踪】标记歆玥正在演出（每场演出只计一次）
                if (!linYue._performanceTrackedThisSlot) {
                    linYue._performanceTrackedThisSlot = true;
                    if (linYue.trackPerformance) linYue.trackPerformance();
                }
            }
        } else {
            this.isWatchingShow = false;
            // 【目标追踪】非演出/不在看→重置演出追踪标志，让下一场可以再计次
            if (linYue && !linYuePerforming) {
                linYue._performanceTrackedThisSlot = false;
            }
            // 非主动观看但碰巧在同场景，给微量恢复（氛围加成）
            if (this.id !== 'ling_yue' && linYuePerforming && linYue.currentScene === this.currentScene) {
                this.sanity = Math.min(100, this.sanity + 0.03 * dt);
                sanSources.push(`演出氛围+${(0.03 * dt).toFixed(2)}`);
            }
        }

        // ---- 找苏医生心理咨询恢复San值（大量花钱）----
        // 必须通过正式治疗流程（_isBeingTreated && _stateOverride === 'mental'）才有大幅恢复
        // 纯粹因为"碰巧在医院"不再自动触发高额恢复
        const suDoctor = game.npcs.find(n => n.id === 'su_doctor');
        const suDoctorAvailable = suDoctor && suDoctor.currentScene === 'medical' && !suDoctor.isSleeping;
        if (this._isBeingTreated && this._stateOverride === 'mental' && suDoctorAvailable) {
            // 正在进行正式心理咨询
            this.isInTherapy = true;
            this.sanity = Math.min(100, this.sanity + 0.30 * dt);  // 心理咨询大幅恢复San值
            sanSources.push(`心理咨询+${(0.30 * dt).toFixed(2)}`);
        } else if (this.id !== 'su_doctor' && this.currentScene === 'medical' && suDoctorAvailable) {
            // 碰巧在医疗站但没有正式咨询——微量恢复（安心氛围）
            this.isInTherapy = false;
            this.sanity = Math.min(100, this.sanity + 0.03 * dt);
            sanSources.push(`医疗站氛围+${(0.03 * dt).toFixed(2)}`);
        } else {
            this.isInTherapy = false;
        }

        // 清醒时San值自然缓慢下降（需要持续获取情绪价值/休息）
        this.sanity = Math.max(0, this.sanity - 0.02 * sanDropMult * dt);
        sanSources.push(`自然-${(0.02 * sanDropMult * dt).toFixed(2)}`);

        // 【Debug】周期性记录San值变化（每60帧约2秒记录一次，避免刷屏）
        if (game.mode === 'debug') {
            if (!this._sanLogCounter) this._sanLogCounter = 0;
            this._sanLogCounter += dt;
            if (this._sanLogCounter >= 60) { // 约每2秒记录一次
                this._sanLogCounter = 0;
                const sanAfter = this.sanity;
                const delta = sanAfter - sanBefore;
                if (Math.abs(delta) > 0.1) { // 只有变化超过0.1才记录
                    this._logDebug('sanity', `San: ${Math.round(sanBefore)}→${Math.round(sanAfter)} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}) 来源:[${sanSources.join(', ')}]`);
                }
                // 【奖惩日志】记录当前生效的连锁惩罚
                const penalties = [];
                if (this.health < 30) penalties.push(`健康差(${Math.round(this.health)}):体力消耗×1.5`);
                else if (this.health < 50) penalties.push(`亚健康(${Math.round(this.health)}):体力消耗×1.2`);
                if (this.sanity < 25) penalties.push(`精神极差(${Math.round(this.sanity)}):食欲-50%/工效-70%`);
                else if (this.sanity < 40) penalties.push(`精神差(${Math.round(this.sanity)}):食欲-30%/工效-40%`);
                if (this.sanity < 30 && !this.isSleeping) penalties.push(`San恶性循环加速中`);
                if (this.health < 35) penalties.push(`健康→San拖累中`);
                if (this.sanity < 30) penalties.push(`社交质量-50%/魅力持续↓`);
                if (this.sanity < 25) penalties.push(`情商持续↓`);
                if (this.health < 25) penalties.push(`移速×0.6`);
                else if (this.health < 40) penalties.push(`移速×0.8`);
                if (this.sanity < 20) penalties.push(`移速×0.7/可能发疯!`);
                if (penalties.length > 0) {
                    this._logDebug('penalty', `⚠️ 连锁惩罚生效中: ${penalties.join(' | ')}`);
                }
                // 【目标进度日志】记录当前目标进度快照
                const activeGoals = this.goals.filter(g => !g.completed);
                if (activeGoals.length > 0) {
                    const goalSnap = activeGoals.map(g => {
                        const pct = g.targetValue > 0 ? Math.round((g.progress / g.targetValue) * 100) : 0;
                        return `${g.desc}:${pct}%`;
                    }).join(' | ');
                    this._logDebug('goal', `📊 目标进度: ${goalSnap}`);
                }
            }
        }

        // ---- 发疯机制（San值过低）----
        // 【增强】发疯阈值提高到<20，概率加大，让低San的后果更严重
        if (!this.isCrazy && this.sanity < 20) {
            // San值越低，发疯概率越高
            const crazyChance = this.sanity < 10 ? 0.003 : (this.sanity < 15 ? 0.002 : 0.001);
            if (Math.random() < crazyChance * dt) {
                this.isCrazy = true;
                this.crazyTimer = 180; // 发疯持续约3游戏小时
                this.mood = '疯狂';
                this.stateDesc = '精神崩溃了 🤯';
                this.expression = ['我受不了了！', '这个世界是假的…', '别碰我！', '哈哈哈哈哈…', '我好累…好累…'][Math.floor(Math.random() * 5)];
                this.expressionTimer = 10;
                if (game.addEvent) {
                    game.addEvent(`🤯 ${this.name} 精神崩溃发疯了！(San:${Math.round(this.sanity)})`);
                }
                // 【事件驱动镜头】通知镜头系统：NPC发疯
                if (game.onNPCEvent) {
                    game.onNPCEvent(this, 'crazy');
                }
            }
        }
        // 发疯中：随机乱走、说胡话、无法正常工作
        if (this.isCrazy) {
            this.crazyTimer -= dt;
            this.stamina = Math.max(0, this.stamina - 0.08 * dt); // 发疯大幅消耗体力
            this.health = Math.max(0, this.health - 0.03 * dt);   // 发疯大幅伤害健康

            // 【极寒生存】San<10 精神崩溃物理攻击：随机攻击附近NPC
            if (this.sanity < 10 && Math.random() < 0.005 * dt) {
                const attackTargets = game.npcs.filter(n =>
                    n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping && !n.isDead
                );
                if (attackTargets.length > 0) {
                    const victim = attackTargets[Math.floor(Math.random() * attackTargets.length)];
                    // 造成伤害：体力-10、健康-5、San-5、双方好感-20
                    victim.stamina = Math.max(0, victim.stamina - 10);
                    victim.health = Math.max(0, victim.health - 5);
                    victim.sanity = Math.max(0, victim.sanity - 5);
                    this.stamina = Math.max(0, this.stamina - 5); // 自己也消耗体力
                    // 双方好感大幅下降
                    const myAff = this.getAffinity(victim.id);
                    this.affinity[victim.id] = Math.max(0, myAff - 20);
                    const theirAff = victim.getAffinity(this.id);
                    victim.affinity[this.id] = Math.max(0, theirAff - 20);
                    // 事件通知
                    const violenceLines = [
                        `${this.name} 精神崩溃，猛推了 ${victim.name}！`,
                        `${this.name} 失控攻击了 ${victim.name}！`,
                        `${this.name} 对 ${victim.name} 动手了！`,
                    ];
                    const line = violenceLines[Math.floor(Math.random() * violenceLines.length)];
                    if (game.addEvent) {
                        game.addEvent(`🔴 ${line}（${victim.name} 体力-10 健康-5 San-5）`);
                    }
                    this.expression = '啊啊啊！！都滚开！！';
                    this.expressionTimer = 8;
                    victim.expression = '疼…！别打我…';
                    victim.expressionTimer = 8;
                    console.log(`[Violence] ${this.name} 攻击了 ${victim.name}`);
                }
            }

            // 随机说胡话 或 语言攻击周围的人
            if (Math.random() < 0.003 * dt) {
                const nearbyVictims = game.npcs.filter(n => 
                    n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping
                );
                if (nearbyVictims.length > 0 && Math.random() < 0.6) {
                    // 【语言攻击】发疯NPC对周围的人进行语言攻击
                    const victim = nearbyVictims[Math.floor(Math.random() * nearbyVictims.length)];
                    const affinity = this.getAffinity(victim.id);
                    // 攻击性台词——根据关系亲密度不同，攻击方式也不同
                    let attackLines;
                    if (affinity >= 70) {
                        // 对亲密的人：更刺心的话（最伤人）
                        attackLines = [
                            `${victim.name}！你从来就没真正关心过我！`,
                            `${victim.name}，你算什么朋友？我最难的时候你在哪？`,
                            `别装了${victim.name}，你跟其他人一样虚伪！`,
                            `${victim.name}你滚开！我不需要你的同情！`,
                            `哈…${victim.name}…你也觉得我疯了对吧？你们都一样…`,
                            `${victim.name}！你知道我每天过的什么日子吗？你根本不在乎！`
                        ];
                    } else if (affinity >= 40) {
                        // 对普通关系的人：敌意和指责
                        attackLines = [
                            `${victim.name}看什么看！你们都在笑话我！`,
                            `别靠近我！${victim.name}你少假惺惺的！`,
                            `${victim.name}！你是不是在背后说我坏话？！`,
                            `都是你们…都是你们害的…${victim.name}你也有份！`,
                            `${victim.name}你少管闲事！滚！`
                        ];
                    } else {
                        // 对关系冷淡的人：恶意和攻击
                        attackLines = [
                            `${victim.name}！给我滚远点！！`,
                            `我看你就不是好人！${victim.name}你别过来！`,
                            `${victim.name}你笑什么笑？！信不信我…`,
                            `你们都想害我…${victim.name}你也是…`
                        ];
                    }
                    this.expression = attackLines[Math.floor(Math.random() * attackLines.length)];
                    this.expressionTimer = 8;
                    
                    // 【核心】语言攻击降低受害者的San值——关系越亲近伤害越大
                    const intimacyMultiplier = affinity >= 70 ? 3.0 : (affinity >= 40 ? 1.5 : 1.0);
                    const sanDamage = 2.5 * intimacyMultiplier; // 基础2.5，挚友受到7.5点伤害
                    victim.sanity = Math.max(0, victim.sanity - sanDamage);
                    
                    // 受害者产生负面情绪反应
                    if (affinity >= 70) {
                        // 来自亲密的人的攻击，伤害更深，情绪影响更大
                        victim.mood = '心痛';
                        victim.expression = `${this.name}…你怎么能这样说…`;
                        victim.expressionTimer = 6;
                    } else {
                        victim.mood = '不安';
                    }
                    
                    if (game.addEvent) {
                        game.addEvent(`😡 ${this.name} 对 ${victim.name} 发起语言攻击！(${victim.name} San-${sanDamage.toFixed(1)})`);
                    }
                } else {
                    // 普通胡话
                    const crazyLines = ['嘿嘿嘿…', '别过来！', '我看到了…', '为什么…为什么…', '哈哈哈哈！', '好黑…好冷…', '谁在说话？！'];
                    this.expression = crazyLines[Math.floor(Math.random() * crazyLines.length)];
                    this.expressionTimer = 6;
                }
            }
            // 发疯持续影响周围人的San值（被动氛围压迫）——附近的人每秒缓慢掉San
            const crazyWitnesses = game.npcs.filter(n => 
                n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping
            );
            for (const witness of crazyWitnesses) {
                const aff = witness.getAffinity(this.id);
                // 关系越好，看到对方发疯越痛苦，San下降越快
                const witnessSanLoss = aff >= 70 ? 0.08 : (aff >= 40 ? 0.04 : 0.02);
                witness.sanity = Math.max(0, witness.sanity - witnessSanLoss * dt);
            }
            // 发疯影响与周围人的关系——附近目睹发疯的NPC好感度下降
            if (Math.random() < 0.003 * dt) {
                for (const witness of crazyWitnesses) {
                    // 目击者对发疯者好感度下降
                    const currentAff = witness.getAffinity(this.id);
                    witness.affinity[this.id] = Math.max(5, currentAff - 2);
                    // 发疯者对目击者好感度也下降（精神混乱导致敌意）
                    const myAff = this.getAffinity(witness.id);
                    this.affinity[witness.id] = Math.max(5, myAff - 1);
                }
                if (crazyWitnesses.length > 0 && game.addEvent) {
                    game.addEvent(`😰 ${crazyWitnesses.map(w => w.name).join('、')} 目睹了 ${this.name} 的疯狂行为，关系变差了`);
                }
            }
            // 恢复条件：San值回到30以上 或 计时结束
            if (this.sanity >= 30 || this.crazyTimer <= 0) {
                this.isCrazy = false;
                this.crazyTimer = 0;
                this.mood = '虚弱';
                this.expression = '我…刚才怎么了…';
                this.expressionTimer = 8;
                if (game.addEvent) {
                    game.addEvent(`😰 ${this.name} 恢复了神智 (San:${Math.round(this.sanity)})`);
                }
            }
        }

        // ---- 精神不稳定行为（San 15~30，未发疯但状态很差）----
        // 阴阳怪气、负面情绪传染——偶尔说尖酸刻薄的话影响周围人
        if (!this.isCrazy && this.sanity >= 15 && this.sanity < 30) {
            if (Math.random() < 0.001 * dt) {
                const nearbyPeople = game.npcs.filter(n =>
                    n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping
                );
                if (nearbyPeople.length > 0) {
                    const target = nearbyPeople[Math.floor(Math.random() * nearbyPeople.length)];
                    const aff = this.getAffinity(target.id);
                    // 阴阳怪气的台词
                    const bitterLines = aff >= 70
                        ? [
                            `哼…${target.name}你今天看起来倒是挺开心的啊…`,
                            `${target.name}，你知道被人无视是什么感觉吗？算了你不会懂。`,
                            `我还以为我们是朋友呢…${target.name}。`,
                            `${target.name}，别假装关心我了，你忙你的吧。`
                        ]
                        : [
                            `真吵…能不能安静点…`,
                            `你们都好开心啊…真好。`,
                            `哈…算了，说了你也不懂。`,
                            `别看我…我没事…`,
                            `这破地方待着真没意思…`
                        ];
                    this.expression = bitterLines[Math.floor(Math.random() * bitterLines.length)];
                    this.expressionTimer = 6;
                    // 轻微影响周围人的San值（比发疯弱得多）
                    for (const person of nearbyPeople) {
                        const personAff = person.getAffinity(this.id);
                        const sanLoss = personAff >= 70 ? 1.5 : 0.5;
                        person.sanity = Math.max(0, person.sanity - sanLoss);
                    }
                    if (game.addEvent) {
                        game.addEvent(`😤 ${this.name} 情绪低落，说了些刺耳的话`);
                    }
                }
            }
        }

        // ---- 生病机制 ----
        if (!this.isSick && this.health < 30) {
            // 健康低于30时有概率触发生病
            if (Math.random() < 0.0001 * dt) {
                this.isSick = true;
                this.sickTimer = 120; // 生病持续约120游戏秒（≈2游戏小时）
                this.health = Math.max(0, this.health - 10);
                this.stateDesc = '生病了 🤒';
                this.expression = '不太舒服…';
                this.expressionTimer = 8;
                if (game.addEvent) {
                    game.addEvent(`🤒 ${this.name} 生病了！(健康:${Math.round(this.health)})`);
                }
            }
        }
        // 生病中：持续消耗体力，计时
        if (this.isSick) {
            this.sickTimer -= dt;
            this.stamina = Math.max(0, this.stamina - 0.02 * dt);
            // 如果看病（到医疗站治疗，简化为：在医疗站内）
            if (this.currentScene === 'medical') {
                this.health = Math.min(100, this.health + 0.1 * dt); // 加速恢复
            }
            // 生病自然恢复或计时结束
            if (this.sickTimer <= 0 || this.health >= 50) {
                this.isSick = false;
                this.sickTimer = 0;
                this.expression = '感觉好多了~';
                this.expressionTimer = 5;
                if (game.addEvent) {
                    game.addEvent(`💊 ${this.name} 康复了！`);
                }
            }
        }

        // ---- 【极寒生存】体温系统更新 ----
        this._updateBodyTemp(dt, game);

        // ---- 体力联动效果：影响移动速度 ----
        let speedBase;
        if (this.stamina <= 0) {
            speedBase = (100 + Math.random() * 10) * 0.3; // 【新增】体力归零，移速降至30%
        } else if (this.stamina >= 80) {
            speedBase = (100 + Math.random() * 10) * 1.2; // 精力充沛，速度+20%
        } else if (this.stamina >= 50) {
            speedBase = 100 + Math.random() * 10; // 正常
        } else if (this.stamina >= 20) {
            speedBase = (100 + Math.random() * 10) * 0.7; // 疲惫，速度-30%
        } else {
            speedBase = (100 + Math.random() * 10) * 0.4; // 虚脱，速度-60%
        }
        // 【增强】健康低时额外减速（身体虚弱走不动）
        if (this.health < 25) {
            speedBase *= 0.6;
        } else if (this.health < 40) {
            speedBase *= 0.8;
        }
        // 【增强】San值极低时额外减速（神思恐性、走路踉跄）
        if (this.sanity < 20) {
            speedBase *= 0.7;
        }
        // 【极寒生存】失温减速
        if (this.isHypothermic) {
            speedBase *= 0.5;
        }
        if (this.isSevereHypothermic) {
            speedBase *= 0; // 严重失温：无法移动
        }
        this.speed = speedBase;

        // ---- 属性边界钳制 ----
        this.stamina = Math.max(0, Math.min(100, this.stamina));
        this.health = Math.max(0, Math.min(100, this.health));
        this.bodyTemp = Math.max(25, Math.min(36.5, this.bodyTemp));
        this.sanity = Math.max(0, Math.min(100, this.sanity));

        // ---- 目标系统：追踪器更新 + 进度检测 ----
        // 工作时间追踪（在工作场所时累计）
        if (isWorking) {
            this._goalTrackers.workHours += dt / 60; // dt是游戏秒，转换为游戏分钟→除60得小时
        }
        // 学习时间追踪（在工坊或医疗站时累计）
        if (this.currentScene === 'workshop' || this.currentScene === 'medical') {
            this._goalTrackers.studyHours += dt / 60;
        }
        // 演出次数追踪由演出系统外部更新（在startPerformance中++）
        // 每日重置 daily 目标
        if (game.dayCount !== this._lastGoalDay) {
            this._lastGoalDay = game.dayCount;
            this._goalTrackers.chatCount = 0;
            this._goalTrackers.chatPartners = [];
            this._goalTrackers.workHours = 0;
            this._goalTrackers.studyHours = 0;
            this._goalTrackers.performCount = 0;
            // 【任务10】重置末日生存日目标
            this._goalTrackers.mealsToday = 0;
            this._goalTrackers.woodChopped = 0;
            this._goalTrackers.gatherCount = 0;
            this._goalTrackers.frostbiteSaved = 0;
            this._goalTrackers.rareItemsFound = 0;
            this._goalTrackers.patrolCount = 0;
            this._goalTrackers.conflictsResolved = 0;
            this._goalTrackers.medkitsCrafted = 0;
            // 重置daily目标的完成状态
            for (const g of this.goals) {
                if (g.type === 'daily') {
                    g.completed = false;
                    g.rewarded = false;
                    g.progress = 0;
                }
            }
        }
        // ---- 极端状态持续计时器（用于死亡判定）----
        // 体力=0持续计时
        if (this.stamina <= 0) {
            this._zeroStaminaDuration += dt;
        } else {
            this._zeroStaminaDuration = 0;
        }
        // 饱腹=0持续计时
        if (this.hunger <= 0) {
            this._zeroHungerDuration += dt;
        } else {
            this._zeroHungerDuration = 0;
        }
        // San=0且发疯持续计时
        if (this.sanity <= 0 && this.isCrazy) {
            this._zeroCrazyDuration += dt;
        } else {
            this._zeroCrazyDuration = 0;
        }

        // ---- 【第2天户外工作时间限制】----
        const wsDay2 = game.weatherSystem;
        const isOutdoorScene = (this.currentScene === 'village');
        if (wsDay2 && wsDay2.currentDay === 2 && isOutdoorScene) {
            this._outdoorWorkDuration += dt;
            // 超过2小时（7200游戏秒）强制回室内
            if (this._outdoorWorkDuration >= 7200 && !this._outdoorForceReturn) {
                this._outdoorForceReturn = true;
                // 强制NPC回到据点
                this._stateOverride = 'force_return';
                this._actionOverride = 'go_to';
                this._actionTarget = 'furnace_main';
                this._currentAction = { type: 'go_to', target: 'furnace_main', reason: '户外工作超时，必须回室内取暖' };
                if (game.addEvent) {
                    game.addEvent(`⚠️ ${this.name}在户外工作超过2小时，体温下降严重，强制返回室内取暖！`);
                }
                console.log(`[OutdoorLimit] ${this.name} 第2天户外工作超2小时，强制回室内`);
            }
            // 1.5小时时预警
            if (this._outdoorWorkDuration >= 5400 && this._outdoorWorkDuration < 5400 + dt + 1 && !this._outdoorForceReturn) {
                if (game.addEvent) {
                    game.addEvent(`⏰ ${this.name}已在户外工作1.5小时，请注意安排回室内休息！`);
                }
            }
        } else {
            // 回到室内后重置计时
            if (this._outdoorWorkDuration > 0 && !isOutdoorScene) {
                this._outdoorWorkDuration = 0;
                this._outdoorForceReturn = false;
            }
        }

        // 定期检测目标进度（每5秒检测一次，避免每帧都算）
        this._goalCheckTimer = (this._goalCheckTimer || 0) + dt;
        if (this._goalCheckTimer >= 5) {
            this._goalCheckTimer = 0;
            this._updateGoals(game);
        }

        // ---- 共同行为关系加成 ----
        // 每隔一段时间检查：在同一场景中一起做某事的NPC，双方关系小幅提升
        this._sharedActivityTimer = (this._sharedActivityTimer || 0) + dt;
        if (this._sharedActivityTimer >= 60) { // 每60真实秒检查一次（降低频率防止好感涨太快）
            this._sharedActivityTimer = 0;
            if (!this.isSleeping && !this.isCrazy) {
                this._checkSharedActivityBonus(game);
            }
        }
    }

    /** 共同行为关系加成：在同场景一起做事的NPC双方关系提升 */;

    proto._updateBodyTemp = function(dt, game) {
        if (this.isDead) return;

        const ws = game.weatherSystem;
        if (!ws) return;

        const temp = ws.getEffectiveTemp();
        const isOutdoor = this.currentScene === 'village';

        // ---- 室外：体温下降 ----
        if (isOutdoor && temp < 0) {
            // 体温下降速率【已调整：从0.000167提高到0.00025】
            // -30°C时约0.0075°C/秒=0.45°C/分钟，从36.5降到25需约25分钟
            let dropRate = Math.abs(temp) * 0.00025 * dt;

            // 失温状态下体温下降加速
            if (this.isHypothermic) {
                dropRate *= 1.5;
            }

            // 【新增风寒效应】大雪或极寒暴风雪天气时降温速率×1.5
            if (ws.currentWeather && (
                ws.currentWeather.includes('大雪') ||
                ws.currentWeather.includes('极寒暴风雪') ||
                ws.currentWeather.includes('暴风雪')
            )) {
                dropRate *= 1.5;
            }

            this.bodyTemp = Math.max(25, this.bodyTemp - dropRate);

            // 累计户外连续时间
            this._outdoorContinuousTime += dt;
        }

        // ---- 室内暖炉旁：体温恢复 ----
        if (!isOutdoor) {
            const fs = game.furnaceSystem;
            const isNearFurnace = fs && fs.isNearActiveFurnace(this);

            if (isNearFurnace) {
                // 暖炉旁恢复体温: +0.2°C/分钟 = +0.00333/秒
                this.bodyTemp = Math.min(36.5, this.bodyTemp + 0.00333 * dt);
                // 暖炉旁体力和健康微恢复（由FurnaceSystem处理）
            } else if (temp < 0) {
                // 室内但暖炉未运行/不在范围内，缓慢降温【已调整：从0.00005降为0.00003】
                const indoorDropRate = Math.abs(temp) * 0.00003 * dt;
                this.bodyTemp = Math.max(25, this.bodyTemp - indoorDropRate);
            } else {
                // 室内且温度≥0，缓慢恢复体温
                this.bodyTemp = Math.min(36.5, this.bodyTemp + 0.001 * dt);
            }

            // 室内重置户外连续时间
            this._outdoorContinuousTime = 0;
        }

        // ---- 失温状态判定 ----
        const wasHypothermic = this.isHypothermic;
        const wasSevere = this.isSevereHypothermic;

        if (this.bodyTemp < 30) {
            // 严重失温: 倒地不起，需救援
            this.isSevereHypothermic = true;
            this.isHypothermic = true;
            this._rescueNeeded = true;

            // 严重失温持续伤害【已调整：加快严重失温伤害】
            this.health = Math.max(0, this.health - 0.2 * dt);
            this.stamina = Math.max(0, this.stamina - 0.3 * dt);

            // 救援倒计时（户外30分钟=1800游戏秒，室内60分钟=3600游戏秒）
            if (isOutdoor) {
                this._rescueTimer += dt;
                if (this._rescueTimer >= 1800 && this.health > 0) {
                    // 30分钟无人救援，冻死
                    this.health = 0;
                    this._deathCause = '冻死';
                    console.log(`[BodyTemp] ${this.name} 严重失温无人救援，冻死`);
                }
            } else {
                // 室内严重失温：救援倒计时延长为60分钟
                this._rescueTimer += dt;
                if (this._rescueTimer >= 3600 && this.health > 0) {
                    this.health = 0;
                    this._deathCause = '冻死';
                    console.log(`[BodyTemp] ${this.name} 室内严重失温60分钟无人救援，冻死`);
                }
            }

            if (!wasSevere) {
                this.mood = '濒死';
                this.stateDesc = '严重失温，倒地不起 🧊';
                this.expression = '好冷…谁来…救…';
                this.expressionTimer = 15;
                if (game.addEvent) {
                    game.addEvent(`🧊 ${this.name} 严重失温倒地！(体温:${this.bodyTemp.toFixed(1)}°C) 需要救援！`);
                }
            }
        } else if (this.bodyTemp < 35) {
            // 轻度失温: 移速×0.5、体力消耗×2、无法工作
            this.isHypothermic = true;
            this.isSevereHypothermic = false;
            this._rescueNeeded = false;
            this._rescueTimer = 0;

            // 【v2.0】体温<33°C时累计失温持续时间（用于死亡判定）
            if (this.bodyTemp < 33) {
                this._hypothermiaDuration += dt;
            } else {
                this._hypothermiaDuration = Math.max(0, this._hypothermiaDuration - dt * 0.5); // 缓慢恢复
            }

            // 失温持续伤害（较轻）【已调整：加快失温伤害】
            this.health = Math.max(0, this.health - 0.05 * dt);
            this.stamina = Math.max(0, this.stamina - 0.08 * dt);

            if (!wasHypothermic) {
                this.mood = '发抖';
                this.stateDesc = '体温过低，瑟瑟发抖 🥶';
                this.expression = '好冷…浑身发抖…';
                this.expressionTimer = 10;
                if (game.addEvent) {
                    game.addEvent(`🥶 ${this.name} 开始失温！(体温:${this.bodyTemp.toFixed(1)}°C)`);
                }
            }
        } else {
            // 体温正常
            this._hypothermiaDuration = 0; // 【v2.0】重置失温持续时间
            if (wasHypothermic) {
                this.isHypothermic = false;
                this.isSevereHypothermic = false;
                this._rescueNeeded = false;
                this._rescueTimer = 0;
                this.expression = '终于暖和过来了…';
                this.expressionTimer = 5;
                if (game.addEvent) {
                    game.addEvent(`🌡️ ${this.name} 体温恢复正常 (${this.bodyTemp.toFixed(1)}°C)`);
                }
            }
        }
    }

    /** 获取体温状态描述 */;

    proto._updateGoals = function(game) {
        for (const goal of this.goals) {
            if (goal.completed && goal.rewarded) continue; // 已完成且已领奖，跳过

            // 计算当前进度
            let currentValue = 0;
            switch (goal.targetKey) {
                case 'chatCount':
                    currentValue = this._goalTrackers.chatCount;
                    break;
                case 'workHours':
                    currentValue = this._goalTrackers.workHours;
                    break;
                case 'studyHours':
                    currentValue = this._goalTrackers.studyHours;
                    break;
                case 'performCount':
                    currentValue = this._goalTrackers.performCount;
                    break;
                case 'health':
                    currentValue = this.health;
                    break;
                case 'allAffinity60':
                case 'allAffinity70': {
                    // 检查和所有其他NPC的好感度是否都达到阈值
                    const threshold = goal.targetKey === 'allAffinity60' ? 60 : 70;
                    const otherNPCs = game.npcs.filter(n => n.id !== this.id);
                    const allAbove = otherNPCs.every(n => this.getAffinity(n.id) >= threshold);
                    currentValue = allAbove ? 1 : 0;
                    break;
                }
                // ============ 【任务10】末日生存目标 ============
                case 'mealsToday':
                    currentValue = this._goalTrackers.mealsToday;
                    break;
                case 'woodChopped':
                    currentValue = this._goalTrackers.woodChopped;
                    break;
                case 'gatherCount':
                    currentValue = this._goalTrackers.gatherCount;
                    break;
                case 'frostbiteSaved':
                    currentValue = this._goalTrackers.frostbiteSaved;
                    break;
                case 'rareItemsFound':
                    currentValue = this._goalTrackers.rareItemsFound;
                    break;
                case 'patrolCount':
                    currentValue = this._goalTrackers.patrolCount;
                    break;
                case 'conflictsResolved':
                    currentValue = this._goalTrackers.conflictsResolved;
                    break;
                case 'medkitsCrafted':
                    currentValue = game._medkitCount || 0; // 全局急救包总数
                    break;
                case 'radioRepaired':
                    currentValue = game._radioRepaired ? 1 : 0;
                    break;
                case 'secondFurnaceBuilt':
                    currentValue = (game.furnaceSystem && game.furnaceSystem.secondFurnaceBuilt) ? 1 : 0;
                    break;
                case 'aliveCount':
                    currentValue = game.npcs.filter(n => !n.isDead).length;
                    break;
                case 'totalWoodCollected':
                    currentValue = (game.resourceSystem && game.resourceSystem.totalCollected) ? game.resourceSystem.totalCollected.woodFuel : 0;
                    break;
                case 'totalFoodCollected':
                    currentValue = (game.resourceSystem && game.resourceSystem.totalCollected) ? game.resourceSystem.totalCollected.food : 0;
                    break;
                case 'sanity':
                    currentValue = this.sanity;
                    break;
                case 'stamina':
                    currentValue = this.stamina;
                    break;
                case 'hunger':
                    currentValue = this.hunger;
                    break;
                default:
                    // 好感度目标（格式：affinity_npcId）
                    if (goal.targetKey.startsWith('affinity_')) {
                        const targetNpcId = goal.targetKey.replace('affinity_', '');
                        currentValue = this.getAffinity(targetNpcId);
                    }
                    break;
            }

            goal.progress = currentValue;

            // 检测是否完成
            if (!goal.completed && currentValue >= goal.targetValue) {
                goal.completed = true;
                goal.completedDay = game.dayCount;
                // 发放奖励
                this._grantGoalReward(goal, game);
            }
        }
    }

    /** 发放目标奖励 */;

    proto._updateHunger = function(dt, game) {
        // 睡觉时不触发饥饿行为，但仍然缓慢消耗（在下方 decayRate 中处理）

        // 饥饿值随时间递减
        // dt 已经是经过倍速处理的 gameDt
        // 设计：一个完整白天（6:00~22:00 = 16 游戏小时 = 960 游戏分钟）饥饿值从 100 降到约 60
        // 每游戏分钟消耗 100/960 ≈ 0.104（清醒时）
        // 每真实秒 = timeSpeed 游戏分钟（默认10），且 dt 已含倍速
        // 所以每帧消耗 = decayRate * dt（dt已含倍速，自动加速）
        // 【极寒生存】无食物时饥饿值2倍速度下降
        const rs = game.resourceSystem;
        const noFoodCrisis = rs && rs.crisisFlags.noFood;
        const hungerMultiplier = noFoodCrisis ? 2.0 : 1.0;

        // 【极寒天气强化】户外寒冷饥饿乘数——越冷越饿
        let coldHungerMult = 1.0;
        const isOutdoor = this.currentScene === 'village';
        if (isOutdoor && game.weatherSystem) {
            const temp = game.weatherSystem.getEffectiveTemp();
            if (temp < -50) {
                coldHungerMult = 3.0;
            } else if (temp < -20) {
                coldHungerMult = 2.5;
            } else if (temp < 0) {
                coldHungerMult = 1 + Math.abs(temp) / 40; // -10°C→×1.25, -20°C→×1.5
            }
        }

        const decayRate = (this.isSleeping ? 0 : 0.4) * hungerMultiplier * coldHungerMult; // 睡觉时不掉饱食度
        this.hunger = Math.max(0, this.hunger - decayRate * dt);

        // 正在吃饭中
        if (this.isEating) {
            this.eatingTimer -= dt;
            if (this.eatingTimer <= 0) {
                this.isEating = false;
                
                // 【v2.1】个人进食：消耗食物并恢复饱腹（食物消耗不受天气影响）
                const rs2 = game.resourceSystem;
                const foodPerMeal = 1.5; // 每人每餐固定消耗
                if (rs2 && rs2.food >= foodPerMeal) {
                    rs2.consumeResource('food', foodPerMeal, `${this.name}个人进食`);
                    this.hunger = Math.min(100, this.hunger + 60);
                    // 【v2.2】吃饭一次性恢复体力/San/健康（不再是持续恢复）
                    const sanPenalty = this.sanity < 25 ? 0.5 : (this.sanity < 40 ? 0.7 : 1.0);
                    this.stamina = Math.min(100, this.stamina + 15 * sanPenalty); // 体力+15（San低时打折）
                    this.sanity = Math.min(100, this.sanity + 5);   // San+5
                    this.health = Math.min(100, this.health + 2);   // 健康+2
                    this.mood = '满足';
                    this.expression = '吃饱了，真舒服！';
                    if (game.addEvent) {
                        game.addEvent(`🍴 ${this.name} 吃饱了（-${foodPerMeal}食物，饱食+60→${Math.round(this.hunger)}，剩余${Math.round(rs2.food)}）`);
                    }
                } else if (rs2 && rs2.food > 0) {
                    // 食物不足，吃掉剩余的，按比例恢复
                    const available = rs2.food;
                    const ratio = available / foodPerMeal;
                    rs2.consumeResource('food', available, `${this.name}个人进食(不足)`);
                    this.hunger = Math.min(100, this.hunger + Math.round(60 * ratio));
                    // 【v2.2】按比例恢复
                    const sanPenalty2 = this.sanity < 25 ? 0.5 : (this.sanity < 40 ? 0.7 : 1.0);
                    this.stamina = Math.min(100, this.stamina + Math.round(15 * ratio * sanPenalty2));
                    this.sanity = Math.min(100, this.sanity + Math.round(5 * ratio));
                    this.health = Math.min(100, this.health + Math.round(2 * ratio));
                    this.mood = '不太满足';
                    this.expression = '只吃了一点点...';
                    if (game.addEvent) {
                        game.addEvent(`⚠️ ${this.name} 食物不够（-${Math.round(available)}食物，饱食+${Math.round(60 * ratio)}）`);
                    }
                } else {
                    // 没有食物
                    this.hunger = Math.max(0, this.hunger - 10);
                    this.mood = '沮丧';
                    this.expression = '没有食物...';
                    if (game.addEvent) {
                        game.addEvent(`😰 ${this.name} 到食堂发现没有食物了！`);
                    }
                }
                
                this.expressionTimer = 5;
                this._hungerOverride = false;
                this._hungerTarget = null;
                this._hungerStuckTimer = 0;
                this._hungerTravelTimer = 0;
                // 【饱食保护】吃完饭后设置较长的冷却时间（真实秒），避免5倍速下频繁触发饥饿导致NPC在建筑间反复跑
                this._hungerTriggerCooldown = 20; // 20真实秒内不再触发饥饿行为
                // 【行为锁】吃饭完成，释放行为锁，检查pending队列
                this._releaseBehaviorLock('eating');
                // 重置日程索引，让日程系统在下一帧重新接管
                this.currentScheduleIdx = -1;
                this.scheduleReached = false;
            }
            return;
        }

        // 饥饿驱动行为：当饥饿值低于阈值时，打断当前日程去吃饭
        // 【修复】睡觉时段（日程要求回家睡觉）不触发饥饿行为，否则会打断回家路径
        // 【优先级仲裁】体力极低/生病时不触发饥饿，让状态覆盖（回家/看病）优先
        const hour = game.getHour();
        const isLateNight = this._isBedtime(hour);
        const hasHigherPriorityNeed = this.stamina < 15 || (this.isSick && this.health < 25) || this._stateOverride;
        const hasFoodAvailable = game.resourceSystem && game.resourceSystem.food > 0;

        // 【强制进食保护】饥饿<10 且有食物且正在睡觉：最最高优先级，打断睡眠去吃饭
        // 【修复】不能饿着肚子睡觉！饱腹=0时必须醒来去吃饭
        // 【跳夜保护】深夜时段（20:00~06:00）如果跳夜即将触发，不要饿醒NPC，等跳夜后统一处理
        const nightSkipHour = game.getHour();
        const isNightSkipWindow = (nightSkipHour >= 20 || nightSkipHour < 6) && !game._nightSkipDone;
        if (this.hunger < 10 && hasFoodAvailable && this.isSleeping && !this._hungerOverride && !this.isEating && !isNightSkipWindow) {
            // 【极度饥饿】hunger<10无视冷却，确保NPC不会饿死
            // 【修复】先设置_hungerOverride防止每帧重复触发日志刷屏
            this._hungerOverride = true;
            console.warn(`[NPC] ${this.name} 饱腹极低(${Math.round(this.hunger)})且在睡觉，打断睡眠去吃饭！`);
            if (game.addEvent) {
                game.addEvent(`🚨 ${this.name} 饿醒了(饱腹${Math.round(this.hunger)})，必须先去吃饭！`);
            }
            // 打断睡眠
            this.isSleeping = false;
            this.state = 'IDLE';
            this._forcedSleep = false;
            this._hungerTriggerCooldown = 5;
            this._triggerHungerBehavior(game);
            return; // 提前返回，不再检查后续条件
        }
        // 【强制进食保护】饥饿<15 且有食物：最高优先级，中断当前一切非紧急任务立即进食
        // 【修复】hunger<15无视冷却，确保NPC在极端消耗下不会饿死
        if (this.hunger < 15 && hasFoodAvailable && !this._hungerOverride && !this.isEating && !this.isSleeping) {
            // 【修复】先设置_hungerOverride防止每帧重复触发日志刷屏
            this._hungerOverride = true;
            // 中断当前任务，强制进食
            this._actionOverride = false;
            this._currentAction = null;
            this._pendingAction = null;
            if (this.state === 'CHATTING') {
                this.state = 'IDLE';
            }
            this._hungerTriggerCooldown = 5; // 紧急情况缩短冷却
            console.warn(`[NPC] ${this.name} 饥饿值极低(${Math.round(this.hunger)})，强制中断任务去进食！`);
            if (game.addEvent) {
                game.addEvent(`🚨 ${this.name} 饿得快撑不住了(${Math.round(this.hunger)})，紧急去找食物！`);
            }
            this._triggerHungerBehavior(game);
        }
        // 【强制进食保护】饥饿<25 且有食物：放宽限制（忽略深夜、忽略低优先级阻断），确保NPC去吃饭
        else if (this.hunger < 25 && hasFoodAvailable && !this._hungerOverride && !this.isEating && !this.isSleeping && this._hungerTriggerCooldown <= 0 && !this._stateOverride) {
            this._hungerTriggerCooldown = 8;
            this._triggerHungerBehavior(game);
        }
        // 常规饥饿触发：hunger<35，保持原有条件
        // 【修复】任务覆盖或资源采集期间，常规饥饿（≥15）不打断，避免NPC在建筑间反复跑
        else if (this.hunger < 35 && !this._hungerOverride && !this.isEating && this.state !== 'CHATTING' && !this.isSleeping && !isLateNight && this._hungerTriggerCooldown <= 0 && !hasHigherPriorityNeed
            && !(this._taskOverride && this._taskOverride.isActive) && !this._resourceGatherOverride) {
            this._hungerTriggerCooldown = 10; // 10秒冷却，避免反复触发刷屏
            this._triggerHungerBehavior(game);
        }
    }

    /** 饥饿触发：打断当前日程，去吃饭 */;

    proto._updateResourceGatherOverride = function(dt, game) {
        // 冷却递减
        if (this._resourceGatherCooldown > 0) {
            this._resourceGatherCooldown -= dt;
        }

        if (!this._resourceGatherOverride) return;

        // 被P0事件打断（饥饿覆盖、状态覆盖、发疯、濒死等）
        if (this._hungerOverride || this._stateOverride || this.isCrazy || this._isDying || this._rescueNeeded || this.isDead) {
            this._clearResourceGatherOverride();
            return;
        }

        const rs = game.resourceSystem;
        if (!rs) {
            this._clearResourceGatherOverride();
            return;
        }

        // 退出条件1：资源恢复安全线
        if (this._resourceGatherType === 'wood' && rs.getWoodFuelHoursRemaining() > 4) {
            if (game.addEvent) game.addEvent(`✅ ${this.name} 木柴已充足，停止砍柴返回`);
            this._clearResourceGatherOverride();
            return;
        }
        if (this._resourceGatherType === 'food' && rs.getFoodMealsRemaining() > 2) {
            if (game.addEvent) game.addEvent(`✅ ${this.name} 食物已充足，停止采集返回`);
            this._clearResourceGatherOverride();
            return;
        }

        // 退出条件2：体力不足
        if (this.stamina < 20) {
            if (game.addEvent) game.addEvent(`😓 ${this.name} 体力不足(${Math.round(this.stamina)})，停止采集`);
            this._clearResourceGatherOverride();
            return;
        }

        // 到达检测：在村庄场景中，且距离目标位置<6格
        if (this.currentScene === 'village') {
            const targetLoc = GST.SCHEDULE_LOCATIONS[this._resourceGatherTarget];
            if (targetLoc) {
                const pos = this.getGridPos();
                const dist = Math.abs(pos.x - targetLoc.x) + Math.abs(pos.y - targetLoc.y);
                if (dist <= 6) {
                    // 已到达采集区，stateDesc已设置为匹配produce_resource的关键词
                    // _updateActionEffect会自动产出资源
                    this._resourceGatherTravelTimer = 0; // 到了就不再计时
                    return;
                }
            }
        }

        // 超时兜底：15秒内未到达 → 传送到目标位置
        this._resourceGatherTravelTimer += dt;
        if (this._resourceGatherTravelTimer > 15) {
            this._resourceGatherTravelTimer = 0;
            const targetLoc = GST.SCHEDULE_LOCATIONS[this._resourceGatherTarget];
            if (targetLoc) {
                this._teleportTo(targetLoc.scene, targetLoc.x, targetLoc.y);
                if (game.addEvent) {
                    game.addEvent(`⚡ ${this.name} 赶到了采集区（传送兜底）`);
                }
            }
        }
    }

    /** 清除资源采集覆盖状态 */;

    proto._updateStateOverride = function(dt, game) {
        // 冷却递减
        if (this._stateOverrideCooldown > 0) this._stateOverrideCooldown -= dt;

        // 正在治疗中
        if (this._isBeingTreated) {
            this._treatmentTimer -= dt;
            if (this._treatmentTimer <= 0) {
                this._finishTreatment(game);
            }
            return;
        }

        // 如果已经在状态覆盖中，检查到达逻辑
        if (this._stateOverride) {
            // 【超时保护】stateOverride持续超过60秒且NPC静止，强制清除
            this._stateOverrideMaxTimer = (this._stateOverrideMaxTimer || 0) + dt;
            if (this._stateOverrideMaxTimer > 60 && !this.isMoving && this.currentPath.length === 0) {
                console.warn(`[NPC-${this.name}] [超时] stateOverride(${this._stateOverride})持续${Math.round(this._stateOverrideMaxTimer)}秒且静止，强制清除`);
                this._clearStateOverride();
                return;
            }
            this._checkStateOverrideArrival(dt, game);
            return;
        }

        // 不在覆盖中 → 检查是否需要触发新的状态覆盖
        if (this._stateOverrideCooldown > 0) return;
        if (this.state === 'CHATTING' || this.isEating) return;
        // 【修复】睡觉中也允许仲裁：但仅限饱腹极低时（饿醒去吃饭）
        if (this.isSleeping && this.hunger >= 10) return; // 睡觉中且不太饿，不仲裁
        if (this.isCrazy) return; // 发疯中不触发（发疯有自己的逻辑）

        const hour = game.getHour();
        const isLateNight = this._isBedtime(hour);

        // 【优先级仲裁】体力极低/生病时，强制打断饥饿覆盖
        // 优先级顺序：体力极低 > 生病 > 饥饿 > 精神差
        // 【修复】如果NPC正在睡觉且饱腹<10，跳过体力仲裁，直接走饥饿路径
        // 优先级1：体力极低 → 回家睡觉（可打断饥饿）
        if (this.stamina < 15 && !isLateNight && !this.isSleeping) {
            if (this._hungerOverride) {
                // 【行为锁保护】如果正在吃饭(isEating=true)，检查距离——快到了/正在吃就不打断
                if (this.isEating) {
                    this._logDebug('override', `[行为锁] 体力极低(${Math.round(this.stamina)})但正在吃饭，不打断`);
                    return; // 正在吃饭中，不打断，等吃完
                }
                // 【行为锁保护】在前往吃饭途中，检查距离吃饭目标是否≤3格
                if (this._hungerTarget) {
                    const loc = GST.SCHEDULE_LOCATIONS[this._hungerTarget.target];
                    if (loc && loc.scene === this.currentScene) {
                        const gx = Math.floor((this.x + this.width / 2) / GST.TILE);
                        const gy = Math.floor((this.y + this.height / 2) / GST.TILE);
                        const dist = Math.abs(gx - loc.x) + Math.abs(gy - loc.y);
                        if (dist <= 3) {
                            this._logDebug('override', `[行为锁] 体力极低但距吃饭目标仅${dist}格，不打断`);
                            return; // 快到了，让NPC先吃完
                        }
                    }
                }
                // 距离较远，允许打断
                this._hungerOverride = false;
                this._hungerTarget = null;
                this._hungerStuckTimer = 0;
                this._hungerTravelTimer = 0;
                this.isEating = false;
                this._releaseBehaviorLock('eating'); // 释放可能的吃饭锁
                console.log(`[优先级仲裁] ${this.name} 体力极低(${Math.round(this.stamina)})，打断饥饿行为优先回家休息`);
            }
            this._triggerStateOverride('exhausted', game);
            return;
        }

        // 优先级2：生病或健康低 → 去医院看病（可打断饥饿）
        // 【增强】提高触发阈值：健康<35就触发（原来<25）
        if ((this.isSick || this.health < 35) && !isLateNight) {
            if (this._hungerOverride) {
                // 【行为锁保护】正在吃饭时，不打断（除非健康<10致命紧急）
                if (this.isEating && this.health >= 10) {
                    this._logDebug('override', `[行为锁] 生病但正在吃饭(健康${Math.round(this.health)}>=10)，不打断`);
                    return;
                }
                this._hungerOverride = false;
                this._hungerTarget = null;
                this._hungerStuckTimer = 0;
                this._hungerTravelTimer = 0;
                this.isEating = false;
                this._releaseBehaviorLock('eating'); // 释放可能的吃饭锁
                console.log(`[优先级仲裁] ${this.name} 生病/健康极低，打断饥饿行为优先看病`);
            }
            this._triggerStateOverride('sick', game);
            return;
        }

        // 优先级3：饥饿覆盖中 → 不打断（饥饿 > 精神差）
        if (this._hungerOverride) return;

        // 优先级4：精神状态差 → 去医院找苏医生咨询（非发疯状态下的预防行为）
        // 【增强】提高触发阈值：San<35就触发（原来<25）让NPC更早开始关注精神健康
        if (this.sanity < 35 && !this.isCrazy && !isLateNight) {
            this._triggerStateOverride('mental', game);
            return;
        }
    }

    /** 触发状态覆盖行为 */;

    proto.getAttributeSummary = function() {
        return `💪体力:${Math.round(this.stamina)}(${this.getStaminaLevel()}) ` +
               `🧠San:${Math.round(this.sanity)}(${this.getSanityLevel()}) ` +
               `🫀健康:${Math.round(this.health)}(${this.getHealthLevel()}) ` +
               `🍖饱腹:${Math.round(this.hunger)}(${this.getHungerStatus()}) ` +
               `🌡️体温:${this.bodyTemp.toFixed(1)}°C(${this.getBodyTempStatus()})`;
    }

    // ============ 行动实效性系统 ============
    /**
     * 每帧根据NPC当前场景 + 当前日程行为类型查ACTION_EFFECT_MAP执行效果
     * 确保NPC的日程行为不再是"过家家"，而是产生实际的资源/进度效果
     */;

    proto.getBodyTempColor = function() {
        if (this.bodyTemp >= 36) return '#4ade80';   // 绿
        if (this.bodyTemp >= 35) return '#facc15';   // 黄
        if (this.bodyTemp >= 32) return '#f87171';   // 红
        return '#c084fc';                             // 紫
    }

    /** 每帧更新饥饿值 */;

    proto.getBodyTempStatus = function() {
        if (this.bodyTemp >= 36) return '正常';
        if (this.bodyTemp >= 35) return '偏低';
        if (this.bodyTemp >= 32) return '失温';
        if (this.bodyTemp >= 30) return '严重失温';
        return '濒死';
    }

    /** 获取体温颜色 (绿→黄→红→紫) */;

    // 【v2.2】已删除getCharismaLevel和getEmpathyLevel（废弃属性）

    proto.getGoalsSummary = function() {
        if (!this.goals || this.goals.length === 0) return '';
        return this.goals.map(g => {
            const pct = g.targetValue > 0 ? Math.min(100, Math.round((g.progress / g.targetValue) * 100)) : 0;
            const status = g.completed ? '✅已完成' : `${pct}%`;
            const typeLabel = g.type === 'daily' ? '📅每日' : '🏆长期';
            return `${typeLabel} ${g.desc} [${status}] 奖励:${g.rewardDesc}`;
        }).join('\n');
    }

    /** 事件驱动的属性变化（由对话、冲突等离散事件触发） */;

    proto.getHealthLevel = function() {
        if (this.health >= 80) return '强健';
        if (this.health >= 50) return '正常';
        if (this.health >= 30) return '亚健康';
        if (this.health >= 10) return '生病';
        return '重病';
    };

    proto.getHungerEmoji = function() {
        if (this.hunger >= 80) return '😋';
        if (this.hunger >= 60) return '🙂';
        if (this.hunger >= 40) return '😐';
        if (this.hunger >= 20) return '😣';
        return '🤤';
    }

    // ============ 【极寒生存】体温系统 ============

    /** 每帧更新体温（在_updateAttributes中调用） */;

    proto.getHungerStatus = function() {
        if (this.hunger >= 80) return '饱足';
        if (this.hunger >= 60) return '正常';
        if (this.hunger >= 40) return '有点饿';
        if (this.hunger >= 20) return '很饿';
        return '饥肠辘辘';
    }

    /** 获取饥饿状态emoji */;

    proto.getSanityLevel = function() {
        if (this.sanity >= 80) return '神清气爪';
        if (this.sanity >= 60) return '精神不错';
        if (this.sanity >= 40) return '有些疲惫';
        if (this.sanity >= 20) return '精神萌乎';
        return '精神崩溃';
    }

    /** 获取全部属性概览（用于Prompt注入） */;

    // 【v2.2】已删除getSavingsLevel（废弃属性）

    proto.getStaminaLevel = function() {
        if (this.stamina >= 80) return '精力充沛';
        if (this.stamina >= 50) return '正常';
        if (this.stamina >= 20) return '疲惫';
        if (this.stamina >= 1) return '虚脱';
        return '倒下';
    };

    // 【v2.2】已删除getWisdomLevel（废弃属性）

    proto.onChatCompleted = function(partner, quality) {
        // quality: 'good' | 'normal' | 'bad'
        // 社交消耗体力
        this.stamina = Math.max(0, this.stamina - 1);
    };

    proto.onConflict = function() {
        this.stamina = Math.max(0, this.stamina - 5);
        this.health = Math.max(0, this.health - 2);
    };

    proto.onHelpOther = function() {
        // 【v2.2】已移除charisma/empathy，帮助他人只影响好感度（由调用方处理）
    };

    proto.onLearnFromOther = function(teacherWisdom) {
        // 【v2.2】已移除wisdom属性，保留空函数防止调用报错
    }

    // ============ 饥饿系统 ============

    /** 获取饥饿状态描述 */;

    proto.trackChatWith = function(partnerId) {
        if (!this._goalTrackers.chatPartners.includes(partnerId)) {
            this._goalTrackers.chatPartners.push(partnerId);
            this._goalTrackers.chatCount = this._goalTrackers.chatPartners.length;
        }
    }

    /** 记录一次演出（用于目标追踪） */;

    proto.trackPerformance = function() {
        this._goalTrackers.performCount++;
    }

    /** 获取目标摘要（供Prompt使用） */;

})();
