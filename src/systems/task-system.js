/**
 * 福音镇 - TaskSystem
 * 挂载到 GST.TaskSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 任务分配系统 - NPC专长与每日任务管理
 * 管理NPC专长、每日任务生成、任务分配、完成度追踪
 * 依赖: game.js, npc.js, resource-system.js, furnace-system.js, weather-system.js
 */

// ============ 任务类型枚举 ============
const TASK_TYPES = {
    COLLECT_WOOD:     'COLLECT_WOOD',      // 收集木柴
    COLLECT_FOOD:     'COLLECT_FOOD',      // 收集食物
    MAINTAIN_POWER:   'MAINTAIN_POWER',    // 维护电力
    COLLECT_MATERIAL: 'COLLECT_MATERIAL',  // 探索废墟
    PREPARE_WARMTH:   'PREPARE_WARMTH',    // 准备御寒物资
    PREPARE_MEDICAL:  'PREPARE_MEDICAL',   // 准备医疗物资
    BOOST_MORALE:     'BOOST_MORALE',      // 鼓舞士气
    COORDINATE:       'COORDINATE',        // 统筹协调
    BUILD_FURNACE:    'BUILD_FURNACE',     // 修建暖炉
    DISTRIBUTE_FOOD:  'DISTRIBUTE_FOOD',   // 分配食物
    MAINTAIN_ORDER:   'MAINTAIN_ORDER',    // 维持秩序
    REST_RECOVER:     'REST_RECOVER',      // 休息恢复
    // ---- 新增特殊角色任务 ----
    SCOUT_RUINS:      'SCOUT_RUINS',       // 废墟侦察（歆玥）
    // CRAFT_MEDICINE已合并到PREPARE_MEDICAL
    // SET_TRAP已移除（v4.6: 效果太弱不值得浪费人力）
    // REPAIR_RADIO已移除（v4.5: 性价比太低，浪费资源）
    BUILD_GENERATOR:  'BUILD_GENERATOR',   // 建造自动发电机
    BUILD_LUMBER_MILL:'BUILD_LUMBER_MILL',  // 建造自动伐木机
};

// ============ 任务详情配置 ============
const TASK_DETAILS = {
    [TASK_TYPES.COLLECT_WOOD]: {
        name: '🪵 收集木柴',
        desc: '前往伐木场砍伐枯树收集木柴',
        isOutdoor: true,
        baseYield: 10,
        baseDuration: 1800,
        staminaCost: 15,
        targetLocation: 'lumber_camp',
        resourceType: 'woodFuel',
    },
    [TASK_TYPES.COLLECT_FOOD]: {
        name: '🍞 收集食物',
        desc: '前往冰湖捕鱼或从废墟中搜索罐头',
        isOutdoor: true,
        baseYield: 8,
        baseDuration: 1800,
        staminaCost: 12,
        targetLocation: 'frozen_lake',
        resourceType: 'food',
    },
    [TASK_TYPES.MAINTAIN_POWER]: {
        name: '⚡ 维护电力',
        desc: '在工坊检修发电机、储备燃油，维持电力供应',
        isOutdoor: false,
        baseYield: 15,
        baseDuration: 2400,
        staminaCost: 10,
        targetLocation: 'workshop_door',
        resourceType: 'power',
    },
    [TASK_TYPES.COLLECT_MATERIAL]: {
        name: '🔍 探索废墟',
        desc: '前往废墟探索，可能发现食物、药品、零件等物资（每天限3次）',
        isOutdoor: true,
        baseYield: 1,
        baseDuration: 3600,
        staminaCost: 18,
        targetLocation: 'ruins_site',
        resourceType: 'explore',
    },
    [TASK_TYPES.PREPARE_WARMTH]: {
        name: '🧥 准备御寒物资',
        desc: '在仓库准备毛毯、厚衣服等御寒物资',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 1800,
        staminaCost: 8,
        targetLocation: 'warehouse_door',
        resourceType: null,
    },
    [TASK_TYPES.PREPARE_MEDICAL]: {
        name: '💊 医疗救治',
        desc: '在医疗站治疗伤患、制作急救包',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 1800,
        staminaCost: 5,
        targetLocation: 'medical_door',
        resourceType: null,
    },
    [TASK_TYPES.BOOST_MORALE]: {
        name: '🎵 鼓舞士气',
        desc: '在暖炉广场通过唱歌、鼓励来提振全员士气',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 1800,
        staminaCost: 8,
        targetLocation: 'furnace_plaza',
        resourceType: null,
    },
    [TASK_TYPES.COORDINATE]: {
        name: '📢 统筹协调',
        desc: '在暖炉广场安抚居民情绪、监督任务进度、制定计划',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 3600,
        staminaCost: 5,
        targetLocation: 'furnace_plaza',
        resourceType: null,
    },
    [TASK_TYPES.BUILD_FURNACE]: {
        name: '🏗️ 修建第二暖炉',
        desc: '在工坊修建第二座暖炉，需多人协作',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 7200,
        staminaCost: 25,
        targetLocation: 'workshop_door',
        resourceType: null,
    },
    // MAINTAIN_FURNACE已移除（v4.6: 暖炉自动燃烧消耗木柴，无需人工维护）
    [TASK_TYPES.DISTRIBUTE_FOOD]: {
        name: '🍲 分配食物',
        desc: '在炊事房合理加工分配食物给全员',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 1200,
        staminaCost: 3,
        targetLocation: 'kitchen_door',
        resourceType: null,
    },
    [TASK_TYPES.MAINTAIN_ORDER]: {
        name: '🛡️ 维持秩序',
        desc: '在暖炉广场安抚情绪、调解冲突、维持团队秩序',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 3600,
        staminaCost: 5,
        targetLocation: 'furnace_plaza',
        resourceType: null,
    },
    [TASK_TYPES.REST_RECOVER]: {
        name: '🛏️ 休息恢复',
        desc: '在暖炉旁休息恢复体力和健康',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 3600,
        staminaCost: 0,
        targetLocation: 'furnace_plaza',
        resourceType: null,
    },
    // ---- 新增特殊任务 ----
    [TASK_TYPES.SCOUT_RUINS]: {
        name: '🔍 废墟侦察',
        desc: '歆玥深入废墟区域侦察搜索稀有物资',
        isOutdoor: true,
        baseYield: 5,
        baseDuration: 2400,
        staminaCost: 20,
        targetLocation: 'ruins_site',
        resourceType: null, // 特殊产出在_applyTaskEffect中处理
    },

    // SET_TRAP已移除（v4.6: 效果太弱不值得浪费人力）
    // REPAIR_RADIO已移除（v4.5）
    [TASK_TYPES.BUILD_GENERATOR]: {
        name: '⚡ 建造自动发电机',
        desc: '在工坊建造自动发电机，建成后自动产电24/h（消耗木柴2/h，有概率故障需维修）',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 14400,
        staminaCost: 20,
        targetLocation: 'workshop_door',
        resourceType: null,
    },
    [TASK_TYPES.BUILD_LUMBER_MILL]: {
        name: '🪵 建造自动伐木机',
        desc: '在工坊建造自动伐木机，建成后自动产柴30/h（消耗电力3/h，有概率故障需维修）',
        isOutdoor: false,
        baseYield: 0,
        baseDuration: 21600,
        staminaCost: 25,
        targetLocation: 'workshop_door',
        resourceType: null,
    },
};

// ============ NPC专长配置（末日生存） ============
const NPC_SPECIALTIES = {
    'zhao_chef': {
        name: '伐木/搬运专长',
        desc: '砍柴×1.5、搬运×1.5、食物采集×1.3、机器建造×1.3',
        bonuses: {
            [TASK_TYPES.COLLECT_WOOD]: 1.5,
            [TASK_TYPES.COLLECT_MATERIAL]: 1.3,
            [TASK_TYPES.BUILD_FURNACE]: 1.3,
            [TASK_TYPES.BUILD_GENERATOR]: 1.3,
            [TASK_TYPES.BUILD_LUMBER_MILL]: 1.3,
            [TASK_TYPES.COLLECT_FOOD]: 1.3,
        },
    },
    'lu_chen': {
        name: '采集/建造专长',
        desc: '采集×1.3、食物采集×1.3、建造×1.3、耐寒体温下降×0.7',
        bonuses: {
            [TASK_TYPES.COLLECT_MATERIAL]: 1.5,
            [TASK_TYPES.COLLECT_FOOD]: 1.3,
            [TASK_TYPES.BUILD_FURNACE]: 1.3,
            [TASK_TYPES.BUILD_GENERATOR]: 1.2,
            [TASK_TYPES.BUILD_LUMBER_MILL]: 1.2,
            [TASK_TYPES.COLLECT_WOOD]: 1.3,
        },
    },
    'li_shen': {
        name: '物资管理/炊事专长',
        desc: '食物加工×2、物资盘点减浪费-20%、分配公平',
        bonuses: {
            [TASK_TYPES.DISTRIBUTE_FOOD]: 2.0,
            [TASK_TYPES.COLLECT_FOOD]: 1.5,
            [TASK_TYPES.PREPARE_WARMTH]: 1.5,
            [TASK_TYPES.PREPARE_MEDICAL]: 1.2,
        },
        wasteReduction: 0.20,
    },
    'wang_teacher': {
        name: '技师/规划专长',
        desc: '发电机维修×2、暖炉扩建×1.5、机器建造×1.5、全队规划+10%',
        bonuses: {
            [TASK_TYPES.MAINTAIN_POWER]: 2.0,
            [TASK_TYPES.BUILD_FURNACE]: 1.5,
            [TASK_TYPES.BUILD_GENERATOR]: 1.5,
            [TASK_TYPES.BUILD_LUMBER_MILL]: 1.5,
            [TASK_TYPES.COORDINATE]: 1.5,
        },
        teamBonus: 0.1,
    },
    'old_qian': {
        name: '领导力/精神支柱专长',
        desc: '调解冲突×2、安抚效果×2、经验判断预警',
        bonuses: {
            [TASK_TYPES.MAINTAIN_ORDER]: 2.0,
            [TASK_TYPES.COORDINATE]: 2.0,
            [TASK_TYPES.BOOST_MORALE]: 1.5,
        },
    },
    'su_doctor': {
        name: '医疗专长',
        desc: '治疗冻伤×2、失温救治+50%、心理疏导San恢复×1.5',
        bonuses: {
            [TASK_TYPES.PREPARE_MEDICAL]: 2.0,
            [TASK_TYPES.REST_RECOVER]: 1.5,
            [TASK_TYPES.BOOST_MORALE]: 1.2,
        },
    },
    'ling_yue': {
        name: '侦察/急救/士气专长',
        desc: '废墟侦察稀有物资×2、急救×1.5、士气恢复×1.3',
        bonuses: {
            [TASK_TYPES.SCOUT_RUINS]: 2.0,
            [TASK_TYPES.PREPARE_MEDICAL]: 1.5,
            [TASK_TYPES.BOOST_MORALE]: 1.3,
            [TASK_TYPES.COLLECT_MATERIAL]: 1.3,
        },
    },
    'qing_xuan': {
        name: '药剂/急救专长',
        desc: '医疗救治×1.5、草药制剂×1.3、学习他人技能×0.7',
        bonuses: {
            [TASK_TYPES.PREPARE_MEDICAL]: 1.5,
            [TASK_TYPES.BOOST_MORALE]: 1.1,
        },
        learnMultiplier: 0.7,
    },
};

// ============ 统一场景Key常量表 ============
const SCENE_KEYS = {
    // 主地图
    VILLAGE: 'village',
    // 室内场景（与 game.maps 中的 key 一致）
    DORM_A: 'dorm_a',
    DORM_B: 'dorm_b',
    MEDICAL: 'medical',
    WAREHOUSE: 'warehouse',
    WORKSHOP: 'workshop',
    KITCHEN: 'kitchen',
    // 户外采集区域ID（用于坐标区域判定，非 currentScene 值）
    LUMBER_CAMP: 'lumber_camp',
    FROZEN_LAKE: 'frozen_lake',
    RUINS_SITE: 'ruins_site',
    ORE_PILE: 'ore_pile',
    // 特殊位置
    FURNACE_PLAZA: 'furnace_plaza',
    NORTH_GATE: 'north_gate',
    SOUTH_GATE: 'south_gate',
};

// ============ 采集速率常量表（每游戏小时产出量）============
// 【v2.0重新平衡】基于需求文档数值推演：
//   木柴：2人×8单位/h×8h=128单位 > 第1天1暖炉60单位消耗 ✓
//   食物：2人×5单位/h×6h=60单位 > 24单位/天消耗 ✓
//   电力：1人×12单位/h×6h=72单位 ≈ 72单位/天消耗 ✓
//   废墟：探索（随机奖励，每天限3次） ✓
const GATHER_RATES = {
    woodFuel: 8,     // 木柴：8单位/小时，伐木场
    food: 5,         // 食物：5单位/小时，冰湖
    power: 12,       // 电力：12单位/小时，工坊/矿渣堆
};

// 户外采集区域坐标范围定义（与 VillageMap.resourceAreas 一致）
const GATHER_OUTDOOR_AREAS = [
    { id: SCENE_KEYS.LUMBER_CAMP, resourceType: 'woodFuel', x: 2, y: 2, w: 8, h: 6 },   // 伐木场
    { id: SCENE_KEYS.FROZEN_LAKE, resourceType: 'food',     x: 2, y: 32, w: 8, h: 6 },  // 冰湖
    { id: SCENE_KEYS.RUINS_SITE,  resourceType: 'explore',   x: 38, y: 2, w: 10, h: 6 }, // 废墟探索点
    { id: SCENE_KEYS.ORE_PILE,    resourceType: 'power',     x: 38, y: 32, w: 10, h: 6 },// 矿渣堆
];

// 室内采集区域映射（currentScene直接匹配）
const GATHER_INDOOR_MAP = {
    [SCENE_KEYS.WORKSHOP]: 'power',      // 工坊 -> 电力
};

// 【兼容】旧的 GATHER_LOCATION_MAP（保留给外部引用）
const GATHER_LOCATION_MAP = {
    'lumber_camp': 'woodFuel',
    'frozen_lake': 'food',
    'ruins_site': 'explore',
    'ore_pile': 'power',
    'workshop': 'power',
};

// 采集所需最低体力
const GATHER_MIN_STAMINA = {
    woodFuel: 20,
    food: 15,
    explore: 20,
    power: 10,
};

// 资源类型Emoji映射
const RESOURCE_EMOJI = {
    woodFuel: '🪵',
    food: '🍞',
    explore: '🔍',
    power: '⚡',
};

class TaskSystem {
    constructor(game) {
        this.game = game;

        // 当前天的任务清单
        this.dailyTasks = [];      // [{id, type, name, desc, target(目标量), progress, assignedNpcId, status, priority}]
        this.taskIdCounter = 0;

        // NPC任务分配映射 { npcId: taskId }
        this.npcAssignments = {};

        // NPC当前任务执行状态 { npcId: { taskId, startTime, workTime, paused, pauseReason } }
        this.npcTaskState = {};

        // 任务完成历史
        this.completedTasks = [];

        // 未完成任务日志
        this.unfinishedTaskLog = [];

        // 系统tick计时
        this._tick = 0;

        // 当天是否已生成任务
        this._taskGeneratedForDay = -1;

        // 全队效率加成（由王老师统筹专长提供）
        this._teamEfficiencyBonus = 0;

        console.log('[TaskSystem] 初始化完成');
    }

    // ============ 每日任务生成 ============

    /** 当天数切换时调用 */
    onDayChange(day) {
        // 记录上一天未完成任务
        this._logUnfinishedTasks(day - 1);

        // 生成新一天的任务
        this._generateDailyTasks(day);
    }

    /** 根据当天配置生成任务清单 */
    _generateDailyTasks(day) {
        if (this._taskGeneratedForDay === day) return;
        this._taskGeneratedForDay = day;

        this.dailyTasks = [];
        this.npcAssignments = {};
        this.npcTaskState = {};

        const rs = this.game.resourceSystem;
        const fs = this.game.furnaceSystem;
        const ws = this.game.weatherSystem;
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);

        // 计算王老师统筹加成
        this._teamEfficiencyBonus = 0;
        const wangTeacher = aliveNpcs.find(n => n.id === 'wang_teacher');
        if (wangTeacher && NPC_SPECIALTIES['wang_teacher'].teamBonus) {
            this._teamEfficiencyBonus = NPC_SPECIALTIES['wang_teacher'].teamBonus;
        }

        // 【智能分工系统】优先使用workPlan，否则走硬编码路径
        let usedWorkPlan = false;
        if (this.game.reincarnationSystem) {
            const holder = this.game.reincarnationSystem.getWorkPlanHolder();
            if (holder && holder.workPlan && holder.workPlan.dayPlans && holder.workPlan.dayPlans[day]) {
                this._generateTasksFromWorkPlan(holder.workPlan, day, rs, fs, aliveNpcs);
                usedWorkPlan = true;
                console.log(`[TaskSystem] 第${day}天使用workPlan生成任务(策略:${holder.workPlan.strategy})`);
            }
        }
        if (!usedWorkPlan) {
            switch (day) {
                case 1: this._generateDay1Tasks(rs, fs, aliveNpcs); break;
                case 2: this._generateDay2Tasks(rs, fs, aliveNpcs); break;
                case 3: this._generateDay3Tasks(rs, fs, aliveNpcs); break;
                case 4: this._generateDay4Tasks(rs, fs, aliveNpcs); break;
            }
        }

        // 分配任务给NPC
        this._assignTasks(aliveNpcs);
        this._activateDailyTaskNavigation(aliveNpcs);  // 驱动NPC走向任务目标

        // 【轮回系统】未使用workPlan时才走旧的优化路径
        if (!usedWorkPlan) {
            this._applyReincarnationTaskBoost(day);
        }

        // 广播任务清单 — 详细显示分工方案，让玩家看到决策协调过程
        if (this.game.addEvent) {
            const strategyLabel = usedWorkPlan ? `策略:${this.game.reincarnationSystem && this.game.reincarnationSystem.getWorkPlanHolder() && this.game.reincarnationSystem.getWorkPlanHolder().workPlan ? this.game.reincarnationSystem.getWorkPlanHolder().workPlan.strategy || '轮回优化' : '默认'}` : '默认分工';
            this.game.addEvent(`\n📋━━━ 第${day}天分工方案（${strategyLabel}）━━━`);
            
            // 按NPC分组显示任务
            const tasksByNpc = {};
            for (const task of this.dailyTasks) {
                const npcId = task.assignedNpcId || 'unassigned';
                if (!tasksByNpc[npcId]) tasksByNpc[npcId] = [];
                tasksByNpc[npcId].push(task);
            }
            
            const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
            const roleEmoji = { zhao_chef: '👨‍🍳', lu_chen: '💪', li_shen: '👩‍🍳', wang_teacher: '👨‍🏫', old_qian: '👴', su_doctor: '👨‍⚕️', ling_yue: '🔍', qing_xuan: '🧪' };
            
            for (const [npcId, tasks] of Object.entries(tasksByNpc)) {
                if (npcId === 'unassigned') continue;
                const name = nameMap[npcId] || npcId;
                const emoji = roleEmoji[npcId] || '👤';
                const taskStr = tasks.map(t => `${t.name}(目标:${t.target})`).join(' + ');
                const npc = aliveNpcs.find(n => n.id === npcId);
                const staminaStr = npc ? `体力:${Math.round(npc.stamina)}` : '';
                this.game.addEvent(`  ${emoji} ${name}: ${taskStr} ${staminaStr}`);
            }
            
            // 显示未分配任务
            if (tasksByNpc['unassigned']) {
                for (const task of tasksByNpc['unassigned']) {
                    this.game.addEvent(`  ❓ 待分配: ${task.name}`);
                }
            }
            this.game.addEvent(`📋━━━ 共${this.dailyTasks.length}项任务，${aliveNpcs.length}人存活 ━━━\n`);

            // 【v4.16】分工方案已由右上角常驻面板(#work-plan-panel)实时显示，不再写入决策动态面板
        }

        console.log(`[TaskSystem] 第${day}天任务生成:`, this.dailyTasks.map(t => `${t.name}→${t.assignedNpcId}`));
    }

    /** 第1天（0°C准备日）任务 */
    _generateDay1Tasks(rs, fs, npcs) {
        // 大量收集木柴 — 赵铁柱
        this._addTask(TASK_TYPES.COLLECT_WOOD, 50, 'urgent', 'zhao_chef');
        // 砍柴 — 陆辰（年轻力壮）
        this._addTask(TASK_TYPES.COLLECT_WOOD, 40, 'urgent', 'lu_chen');
        // 采集食物 — 陆辰(次要轮换)
        this._addTask(TASK_TYPES.COLLECT_FOOD, 30, 'high', 'lu_chen');
        // 物资管理+分配食物 — 李婶
        this._addTask(TASK_TYPES.COLLECT_FOOD, 40, 'urgent', 'li_shen');
        this._addTask(TASK_TYPES.DISTRIBUTE_FOOD, 1, 'high', 'li_shen');
        // 建造自动发电机 — 王策（工程师优先建设自动化设施）
        this._addTask(TASK_TYPES.BUILD_GENERATOR, 1, 'urgent', 'wang_teacher');
        // 维护电力+暖炉方案 — 王策（建完发电机后维护）
        this._addTask(TASK_TYPES.MAINTAIN_POWER, 30, 'high', 'wang_teacher');
        // 准备医疗物资 — 苏岩
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'high', 'su_doctor');
        // 统筹协调 — 老钱
        this._addTask(TASK_TYPES.COORDINATE, 1, 'normal', 'old_qian');
        this._addTask(TASK_TYPES.MAINTAIN_ORDER, 1, 'normal', 'old_qian');
        // 废墟侦察 — 歆玥
        this._addTask(TASK_TYPES.SCOUT_RUINS, 1, 'high', 'ling_yue');
        this._addTask(TASK_TYPES.BOOST_MORALE, 1, 'normal', 'ling_yue');
        // 建造自动伐木机 — 清璇（发电机就绪后尽快建设伐木机形成循环）
        this._addTask(TASK_TYPES.BUILD_LUMBER_MILL, 1, 'high', 'qing_xuan');
        // 医疗 — 清璇
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'high', 'qing_xuan');
        // 准备御寒
        this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'normal', 'li_shen');
    }

    /** 第2天（-30°C大雪天）任务 — 户外限制2小时 */
    _generateDay2Tasks(rs, fs, npcs) {
        const woodNeeded = Math.max(0, 80 - (rs ? rs.woodFuel : 0));
        const foodNeeded = Math.max(0, 40 - (rs ? rs.food : 0));

        // 冒险外出砍柴 — 赵铁柱
        if (woodNeeded > 10) {
            this._addTask(TASK_TYPES.COLLECT_WOOD, Math.min(30, woodNeeded), 'urgent', 'zhao_chef');
        }
        // 冒险外出采集 — 陆辰
        if (foodNeeded > 8) {
            this._addTask(TASK_TYPES.COLLECT_FOOD, Math.min(20, foodNeeded), 'high', 'lu_chen');
        }

        // 室内搬运木柴 — 赵铁柱(室内协助)
        this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'urgent', 'zhao_chef');
        // 维护电力 — 王策
        this._addTask(TASK_TYPES.MAINTAIN_POWER, 20, 'high', 'wang_teacher');
        // 分配食物 — 李婶
        this._addTask(TASK_TYPES.DISTRIBUTE_FOOD, 1, 'urgent', 'li_shen');
        this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'high', 'li_shen');
        // 医疗待命 — 苏岩
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'urgent', 'su_doctor');
        // 安抚情绪 — 老钱
        this._addTask(TASK_TYPES.MAINTAIN_ORDER, 1, 'urgent', 'old_qian');
        // 侦察+鼓舞 — 歆玥（短时外出侦察后鼓舞）
        this._addTask(TASK_TYPES.SCOUT_RUINS, 1, 'high', 'ling_yue');
        this._addTask(TASK_TYPES.BOOST_MORALE, 1, 'high', 'ling_yue');
        // 医疗+无线电 — 清璇
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'high', 'qing_xuan');
    }

    /** 第3天（0°C喘息日）任务 — 重点修建第二暖炉 */
    _generateDay3Tasks(rs, fs, npcs) {
        // 【v2.0-需求10】第3天是为第4天做准备的关键日
        // 计算第4天所需物资（-60°C暴风雪，消耗×2.0）
        const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.furnaces.length : 1;
        const day4WoodNeeded = Math.round(2.5 * furnaceCount * 24 * 2.0); // 2.5/h × 暖炉数 × 24h × 2.0倍
        const day4FoodNeeded = Math.round(npcs.length * 1.5 * 2); // 人数×1.5×2餐
        const day4PowerNeeded = Math.round(3 * 24 * 1.5); // 3/h × 24h × 1.5倍

        const woodDeficit = Math.max(0, day4WoodNeeded - (rs ? rs.woodFuel : 0));
        const foodDeficit = Math.max(0, day4FoodNeeded - (rs ? rs.food : 0));
        const powerDeficit = Math.max(0, day4PowerNeeded - (rs ? rs.power : 0));

        // 广播第4天准备清单
        if (this.game.addEvent) {
            this.game.addEvent(`📋 第3天——为明天极寒暴风雪做准备！`);
            this.game.addEvent(`  🪵 木柴: 需${day4WoodNeeded}单位，当前${Math.round(rs ? rs.woodFuel : 0)}${woodDeficit > 0 ? `（缺${woodDeficit}❌）` : '✅'}`);
            this.game.addEvent(`  🍞 食物: 需${day4FoodNeeded}单位，当前${Math.round(rs ? rs.food : 0)}${foodDeficit > 0 ? `（缺${foodDeficit}❌）` : '✅'}`);
            this.game.addEvent(`  ⚡ 电力: 需${day4PowerNeeded}单位，当前${Math.round(rs ? rs.power : 0)}${powerDeficit > 0 ? `（缺${powerDeficit}❌）` : '✅'}`);
        }

        // 重点：修建第二暖炉 — 赵铁柱+陆辰+王策
        if (fs && !fs.secondFurnaceBuilt && !fs.isBuildingSecondFurnace) {
            this._addTask(TASK_TYPES.BUILD_FURNACE, 1, 'urgent', 'zhao_chef');
            this._addTask(TASK_TYPES.BUILD_FURNACE, 1, 'urgent', 'lu_chen');
            this._addTask(TASK_TYPES.BUILD_FURNACE, 1, 'urgent', 'wang_teacher');
        }

        // 补充木柴 — 缺口越大优先级越高
        if (woodDeficit > 0) {
            const woodPriority = woodDeficit > 50 ? 'urgent' : 'high';
            this._addTask(TASK_TYPES.COLLECT_WOOD, Math.min(60, woodDeficit), woodPriority, 'zhao_chef');
            // 缺口大时增派陆辰也去砍柴
            if (woodDeficit > 30) {
                this._addTask(TASK_TYPES.COLLECT_WOOD, Math.min(30, woodDeficit - 30), woodPriority, 'lu_chen');
            }
        }

        // 补充食物
        if (foodDeficit > 0) {
            const foodPriority = foodDeficit > 15 ? 'urgent' : 'high';
            this._addTask(TASK_TYPES.COLLECT_FOOD, Math.min(30, foodDeficit), foodPriority, 'lu_chen');
        }

        // 维护电力 — 王策（缺口大时提升优先级）
        const powerPriority = powerDeficit > 30 ? 'urgent' : 'high';
        this._addTask(TASK_TYPES.MAINTAIN_POWER, Math.max(20, Math.min(40, powerDeficit)), powerPriority, 'wang_teacher');
        // 分配食物+物资整理 — 李婶
        this._addTask(TASK_TYPES.DISTRIBUTE_FOOD, 1, 'high', 'li_shen');
        // 医疗 — 苏岩
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'high', 'su_doctor');
        // 统筹 — 老钱
        this._addTask(TASK_TYPES.COORDINATE, 1, 'normal', 'old_qian');
        // 最后一次侦察 — 歆玥
        this._addTask(TASK_TYPES.SCOUT_RUINS, 1, 'high', 'ling_yue');
        this._addTask(TASK_TYPES.BOOST_MORALE, 1, 'normal', 'ling_yue');
        // 医疗 — 清璇
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'urgent', 'qing_xuan');
    }

    /** 第4天（-60°C大极寒）任务 — 全部室内 */
    _generateDay4Tasks(rs, fs, npcs) {
        // 严禁外出！所有任务均为室内

        // 室内准备御寒 — 赵铁柱+陆辰
        this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'urgent', 'zhao_chef');
        this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'urgent', 'lu_chen');
        // 分配食物 — 李婶
        this._addTask(TASK_TYPES.DISTRIBUTE_FOOD, 1, 'urgent', 'li_shen');
        // 维护电力 — 王策
        this._addTask(TASK_TYPES.MAINTAIN_POWER, 1, 'urgent', 'wang_teacher');
        // 维持秩序 — 老钱
        this._addTask(TASK_TYPES.MAINTAIN_ORDER, 1, 'urgent', 'old_qian');
        // 医疗待命 — 苏岩
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'urgent', 'su_doctor');
        // 鼓舞士气 — 歆玥
        this._addTask(TASK_TYPES.BOOST_MORALE, 1, 'urgent', 'ling_yue');
        // 医疗+辅助 — 清璇
        this._addTask(TASK_TYPES.PREPARE_MEDICAL, 1, 'high', 'qing_xuan');
    }

    // ============ 【智能分工系统】从workPlan生成任务 ============

    /** 根据workPlan的分工方案生成当天任务 */
    _generateTasksFromWorkPlan(workPlan, day, rs, fs, aliveNpcs) {
        const dayPlan = workPlan.dayPlans[day];
        if (!dayPlan || dayPlan.length === 0) return;

        const aliveIds = new Set(aliveNpcs.map(n => n.id));

        // 根据workPlan中每个NPC的分配生成任务
        for (const assignment of dayPlan) {
            const npcId = assignment.npcId;
            // 如果该NPC已死亡，跳过（后面由reassign处理）
            if (!aliveIds.has(npcId)) continue;

            const taskType = assignment.task;
            if (!TASK_DETAILS[taskType]) continue;

            // 确定任务目标量
            let target = assignment.target || 1;
            const detail = TASK_DETAILS[taskType];
            if (detail && detail.resourceType && target <= 1) {
                target = this._calcResourceTarget(taskType, rs, fs, day);
            }

            // 确定优先级
            let priority = assignment.priority || 'high';
            if (day === 4) priority = 'urgent';

            this._addTask(taskType, target, priority, npcId);
        }

        // 为已死亡NPC的任务重分配给存活NPC
        const deadAssignments = dayPlan.filter(a => !aliveIds.has(a.npcId));
        for (const deadA of deadAssignments) {
            const taskType = deadA.task;
            if (!TASK_DETAILS[taskType]) continue;

            const target = deadA.target || this._calcResourceTarget(taskType, rs, fs, day);
            const bestNpc = this._findBestNpcForTask(taskType, aliveNpcs);
            if (bestNpc) {
                this._addTask(taskType, target, 'high', bestNpc.id);
                console.log(`[TaskSystem-WorkPlan] 死者${deadA.npcId}的任务${taskType}重分配给${bestNpc.name}`);
            }
        }
    }

    /** 根据任务类型和当前资源计算合理的目标量 */
    _calcResourceTarget(taskType, rs, fs, day) {
        switch (taskType) {
            case TASK_TYPES.COLLECT_WOOD: {
                if (!rs) return 50;
                const needed = day === 1 ? 80 : day === 3 ? 60 : 30;
                return Math.max(10, needed - Math.round(rs.woodFuel * 0.3));
            }
            case TASK_TYPES.COLLECT_FOOD: {
                if (!rs) return 40;
                const needed = day === 1 ? 50 : 30;
                return Math.max(10, needed - Math.round(rs.food * 0.3));
            }
            case TASK_TYPES.COLLECT_MATERIAL: {
                // 废墟探索任务，固定优先级
                return 30;
            }
            case TASK_TYPES.MAINTAIN_POWER: {
                if (!rs) return 30;
                return Math.max(10, 30 - Math.round(rs.power * 0.2));
            }
            default: return 1;
        }
    }

    /** 为特定任务类型找到最佳NPC（按专长匹配+体力排序） */
    _findBestNpcForTask(taskType, aliveNpcs) {
        const urgentAssignedNpcIds = new Set(
            this.dailyTasks.filter(t => t.priority === 'urgent' && t.assignedNpcId)
                .map(t => t.assignedNpcId)
        );

        const candidates = aliveNpcs.filter(n =>
            !n.isDead && !urgentAssignedNpcIds.has(n.id)
        );

        if (candidates.length === 0) return aliveNpcs.find(n => !n.isDead) || null;

        candidates.sort((a, b) => {
            const specA = NPC_SPECIALTIES[a.id];
            const specB = NPC_SPECIALTIES[b.id];
            const multA = (specA && specA.bonuses && specA.bonuses[taskType]) || 1.0;
            const multB = (specB && specB.bonuses && specB.bonuses[taskType]) || 1.0;
            if (multA !== multB) return multB - multA;
            return b.stamina - a.stamina;
        });

        return candidates[0];
    }

    // ============ 【任务8】动态任务重分配 ============

    /** NPC死亡时重分配其未完成任务 */
    reassignDeadNpcTasks(deadNpcId) {
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);
        if (aliveNpcs.length === 0) return;

        const deadTasks = this.dailyTasks.filter(
            t => t.assignedNpcId === deadNpcId && t.status !== 'completed'
        );
        if (deadTasks.length === 0) return;

        for (const task of deadTasks) {
            task.status = 'failed';
            const remaining = task.target - task.progress;
            if (remaining <= 0) continue;

            const bestNpc = this._findBestNpcForTask(task.type, aliveNpcs);
            if (bestNpc) {
                const newTaskId = this._addTask(task.type, Math.ceil(remaining), task.priority, bestNpc.id);
                this.npcAssignments[bestNpc.id] = newTaskId;

                if (this.game.addEvent) {
                    const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
                    this.game.addEvent(`🔄 ${nameMap[deadNpcId] || deadNpcId}的未完成任务「${task.name}」已转交给${bestNpc.name}`);
                }
                console.log(`[TaskSystem] 死者${deadNpcId}的任务${task.name}重分配给${bestNpc.name}`);
            }
        }

        delete this.npcAssignments[deadNpcId];
        delete this.npcTaskState[deadNpcId];
    }

    /** 天气变化时将户外NPC任务转为室内 */
    onWeatherEmergency(weatherType) {
        if (weatherType !== 'blizzard') return;

        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);
        for (const task of this.dailyTasks) {
            if (task.status === 'completed' || !task.isOutdoor) continue;

            const npc = aliveNpcs.find(n => n.id === task.assignedNpcId);
            if (!npc) continue;

            task.status = 'failed';
            const newTaskId = this._addTask(TASK_TYPES.PREPARE_WARMTH, 1, 'urgent', npc.id);
            this.npcAssignments[npc.id] = newTaskId;

            if (this.game.addEvent) {
                this.game.addEvent(`🌨️ 暴风雪！${npc.name}的户外任务「${task.name}」已取消，转为室内准备御寒物资`);
            }
        }

        // 更新workPlan摘要
        if (this.game.reincarnationSystem) {
            const holder = this.game.reincarnationSystem.getWorkPlanHolder();
            if (holder && holder.workPlan) {
                holder.workPlan.workPlanSummary += '(暴风雪:户外→室内)';
            }
        }
    }

    /** 添加任务到清单 */
    _addTask(type, target, priority, preferredNpcId) {
        const detail = TASK_DETAILS[type];
        if (!detail) return;

        const taskId = `task_${++this.taskIdCounter}`;
        this.dailyTasks.push({
            id: taskId,
            type: type,
            name: detail.name,
            desc: detail.desc,
            target: target,
            progress: 0,
            assignedNpcId: preferredNpcId || null,
            status: 'pending',  // pending | in_progress | completed | failed
            priority: priority, // urgent | high | normal | low
            isOutdoor: detail.isOutdoor,
            startTime: null,
            completedTime: null,
        });
        return taskId;
    }

    // ============ 任务分配 ============

    /** 分配任务给NPC */
    _assignTasks(aliveNpcs) {
        for (const task of this.dailyTasks) {
            if (task.assignedNpcId) {
                // 已有指定NPC，检查是否存活
                const npc = aliveNpcs.find(n => n.id === task.assignedNpcId);
                if (!npc) {
                    // NPC已死亡，重新分配
                    task.assignedNpcId = this._findBestNpc(task, aliveNpcs);
                }
                this.npcAssignments[task.assignedNpcId] = task.id;
            } else {
                task.assignedNpcId = this._findBestNpc(task, aliveNpcs);
                if (task.assignedNpcId) {
                    this.npcAssignments[task.assignedNpcId] = task.id;
                }
            }
        }
    }

    /**
     * 将每日任务分配转化为NPC导航指令
     * 桥接 _assignTasks（静态映射）与 NPC 物理移动
     * Council 投票结果会在之后覆盖（后调用的 activateTaskOverride 替换前一个）
     */
    _activateDailyTaskNavigation(aliveNpcs) {
        for (const npc of aliveNpcs) {
            const taskId = this.npcAssignments[npc.id];
            if (!taskId) continue;
            const task = this.dailyTasks.find(t => t.id === taskId);
            if (!task || task.status === 'completed') continue;
            const detail = TASK_DETAILS[task.type];
            if (!detail || !detail.targetLocation) continue;
            // 不覆盖已有的 active taskOverride（council决议优先）
            if (npc._taskOverride && npc._taskOverride.isActive) continue;
            // 体力/健康过低的NPC不派出去
            if (npc.stamina < 30 || npc.health < 30) continue;
            npc.activateTaskOverride(taskId, detail.targetLocation, task.priority || 'normal', detail.resourceType || null, detail.name);
            console.log(`[TaskSystem] 每日任务导航：${npc.name} → ${detail.name} → ${detail.targetLocation}`);
        }
    }

    /** 为任务找到最佳NPC */
    _findBestNpc(task, aliveNpcs) {
        // 找还没被分配任务的NPC
        const unassigned = aliveNpcs.filter(n => !this.npcAssignments[n.id]);
        if (unassigned.length === 0) return null;

        // 按专长匹配度排序
        let best = null;
        let bestScore = -1;
        for (const npc of unassigned) {
            let score = 0;
            const spec = NPC_SPECIALTIES[npc.id];
            if (spec && spec.bonuses && spec.bonuses[task.type]) {
                score += spec.bonuses[task.type] * 10;
            }
            // 户外任务优先体力高的
            if (task.isOutdoor) {
                score += npc.stamina / 10;
                score += npc.health / 20;
            }
            if (score > bestScore) {
                bestScore = score;
                best = npc;
            }
        }
        return best ? best.id : unassigned[0].id;
    }

    // ============ 主更新循环 ============

    /** 在game.update()中调用 */
    update(gameDt) {
        this._tick += gameDt;
        if (this._tick < 1.0) return;
        const dt = this._tick;
        this._tick = 0;

        // 更新每个NPC的任务执行
        for (const npc of this.game.npcs) {
            if (npc.isDead) continue;
            this._updateNpcTask(npc, dt);
            // 【新增】持续驻留产出系统
            this._updateGathering(npc, dt);
        }

        // 【任务8】资源紧急任务自动分配（每2秒检查一次）
        if (!this._urgencyCheckTick) this._urgencyCheckTick = 0;
        this._urgencyCheckTick += dt;
        if (this._urgencyCheckTick >= 2) {
            this._urgencyCheckTick = 0;
            this._checkResourceUrgency();
        }

        // 更新食物浪费减少标记计时
        if (this.game._foodWasteReductionTimer > 0) {
            this.game._foodWasteReductionTimer -= dt;
            if (this.game._foodWasteReductionTimer <= 0) {
                this.game._foodWasteReduction = false;
            }
        }

        // 更新巡逻加成标记计时
        if (this.game._patrolBonusTimer > 0) {
            this.game._patrolBonusTimer -= dt;
            if (this.game._patrolBonusTimer <= 0) {
                this.game._patrolBonus = false;
            }
        }
    }

    /** 更新单个NPC的任务执行 */
    _updateNpcTask(npc, dt) {
        const taskId = this.npcAssignments[npc.id];
        if (!taskId) return;

        const task = this.dailyTasks.find(t => t.id === taskId);
        if (!task || task.status === 'completed' || task.status === 'failed') return;

        // 获取任务状态
        let state = this.npcTaskState[npc.id];
        if (!state) {
            state = { taskId, startTime: 0, workTime: 0, paused: false, pauseReason: null };
            this.npcTaskState[npc.id] = state;
        }

        // 体力/健康阈值自动暂停
        if (npc.stamina < 30 || npc.health < 30) {
            if (!state.paused) {
                state.paused = true;
                state.pauseReason = npc.stamina < 30 ? '体力不足' : '健康不佳';
                if (this.game.addEvent) {
                    this.game.addEvent(`⏸️ ${npc.name}因${state.pauseReason}暂停任务，回室内休息`);
                }
            }
            return;
        }

        // 第2天户外时间限制
        const ws = this.game.weatherSystem;
        if (ws && ws.currentDay === 2 && task.isOutdoor) {
            if (ws.isOutdoorTimeExceeded(npc.id)) {
                if (!state.paused) {
                    state.paused = true;
                    state.pauseReason = '户外时间超限';
                    if (this.game.addEvent) {
                        this.game.addEvent(`⏸️ ${npc.name}户外工作已达2小时上限，必须回室内！`);
                    }
                }
                return;
            }
        }

        // 第4天禁止外出
        if (ws && ws.currentDay === 4 && task.isOutdoor) {
            state.paused = true;
            state.pauseReason = '大极寒禁止外出';
            return;
        }

        // 恢复暂停状态
        if (state.paused && npc.stamina >= 40 && npc.health >= 40) {
            state.paused = false;
            state.pauseReason = null;
        }

        if (state.paused) return;

        // 任务执行中
        if (task.status === 'pending') {
            task.status = 'in_progress';
            task.startTime = Date.now();
        }

        // 【修复v4.4.2】任务效果位置校验：NPC必须在任务指定的正确场景才能产出
        // 【Bug修复】_door类型目标在SCHEDULE_LOCATIONS中scene='village'（门口坐标），
        // NPC导航到门口后在village场景，但之前的校验要求NPC在室内场景，导致
        // BUILD_FURNACE等_door类目标任务永远无法执行（NPC站门口但校验要求在室内）
        const taskDetail = TASK_DETAILS[task.type];
        if (taskDetail && taskDetail.targetLocation) {
            const doorToScene = {
                warehouse_door: 'warehouse', medical_door: 'medical',
                dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
                kitchen_door: 'kitchen', workshop_door: 'workshop',
            };
            const tLoc = taskDetail.targetLocation;
            const isDoor = tLoc.endsWith('_door');
            if (isDoor) {
                // _door类型任务：NPC在门口(village)或已进入对应室内场景都算到达
                const indoorScene = doorToScene[tLoc];
                if (npc.currentScene !== 'village' && npc.currentScene !== indoorScene) {
                    return;
                }
            } else {
                // 非_door类型（户外采集点等）：NPC必须在village场景
                if (npc.currentScene !== 'village') {
                    return;
                }
            }
        }

        state.workTime += dt;

        // 计算效率倍率
        const efficiency = this.getTaskEfficiency(npc.id, task.type);

        // 资源产出型任务
        const detail = TASK_DETAILS[task.type];
        if (detail && detail.resourceType && detail.baseYield > 0) {
            let yieldPerSecond = (detail.baseYield / detail.baseDuration) * efficiency;
            // 【难度系统】采集效率乘以难度倍率
            const _diffGatherMult = this.game.getDifficultyMult ? this.game.getDifficultyMult('gatherEfficiencyMult') : 1.0;
            yieldPerSecond *= _diffGatherMult;
            const produced = yieldPerSecond * dt;

            // 第2天户外冒险加成
            if (ws && ws.currentDay === 2 && task.isOutdoor) {
                const adventureBonus = 1.5;
                task.progress += produced * adventureBonus;
            } else {
                task.progress += produced;
            }

            // 周期性交付资源（每产出5单位交付一次）
            const delivered = Math.floor(task.progress / 5) * 5;
            const previousDelivered = Math.floor((task.progress - produced) / 5) * 5;
            if (delivered > previousDelivered) {
                const toDeliver = delivered - previousDelivered;
                const rs = this.game.resourceSystem;
                if (rs) {
                    rs.addResource(detail.resourceType, toDeliver, npc.name);
                }
            }

            // 消耗体力
            const staminaDrain = (detail.staminaCost / detail.baseDuration) * dt;
            npc.stamina = Math.max(0, npc.stamina - staminaDrain);

            // 任务完成检测
            if (task.progress >= task.target) {
                task.status = 'completed';
                task.completedTime = Date.now();
                this.completedTasks.push({ ...task });

                if (this.game.addEvent) {
                    this.game.addEvent(`✅ ${npc.name}完成任务: ${task.name}（产出${Math.round(task.progress)}单位）`);
                }
                // 奖励San值
                npc.sanity = Math.min(100, npc.sanity + 5);
            }
        } else {
            // 非资源型任务（协调、鼓舞、医疗等）
            const progressRate = (1 / detail.baseDuration) * efficiency;
            task.progress += progressRate * dt;

            // 特殊任务效果
            this._applyTaskEffect(npc, task, dt, efficiency);

            // 消耗体力
            const staminaDrain = (detail.staminaCost / detail.baseDuration) * dt;
            npc.stamina = Math.max(0, npc.stamina - staminaDrain);

            // 完成检测
            if (task.progress >= task.target) {
                task.status = 'completed';
                task.completedTime = Date.now();
                this.completedTasks.push({ ...task });

                if (this.game.addEvent) {
                    this.game.addEvent(`✅ ${npc.name}完成任务: ${task.name}`);
                }
                npc.sanity = Math.min(100, npc.sanity + 5);
            }
        }
    }

    /** 特殊任务效果 */
    _applyTaskEffect(npc, task, dt, efficiency) {
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);

        switch (task.type) {
            case TASK_TYPES.BOOST_MORALE: {
                // 歆玥鼓舞：恢复同场景所有NPC的San值
                const sameScene = aliveNpcs.filter(n => n.currentScene === npc.currentScene && n.id !== npc.id);
                for (const other of sameScene) {
                    other.sanity = Math.min(100, other.sanity + 0.02 * efficiency * dt);
                }
                break;
            }
            case TASK_TYPES.COORDINATE: {
                // 统筹协调：提升同场景NPC工作效率（通过San值维持）
                const sameScene = aliveNpcs.filter(n => n.currentScene === npc.currentScene && n.id !== npc.id);
                for (const other of sameScene) {
                    other.sanity = Math.min(100, other.sanity + 0.01 * efficiency * dt);
                }
                break;
            }
            case TASK_TYPES.MAINTAIN_ORDER: {
                // 维持秩序：老钱安抚，恢复San值
                const sameScene = aliveNpcs.filter(n => n.currentScene === npc.currentScene && n.id !== npc.id);
                for (const other of sameScene) {
                    other.sanity = Math.min(100, other.sanity + 0.015 * efficiency * dt);
                }
                break;
            }
            case TASK_TYPES.PREPARE_MEDICAL: {
                // 医疗救治：治疗同场景中健康低的NPC + 制作急救包
                const sameScene = aliveNpcs.filter(n => n.currentScene === npc.currentScene && n.id !== npc.id && n.health < 60);
                for (const other of sameScene) {
                    other.health = Math.min(100, other.health + 0.03 * efficiency * dt);
                    // 治疗失温
                    if (other.bodyTemp < 35 && other.bodyTemp !== undefined) {
                        other.bodyTemp = Math.min(36.5, other.bodyTemp + 0.005 * efficiency * dt);
                    }
                }
                // 同时制作急救包（合并原CRAFT_MEDICINE功能）
                if (!this.game._medkitCraftProgress) this.game._medkitCraftProgress = 0;
                const craftRate = 0.5 * efficiency;
                this.game._medkitCraftProgress += (dt / 7200) * craftRate; // 7200秒(2游戏小时)产出1份
                if (this.game._medkitCraftProgress >= 1) {
                    this.game._medkitCraftProgress -= 1;
                    this.game._medkitCount = (this.game._medkitCount || 0) + 1;
                    if (this.game.addEvent) {
                        this.game.addEvent(`💊 ${npc.name}制作了1份急救包（共${this.game._medkitCount}份）`);
                    }
                }
                break;
            }
            case TASK_TYPES.BUILD_FURNACE: {
                // 修建暖炉：通知FurnaceSystem
                const fs = this.game.furnaceSystem;
                if (fs && !fs.secondFurnaceBuilt) {
                    // 收集所有被分配到BUILD_FURNACE的NPC
                    const builders = this.dailyTasks
                        .filter(t => t.type === TASK_TYPES.BUILD_FURNACE && t.assignedNpcId)
                        .map(t => t.assignedNpcId);
                    if (!fs.isBuildingSecondFurnace) {
                        // 尚未开始建造，发起建造
                        fs.startBuildSecondFurnace(builders);
                    } else {
                        // 已在建造中，持续同步工人列表（NPC可能中途加入/退出）
                        fs.buildWorkers = builders;
                    }
                }
                break;
            }
            // MAINTAIN_FURNACE已移除（v4.6）
            case TASK_TYPES.BUILD_GENERATOR:
            case TASK_TYPES.BUILD_LUMBER_MILL: {
                // 建造自动化机器：通知MachineSystem
                const ms = this.game.machineSystem;
                if (ms) {
                    const machineType = task.type === TASK_TYPES.BUILD_GENERATOR ? 'generator' : 'lumberMill';
                    const machine = ms[machineType];
                    if (machine && !machine.built) {
                        const builders = this.dailyTasks
                            .filter(t => t.type === task.type && t.assignedNpcId)
                            .map(t => t.assignedNpcId);
                        if (!machine.building) {
                            ms.startBuild(machineType, builders);
                        } else {
                            machine.buildWorkers = builders;
                        }
                    }
                }
                break;
            }
            case TASK_TYPES.MAINTAIN_POWER: {
                // 维护电力：产出电力
                const rs = this.game.resourceSystem;
                if (rs) {
                    const detail = TASK_DETAILS[task.type];
                    let yieldPerSecond = (detail.baseYield / detail.baseDuration) * efficiency;
                    // 【难度系统】采集效率乘以难度倍率
                    const _diffGatherMult2 = this.game.getDifficultyMult ? this.game.getDifficultyMult('gatherEfficiencyMult') : 1.0;
                    yieldPerSecond *= _diffGatherMult2;
                    rs.addResource('power', yieldPerSecond * dt);
                }
                break;
            }
            case TASK_TYPES.SCOUT_RUINS: {
                // 歆玥废墟侦察：有概率产出稀有物资
                const rs2 = this.game.resourceSystem;
                if (rs2 && Math.random() < 0.002 * efficiency * dt) {
                    const loot = ['medicine', 'canned_food', 'spare_parts'];
                    const item = loot[Math.floor(Math.random() * loot.length)];
                    const names = { medicine: '💊药品', canned_food: '🥫罐头', spare_parts: '🔧零件' };
                    if (this.game.addEvent) {
                        this.game.addEvent(`🔍 ${npc.name}在废墟中发现了${names[item]}！`);
                    }
                    // 转为对应资源
                    if (item === 'medicine') rs2.addResource('medical', 5, npc.name);
                    else if (item === 'canned_food') rs2.addResource('food', 8, npc.name);
                    else if (item === 'spare_parts') rs2.addResource('power', 5, npc.name);
                }
                break;
            }
            // CRAFT_MEDICINE已合并到PREPARE_MEDICAL
            // SET_TRAP已移除（v4.6）
            // REPAIR_RADIO已移除（v4.5）
            case TASK_TYPES.DISTRIBUTE_FOOD: {
                // 李婶分配食物：完成后全员饱腹恢复+触发进餐事件
                if (task.progress >= task.target && !task._foodDistributed) {
                    task._foodDistributed = true;
                    const rs4 = this.game.resourceSystem;
                    const foodCost = aliveNpcs.length * 1.5; // 每人1.5单位食物
                    if (rs4 && rs4.food >= foodCost) {
                        rs4.consumeResource('food', foodCost, '分配食物');
                        for (const other of aliveNpcs) {
                            if (other.hunger !== undefined) {
                                other.hunger = Math.min(100, other.hunger + 25);
                            }
                            other.sanity = Math.min(100, other.sanity + 2);
                        }
                        if (this.game.addEvent) {
                            this.game.addEvent(`🍽️ ${npc.name}为${aliveNpcs.length}人分配了食物（消耗${Math.round(foodCost)}单位，全员饱腹+25）`);
                        }
                    } else if (rs4) {
                        if (this.game.addEvent) {
                            this.game.addEvent(`⚠️ ${npc.name}尝试分配食物，但食物储备不足（需${Math.round(foodCost)}，仅${Math.round(rs4.food)}）`);
                        }
                    }
                }
                break;
            }
            case TASK_TYPES.PREPARE_WARMTH: {
                // 准备御寒物资：完成后全员体温恢复加成buff
                if (task.progress >= task.target && !task._warmthPrepared) {
                    task._warmthPrepared = true;
                    // 激活御寒buff，持续到下一天
                    this.game._warmthPrepBonus = true;
                    for (const other of aliveNpcs) {
                        if (other.bodyTemp !== undefined && other.bodyTemp < 36.5) {
                            other.bodyTemp = Math.min(36.5, other.bodyTemp + 0.5);
                        }
                        other.sanity = Math.min(100, other.sanity + 3);
                    }
                    if (this.game.addEvent) {
                        this.game.addEvent(`🧥 ${npc.name}准备好了御寒物资！全员获得保暖加成（体温+0.5°C, San+3）`);
                    }
                }
                break;
            }
            case TASK_TYPES.REST_RECOVER: {
                // 休息恢复：在暖炉旁加速恢复体力和健康
                const fSys = this.game.furnaceSystem;
                if (fSys && fSys.isNearActiveFurnace(npc)) {
                    npc.stamina = Math.min(100, npc.stamina + 0.05 * efficiency * dt);
                    npc.health = Math.min(100, npc.health + 0.02 * efficiency * dt);
                }
                break;
            }
        }
    }

    /**
     * 检测NPC当前是否在采集区域，返回对应的资源类型
     * 户外区域用坐标范围判定（因为NPC在户外时currentScene都是'village'）
     * 室内区域用currentScene直接匹配
     * @returns {string|null} 资源类型(woodFuel/food/explore/power)或null
     */
    _detectGatherArea(npc) {
        const scene = npc.currentScene;

        // 1. 室内场景直接匹配
        if (GATHER_INDOOR_MAP[scene]) {
            return GATHER_INDOOR_MAP[scene];
        }

        // 2. 户外区域坐标范围检测
        if (scene === SCENE_KEYS.VILLAGE) {
            const gx = npc.x / 32; // GST.TILE = 32
            const gy = npc.y / 32;
            for (const area of GATHER_OUTDOOR_AREAS) {
                if (gx >= area.x && gx < area.x + area.w && gy >= area.y && gy < area.y + area.h) {
                    return area.resourceType;
                }
            }
        }

        return null;
    }

    /**
     * 获取NPC当前所在的采集区域ID
     * @returns {string|null} 区域ID如'lumber_camp'或null
     */
    _detectGatherAreaId(npc) {
        const scene = npc.currentScene;

        if (scene === SCENE_KEYS.VILLAGE) {
            const gx = npc.x / 32;
            const gy = npc.y / 32;
            for (const area of GATHER_OUTDOOR_AREAS) {
                if (gx >= area.x && gx < area.x + area.w && gy >= area.y && gy < area.y + area.h) {
                    return area.id;
                }
            }
        }

        // 室内
        if (GATHER_INDOOR_MAP[scene]) {
            return scene;
        }

        return null;
    }

    /** 检测NPC是否在采集区域，持续产出资源 */
    _updateGathering(npc, dt) {
        if (npc.isDead || npc.isSleeping) return;

        // 判断NPC当前所在区域对应的资源类型
        const resourceType = this._detectGatherArea(npc);
        if (!resourceType) {
            // 不在采集区域，重置状态
            if (npc._gatheringResource) {
                // NPC离开采集区域，输出总结日志
                const totalTime = npc._gatherTotalTime || 0;
                const totalYield = npc._gatherAccumulated || 0;
                if (totalYield > 0 && this.game.addEvent) {
                    const emoji = RESOURCE_EMOJI[npc._gatheringResource] || '📦';
                    const hours = (totalTime / 3600).toFixed(1);
                    this.game.addEvent(`${emoji} ${npc.name}在采集区工作${hours}小时，共收集${Math.round(totalYield)}单位`);
                }
                npc._gatheringResource = null;
                npc._gatherAccumulated = 0;
                npc._gatherTotalTime = 0;
                npc._gatherNotifyAccum = 0;
            }
            return;
        }

        // 体力检查：低于最低工作体力阈值时停止产出
        const minStamina = GATHER_MIN_STAMINA[resourceType] || 20;
        if (npc.stamina <= minStamina) {
            // 触发一次性提示
            if (!npc._gatherStaminaWarned) {
                npc._gatherStaminaWarned = true;
                if (this.game.addEvent) {
                    this.game.addEvent(`⚠️ ${npc.name}体力不足无法继续工作（体力:${Math.round(npc.stamina)}）`);
                }
            }
            return;
        }
        npc._gatherStaminaWarned = false;

        // 初始化采集状态
        if (!npc._gatheringResource || npc._gatheringResource !== resourceType) {
            // 【调试日志】NPC进入采集区
            const areaId = this._detectGatherAreaId(npc) || resourceType;
            console.log(`[采集] ${npc.name} 在 ${areaId} 采集 ${resourceType} (坐标: ${(npc.x/32).toFixed(1)},${(npc.y/32).toFixed(1)})`);
            if (this.game.addEvent) {
                const emoji = RESOURCE_EMOJI[resourceType] || '📦';
                this.game.addEvent(`${emoji} ${npc.name} 到达采集区，开始${resourceType === 'woodFuel' ? '砍柴' : resourceType === 'food' ? '捕鱼' : resourceType === 'explore' ? '探索废墟' : '维护电力'}`);
            }
            // 【任务8】更新NPC状态描述为具体的采集动作
            const gatherActionNames = {
                woodFuel: '🪓 正在砍柴',
                food: '🎣 正在捕鱼',
                explore: '🔍 正在探索废墟',
                power: '🔧 正在维护电力'
            };
            npc.stateDesc = gatherActionNames[resourceType] || '正在采集';
            npc._gatheringResource = resourceType;
            npc._gatherAccumulated = 0;
            npc._gatherTotalTime = 0;
            npc._gatherNotifyAccum = 0;
        }

        // 计算实际产出
        const baseRate = GATHER_RATES[resourceType] || 0;

        // 专长倍率
        let specialtyMult = 1.0;
        const spec = NPC_SPECIALTIES[npc.id];
        if (spec && spec.bonuses) {
            // 查找对应的任务类型
            const taskTypeMap = {
                woodFuel: TASK_TYPES.COLLECT_WOOD,
                food: TASK_TYPES.COLLECT_FOOD,
                explore: TASK_TYPES.COLLECT_MATERIAL,
                power: TASK_TYPES.MAINTAIN_POWER,
            };
            const taskType = taskTypeMap[resourceType];
            if (taskType && spec.bonuses[taskType]) {
                specialtyMult = spec.bonuses[taskType];
            }
        }

        // 体力效率系数【v2.0重新平衡：匹配需求文档体力修正表】
        let staminaEff = 1.0;
        if (npc.stamina >= 80) staminaEff = 1.2;       // 体力充沛，效率提升
        else if (npc.stamina >= 50) staminaEff = 1.0;  // 正常效率
        else if (npc.stamina >= 20) staminaEff = 0.6;  // 体力偏低，效率下降
        else staminaEff = 0.3;                          // 体力极低，几乎无法工作

        // 天气惩罚【v2.0重新平衡：匹配需求文档天气采集效率修正表】
        let weatherPenalty = 1.0;
        const ws = this.game.weatherSystem;
        if (ws) {
            // 户外判定：NPC在village场景且在采集区域坐标范围内
            const isOutdoor = (npc.currentScene === SCENE_KEYS.VILLAGE);
            if (isOutdoor) {
                if (ws.currentDay === 1) weatherPenalty = 0.9;       // 第1天-10°C轻雪
                else if (ws.currentDay === 2) weatherPenalty = 0.7;  // 第2天-25°C中雪
                else if (ws.currentDay === 3) weatherPenalty = 1.1;  // 第3天0°C喘息日
                else if (ws.currentDay === 4) weatherPenalty = 0;    // 第4天-60°C禁止外出
            }
        }

        // 是否有对应采集任务，无任务时50%速率产出
        let taskMult = 0.5; // 默认无任务50%
        const npcTask = this.getNpcTask(npc.id);
        if (npcTask) {
            const detail = TASK_DETAILS[npcTask.type];
            if (detail && detail.resourceType === resourceType) {
                taskMult = 1.0;
            }
        }

        // taskOverride 任务驱动的NPC也视为有任务
        if (npc._taskOverride && npc._taskOverride.isActive) {
            taskMult = 1.0;
        }

        // 实际产出 = 基础产出/小时 × 专长倍率 × 体力效率 × 天气惩罚 × 任务倍率 / 3600秒
        // 【难度系统】采集效率乘以难度倍率
        const _diffGatherMult3 = this.game.getDifficultyMult ? this.game.getDifficultyMult('gatherEfficiencyMult') : 1.0;
        const actualRatePerSec = (baseRate * specialtyMult * staminaEff * weatherPenalty * taskMult * _diffGatherMult3) / 3600;
        const produced = actualRatePerSec * dt;

        if (produced <= 0) return;

        // 累加产出
        npc._gatherAccumulated += produced;
        npc._gatherTotalTime += dt;
        npc._gatherNotifyAccum += produced;

        // 实际添加到资源系统
        const rs = this.game.resourceSystem;
        if (rs) {
            rs.addResource(resourceType, produced, npc.name);
        }

        // 每累计达到10单位时显示通知【v2.0调整：从5提升到10，减少刷屏】
        if (npc._gatherNotifyAccum >= 10) {
            npc._gatherNotifyAccum -= 10;
            if (this.game.addEvent) {
                const emoji = RESOURCE_EMOJI[resourceType] || '📦';
                const effText = specialtyMult > 1 ? `（效率${specialtyMult}x）` : '';
                this.game.addEvent(`${emoji} ${npc.name}在采集区工作，已收集${Math.round(npc._gatherAccumulated)}单位${effText}`);
            }
        }
    }

    // ============ 效率计算 ============

    /** 获取NPC执行某类任务的效率倍率 */
    getTaskEfficiency(npcId, taskType) {
        let efficiency = 1.0;

        // 专长加成
        const spec = NPC_SPECIALTIES[npcId];
        if (spec && spec.bonuses && spec.bonuses[taskType]) {
            efficiency *= spec.bonuses[taskType];
        }

        // 王老师全队加成
        efficiency *= (1 + this._teamEfficiencyBonus);

        return efficiency;
    }

    // ============ 查询接口 ============

    /** 获取NPC的专长信息 */
    getSpecialty(npcId) {
        return NPC_SPECIALTIES[npcId] || null;
    }

    /** 获取NPC当前分配的任务 */
    getNpcTask(npcId) {
        const taskId = this.npcAssignments[npcId];
        if (!taskId) return null;
        return this.dailyTasks.find(t => t.id === taskId) || null;
    }

    /** 获取NPC的任务描述（供AI prompt注入） */
    getNpcTaskDescForPrompt(npcId) {
        const task = this.getNpcTask(npcId);
        if (!task) return '暂无分配任务';

        const state = this.npcTaskState[npcId];
        const detail = TASK_DETAILS[task.type];
        let desc = `当前任务: ${task.name}`;
        if (task.status === 'completed') {
            desc += '（已完成✅）';
        } else if (state && state.paused) {
            desc += `（已暂停⏸️: ${state.pauseReason}）`;
        } else {
            const progressPercent = task.target > 0 ? Math.round((task.progress / task.target) * 100) : 0;
            desc += `（进度: ${progressPercent}%）`;
            if (detail && detail.targetLocation) {
                desc += `（目标地点: ${detail.targetLocation}）`;
            }
        }
        return desc;
    }

    /** 获取今日任务完成度 */
    getDailyCompletionRate() {
        if (this.dailyTasks.length === 0) return 0;
        const completed = this.dailyTasks.filter(t => t.status === 'completed').length;
        return completed / this.dailyTasks.length;
    }

    /** 获取任务面板数据（给UI用） */
    getTaskPanelData() {
        return this.dailyTasks.map(task => {
            const npc = this.game.npcs.find(n => n.id === task.assignedNpcId);
            const state = this.npcTaskState[task.assignedNpcId];
            return {
                id: task.id,
                name: task.name,
                desc: task.desc,
                assignee: npc ? npc.name : '未分配',
                assigneeId: task.assignedNpcId,
                status: task.status,
                priority: task.priority,
                progress: task.target > 0 ? Math.min(1, task.progress / task.target) : (task.status === 'completed' ? 1 : 0),
                target: task.target,
                currentProgress: Math.round(task.progress * 10) / 10,
                paused: state ? state.paused : false,
                pauseReason: state ? state.pauseReason : null,
                isOutdoor: task.isOutdoor,
            };
        });
    }

    /** 获取任务摘要（给AI prompt用） */
    getTaskSummaryForPrompt() {
        const total = this.dailyTasks.length;
        const completed = this.dailyTasks.filter(t => t.status === 'completed').length;
        const inProgress = this.dailyTasks.filter(t => t.status === 'in_progress').length;
        const paused = Object.values(this.npcTaskState).filter(s => s.paused).length;
        return `任务${completed}/${total}完成 | ${inProgress}进行中 | ${paused}暂停`;
    }

    /**
     * 获取指定NPC当前分配的未完成任务（供NPC._executeAction的case 'work'调用）
     * @param {string} npcId - NPC的id
     * @returns {{ type: string, desc: string, targetLocation: string } | null}
     */
    getCurrentTask(npcId) {
        if (!npcId) return null;
        // 优先查找该NPC被分配的任务ID
        const taskId = this.npcAssignments[npcId];
        if (taskId) {
            const task = this.dailyTasks.find(t => t.id === taskId && t.status !== 'completed');
            if (task) {
                const details = TASK_DETAILS[task.type];
                if (details) {
                    return {
                        type: task.type,
                        desc: details.desc || task.desc || task.name,
                        targetLocation: details.targetLocation || null,
                    };
                }
            }
        }
        // 没有通过npcAssignments分配的任务，遍历dailyTasks找assignedNpcId匹配的
        const assignedTask = this.dailyTasks.find(t =>
            t.assignedNpcId === npcId && t.status !== 'completed'
        );
        if (assignedTask) {
            const details = TASK_DETAILS[assignedTask.type];
            if (details) {
                return {
                    type: assignedTask.type,
                    desc: details.desc || assignedTask.desc || assignedTask.name,
                    targetLocation: details.targetLocation || null,
                };
            }
        }
        return null;
    }

    // ============ 日志 ============

    /** 记录未完成任务 */
    _logUnfinishedTasks(day) {
        if (day < 1) return;
        const unfinished = this.dailyTasks.filter(t => t.status !== 'completed');
        if (unfinished.length > 0) {
            this.unfinishedTaskLog.push({
                day: day,
                tasks: unfinished.map(t => ({
                    name: t.name,
                    assignee: t.assignedNpcId,
                    progress: Math.round(t.progress * 10) / 10,
                    target: t.target,
                    reason: this.npcTaskState[t.assignedNpcId]?.pauseReason || '时间不足',
                })),
            });

            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ 第${day}天有${unfinished.length}项任务未完成！`);
                for (const t of unfinished) {
                    const progressPercent = t.target > 0 ? Math.round((t.progress / t.target) * 100) : 0;
                    this.game.addEvent(`  ❌ ${t.name}: ${progressPercent}%未完成`);
                }
            }
        }
    }

    // ============ 【轮回系统】前世经验任务优化 ============

    /** 基于前世记忆优化当天任务分配 */
    _applyReincarnationTaskBoost(day) {
        if (!this.game || !this.game.reincarnationSystem) return;
        const rs = this.game.reincarnationSystem;
        if (rs.getLifeNumber() <= 1) return; // 第1世无优化

        const lastLife = rs.getLastLifeData();
        if (!lastLife) return;

        let optimized = false;

        // 1. 资源不足优化：增加收集目标量
        if (lastLife.resourceSnapshot) {
            const snap = lastLife.resourceSnapshot;

            // 木柴严重不足（<安全线50%，安全线约80单位）
            if (snap.woodFuel < 40) {
                for (const task of this.dailyTasks) {
                    if (task.type === 'COLLECT_WOOD') {
                        const oldTarget = task.target;
                        task.target = Math.round(task.target * 1.4); // 增加40%
                        console.log(`[TaskSystem-轮回] 木柴任务目标提升: ${oldTarget} → ${task.target}`);
                        optimized = true;
                    }
                }
            }

            // 食物严重不足
            if (snap.food < 20) {
                for (const task of this.dailyTasks) {
                    if (task.type === 'COLLECT_FOOD') {
                        const oldTarget = task.target;
                        task.target = Math.round(task.target * 1.3); // 增加30%
                        console.log(`[TaskSystem-轮回] 食物任务目标提升: ${oldTarget} → ${task.target}`);
                        optimized = true;
                    }
                }
            }
        }

        // 2. 第二暖炉未建好：提升优先级
        if (!lastLife.secondFurnaceBuilt) {
            for (const task of this.dailyTasks) {
                if (task.type === 'BUILD_FURNACE') {
                    if (task.priority !== 'urgent') {
                        task.priority = 'urgent';
                        console.log(`[TaskSystem-轮回] 暖炉建造任务提升为urgent优先级`);
                        optimized = true;
                    }
                }
            }
            // 如果第1天暖炉未建好，增加木柴收集量
            if (day === 1) {
                for (const task of this.dailyTasks) {
                    if (task.type === 'COLLECT_WOOD') {
                        const oldTarget = task.target;
                        task.target = Math.round(task.target * 1.3);
                        console.log(`[TaskSystem-轮回] 木柴任务目标提升: ${oldTarget} → ${task.target}（上世暖炉未建好，增加木柴储备）`);
                        optimized = true;
                        break; // 只提升一个
                    }
                }
            }
        }

        // 3. 户外冻死记录：降低第2天户外任务目标
        if (day === 2) {
            const frozenOutdoor = (lastLife.deathRecords || []).filter(
                d => d.cause === '冻死' && d.day <= 2
            );
            if (frozenOutdoor.length > 0) {
                for (const task of this.dailyTasks) {
                    if (task.type === 'COLLECT_WOOD' || task.type === 'COLLECT_FOOD' || task.type === 'SCOUT_RUINS') {
                        const oldTarget = task.target;
                        task.target = Math.max(5, Math.round(task.target * 0.7)); // 降低30%
                        console.log(`[TaskSystem-轮回] 第2天户外任务降低: ${oldTarget} → ${task.target}（上世有人户外冻死）`);
                        optimized = true;
                    }
                }
            }
        }

        // 4. 显示优化提示
        if (optimized && this.game.addEvent) {
            this.game.addEvent(`🔄 基于前世经验优化了第${day}天的任务分配`);
        }
    }

    // ============ 【任务8】资源紧急任务自动分配 & think→action桥接 ============

    /**
     * 检测资源紧急情况并自动分配NPC前往采集
     * 每2秒调用一次，检测木柴<6h消耗量 / 食物<1餐需求 / 电力<3h消耗时触发
     */
    _checkResourceUrgency() {
        const rs = this.game.resourceSystem;
        if (!rs) return;

        const ws = this.game.weatherSystem;
        const currentDay = ws ? ws.currentDay : 1;

        // 第4天禁止户外任务
        if (currentDay === 4) return;

        const urgency = rs.getResourceUrgency();
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);

        // 检测各资源是否有NPC正在采集（包括暂停中的任务，避免反复分配）
        const activeGatherers = {};
        for (const npc of aliveNpcs) {
            if (npc._taskOverride && npc._taskOverride.resourceType) {
                // 只要taskOverride有resourceType，无论isActive还是暂停中，都算已分配
                const rt = npc._taskOverride.resourceType;
                if (!activeGatherers[rt]) activeGatherers[rt] = [];
                activeGatherers[rt].push(npc.id);
            }
        }

        // 资源紧急分配逻辑
        const urgentNeeds = [];
        if (urgency.wood === 'critical') {
urgentNeeds.push({ resourceType: 'woodFuel', taskType: TASK_TYPES.COLLECT_WOOD, targetLocation: 'lumber_camp', maxWorkers: 2 });
        }
        if (urgency.food === 'critical') {
urgentNeeds.push({ resourceType: 'food', taskType: TASK_TYPES.COLLECT_FOOD, targetLocation: 'frozen_lake', maxWorkers: 2 });
        }
        if (urgency.power === 'critical') {
            urgentNeeds.push({ resourceType: 'power', taskType: TASK_TYPES.MAINTAIN_POWER, targetLocation: 'workshop_door', maxWorkers: 1 });
        }

        for (const need of urgentNeeds) {
            const currentGatherers = activeGatherers[need.resourceType] || [];
            if (currentGatherers.length >= need.maxWorkers) continue; // 已有足够人在采集

            // 筛选空闲 + 体力>30 的NPC
            const candidates = aliveNpcs.filter(npc => {
                if (npc.isDead || npc.isSleeping) return false;
                if (npc.stamina < 30 || npc.health < 30) return false;
                // 【v4.17修复】有taskOverride（无论active还是暂停）的NPC都不再分配
                if (npc._taskOverride && (npc._taskOverride.isActive || npc._taskOverride.taskId)) return false;
                if (npc._behaviorPriority === 'P0') return false;
                // 第2天户外限制
                if (currentDay === 2 && need.taskType !== TASK_TYPES.MAINTAIN_POWER && npc._outdoorTimer > 100) return false;
                return true;
            });

            if (candidates.length === 0) continue;

            // 【增强】按专长匹配度排序，排除老钱（优先安抚），相同专长按体力排序
            candidates.sort((a, b) => {
                // 老钱优先安抚，排到最后（除非没有其他人可用）
                const aIsQian = a.id === 'old_qian' ? 1 : 0;
                const bIsQian = b.id === 'old_qian' ? 1 : 0;
                if (aIsQian !== bIsQian) return aIsQian - bIsQian;

                const specA = NPC_SPECIALTIES[a.id];
                const specB = NPC_SPECIALTIES[b.id];
                const multA = (specA && specA.bonuses && specA.bonuses[need.taskType]) || 1.0;
                const multB = (specB && specB.bonuses && specB.bonuses[need.taskType]) || 1.0;
                // 优先选专长倍率高的
                if (multA !== multB) return multB - multA;
                // 相同专长倍率按体力排序
                return b.stamina - a.stamina;
            });

            // 分配最优NPC
            const assignCount = need.maxWorkers - currentGatherers.length;
            for (let i = 0; i < Math.min(assignCount, candidates.length); i++) {
                const npc = candidates[i];
                const activated = npc.activateTaskOverride(
                    `urgent_${need.resourceType}_${Date.now()}`,
                    need.targetLocation,
                    'urgent',
                    need.resourceType
                );

                // 【v4.17】只在任务成功激活时才发消息，且60秒内同NPC同资源不重复
                if (activated && this.game.addEvent) {
                    if (!this._urgencyMsgCooldown) this._urgencyMsgCooldown = {};
                    const cooldownKey = `${npc.id}_${need.resourceType}`;
                    const now = Date.now();
                    if (!this._urgencyMsgCooldown[cooldownKey] || now - this._urgencyMsgCooldown[cooldownKey] > 60000) {
                        this._urgencyMsgCooldown[cooldownKey] = now;
                        const resourceNames = { woodFuel: '砍柴', food: '采集食物', power: '维护电力' };
                        const spec = NPC_SPECIALTIES[npc.id];
                        const mult = (spec && spec.bonuses && spec.bonuses[need.taskType]) || 1.0;
                        const multTag = mult > 1.0 ? `(专长×${mult})` : '';
                        this.game.addEvent(`🚨 资源紧急！${npc.name}${multTag}被自动分配前往${resourceNames[need.resourceType]}！`);
                    }
                }

                console.log(`[TaskSystem] 紧急分配 ${npc.name} → ${need.resourceType} (${need.targetLocation})`);
            }
        }

        // warning级别也分配，但只分配1人
        const warningNeeds = [];
        if (urgency.wood === 'warning' && !(activeGatherers['woodFuel']?.length > 0)) {
warningNeeds.push({ resourceType: 'woodFuel', taskType: TASK_TYPES.COLLECT_WOOD, targetLocation: 'lumber_camp' });
        }
        if (urgency.food === 'warning' && !(activeGatherers['food']?.length > 0)) {
warningNeeds.push({ resourceType: 'food', taskType: TASK_TYPES.COLLECT_FOOD, targetLocation: 'frozen_lake' });
        }
        if (urgency.power === 'warning' && !(activeGatherers['power']?.length > 0)) {
warningNeeds.push({ resourceType: 'power', taskType: TASK_TYPES.MAINTAIN_POWER, targetLocation: 'workshop_door' });
        }

        for (const need of warningNeeds) {
            const candidates = aliveNpcs.filter(npc => {
                if (npc.isDead || npc.isSleeping) return false;
                if (npc.stamina < 40 || npc.health < 40) return false;
                // 【v4.17修复】有taskOverride（无论active还是暂停）的NPC都不再分配
                if (npc._taskOverride && (npc._taskOverride.isActive || npc._taskOverride.taskId)) return false;
                if (npc._behaviorPriority === 'P0') return false;
                if (currentDay === 2 && npc._outdoorTimer > 80) return false;
                return true;
            });

            if (candidates.length === 0) continue;

            // 【增强】warning级别也使用增强排序：排除老钱，按专长+体力排序
            candidates.sort((a, b) => {
                const aIsQian = a.id === 'old_qian' ? 1 : 0;
                const bIsQian = b.id === 'old_qian' ? 1 : 0;
                if (aIsQian !== bIsQian) return aIsQian - bIsQian;

                const specA = NPC_SPECIALTIES[a.id];
                const specB = NPC_SPECIALTIES[b.id];
                const multA = (specA && specA.bonuses && specA.bonuses[need.taskType]) || 1.0;
                const multB = (specB && specB.bonuses && specB.bonuses[need.taskType]) || 1.0;
                if (multA !== multB) return multB - multA;
                return b.stamina - a.stamina;
            });

            const npc = candidates[0];
            npc.activateTaskOverride(
                `warning_${need.resourceType}_${Date.now()}`,
                need.targetLocation,
                'high',
                need.resourceType
            );

            if (this.game.addEvent) {
                const resourceNames = { woodFuel: '砍柴', food: '采集食物', power: '维护电力' };
                const spec = NPC_SPECIALTIES[npc.id];
                const mult = (spec && spec.bonuses && spec.bonuses[need.taskType]) || 1.0;
                const multTag = mult > 1.0 ? `(专长×${mult})` : '';
                this.game.addEvent(`⚠️ 资源偏低，${npc.name}${multTag}前往${resourceNames[need.resourceType]}补充物资`);
            }
        }
    }

    /** 将营地会议分工转成正式的当日任务表（用于首日晨会） */
    applyCouncilAssignments(proposal, options) {
        if (!proposal || !proposal.assignments) return false;

        const day = (options && options.day) || this.game.dayCount || 1;
        const rs = this.game.resourceSystem;
        const fs = this.game.furnaceSystem;
        const aliveNpcs = this.game.npcs.filter(n => !n.isDead);
        const npcByName = new Map(aliveNpcs.map(n => [n.name, n]));

        this._taskGeneratedForDay = day;
        this.dailyTasks = [];
        this.npcAssignments = {};
        this.npcTaskState = {};

        for (const npc of aliveNpcs) {
            if (!npc._taskOverride) continue;
            npc._taskOverride.isActive = false;
            npc._taskOverride.taskId = null;
            npc._taskOverride.targetLocation = null;
            npc._taskOverride.resourceType = null;
            npc._taskOverride.stateDesc = null;
            npc._taskOverride.displayDesc = null;
            npc._taskOverride.effectKey = null;
            npc._taskOverride.intentId = null;
        }

        for (const [name, taskText] of Object.entries(proposal.assignments)) {
            const npc = npcByName.get(name);
            if (!npc) continue;

            const resolved = this._resolveCouncilAssignment(taskText, day, npc, rs, fs);
            const taskId = this._addTask(resolved.type, resolved.target, resolved.priority, npc.id);
            if (taskId) {
                this.npcAssignments[npc.id] = taskId;
            }
        }

        for (const npc of aliveNpcs) {
            if (this.npcAssignments[npc.id]) continue;
            const fallback = this._resolveCouncilAssignment('', day, npc, rs, fs);
            const taskId = this._addTask(fallback.type, fallback.target, fallback.priority, npc.id);
            if (taskId) {
                this.npcAssignments[npc.id] = taskId;
            }
        }

        this._assignTasks(aliveNpcs);
        this._activateDailyTaskNavigation(aliveNpcs);

        if (this.game.addEvent) {
            this.game.addEvent(`🌅 晨会通过「${proposal.name || '今日分工'}」方案，第${day}天任务已重新排定`);

            const lines = aliveNpcs.map(npc => {
                const taskId = this.npcAssignments[npc.id];
                const task = this.dailyTasks.find(t => t.id === taskId);
                return task ? `  ${npc.name}: ${task.name}` : null;
            }).filter(Boolean);

            for (const line of lines) {
                this.game.addEvent(line);
            }
        }

        // 【v4.16】晨会定稿已由右上角常驻面板(#work-plan-panel)实时显示，不再写入决策动态面板

        console.log(`[TaskSystem] 晨会方案已转成第${day}天正式任务:`, this.dailyTasks.map(t => `${t.name}→${t.assignedNpcId}`));
        return true;
    }

    _resolveCouncilAssignment(taskText, day, npc, rs, fs) {
        const text = String(taskText || '').trim();
        const lowered = text.toLowerCase();
        const has = (...keywords) => keywords.some(kw => lowered.includes(String(kw).toLowerCase()));
        const calc = (type) => this._calcResourceTarget(type, rs, fs, day);

        if (has('建造发电机', '自动发电', '发电机')) {
            return { type: TASK_TYPES.BUILD_GENERATOR, target: 1, priority: 'urgent' };
        }
        if (has('建造伐木机', '自动伐木', '伐木机')) {
            return { type: TASK_TYPES.BUILD_LUMBER_MILL, target: 1, priority: 'high' };
        }
        if (has('暖炉扩建', '修复暖炉', '扩建暖炉', '建造暖炉', '第二暖炉')) {
            return { type: TASK_TYPES.BUILD_FURNACE, target: 1, priority: 'urgent' };
        }
        if (has('人工发电', '手摇发电', '手动发电', '维护电力', '电力', '接线', '电路', '供电')) {
            return { type: TASK_TYPES.MAINTAIN_POWER, target: calc(TASK_TYPES.MAINTAIN_POWER), priority: 'high' };
        }
        if (has('砍柴', '伐木', '木柴', '柴火', '木头')) {
            return { type: TASK_TYPES.COLLECT_WOOD, target: calc(TASK_TYPES.COLLECT_WOOD), priority: 'urgent' };
        }
        if (has('做饭', '烹饪', '炊事', '分配食物', '分食', '准备早餐', '准备晚餐')) {
            return { type: TASK_TYPES.DISTRIBUTE_FOOD, target: 1, priority: 'high' };
        }
        if (has('采集食物', '食物', '捕鱼', '抓鱼', '钓鱼', '打鱼', '冰湖')) {
            return { type: TASK_TYPES.COLLECT_FOOD, target: calc(TASK_TYPES.COLLECT_FOOD), priority: 'high' };
        }
        if (has('医疗', '治疗', '急救', '包扎', '药', '伤员', '心理疏导')) {
            return { type: TASK_TYPES.PREPARE_MEDICAL, target: 1, priority: 'high' };
        }
        if (has('探索', '废墟', '搜索', '搜寻', '找零件', '材料', '物资')) {
            if (has('零件', '材料', '物资')) {
                return { type: TASK_TYPES.COLLECT_MATERIAL, target: calc(TASK_TYPES.COLLECT_MATERIAL), priority: 'high' };
            }
            return { type: TASK_TYPES.SCOUT_RUINS, target: 1, priority: 'high' };
        }
        if (has('侦察', '巡查')) {
            return { type: TASK_TYPES.SCOUT_RUINS, target: 1, priority: 'high' };
        }
        if (has('安抚', '鼓舞', '士气', '安慰', '谈心')) {
            return { type: TASK_TYPES.BOOST_MORALE, target: 1, priority: 'normal' };
        }
        if (has('巡逻', '守夜', '值班', '警戒', '秩序')) {
            return { type: TASK_TYPES.MAINTAIN_ORDER, target: 1, priority: 'normal' };
        }
        if (has('统筹', '协调', '组织', '指挥')) {
            return { type: TASK_TYPES.COORDINATE, target: 1, priority: 'normal' };
        }
        if (has('御寒', '保暖', '取暖', '准备御寒')) {
            return { type: TASK_TYPES.PREPARE_WARMTH, target: 1, priority: 'normal' };
        }
        if (has('休息', '恢复', '睡觉', '养伤')) {
            return { type: TASK_TYPES.REST_RECOVER, target: 1, priority: 'normal' };
        }

        if (npc.health < 40 || npc.stamina < 25) {
            return { type: TASK_TYPES.REST_RECOVER, target: 1, priority: 'normal' };
        }

        switch (npc.id) {
            case 'wang_teacher':
                return { type: TASK_TYPES.BUILD_GENERATOR, target: 1, priority: 'urgent' };
            case 'zhao_chef':
                return { type: TASK_TYPES.COLLECT_WOOD, target: calc(TASK_TYPES.COLLECT_WOOD), priority: 'urgent' };
            case 'lu_chen':
                return { type: TASK_TYPES.COLLECT_FOOD, target: calc(TASK_TYPES.COLLECT_FOOD), priority: 'high' };
            case 'li_shen':
                return { type: TASK_TYPES.DISTRIBUTE_FOOD, target: 1, priority: 'high' };
            case 'su_doctor':
            case 'qing_xuan':
                return { type: TASK_TYPES.PREPARE_MEDICAL, target: 1, priority: 'high' };
            case 'ling_yue':
                return { type: TASK_TYPES.SCOUT_RUINS, target: 1, priority: 'high' };
            case 'old_qian':
                return { type: TASK_TYPES.COORDINATE, target: 1, priority: 'normal' };
            default:
                return { type: TASK_TYPES.PREPARE_WARMTH, target: 1, priority: 'normal' };
        }
    }

    // ============ 序列化 ============

    serialize() {
        return {
            dailyTasks: this.dailyTasks,
            npcAssignments: { ...this.npcAssignments },
            npcTaskState: { ...this.npcTaskState },
            completedTasks: this.completedTasks,
            unfinishedTaskLog: this.unfinishedTaskLog,
            taskIdCounter: this.taskIdCounter,
            taskGeneratedForDay: this._taskGeneratedForDay,
        };
    }

    deserialize(data) {
        if (!data) return;
        this.dailyTasks = data.dailyTasks || [];
        this.npcAssignments = data.npcAssignments || {};
        this.npcTaskState = data.npcTaskState || {};
        this.completedTasks = data.completedTasks || [];
        this.unfinishedTaskLog = data.unfinishedTaskLog || [];
        this.taskIdCounter = data.taskIdCounter || 0;
        this._taskGeneratedForDay = data.taskGeneratedForDay || -1;
    }
}

    GST.TaskSystem = TaskSystem;
})();
