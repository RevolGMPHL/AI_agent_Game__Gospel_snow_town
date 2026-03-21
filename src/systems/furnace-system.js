/**
 * 福音镇 - FurnaceSystem
 * 挂载到 GST.FurnaceSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 暖炉系统 - 室内温度管理
 * 管理暖炉列表、有效范围、温度维持、第二暖炉修建
 * 依赖: game.js, resource-system.js
 */

// ============ 暖炉配置 ============
const FURNACE_CONFIG = {
    defaultCapacity: 5,          // 每座暖炉可容纳人数
    warmTemp: 15,                // 暖炉维持的室内温度（°C）
    cooldownMinutes: 30,         // 暖炉熄灭后降温时间（分钟）
    relightMinWood: 3,            // 重新点燃需要的最低木柴量（防止刚补一点就点着又耗完）
    relightCooldownSeconds: 300,  // 熄灭后至少冷却5分钟才能重新点燃（游戏内秒）
    bodyTempRecoveryRate: 0.2,   // 体温恢复速率（°C/分钟）= +0.00333/秒
    staminaRecoveryRate: 0.02,   // 体力恢复速率（/秒）【已调整：从0.05降为0.02】
    healthRecoveryRate: 0.008,    // 健康恢复速率（/秒）【已调整：从0.02降为0.008】

    // 第二座暖炉修复（Day3解锁，纯劳动，不消耗资源）
    buildMaterialCost: 0,        // 不需要建材
    buildWoodCost: 0,            // 不需要木柴
    buildTimeSeconds: 7200,      // 修复需要2游戏小时劳动
    buildMinWorkers: 1,          // 1人可修复但较慢
    buildUnlockDay: 3,           // Day3解锁

    // 拥挤惩罚（8人共用1座暖炉时触发）
    crowdThreshold: 5,           // 超过此人数触发拥挤
    crowdSanDrain: 0.005,        // 拥挤时San值下降（/秒）【已调整：从0.05降为0.005，每小时约18San】
    crowdConflictBonus: 0.10,    // 拥挤时冲突概率增加10%
    crowdConflictChance: 0.001,  // 每秒冲突触发概率（当拥挤时）
};

// 暖炉初始位置配置
const FURNACE_LOCATIONS = {
    dorm_a: {
        id: 'furnace_dorm_a',
        name: '宿舍A暖炉',
        scene: 'dorm_a',        // 所在地图场景
        capacity: FURNACE_CONFIG.defaultCapacity,
        position: { x: 6, y: 4 },  // 室内地图坐标（暖炉中心）
        range: 8,                // 有效范围（格数）
    },
    dorm_b: {
        id: 'furnace_dorm_b',
        name: '宿舍B暖炉',
        scene: 'dorm_b',
        capacity: FURNACE_CONFIG.defaultCapacity,
        position: { x: 6, y: 4 },
        range: 8,
    },
    // 主暖炉广场（露天，村庄场景）
    main_plaza: {
        id: 'furnace_main',
        name: '主暖炉',
        scene: 'village',
        capacity: 8,
        position: { x: 25, y: 20 },  // 地图中心暖炉广场
        range: 5,                // 村庄场景用距离判定
    },
};

class FurnaceSystem {
    constructor(game) {
        this.game = game;

        // 暖炉列表 — 初始仅包含主暖炉广场（1座）
        // 【重构】从2座改为1座，第二座需要通过建造获得
        this.furnaces = [
            this._createFurnace(FURNACE_LOCATIONS.main_plaza),
        ];

        // 建造条件检查计时器
        this._buildConditionCheckTick = 0;
        this._buildConditionNotified = false;

        // 第二座暖炉修建状态
        this.buildProgress = 0;          // 修建进度（0~1）
        this.buildWorkers = [];           // 当前参与修建的NPC id列表
        this.isBuildingSecondFurnace = false;
        this.secondFurnaceBuilt = false;
        this._buildPaused = false;
        this._lastReportedProgress = 0;  // 上次报告时的进度（用于每10%报告一次）

        // 系统tick计时
        this._tick = 0;

        console.log('[FurnaceSystem] 初始化完成，暖炉数量:', this.furnaces.length);
    }

    /** 创建暖炉对象 */
    _createFurnace(config) {
        return {
            id: config.id,
            name: config.name,
            scene: config.scene,
            capacity: config.capacity,
            position: { ...config.position },
            range: config.range,
            active: true,           // 是否运转中
            indoorTemp: FURNACE_CONFIG.warmTemp, // 当前室内温度
            _coolingTimer: 0,       // 降温倒计时
        };
    }

    // ============ 主更新循环 ============

    /** 在game.update()中调用 */
    update(gameDt) {
        this._tick += gameDt;
        if (this._tick < 1.0) return;
        const dt = this._tick;
        this._tick = 0;

        // 更新每座暖炉
        for (const furnace of this.furnaces) {
            this._updateFurnace(furnace, dt);
        }

        // 更新NPC的暖炉效果
        this._applyWarmthEffects(dt);

        // 更新第二暖炉修建进度
        if (this.isBuildingSecondFurnace) {
            this._updateBuildProgress(dt);
        }

        // 定期检查建造条件（每5秒）
        this._buildConditionCheckTick += dt;
        if (this._buildConditionCheckTick >= 5) {
            this._buildConditionCheckTick = 0;
            this._checkAndNotifyBuildCondition();
        }

        // 拥挤判定
        this._checkCrowding(dt);
    }

    /** 更新单座暖炉 */
    _updateFurnace(furnace, dt) {
        const rs = this.game.resourceSystem;

        // 检查运转条件：只需木柴>0（电力不再是暖炉运转的必要条件）
        if (furnace.active) {
            if (rs && rs.woodFuel <= 0) {
                furnace.active = false;
                furnace._coolingTimer = FURNACE_CONFIG.cooldownMinutes * 60; // 转为秒
                if (this.game.addEvent) {
                    this.game.addEvent(`🔥❌ ${furnace.name}因木柴耗尽而熄灭！`);
                }
                console.log(`[FurnaceSystem] ${furnace.name} 熄灭`);
            }
        }

        // 熄灭后降温
        if (!furnace.active) {
            if (furnace._coolingTimer > 0) {
                furnace._coolingTimer -= dt;
                // 温度线性降至室外温度
                const ws = this.game.weatherSystem;
                const outdoorTemp = ws ? ws.getEffectiveTemp() : 0;
                const progress = 1 - Math.max(0, furnace._coolingTimer) / (FURNACE_CONFIG.cooldownMinutes * 60);
                furnace.indoorTemp = FURNACE_CONFIG.warmTemp + (outdoorTemp - FURNACE_CONFIG.warmTemp) * progress;
            } else {
                // 完全冷却，与室外温度一致
                const ws = this.game.weatherSystem;
                furnace.indoorTemp = ws ? ws.getEffectiveTemp() : 0;
            }

            // 重新检查是否可以恢复运转（需要足够木柴 + 冷却时间已过）
            const elapsedSinceDeath = (FURNACE_CONFIG.cooldownMinutes * 60) - furnace._coolingTimer;
            const canRelight = rs && rs.woodFuel >= FURNACE_CONFIG.relightMinWood
                && elapsedSinceDeath >= FURNACE_CONFIG.relightCooldownSeconds;
            if (canRelight) {
                furnace.active = true;
                furnace._coolingTimer = 0;
                furnace.indoorTemp = FURNACE_CONFIG.warmTemp;
                if (this.game.addEvent) {
                    this.game.addEvent(`🔥✅ ${furnace.name}重新点燃！（木柴储备: ${rs.woodFuel.toFixed(1)}）`);
                }
            }
        } else {
            // 运转中，维持温度
            furnace.indoorTemp = FURNACE_CONFIG.warmTemp;
        }
    }

    /** 对暖炉范围内NPC施加温暖效果 */
    _applyWarmthEffects(dt) {
        for (const npc of this.game.npcs) {
            if (npc.isDead) continue;

            const nearFurnace = this.isNearActiveFurnace(npc);
            if (nearFurnace) {
                // 体温恢复
                if (npc.bodyTemp !== undefined) {
                    npc.bodyTemp = Math.min(36.5, npc.bodyTemp + FURNACE_CONFIG.bodyTempRecoveryRate / 60 * dt);
                }
                // 体力和健康恢复
                // 【饥饿削弱恢复】饱腹<20时体力恢复效率×0.5
                const hungerPenalty = (npc.hunger !== undefined && npc.hunger < 20) ? 0.5 : 1.0;
                // 【第3天喘息日恢复加成】暖炉旁恢复速率×1.5
                const day3Boost = (this.game._day3RecoveryBoost) ? 1.5 : 1.0;
                npc.stamina = Math.min(100, npc.stamina + FURNACE_CONFIG.staminaRecoveryRate * hungerPenalty * day3Boost * dt);
                npc.health = Math.min(100, npc.health + FURNACE_CONFIG.healthRecoveryRate * day3Boost * dt);
            }
        }
    }

    /** 拥挤判定 — 当暖炉附近人数超过容量阈值时施加惩罚 */
    _checkCrowding(dt) {
        // 统计每座暖炉范围内人数
        for (const furnace of this.furnaces) {
            if (!furnace.active) continue;
            const npcsNear = this.game.npcs.filter(n => !n.isDead && this._isInFurnaceRange(n, furnace));
            if (npcsNear.length > FURNACE_CONFIG.crowdThreshold) {
                // 拥挤！San值下降 + 冲突概率增加
                for (const npc of npcsNear) {
                    npc.sanity = Math.max(0, npc.sanity - FURNACE_CONFIG.crowdSanDrain * dt);
                }
                // 拥挤冲突概率（每秒判定一次）
                if (Math.random() < FURNACE_CONFIG.crowdConflictChance * dt) {
                    // 随机选两人触发摩擦
                    if (npcsNear.length >= 2) {
                        const a = npcsNear[Math.floor(Math.random() * npcsNear.length)];
                        let b = a;
                        while (b === a) b = npcsNear[Math.floor(Math.random() * npcsNear.length)];
                        a.sanity = Math.max(0, a.sanity - 3);
                        b.sanity = Math.max(0, b.sanity - 3);
                        if (this.game.addEvent) {
                            this.game.addEvent(`😤 ${a.name}和${b.name}因拥挤的暖炉空间发生口角（San-3）`);
                        }
                    }
                }
            }
        }
    }

    /** 检查是否满足第二暖炉修复条件（Day3解锁） */
    checkBuildCondition() {
        if (this.secondFurnaceBuilt || this.isBuildingSecondFurnace) return false;
        // Day3解锁
        const day = this.game.dayCount || this.game.weatherSystem?.currentDay || 1;
        return day >= FURNACE_CONFIG.buildUnlockDay;
    }

    /** 定期检查建造条件并通知 */
    _checkAndNotifyBuildCondition() {
        if (this.secondFurnaceBuilt || this.isBuildingSecondFurnace || this._buildConditionNotified) return;
        if (this.checkBuildCondition()) {
            this._buildConditionNotified = true;
            if (this.game.addEvent) {
                this.game.addEvent(`📢 第3天到了！可以开始修复第二暖炉！派2人去工坊劳动约2小时即可！`);
            }
        }
    }

    // ============ 第二座暖炉修建 ============

    /** 开始修建第二座暖炉（由TaskSystem调用） */
    startBuildSecondFurnace(workerIds) {
        if (this.secondFurnaceBuilt) {
            console.log('[FurnaceSystem] 第二座暖炉已建成，无需重复修复');
            return false;
        }

        // 检查Day3解锁
        if (!this.checkBuildCondition()) {
            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ 第二暖炉尚未解锁！需要等到第3天才能修复`);
            }
            return false;
        }

        // 不消耗资源，纯劳动
        this.isBuildingSecondFurnace = true;
        this.buildProgress = 0;
        this.buildWorkers = workerIds || [];

        if (this.game.addEvent) {
            this.game.addEvent(`🏗️ 开始修复第二座暖炉！预计需要2小时劳动，${this.buildWorkers.length}人参与施工`);
        }

        console.log('[FurnaceSystem] 开始修复第二暖炉，工人:', this.buildWorkers);
        return true;
    }

    /** 更新修建进度 */
    _updateBuildProgress(dt) {
        if (!this.isBuildingSecondFurnace || this.secondFurnaceBuilt) return;

        // 资源不足时自动暂停建造
        const rs = this.game.resourceSystem;
        if (rs && rs.woodFuel <= 5) {
            // 木柴太少（暖炉都快烧不起了），暂停建造
            if (!this._buildPaused) {
                this._buildPaused = true;
                if (this.game.addEvent) {
                    this.game.addEvent(`⏸️ 暖炉建造暂停——木柴储备过低，优先保暖！`);
                }
            }
            return;
        }
        if (this._buildPaused) {
            this._buildPaused = false;
            if (this.game.addEvent) {
                this.game.addEvent(`▶️ 暖炉建造继续！当前进度${Math.round(this.buildProgress * 100)}%`);
            }
        }

        // 根据工人数量计算速率（1人可建造但较慢，多人协作加速）
        const workerCount = Math.max(1, this.buildWorkers.length);
        const efficiencyMultiplier = workerCount >= 3
            ? 1 + (workerCount - 3) * 0.15
            : workerCount * 0.5; // 1人=0.5x, 2人=1.0x, 3人+=加速

        // 【修复】dt是speed-adjusted真实秒，buildTimeSeconds是游戏秒，需乘timeSpeed转换
        const gameSeconds = dt * (this.game.timeSpeed || 60);
        const progressIncrement = (gameSeconds / FURNACE_CONFIG.buildTimeSeconds) * efficiencyMultiplier;
        this.buildProgress = Math.min(1, this.buildProgress + progressIncrement);

        // 每10%进度报告一次
        const currentPct = Math.floor(this.buildProgress * 10);
        const lastPct = Math.floor(this._lastReportedProgress * 10);
        if (currentPct > lastPct && this.buildProgress < 1) {
            this._lastReportedProgress = this.buildProgress;
            if (this.game.addEvent) {
                this.game.addEvent(`🏗️ 暖炉建造进度：${Math.round(this.buildProgress * 100)}%（${workerCount}人施工中）`);
            }
        }

        // 完成
        if (this.buildProgress >= 1) {
            this._completeSecondFurnace();
        }
    }

    /** 完成第二座暖炉修建 */
    _completeSecondFurnace() {
        this.isBuildingSecondFurnace = false;
        this.secondFurnaceBuilt = true;
        this.buildProgress = 1;
        this._buildPaused = false;

        // 在宿舍B激活第二暖炉
        const newFurnace = this._createFurnace(FURNACE_LOCATIONS.dorm_b);
        this.furnaces.push(newFurnace);

        // 同步更新宿舍B地图的暖炉状态
        if (this.game.maps && this.game.maps.dorm_b) {
            this.game.maps.dorm_b.secondFurnaceBuilt = true;
        }

        if (this.game.addEvent) {
            this.game.addEvent(`🔥🎉 第二座暖炉（宿舍B）修建完成！现在有2座暖炉，NPC可以分散到两个区域取暖，拥挤惩罚消除！`);
        }

        console.log('[FurnaceSystem] 第二座暖炉修建完成！当前暖炉数:', this.furnaces.length);
    }

    // ============ 查询接口 ============

    /** 判断NPC是否在某个运转中暖炉的有效范围内 */
    isNearActiveFurnace(npc) {
        // 【修复】室内场景（宿舍、食堂、医院等）由中央暖炉供暖管道覆盖
        // 只要有任意活跃暖炉运转中，室内NPC就享受暖炉保护
        const INDOOR_SCENES = ['dorm_a', 'dorm_b', 'kitchen', 'medical', 'warehouse', 'workshop'];
        if (INDOOR_SCENES.includes(npc.currentScene)) {
            // 找到任意一座运转中的暖炉即可
            const activeFurnace = this.furnaces.find(f => f.active);
            if (activeFurnace) return activeFurnace;
        }

        for (const furnace of this.furnaces) {
            if (!furnace.active) continue;
            if (this._isInFurnaceRange(npc, furnace)) {
                return furnace;
            }
        }
        return null;
    }

    /** 判断NPC是否在暖炉范围内 */
    _isInFurnaceRange(npc, furnace) {
        // 村庄场景（主暖炉广场）：用距离判定
        if (furnace.scene === 'village' && npc.currentScene === 'village') {
            const pos = npc.getGridPos();
            const dx = Math.abs(pos.x - furnace.position.x);
            const dy = Math.abs(pos.y - furnace.position.y);
            return dx <= furnace.range && dy <= furnace.range;
        }
        // 室内场景：只要NPC在暖炉所在的室内场景中，就算在范围内
        return npc.currentScene === furnace.scene;
    }

    /** 获取运转中的暖炉数 */
    getActiveFurnaceCount() {
        return this.furnaces.filter(f => f.active).length;
    }

    /** 获取暖炉状态摘要 */
    getFurnaceSummary() {
        const active = this.getActiveFurnaceCount();
        const total = this.furnaces.length;
        let s = `暖炉${total}座(${active}运转中)`;
        if (this.isBuildingSecondFurnace) {
            s += ` | 第二暖炉修建中: ${Math.round(this.buildProgress * 100)}%`;
        }
        return s;
    }

    /** 获取NPC所在位置的室内温度 */
    getIndoorTempForNpc(npc) {
        // 【修复】室内场景（宿舍等）由中央暖炉供暖
        const INDOOR_SCENES = ['dorm_a', 'dorm_b', 'kitchen', 'medical', 'warehouse', 'workshop'];
        if (INDOOR_SCENES.includes(npc.currentScene)) {
            const activeFurnace = this.furnaces.find(f => f.active);
            if (activeFurnace) return activeFurnace.indoorTemp;
            // 没有活跃暖炉，返回室内降温后的温度（介于暖炉温度和室外之间）
            const coolingFurnace = this.furnaces.find(f => f._coolingTimer > 0);
            if (coolingFurnace) return coolingFurnace.indoorTemp;
        }

        for (const furnace of this.furnaces) {
            if (this._isInFurnaceRange(npc, furnace)) {
                return furnace.indoorTemp;
            }
        }
        // 不在任何暖炉范围内，返回室外温度
        const ws = this.game.weatherSystem;
        return ws ? ws.getEffectiveTemp() : 0;
    }

    /** 通知：燃料耗尽（由ResourceSystem调用） */
    onFuelDepleted() {
        for (const furnace of this.furnaces) {
            if (furnace.active) {
                furnace.active = false;
                furnace._coolingTimer = FURNACE_CONFIG.cooldownMinutes * 60;
            }
        }
    }

    /** 通知：电力中断（由ResourceSystem调用） */
    onPowerOut() {
        for (const furnace of this.furnaces) {
            if (furnace.active) {
                furnace.active = false;
                furnace._coolingTimer = FURNACE_CONFIG.cooldownMinutes * 60;
            }
        }
    }

    // ============ 序列化 ============

    serialize() {
        return {
            furnaces: this.furnaces.map(f => ({
                id: f.id,
                active: f.active,
                indoorTemp: f.indoorTemp,
                coolingTimer: f._coolingTimer,
            })),
            buildProgress: this.buildProgress,
            isBuildingSecondFurnace: this.isBuildingSecondFurnace,
            secondFurnaceBuilt: this.secondFurnaceBuilt,
            buildWorkers: [...this.buildWorkers],
        };
    }

    deserialize(data) {
        if (!data) return;
        this.secondFurnaceBuilt = data.secondFurnaceBuilt || false;
        this.isBuildingSecondFurnace = data.isBuildingSecondFurnace || false;
        this.buildProgress = data.buildProgress || 0;
        this.buildWorkers = data.buildWorkers || [];
        this._buildPaused = false;
        this._buildConditionNotified = false;

        // 恢复暖炉列表（兼容旧存档）
        // 旧存档可能有dorm_a暖炉，新存档初始只有1座
        if (this.secondFurnaceBuilt) {
            if (!this.furnaces.find(f => f.id === 'furnace_dorm_b')) {
                this.furnaces.push(this._createFurnace(FURNACE_LOCATIONS.dorm_b));
            }
            // 同步宿舍B地图
            if (this.game.maps && this.game.maps.dorm_b) {
                this.game.maps.dorm_b.secondFurnaceBuilt = true;
            }
        }

        // 恢复暖炉状态
        if (data.furnaces) {
            for (const saved of data.furnaces) {
                const furnace = this.furnaces.find(f => f.id === saved.id);
                if (furnace) {
                    furnace.active = saved.active;
                    furnace.indoorTemp = saved.indoorTemp;
                    furnace._coolingTimer = saved.coolingTimer || 0;
                }
            }
        }
    }
}

    GST.FurnaceSystem = FurnaceSystem;
})();
