/**
 * 福音镇 - NPC 核心类
 * NPC 类的核心框架：构造函数、update主循环、状态管理、移动/碰撞、序列化
 * 挂载到 GST.NPC
 */
(function() {
    'use strict';
    const GST = window.GST;

    class NPC {
    constructor(config, game) {
        this.id = config.id;
        this.name = config.name;
        this.age = config.age;
        this.occupation = config.occupation;
        this.personality = config.personality;
        this.homeName = config.home;
        this.workplaceName = config.workplace;
        this.color = config.color || GST.C.NPC;
        this.scheduleTemplate = config.schedule;
        this.config = config; // 保存完整配置（含bedtime等）

        // 位置状态
        this.currentScene = config.spawnScene;
        this.x = config.spawnX * GST.TILE;
        this.y = config.spawnY * GST.TILE;
        this.width = GST.TILE;
        this.height = GST.TILE;

        // 移动
        this.speed = 100 + Math.random() * 40; // 每个 NPC 速度稍有不同
        this.facing = 0; // 0=down,1=left,2=right,3=up
        this.isMoving = false;
        this.currentPath = [];
        this.pathIndex = 0;
        this.moveTarget = null; // { x, y } 当前路点像素
        this.stuckTimer = 0;
        this.collisionStallTimer = 0;  // 被碰撞持续阻挡的累计时间
        this._yieldMove = null;         // 让路临时目标 { x, y }（格子坐标）
        this._yieldTimer = 0;           // 让路等待计时

        // 动画
        this.animFrame = 0;
        this.animTimer = 0;

        // Sprite（先设onload再设src，避免浏览器缓存命中时onload事件丢失）
        this.sprite = new Image();
        this.spriteLoaded = false;
        this.sprite.onload = () => { this.spriteLoaded = true; };
        this.sprite.onerror = () => { console.warn(`[NPC] ${this.name} sprite加载失败: ${config.spriteDir}/texture.png`); };
        this.sprite.src = config.spriteDir + '/texture.png';
        // 缓存兜底：如果图片已在浏览器缓存中同步完成加载
        if (this.sprite.complete && this.sprite.naturalWidth > 0) {
            this.spriteLoaded = true;
        }

        this.portrait = new Image();
        this._portraitLoaded = false;
        this.portrait.onload = () => { this._portraitLoaded = true; };
        this.portrait.src = config.spriteDir + '/portrait.png';

        // AI 状态
        this.state = 'IDLE'; // IDLE, WALKING, BUSY, CHATTING, SLEEPING
        this.stateDesc = config.schedule[0]?.desc || '闲逛';
        this.mood = '平静';
        this.expression = '';
        this.expressionTimer = 0;

        // 记忆
        this.memories = [];
        this.maxMemories = 20;

        // 好感度 (对其他 NPC)
        this.affinity = {}; // { npcId: number }

        // AI 思考节流
        this.aiCooldown = 0;
        this.aiInterval = 15 + Math.random() * 15; // 15~30 秒思考一次

        // 社交冷却
        this.chatCooldowns = {}; // { npcId: timestamp }

        // 哲学家/思考型角色特殊设定：更积极地找人聊天
        if (config.id === 'old_qian') {
            this.aiInterval = 10 + Math.random() * 10; // 10~20 秒思考一次
        }

        // 【轮回系统】世数>=2时，AI思考间隔缩短10%（NPC更"警觉"）
        if (game && game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() >= 2) {
            this.aiInterval = Math.round(this.aiInterval * 0.9);
        }

        // 性别
        this.gender = config.gender || '男';

        // 初始化情感关系好感度（非对称）
        if (config.id === 'zhao_chef') {
            this.affinity = { li_shen: 75 };
        } else if (config.id === 'li_shen') {
            this.affinity = { zhao_chef: 65 };
        } else if (config.id === 'su_doctor') {
            this.affinity = { ling_yue: 70 };
        } else if (config.id === 'wang_teacher') {
            this.affinity = { ling_yue: 68 };
        } else if (config.id === 'ling_yue') {
            this.affinity = { su_doctor: 60, wang_teacher: 62 };
        } else if (config.id === 'lu_chen') {
this.affinity = { qing_xuan: 72 };
        } else if (config.id === 'qing_xuan') {
            this.affinity = { lu_chen: 65 };
        }

        // 【轮回系统】应用前世记忆加成
        this._applyReincarnationBonus(game);

        // 日程追踪
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
        this._pendingEnterScene = null;  // 到达门口后自动进入的室内场景
        this._pendingEnterKey = null;    // 对应的门口key

        // 睡眠系统
        this.isSleeping = false;
        this.sleepZTimer = 0; // "Zzz" 动画计时器

        // 【休息缓冲期】白天rest到达宿舍后，保持停留一段时间再让日程系统接管
        this._restCooldownTimer = 0; // 单位：秒（游戏时间），>0 表示正在休息缓冲期中

        // 【强制睡眠标记】区分日程睡眠和体力不支/白天休息强制入睡
        this._forcedSleep = false;       // 是否为强制睡眠（非日程驱动）
        this._forcedSleepTimer = 0;      // 强制睡眠已持续的游戏时间（秒）

        // 下雨避雨
        this.isSeekingShelter = false;
        this.hasUmbrella = Math.random() > 0.6; // 40% 概率有伞

        // 场所经营统计（店主角色使用）
        this.shopVisitorCount = 0;       // 今天来过的客人数
        this.shopLastVisitorTime = null; // 上一个客人来的时间
        this.shopAloneMinutes = 0;       // 连续没客人的分钟数
        this.shopOutRecruitingUntil = 0; // 外出招揽截止时间（小时）

        // 饥饿系统
        this.hunger = 100;              // 饱腹值 0~100, 100=饱, 0=饿极了
        this.hungerDecayTimer = 0;      // 饥饿递减计时器
        this.isEating = false;          // 正在吃饭中
        this.eatingTimer = 0;           // 吃饭持续时间
        this._hungerOverride = false;   // 饥饿临时日程覆盖中
        this._hungerTarget = null;      // 饥饿驱动的目标场所
        this._hungerTriggerCooldown = 0; // 饥饿触发冷却计时器

        // ============ 资源采集覆盖系统（参考饥饿覆盖模式） ============
        this._resourceGatherOverride = false;  // 资源采集覆盖激活中
        this._resourceGatherTarget = null;     // 采集目标位置key（如'lumber_camp'/'frozen_lake'）
        this._resourceGatherType = null;       // 采集资源类型: 'wood'|'food'|null
        this._resourceGatherTravelTimer = 0;   // 采集超时兜底计时（秒）
        this._resourceGatherCooldown = 0;      // 采集触发冷却计时器（秒）

        // ============ 状态驱动行为覆盖系统 ============
        // 类似饥饿覆盖，当NPC状态极差时打断日程执行紧急行为
        this._stateOverride = null;     // 当前状态覆盖类型: 'exhausted'|'sick'|'mental'|null
        this._stateOverrideTarget = null; // 状态覆盖的导航目标 (同hungerTarget格式)
        this._stateOverrideCooldown = 0;  // 状态覆盖触发冷却（秒），避免反复触发
        this._stateOverrideStuckTimer = 0; // 卡住检测计时
        this._stateOverrideTravelTimer = 0; // 超时兜底计时
        this._stateOverrideMaxTimer = 0;   // 状态覆盖最大持续时间计时（超时保护）
        this._isBeingTreated = false;   // 正在被治疗中（看病）
        this._treatmentTimer = 0;       // 治疗持续时间

        // 社交找不到人冷却
        this._noOneFoundCooldown = 0;   // 找不到人后的冷却计时（秒）

        // 进出门过渡系统
        this._walkingToDoor = false;    // 正在走向室内门口准备出门
        this._indoorEntryProtection = 0; // 进屋保护期计时器（秒），进入室内后短暂冻结跨场景导航防止闪现
        this._outdoorCooldown = 0;       // 户外冷却期（秒），P0体温避险清除后短暂阻止导航到户外
        this._exitDoorTarget = null;    // 出门后的目标 {scene, x, y}
        this._enterWalkTarget = null;   // 进门后需要走到的室内目标位置

        // 社交走路系统：wantChat走向目标NPC后自动发起对话
        this._chatWalkTarget = null;    // 正在走向的聊天目标NPC id

        // ============ 发呆兜底检测系统 ============
        this._idleWatchdogTimer = 0;      // 发呆计时器（秒）
        this._idleWatchdogCount = 0;      // 兜底触发次数
        this._idleWatchdogResetTime = 0;  // 兜底触发计数重置时间

        // ============ 核心属性系统（v2.2）============
        const a = config.attrs || {};
        this.stamina  = a.stamina  ?? 50;  // 💪 体力 (0~100) 每天工作消耗，休息恢复
        this.health   = a.health   ?? 50;  // 🫀 健康 (0~100) 身体状况，低了会生病

        // San值系统（精神值，类似《饥荒》的san值）
        this.sanity = a.sanity ?? 70; // 🧠 San值 (0~100) 精神状态，通宵/劳累降低，社交/娱乐/睡眠恢复

        // 【v2.2】废弃属性保留但不再参与计算
        this.savings  = 0;
        this.charisma = 50;
        this.wisdom   = 50;
        this.empathy  = 50;

        // 属性变化计时器（缓慢变化，每游戏小时触发一次检查）
        this._attrUpdateTimer = 0;
        // 生病状态
        this.isSick = false;
        this.sickTimer = 0; // 生病持续时间（游戏小时）

        // 发疯状态（San值过低触发）
        this.isCrazy = false;
        this.crazyTimer = 0; // 发疯持续时间

        // ============ 极寒生存属性 ============
        this.bodyTemp = 36.5;           // 🌡️ 体温 (25°C~36.5°C)，低于35失温，低于30严重失温
        this.isDead = false;            // 💀 是否死亡
        this._deathCause = null;        // 死亡原因: '冻死'|'饿死'|'精神崩溃致死'|null
        this._deathTime = null;         // 死亡时间
        this.isHypothermic = false;     // 🥶 失温状态（体温<35°C）
        this.isSevereHypothermic = false; // 🧊 严重失温（体温<30°C，倒地不起）
        this.isFrostbitten = false;     // 冻伤状态
        this._outdoorContinuousTime = 0; // 连续户外时间（秒）
        this._rescueNeeded = false;     // 是否需要救援（严重失温倒地）
        this._rescueTimer = 0;          // 救援倒计时（秒），超时冻死

        // ============ 极端状态持续计时器（用于死亡判定）============
        this._zeroStaminaDuration = 0;  // 体力=0的持续秒数
        this._zeroHungerDuration = 0;   // 饱腹=0的持续秒数
        this._zeroCrazyDuration = 0;    // San=0且发疯的持续秒数
        this._hypothermiaDuration = 0;  // 【v2.0】体温<33°C的持续秒数（用于失温致死判定）
        this._isDying = false;          // 【v2.0】濒死状态
        this._dyingTimer = 0;           // 【v2.0】濒死状态计时器（秒）

        // ============ 户外工作时间追踪 ============
        this._outdoorWorkDuration = 0;  // 当前户外连续工作秒数
        this._outdoorForceReturn = false; // 是否已触发强制回室内

        // 看演出/心理咨询状态
        this.isWatchingShow = false;  // 正在看歆玥演出
        this.isInTherapy = false;     // 正在接受苏医生心理咨询

        // ============ 任务驱动覆盖系统（三层优先级P1层） ============
        this._taskOverride = {
            taskId: null,           // 当前覆盖的任务ID
            targetLocation: null,   // 目标位置key（SCHEDULE_LOCATIONS中的key）
            isActive: false,        // 是否激活
            priority: 'normal',     // 优先级: 'urgent'|'high'|'normal'
            resourceType: null,     // 关联的资源类型（用于采集任务）
        };
        this._taskOverrideStuckTimer = 0;  // 任务覆盖卡住检测
        this._taskOverrideTravelTimer = 0; // 任务覆盖超时兜底
        this._behaviorPriority = 'P2';     // 当前行为层级标记: 'P0'|'P1'|'P2'

        // ============ 日程导航超时兜底 ============
        this._navStartTime = 0;            // 导航开始时间（Date.now()）
        this._scheduleNavTimer = 0;        // 日程导航累计时间（秒）
        this._scheduleNavTarget = null;    // 当前日程导航目标key

        // ============ LLM行动决策系统 ============
        this._actionDecisionCooldown = 0;       // 行动决策冷却计时器（秒）
        this._actionDecisionInterval = 45 + Math.random() * 30; // 45~75秒做一次行动决策
        this._pendingAction = null;             // 待执行的行动 { type, target, reason, priority, companion }
        this._currentAction = null;             // 正在执行的行动
        this._actionOverride = false;           // 是否正在覆盖日程
        this._actionTarget = null;              // 行动覆盖的导航目标
        this._actionStuckTimer = 0;             // 行动卡住检测
        this._actionTravelTimer = 0;            // 行动超时兜底
        this._companionTarget = null;           // 被邀请一起走的目标NPC id
        this._isCompanion = false;              // 当前是否作为同伴跟随中
        this._companionLeader = null;           // 正在跟随的领导者NPC id
        this._companionDestination = null;      // 同伴模式的目标位置key
        this._companionStartTime = 0;           // 同伴模式开始时间（用于超时释放）
        this._lastActionThought = '';           // 上一次行动决策的思考记录（供think参考）

        // ============ Debug日志系统 ============
        this._debugLog = [];            // 行动轨迹日志 [{time, type, detail}]
        this._debugDialogueLog = [];    // 对话记录日志 [{time, partner, lines}]
        this._maxDebugLog = 100;        // 最多保留100条行动日志
        this._maxDebugDialogue = 20;    // 最多保留20条对话记录
        this._lastLoggedState = '';     // 上一次记录的状态（避免重复记录相同状态）

        // ============ 目标系统 ============
        // 从config中加载目标模板，初始化每个目标的运行时状态
        this.goals = (config.goals || []).map(g => ({
            ...g,
            completed: false,       // 是否已完成
            progress: 0,            // 当前进度（0~targetValue）
            rewarded: false,        // 是否已领取奖励
            completedDay: -1,       // 完成的天数（用于daily目标重置）
        }));
        // 每日追踪计数器（每天重置）
        this._goalTrackers = {
            chatCount: 0,       // 今天聊了几个不同的人
            chatPartners: [],   // 今天聊过的人id列表（用于去重）
            workHours: 0,       // 今天工作了多少小时
            studyHours: 0,      // 今天学习了多少小时
            performCount: 0,    // 今天演出了几次
            // 【任务10】末日生存目标追踪
            mealsToday: 0,      // 今天吃了几顿
            woodChopped: 0,     // 今天砍了多少木柴
                gatherCount: 0,     // 今天采集了多少次（食物/电力/探索）
            frostbiteSaved: 0,  // 今天治疗了几人冻伤
            rareItemsFound: 0,  // 今天发现了几个稀有物品
            patrolCount: 0,     // 今天巡逻了几次
            conflictsResolved: 0, // 今天调解了几次冲突
            medkitsCrafted: 0,  // 今天制作了几个急救包
        };
        this._goalCheckTimer = 0;    // 目标检测计时器
        this._lastGoalDay = -1;      // 上次重置目标的天数

        // ============ 统一行为锁系统（BehaviorLock） ============
        // 防止多个覆盖系统互相打断，确保吃饭/休息/睡觉等行为完整执行
        this._currentBehaviorLock = null;   // 当前行为锁 { type: string, priority: number, startTime: number } 或 null
        this._pendingBehaviors = [];         // 待执行行为队列（最多3个）[{ type, priority, callback }]
        this._activeOverride = 'none';       // 当前覆盖系统快照: 'none'|'hunger'|'state'|'action'|'resource'|'task'

        // 游戏引用
        this.game = game;
    }

    // ============ Debug日志方法 ============
    /**
     * 记录debug行动日志
     * @param {string} type - 日志类型: 'think'|'action'|'schedule'|'state'|'override'|'chat'|'move'|'eat'|'sleep'
     * @param {string} detail - 日志详情
     */

    _logDebug(type, detail) {
        // collision类型在所有模式下都记录（调试碰撞卡死问题）
        if (type !== 'collision' && (!this.game || this.game.mode !== 'debug')) return;
        const time = this.game ? this.game.getTimeStr() : '??:??';
        const day = (this.game && this.game.dayCount) || 0;
        const realTime = new Date().toLocaleString('zh-CN', { hour12: false });
        const entry = { time, day, realTime, type, detail, timestamp: Date.now() };
        this._debugLog.unshift(entry);
        if (this._debugLog.length > this._maxDebugLog) this._debugLog.pop();
        // 同时输出到控制台，便于实时查看（含真实时间和游戏天数）
        console.log(`[DEBUG·${this.name}] [D${day} ${time}] [${realTime}] [${type}] ${detail}`);
    }

    /**
     * 记录debug对话日志
     * @param {string} partner - 对话对象
     * @param {Array} lines - 对话内容 [{speaker, text}]
     */

    _logDebugDialogue(partner, lines) {
        if (!this.game || this.game.mode !== 'debug') return;
        const time = this.game.getTimeStr();
        const day = this.game.dayCount || 0;
        const realTime = new Date().toLocaleString('zh-CN', { hour12: false });
        const entry = { time, day, realTime, partner, lines, timestamp: Date.now() };
        this._debugDialogueLog.unshift(entry);
        if (this._debugDialogueLog.length > this._maxDebugDialogue) this._debugDialogueLog.pop();
    }

    /**
     * 获取格式化的debug日志（供UI面板显示）
     */

    getDebugLogText() {
        if (this._debugLog.length === 0) return '暂无行动记录';
        return this._debugLog.slice(0, 50).map(e => {
            const icon = {
                'think': '💭', 'action': '🎯', 'schedule': '📅', 'state': '⚡',
                'override': '🔄', 'chat': '💬', 'move': '🚶', 'eat': '🍜',
                'sleep': '😴', 'sanity': '🧠', 'hunger': '🍽️', 'health': '🏥',
                'goal': '🎯', 'reward': '⚖️', 'penalty': '⚠️'
            }[e.type] || '📝';
            const dayStr = e.day !== undefined ? `D${e.day} ` : '';
            return `[${dayStr}${e.time}] ${icon} ${e.detail}`;
        }).join('\n');
    }

    /**
     * 获取格式化的debug对话日志
     */

    getDebugDialogueText() {
        if (this._debugDialogueLog.length === 0) return '暂无对话记录';
        return this._debugDialogueLog.map(d => {
            const dayStr = d.day !== undefined ? `D${d.day} ` : '';
            const realTimeStr = d.realTime ? ` (${d.realTime})` : '';
            const header = `=== [${dayStr}${d.time}]${realTimeStr} 与 ${d.partner} 的对话 ===`;
            const body = d.lines.map(l => `  ${l.speaker}: ${l.text}`).join('\n');
            return header + '\n' + body;
        }).join('\n\n');
    }

    // ============ 统一行为锁（BehaviorLock）核心方法 ============

    /**
     * 尝试获取行为锁
     * @param {string} type - 行为类型（如'eating','sleeping','resting','treating','gathering'）
     * @param {number} priority - 行为优先级（使用BEHAVIOR_PRIORITY常量）
     * @param {Function} [callback] - 如果被放入pending队列，恢复时的回调
     * @returns {boolean} true=成功获取锁，false=被拒绝（已放入pending队列）
     */

    _acquireBehaviorLock(type, priority, callback) {
        // 无锁时直接获取
        if (!this._currentBehaviorLock) {
            this._currentBehaviorLock = {
                type: type,
                priority: priority,
                startTime: this.game ? this.game.gameTime : Date.now()
            };
            this._logDebug('override', `[行为锁] 获取锁: ${type}(优先级${priority})`);
            return true;
        }

        // 新行为优先级更高，抢占
        if (priority > this._currentBehaviorLock.priority) {
            const oldType = this._currentBehaviorLock.type;
            const oldPriority = this._currentBehaviorLock.priority;
            this._logDebug('override', `[行为锁] 抢占: ${type}(${priority}) 替换 ${oldType}(${oldPriority})`);
            this._currentBehaviorLock = {
                type: type,
                priority: priority,
                startTime: this.game ? this.game.gameTime : Date.now()
            };
            return true;
        }

        // 优先级不够，放入待执行队列
        if (callback) {
            // 检查队列中是否已有同类型行为
            const existing = this._pendingBehaviors.findIndex(b => b.type === type);
            if (existing >= 0) {
                this._pendingBehaviors[existing] = { type, priority, callback };
            } else {
                this._pendingBehaviors.push({ type, priority, callback });
                // 队列最多3个，超出丢弃最低优先级
                if (this._pendingBehaviors.length > 3) {
                    this._pendingBehaviors.sort((a, b) => b.priority - a.priority);
                    const dropped = this._pendingBehaviors.pop();
                    this._logDebug('override', `[行为锁] pending队列满，丢弃: ${dropped.type}(${dropped.priority})`);
                }
            }
            this._logDebug('override', `[行为锁] 拒绝 ${type}(${priority})，当前锁: ${this._currentBehaviorLock.type}(${this._currentBehaviorLock.priority})，放入pending`);
        } else {
            this._logDebug('override', `[行为锁] 拒绝 ${type}(${priority})，当前锁: ${this._currentBehaviorLock.type}(${this._currentBehaviorLock.priority})`);
        }
        return false;
    }

    /**
     * 释放行为锁，并自动执行pending队列中最高优先级的行为
     * @param {string} expectedType - 期望释放的行为类型（安全校验，防止误释放）
     * @returns {boolean} true=释放成功
     */

    _releaseBehaviorLock(expectedType) {
        if (!this._currentBehaviorLock) {
            return false;
        }
        if (expectedType && this._currentBehaviorLock.type !== expectedType) {
            this._logDebug('override', `[行为锁] 释放失败: 期望${expectedType}，实际${this._currentBehaviorLock.type}`);
            return false;
        }
        const releasedType = this._currentBehaviorLock.type;
        this._currentBehaviorLock = null;
        this._logDebug('override', `[行为锁] 释放锁: ${releasedType}`);

        // 自动执行pending队列中最高优先级的行为
        this._executePendingBehavior();
        return true;
    }

    /**
     * 执行pending队列中最高优先级的行为
     */

    _executePendingBehavior() {
        if (this._pendingBehaviors.length === 0) return;

        // 按优先级排序，取最高的
        this._pendingBehaviors.sort((a, b) => b.priority - a.priority);
        const next = this._pendingBehaviors.shift();
        this._logDebug('override', `[行为锁] 从pending队列执行: ${next.type}(${next.priority})`);

        if (next.callback && typeof next.callback === 'function') {
            try {
                next.callback();
            } catch (e) {
                console.warn(`[行为锁] pending回调执行失败: ${next.type}`, e);
            }
        }
    }

    /**
     * 检查当前是否持有行为锁
     * @returns {boolean}
     */

    _hasBehaviorLock() {
        return this._currentBehaviorLock !== null;
    }

    /**
     * 获取当前行为锁的优先级
     * @returns {number} 当前锁优先级，无锁返回-1
     */

    _getBehaviorLockPriority() {
        return this._currentBehaviorLock ? this._currentBehaviorLock.priority : -1;
    }

    /**
     * 获取当前行为锁的类型
     * @returns {string|null}
     */

    _getBehaviorLockType() {
        return this._currentBehaviorLock ? this._currentBehaviorLock.type : null;
    }

    /**
     * 获取P0紧急层的动态阈值（根据当前行为锁优先级调整）
     * @returns {{ healthThreshold: number, staminaThreshold: number, tempThreshold: number }}
     */

    _getP0Thresholds() {
        const lockPriority = this._getBehaviorLockPriority();
        if (lockPriority >= GST.BEHAVIOR_PRIORITY.BASIC_NEED) {
            // 正在吃饭/睡觉/治疗中，阈值收紧
            return {
                healthThreshold: 10,    // 从<20收紧到<10
                staminaThreshold: 5,    // 从<20收紧到<5
                tempThreshold: 35       // 体温维持<35°C不变
            };
        }
        // 无锁或低优先级锁，使用原始阈值
        return {
            healthThreshold: 20,
            staminaThreshold: 20,
            tempThreshold: 35
        };
    }

    /**
     * 行为锁超时安全网检查（在update头部调用）
     * 防止因bug导致NPC永久卡在某个行为中
     */

    _checkBehaviorLockTimeout() {
        if (!this._currentBehaviorLock || !this.game) return;
        const elapsed = this.game.gameTime - this._currentBehaviorLock.startTime;
        if (elapsed > 120) { // 120秒游戏时间
            const lockType = this._currentBehaviorLock.type;
            const lockPriority = this._currentBehaviorLock.priority;
            console.warn(`[行为锁超时] ${this.name} 行为锁 ${lockType}(${lockPriority}) 持续${elapsed.toFixed(0)}秒游戏时间，强制释放`);
            this._logDebug('override', `[行为锁超时] ${lockType}(${lockPriority}) 持续${elapsed.toFixed(0)}秒，强制释放`);
            this._currentBehaviorLock = null;
            // 清空pending队列中过期的行为
            this._pendingBehaviors = [];
        }
    }

    getSortY() { return this.y + GST.TILE - 2; }

    getGridPos() {
        return {
            x: Math.floor((this.x + this.width / 2) / GST.TILE),
            y: Math.floor((this.y + this.height / 2) / GST.TILE)
        };
    }

    addMemory(data) {
        const time = this.game ? this.game.getTimeStr() : '';
        // 支持结构化数据和纯文本两种格式
        if (typeof data === 'string') {
            // 兼容旧格式：纯文本
            let type = 'event';
            if (data.startsWith('[想法]')) type = 'thought';
            else if (data.startsWith('和') && data.includes('聊天')) type = 'chat';
            this.memories.push({ time, text: data, type });
        } else {
            // 新格式：结构化对象 { type, text, lines?, partner? }
            this.memories.push({ time, ...data });
        }
        if (this.memories.length > this.maxMemories) this.memories.shift();
    }

    getAffinity(otherId) {
        return this.affinity[otherId] ?? 50;
    }

    changeAffinity(otherId, delta) {
        const cur = this.getAffinity(otherId);
        this.affinity[otherId] = Math.max(0, Math.min(100, cur + delta));
    }

    /** 【轮回系统】应用前世记忆加成 */

    _applyReincarnationBonus(game) {
        if (!game || !game.reincarnationSystem) return;
        const rs = game.reincarnationSystem;
        const lifeNum = rs.getLifeNumber();
        if (lifeNum <= 1) return; // 第1世无加成

        console.log(`[NPC-轮回] ${this.name} 应用第${lifeNum}世轮回加成`);

        // 【难度系统】获取轮回Buff强度倍率
        const reincBuffMult = (game.getDifficultyMult) ? game.getDifficultyMult('reincarnationBuffMult') : 1.0;

        // 1. San值加成：min(100, 基础值 + 5 × 世数 × 难度倍率)
        if (this.sanity !== undefined) {
            const bonus = Math.round(5 * lifeNum * reincBuffMult);
            this.sanity = Math.min(100, this.sanity + bonus);
            console.log(`  San值加成: +${bonus} (×${reincBuffMult}) → ${Math.round(this.sanity)}`);
        }

        // 2. 上一世死亡同伴好感度+10（×难度倍率）
        const deathRecords = rs.getLastLifeDeathRecords();
        for (const record of deathRecords) {
            // 通过名字匹配NPC ID
            const deadNpc = (typeof GST.NPC_CONFIGS !== 'undefined') 
                ? GST.NPC_CONFIGS.find(c => c.name === record.name)
                : null;
            if (deadNpc && deadNpc.id !== this.id) {
                const cur = this.getAffinity(deadNpc.id);
                const affinityBonus = Math.round(10 * reincBuffMult);
                this.affinity[deadNpc.id] = Math.min(100, cur + affinityBonus);
                console.log(`  好感度加成: 对${record.name}(上世死亡) +${affinityBonus} → ${this.affinity[deadNpc.id]}`);
            }
        }

        // 3. 上一世冲突对象好感度-5
        const conflicts = rs.getLastLifeConflictEvents();
        for (const event of conflicts) {
            // 尝试从事件文本中提取NPC名字
            if (typeof GST.NPC_CONFIGS !== 'undefined') {
                for (const cfg of GST.NPC_CONFIGS) {
                    if (cfg.id !== this.id && event.text && event.text.includes(cfg.name) && event.text.includes(this.name)) {
                        const cur = this.getAffinity(cfg.id);
                        this.affinity[cfg.id] = Math.max(0, cur - 5);
                        console.log(`  好感度惩罚: 对${cfg.name}(上世冲突) -5 → ${this.affinity[cfg.id]}`);
                    }
                }
            }
        }

        // 4. 如果自己上一世死亡，添加初始记忆
        if (rs.wasNpcDeadLastLife(this.id)) {
            const deathCause = rs.getNpcDeathCauseLastLife(this.id);
            this.addMemory(`[前世残影] 你隐约记得自己曾经${deathCause === '冻死' ? '在极度寒冷中失去意识' : deathCause === '饿死' ? '在饥饿中慢慢衰弱' : '经历了可怕的事情'}…那种恐惧至今挥之不去。`, 'reincarnation');
        }
    }

    /** 是否正处于休息缓冲期 */
    get isRestingCooldown() { return this._restCooldownTimer > 0; }

    // ---- 更新 ----

    update(dt, game) {
        // 【死亡短路】死亡NPC跳过全部行为逻辑
        if (this.isDead) return;

        // 【行为锁超时安全网】防止因bug导致NPC永久卡在某个行为中
        this._checkBehaviorLockTimeout();

        // 【场景一致性校验】确保NPC的currentScene在已知场景列表中，否则重置到village
        if (game && game.maps) {
            if (!game.maps[this.currentScene]) {
                console.warn(`[场景修正] ${this.name} 的currentScene="${this.currentScene}" 不在已知场景中，重置到village`);
                this.currentScene = 'village';
                this.x = 15 * GST.TILE;
                this.y = 15 * GST.TILE;
                this.currentPath = [];
                this.pathIndex = 0;
                this.isMoving = false;
            } else {
                // 【坐标边界校验】确保NPC坐标在当前场景地图范围内
                const curMap = game.maps[this.currentScene];
                const maxPx = (curMap.width - 1) * GST.TILE;
                const maxPy = (curMap.height - 1) * GST.TILE;
                if (this.x < 0 || this.x > maxPx || this.y < 0 || this.y > maxPy) {
                    console.warn(`[坐标修正] ${this.name} 坐标(${(this.x/GST.TILE).toFixed(1)},${(this.y/GST.TILE).toFixed(1)})超出${this.currentScene}边界(${curMap.width}x${curMap.height})，钳制到有效范围`);
                    this.x = Math.max(0, Math.min(this.x, maxPx));
                    this.y = Math.max(0, Math.min(this.y, maxPy));
                }
            }
        }

        // 表情计时器
        if (this.expressionTimer > 0) {
            this.expressionTimer -= dt;
            if (this.expressionTimer <= 0) this.expression = '';
        }

        // 冷却计时器递减（使用真实时间，不受倍速影响，避免5倍速下冷却太快导致行为抖动）
        const _speedMult = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
        const _realDt = _speedMult > 0 ? dt / _speedMult : dt;
        if (this._noOneFoundCooldown > 0) this._noOneFoundCooldown -= _realDt;
        if (this._hungerTriggerCooldown > 0) this._hungerTriggerCooldown -= _realDt;
        // 【进屋保护期递减】使用真实时间，避免5倍速下保护期秒过
        if (this._indoorEntryProtection > 0) this._indoorEntryProtection -= _realDt;
        // 【户外冷却期递减】P0体温避险清除后的保护，使用真实时间
        if (this._outdoorCooldown > 0) this._outdoorCooldown -= _realDt;

        // 【休息缓冲期递减】缓冲期结束时恢复日程接管
        // 【行为锁优化】改为条件驱动：体力>=40或经过60秒游戏时间
        if (this._restCooldownTimer > 0) {
            this._restCooldownTimer -= dt;
            // 【硬保护B4】缓冲期内渐进恢复体力（每秒+2）
            this.stamina = Math.min(100, this.stamina + 2 * dt);
            // 【边界保护】极度饥饿(hunger<10)可以穿透休息缓冲期
            if (this.hunger < 10) {
                console.log(`[饥饿穿透] ${this.name} 休息缓冲期中极度饥饿(${Math.round(this.hunger)})，穿透缓冲期去吃饭`);
                this._logDebug('override', `[饥饿穿透] 极度饥饿(${Math.round(this.hunger)})穿透休息缓冲期`);
                this._restCooldownTimer = 0;
                this._clearActionOverride();
                this._releaseBehaviorLock('resting');
                this._triggerHungerBehavior(game);
            }
            const restDone = this._restCooldownTimer <= 0 || this.stamina >= 40;
            if (restDone) {
                const reason = this.stamina >= 40 ? `体力恢复到${Math.round(this.stamina)}` : `缓冲期到期`;
                this._restCooldownTimer = 0;
                console.log(`[休息结束] ${this.name} ${reason}，检查后续行为`);
                this._logDebug('override', `[休息完毕] ${reason}`);
                this.stateDesc = '休息完毕';
                this._clearActionOverride();
                this._releaseBehaviorLock('resting'); // 释放休息行为锁
                // 【硬保护B4】缓冲期结束后自动检查饥饿状态
                if (this.hunger < 35) {
                    console.log(`[休息→吃饭] ${this.name} 休息完毕但饥饿(${Math.round(this.hunger)})，自动触发饮食行为`);
                    this._logDebug('override', `[休息→吃饭] 休息后饥饿(${Math.round(this.hunger)})，触发饮食`);
                    this._triggerHungerBehavior(game);
                } else {
                    this.currentScheduleIdx = -1;
                    this.scheduleReached = false;
                    console.log(`[休息结束] ${this.name} 体力充足且不饥，日程系统恢复接管`);
                }
            }
        }

        // 【吵架冷淡期递减】冷淡期内不会被动增加好感度
        if (this._affinityCooldown) {
            for (const id in this._affinityCooldown) {
                if (this._affinityCooldown[id] > 0) {
                    this._affinityCooldown[id] -= dt;
                }
            }
        }

        // 【老钱被动光环】镇长讲话 - 当老钱在暖炉广场且同场景存活NPC≥3人时，自动为在场NPC恢复San值
        if (this.id === 'old_qian' && !this.isDead && game && game.npcs) {
            // 判断老钱是否在暖炉广场（village场景的furnace_plaza区域，或直接用currentScene判断）
            const isAtFurnacePlaza = this.currentScene === 'village' && 
                this.x >= 20 * GST.TILE && this.x <= 30 * GST.TILE && this.y >= 18 * GST.TILE && this.y <= 26 * GST.TILE;
            if (isAtFurnacePlaza) {
                const sameSceneAlive = game.npcs.filter(n => 
                    n.id !== this.id && !n.isDead && n.currentScene === this.currentScene
                );
                if (sameSceneAlive.length >= 3) {
                    // 每秒为在场NPC恢复+0.03 San值（纯被动，不依赖安抚工作状态）
                    for (const npc of sameSceneAlive) {
                        if (npc.sanity < 100) {
                            npc.sanity = Math.min(100, npc.sanity + 0.03 * dt);
                        }
                    }
                }
            }
        }

        // 【v2.0】濒死状态：停止所有活动，仅更新属性和体温
        if (this._isDying) {
            this._updateAttributes(dt, game);
            this._updateBodyTemp(dt, game);
            return; // 濒死NPC不执行任何行动逻辑
        }

        // 【进出门过渡】如果正在走向室内门口准备出门
        if (this._walkingToDoor) {
            this._updateDoorWalk(dt, game);
            return; // 出门过渡期间不执行其他逻辑
        }

        // 六大属性系统更新
        this._updateAttributes(dt, game);

        // 行动实效性系统更新（让日程行为产生实际效果）
        this._updateActionEffect(dt, game);

        // 【新增】全局急救包自动使用检查（独立于medical_heal，每帧执行）
        this._checkAutoMedkit(dt, game);

        // 饥饿系统更新
        // 【修复】睡眠状态必须在饥饿之前更新，避免竞争条件：
        // 旧顺序：_updateHunger(饿醒) → _updateSleepState(立刻重新入睡) → 无限循环
        // 新顺序：_updateSleepState(稳定入睡/起床) → _updateHunger(在确定的清醒状态下检查饥饿)
        this._updateSleepState(game);

        this._updateHunger(dt, game);
        // 如果在睡觉，只更新 Zzz 动画，不做其他事
        if (this.isSleeping) {
            this.sleepZTimer += dt;
            this.isMoving = false;
            this.animFrame = 0;
            // 【强制睡眠计时】累加强制睡眠持续时间
            if (this._forcedSleep) {
                this._forcedSleepTimer += dt;
            }
            // 【行为锁保护】睡眠期间仅致命紧急(health<10 || bodyTemp<33)才允许唤醒
            // P0层穿透检查：如果有致命紧急情况，不返回，让后续逻辑处理
            const fatalDuringSleep = (this.health < 10) || (this.bodyTemp !== undefined && this.bodyTemp < 33);
            if (!fatalDuringSleep) {
                return; // 非致命情况，继续睡觉
            }
            // 致命紧急，允许穿透到后续逻辑（不返回），同时清除强制睡眠标记
            if (this._forcedSleep) {
                this._forcedSleep = false;
                this._forcedSleepTimer = 0;
                this._logDebug('sleep', `[强制睡眠] 致命紧急穿透强制睡眠`);
            }
            this._logDebug('override', `[行为锁] 睡眠中触发致命紧急(健康${Math.round(this.health)},体温${this.bodyTemp?.toFixed(1)})，允许唤醒`);
        }

        // 状态驱动行为覆盖（疲劳回家、生病看病、精神差求助）
        this._updateStateOverride(dt, game);

        // 资源采集覆盖（木柴/食物紧缺时自动派去采集）
        this._checkResourceGatherNeed(game);
        this._updateResourceGatherOverride(dt, game);

        // 【v2.0-优化】资源紧张时强制结束聊天（基于 tension 统一判断）
        if (this.state === 'CHATTING' && game && game.resourceSystem) {
            if (!this._chatUrgencyCheckTimer) this._chatUrgencyCheckTimer = 0;
            this._chatUrgencyCheckTimer += dt;
            if (this._chatUrgencyCheckTimer >= 5) { // 每5秒检查一次
                this._chatUrgencyCheckTimer = 0;
                const tension = game.resourceSystem.getResourceTension();
                if (tension >= 0.5) {
                    this._forceEndChat();
                    if (game.addEvent) {
                        game.addEvent(`⚡ ${this.name}因资源紧张（${(tension * 100).toFixed(0)}%）停止聊天，前往工作！`);
                    }
                    this._logDebug('chat', `资源紧张度${tension.toFixed(2)}>=0.5，强制结束聊天`);
                }
            }
        }

        // LLM行动决策系统更新（覆盖检测、同伴到达检测等）
        this._updateActionOverride(dt, game);

        // 下雨避雨检查
        this._updateRainResponse(game);

        // 日程检查
        this._updateSchedule(dt, game);

        // 【兜底】发呆检测与自动恢复
        this._updateIdleWatchdog(dt, game);

        // 【增强】让路逻辑处理：如果被碰撞系统指派了让路目标，优先执行让路移动
        if (this._yieldMove) {
            this._yieldTimer = (this._yieldTimer || 0) + dt;
            const ytx = this._yieldMove.x * GST.TILE;
            const yty = this._yieldMove.y * GST.TILE;
            const ydx = ytx - this.x;
            const ydy = yty - this.y;
            const ydist = Math.sqrt(ydx * ydx + ydy * ydy);

            if (ydist < 3 || this._yieldTimer > 2.0) {
                // 让路完成或超时，清除让路状态
                if (ydist < 3) {
                    this.x = ytx;
                    this.y = yty;
                }
                this._yieldMove = null;
                this._yieldTimer = 0;
                this.collisionStallTimer = 0;
                // 恢复之前保存的路径
                if (this._savedPath) {
                    this.currentPath = this._savedPath.path;
                    this.pathIndex = this._savedPath.index;
                    this._savedPath = null;
                    // 重新寻路到原目标（因为位置变了）
                    if (this.currentPath.length > 0) {
                        const finalTarget = this.currentPath[this.currentPath.length - 1];
                        this.currentPath = [];
                        this.pathIndex = 0;
                        this._pathTo(finalTarget.x, finalTarget.y, game);
                    }
                }
                this.isMoving = false;
            } else {
                // 朝让路目标移动
                const ynx = ydx / ydist;
                const yny = ydy / ydist;
                const yStep = Math.min(this.speed * dt, ydist - 1);
                this.x += ynx * yStep;
                this.y += yny * yStep;
                this.isMoving = true;
                // 面向方向
                if (Math.abs(ydx) >= Math.abs(ydy)) {
                    this.facing = ydx < 0 ? 1 : 2;
                } else {
                    this.facing = ydy < 0 ? 3 : 0;
                }
            }
        }
        // 移动
        else if (this.currentPath.length > 0) {
            if (this.pathIndex < this.currentPath.length) {
                this._followPath(dt, game);
                // 【增强】走向聊天目标途中：持续检测距离和目标状态
                if (this._chatWalkTarget) {
                    const chatTarget = game.npcs.find(n => n.id === this._chatWalkTarget);
                    if (!chatTarget || chatTarget.currentScene !== this.currentScene) {
                        // 目标已离开同场景，放弃走路
                        this._chatWalkTarget = null;
                        this.currentPath = [];
                        this.pathIndex = 0;
                        this.isMoving = false;
                        this.state = 'IDLE';
                        this.expression = chatTarget ? `${chatTarget.name}走了…` : '';
                        this.expressionTimer = 4;
                        this._logDebug('chat', `聊天目标已离开同场景，放弃追踪`);
                    } else {
                        // 目标还在，检测距离——足够近时提前发起对话
                        const myPos = this.getGridPos();
                        const tPos = chatTarget.getGridPos();
                        const dist = Math.abs(myPos.x - tPos.x) + Math.abs(myPos.y - tPos.y);
                        if (dist <= 4 && chatTarget.state !== 'CHATTING' && this.state !== 'CHATTING' && this._canChatWith(chatTarget)) {
                            // 已经走到足够近，提前发起对话
                            const chatTargetId = this._chatWalkTarget;
                            this._chatWalkTarget = null;
                            this.currentPath = [];
                            this.pathIndex = 0;
                            this.isMoving = false;
                            this.state = 'IDLE';
                            game.dialogueManager && game.dialogueManager.startNPCChat(this, chatTarget);
                            if (game.addEvent) {
                                game.addEvent(`🤝 ${this.name} 走到 ${chatTarget.name} 旁边开始聊天`);
                            }
                            this._logDebug('chat', `途中检测到距离${dist}格，提前发起对话`);
                        }
                    }
                }
            } else {
                // 路径走完了（pathIndex >= length），检查是否需要进入建筑
                this.currentPath = [];
                this.pathIndex = 0;
                this.isMoving = false;
                this.state = 'IDLE';

                if (this._pendingEnterScene) {
                    // 【进门流程】到达建筑门口，直接传送到室内座位（不经门口中转）
                    this._enterIndoor(this._pendingEnterScene, game);
                } else if (this._enterWalkTarget) {
                    // 【修复】进门后走向室内目标的路径走完了，检查是否真正到达
                    const pos = this.getGridPos();
                    const ewt = this._enterWalkTarget;
                    const distToTarget = Math.abs(pos.x - ewt.x) + Math.abs(pos.y - ewt.y);
                    if (distToTarget <= 3) {
                        // 已到达室内目标
                        this._enterWalkTarget = null;
                        this.scheduleReached = true;
                    } else {
                        // 还没到达，可能寻路走了一段但没到位，直接传送过去
                        console.log(`[进门修复] ${this.name} 路径走完但离室内目标(${ewt.x},${ewt.y})还有${distToTarget}格，直接传送`);
                        this.x = ewt.x * GST.TILE;
                        this.y = ewt.y * GST.TILE;
                        this._enterWalkTarget = null;
                        this.scheduleReached = true;
                    }
                } else if (this._chatWalkTarget) {
                    // 【修复】wantChat走路到达目标附近，自动发起对话
                    const chatTargetId = this._chatWalkTarget;
                    this._chatWalkTarget = null;
                    const target = game.npcs.find(n => n.id === chatTargetId);
                    // 【关键修复】到达后再次验证同场景，防止目标已离开导致隔空对话
                    if (target && target.currentScene === this.currentScene
                        && target.state !== 'CHATTING' && this.state !== 'CHATTING' && this._canChatWith(target)) {
                        game.dialogueManager && game.dialogueManager.startNPCChat(this, target);
                        if (game.addEvent) {
                            game.addEvent(`🤝 ${this.name} 走到 ${target.name} 旁边开始聊天`);
                        }
                    } else if (target && target.currentScene !== this.currentScene) {
                        this.expression = `${target.name}已经走了…`;
                        this.expressionTimer = 4;
                    }
                    // 走完社交路径后恢复日程已到达状态（不影响日程）
                    // scheduleReached 保持之前的值不变
                } else {
                    // 普通路径走完
                    this.scheduleReached = true;
                }
            }
        } else {
            this.isMoving = false;
            // 静止时逐渐衰减碰撞累积计时器
            if (this.collisionStallTimer > 0) {
                this.collisionStallTimer = Math.max(0, this.collisionStallTimer - dt * 0.3);
            }
        }

        // 【修复】位置合法性检测：站着不动的NPC如果被碰撞推进了墙壁/实体区域，自动恢复
        if (!this.isMoving && this.currentPath.length === 0) {
            const map = game.maps[this.currentScene];
            if (map && map.isSolid(this.x + GST.TILE / 2, this.y + GST.TILE / 2)) {
                // NPC当前位置在实体区域内，搜索最近的可通行位置
                let found = false;
                for (let r = 1; r <= 5 && !found; r++) {
                    for (let dy = -r; dy <= r && !found; dy++) {
                        for (let dx = -r; dx <= r && !found; dx++) {
                            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只查外圈
                            const testX = this.x + dx * GST.TILE;
                            const testY = this.y + dy * GST.TILE;
                            if (!map.isSolid(testX + GST.TILE / 2, testY + GST.TILE / 2)) {
                                console.log(`[位置修复] ${this.name} 被推进墙壁，从(${Math.floor(this.x/GST.TILE)},${Math.floor(this.y/GST.TILE)})恢复到(${Math.floor(testX/GST.TILE)},${Math.floor(testY/GST.TILE)})`);
                                this.x = testX;
                                this.y = testY;
                                found = true;
                            }
                        }
                    }
                }
            }
        }

        // AI 思考冷却
        this.aiCooldown -= dt;

        // 动画
        if (this.isMoving) {
            this.animTimer += dt * 5;
            this.animFrame = Math.floor(this.animTimer) % 3;
        } else {
            this.animFrame = 0;
            this.animTimer = 0;
        }
    }

    // ---- 天气影响日程 ----
    // 户外目标集合
    static get OUTDOOR_TARGETS() {
        return new Set(['furnace_plaza', 'lumber_yard', 'ruins', 'north_gate', 'south_gate']);
    }
    // 雨天室内替代目标池（随机选一个）
    static get RAIN_INDOOR_ALTERNATIVES() {
        return [
            { target: 'dorm_a_door',   desc: '暴风雪来了，回宿舍A躲避' },
            { target: 'dorm_b_door',   desc: '暴风雪来了，回宿舍B躲避' },
            { target: 'kitchen_door',  desc: '太冷了，去炊事房取暖' },
            { target: 'workshop_door', desc: '太冷了，去工坊取暖' },
            { target: 'warehouse_door', desc: '太冷了，去仓库躲避' },
            { target: 'medical_door',  desc: '太冷了，去医疗站取暖' },
        ];
    }

    /**
     * 获取经天气调整后的日程条目
     * 如果正在下雨且目标是户外地点，则替换为室内目标
     * @param {Object} entry - 原始日程条目 { start, end, action, target, desc }
     * @param {Object} game - 游戏实例
     * @returns {Object} 调整后的日程条目（可能是原始的，也可能是替换后的）
     */

    _getDoorPos() {
        // 【修复】直接使用SCHEDULE_LOCATIONS中的_door坐标（即建筑门口外一格），确保NPC出门后出现在正确的门口位置
        const doorKey = this.currentScene + '_door';
        const doorLoc = GST.SCHEDULE_LOCATIONS[doorKey];
        if (doorLoc) {
            // 出门时在门口附近小幅散开（左右偏移±1格，向南偏移0~1格），避免多NPC堆叠
            return {
                x: doorLoc.x + Math.floor(Math.random() * 3) - 1,
                y: doorLoc.y + Math.floor(Math.random() * 2)
            };
        }
        // 兜底：如果找不到门口坐标，返回村庄中心
        return { x: 25, y: 22 };
    }

    /**
     * 【体温安全】查找距离NPC最近的室内建筑门口
     * 用于体温极低时紧急避险，优先进入最近的建筑而非必须去暖炉
     * @returns {{ key: string, dist: number } | null}
     */

    _findNearestIndoorDoor(game) {
        if (this.currentScene !== 'village') return null;
        const pos = this.getGridPos();
        const doorTargets = [
            'warehouse_door', 'medical_door', 'dorm_a_door', 'dorm_b_door',
            'kitchen_door', 'workshop_door'
        ];
        let nearest = null;
        let minDist = Infinity;
        for (const key of doorTargets) {
            const loc = GST.SCHEDULE_LOCATIONS[key];
            if (!loc) continue;
            const dist = Math.abs(pos.x - loc.x) + Math.abs(pos.y - loc.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = { key, dist };
            }
        }
        return nearest;
    }

    /**
     * 【增强】从室内多座位中随机选择一个未被其他NPC占用的位置
     * @param {string} scene - 室内场景名（如 'kitchen'）
     * @param {object} game - game 对象，用于查询其他NPC位置
     * @returns {{ x: number, y: number } | null} 选中的座位坐标，或 null（无可用座位时回退到默认）
     */

    _pickIndoorSeat(scene, game) {
        const seats = GST.INDOOR_SEATS[scene];
        if (!seats || seats.length === 0) return null;

        // 收集同场景中其他NPC已占据的格子
        const occupied = new Set();
        if (game && game.npcs) {
            for (const other of game.npcs) {
                if (other === this) continue;
                if (other.currentScene !== scene) continue;
                const pos = other.getGridPos();
                occupied.add(`${pos.x},${pos.y}`);
                // 也把其他NPC的目标位置标记为占用（避免两个NPC选同一个座位）
                if (other._enterWalkTarget) {
                    occupied.add(`${other._enterWalkTarget.x},${other._enterWalkTarget.y}`);
                }
            }
        }

        // 筛选未被占用的座位
        const available = seats.filter(s => !occupied.has(`${s.x},${s.y}`));

        if (available.length > 0) {
            // 随机选一个
            const pick = available[Math.floor(Math.random() * available.length)];
            return { x: pick.x, y: pick.y };
        }

        // 所有座位都被占了，随机选一个（总比都挤门口好）
        const pick = seats[Math.floor(Math.random() * seats.length)];
        return { x: pick.x, y: pick.y };
    }

    /**
     * 【统一进门方法】直接传送到室内座位位置，不再经过门口中转
     * 解决 NPC 堵在门口吃饭睡觉的问题：室内空间太小（8格高），
     * 门口(y=7)到座位的寻路经常被家具阻塞导致 NPC 卡在门口。
     * @param {string} targetScene - 目标室内场景名
     * @param {object} [game] - game 对象
     * @returns {boolean} 是否成功进入
     */

    _enterIndoor(targetScene, game) {
        game = game || this.game;
        // 【调试】追踪是谁调用了 _enterIndoor
        const _stack = new Error().stack;
        console.log(`[_enterIndoor追踪] ${this.name} → ${targetScene}, 当前场景=${this.currentScene}, hungerOverride=${this._hungerOverride}, taskOverride=${this._taskOverride?.isActive}, walkingToDoor=${this._walkingToDoor}\n调用栈: ${_stack.split('\n').slice(1,4).join(' <- ')}`);
        // 选择座位
        const insideKey = targetScene + '_inside';
        let insideLoc = GST.SCHEDULE_LOCATIONS[insideKey];
        const seatLoc = this._pickIndoorSeat(targetScene, game);
        if (seatLoc) insideLoc = { scene: targetScene, x: seatLoc.x, y: seatLoc.y };

        if (insideLoc) {
            // 【关键】精确设置像素坐标，不使用 _teleportTo 的随机偏移
            this.currentScene = insideLoc.scene;
            this.x = insideLoc.x * GST.TILE;
            this.y = insideLoc.y * GST.TILE;
            this.currentPath = [];
            this.pathIndex = 0;
            this.isMoving = false;
            this._enterWalkTarget = null;
            this._arrivalAwarenessApplied = -1;
            this.scheduleReached = true;
            this._pendingEnterScene = null;
            this._pendingEnterKey = null;
            this._indoorEntryProtection = 3;
            return true;
        }

        // 兜底：没有座位定义，传送到场景中央
        this.currentScene = targetScene;
        this.x = 5 * GST.TILE;
        this.y = 4 * GST.TILE;
        this.currentPath = [];
        this.pathIndex = 0;
        this.isMoving = false;
        this._enterWalkTarget = null;
        this._arrivalAwarenessApplied = -1;
        this.scheduleReached = true;
        this._pendingEnterScene = null;
        this._pendingEnterKey = null;
        this._indoorEntryProtection = 3;
        return true;
    }

    /** 获取当前室内场景的门口坐标（室内侧） */

    _getIndoorDoorPos() {
        const key = this.currentScene + '_indoor_door';
        const loc = GST.SCHEDULE_LOCATIONS[key];
        if (loc) return { x: loc.x, y: loc.y };
        // 兜底：根据场景类型估算门口位置（底部中间）
        const sizeMap = {
            warehouse: { w: 10, h: 8 }, medical: { w: 10, h: 8 },
            dorm_a: { w: 12, h: 8 }, dorm_b: { w: 12, h: 8 },
            kitchen: { w: 8, h: 8 }, workshop: { w: 12, h: 8 },
        };
        const size = sizeMap[this.currentScene];
        if (size) return { x: Math.floor(size.w / 2), y: size.h - 1 };
        return { x: 5, y: 8 };
    }

    /** 出门过渡：先走到室内门口，到达后再传送到村庄 */

    _walkToDoorAndExit(game, onExitCallback) {
        // 【调试】追踪出门调用
        const _stack2 = new Error().stack;
        console.log(`[_walkToDoorAndExit追踪] ${this.name} 当前场景=${this.currentScene}, hungerOverride=${this._hungerOverride}, taskOverride=${this._taskOverride?.isActive}\n调用栈: ${_stack2.split('\n').slice(1,4).join(' <- ')}`);
        if (this.currentScene === 'village') {
            // 已经在村庄了，直接执行回调
            if (onExitCallback) onExitCallback();
            return;
        }

        // 【天气保护】极端天气禁止出门
        // 【修复】P0紧急状态（健康危急/体力不支）无视天气限制，必须回家
        const ws = game && game.weatherSystem;
        const isP0Urgent = this._behaviorPriority === 'P0';
        if (ws && !ws.canGoOutside() && !isP0Urgent) {
            console.warn(`[NPC-${this.name}] [天气保护] 因极端天气取消出门`);
            this._logDebug('schedule', `[天气保护] ${this.name} 因极端天气取消出门`);
            // 不执行出门，也不执行回调
            return;
        }

        // 【户外冷却期保护】P0体温避险清除后短暂阻止出门，防止刚恢复就又被冻
        if (this._outdoorCooldown > 0 && !isP0Urgent) {
            console.log(`[户外冷却] ${this.name} 户外冷却期剩余${this._outdoorCooldown.toFixed(1)}s，阻止出门`);
            return;
        }

        const indoorDoor = this._getIndoorDoorPos();
        const pos = this.getGridPos();
        const dist = Math.abs(pos.x - indoorDoor.x) + Math.abs(pos.y - indoorDoor.y);

        // 【体温安全】低温警告：室外温度极低且NPC体温偏低时发出警告
        if (ws) {
            const outdoorTemp = ws.getEffectiveTemp();
            if (outdoorTemp < -30 && this.bodyTemp < 36) {
                if (game && game.addEvent) {
                    game.addEvent(`⚠️ ${this.name} 冒着严寒出门了（室外${outdoorTemp}°C，体温${this.bodyTemp.toFixed(1)}°C）`);
                }
                this._logDebug('schedule', `[体温警告] ${this.name} 在${outdoorTemp}°C下出门，体温${this.bodyTemp.toFixed(1)}°C`);
            }
        }

        if (dist <= 2) {
            // 已经在门口附近，直接出门
            const doorPos = this._getDoorPos();
            this._teleportTo('village', doorPos.x, doorPos.y);
            // 【出门保护期】防止安全网立即把NPC传送回室内
            this._indoorEntryProtection = 5;
            this._pendingEnterScene = null; // 清理残留的进门标记
            if (onExitCallback) onExitCallback();
            return;
        }

        // 需要走到门口
        this._walkingToDoor = true;
        this._exitDoorCallback = onExitCallback;
        this._exitDoorTimer = 0;
        this._pendingEnterScene = null; // 清理残留的进门标记，防止出门后又被自动进门
        // 清除当前路径，导航到门口
        this.currentPath = [];
        this.isMoving = false;
        this._pathTo(indoorDoor.x, indoorDoor.y, game);
    }

    /** 出门过渡期间的更新逻辑 */

    _updateDoorWalk(dt, game) {
        // 【关键修复】CHATTING状态下暂停出门过渡，防止对话中被传送
        if (this.state === 'CHATTING') {
            return;
        }

        // 【天气保护】出门过程中检测天气变化，禁止传送到室外
        // 【修复】P0紧急状态（健康危急/体力不支）无视天气限制，不能卡死在室内
        const wsCheck = game && game.weatherSystem;
        const isP0Emg = this._behaviorPriority === 'P0';
        if (wsCheck && !wsCheck.canGoOutside() && !isP0Emg) {
            console.warn(`[NPC-${this.name}] [天气保护] 出门过程中检测到极端天气，取消出门`);
            this._walkingToDoor = false;
            this._exitDoorCallback = null;
            this.currentPath = [];
            this.isMoving = false;
            return;
        }

        // 超时保护：3真实秒还没走到门口就直接传送出去
        // 【修复】使用真实时间递减，避免5倍速下0.6秒就超时传送
        const _speedMultDoor = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
        const _realDtDoor = _speedMultDoor > 0 ? dt / _speedMultDoor : dt;
        this._exitDoorTimer = (this._exitDoorTimer || 0) + _realDtDoor;
        if (this._exitDoorTimer > 3) {
            this._walkingToDoor = false;
            const doorPos = this._getDoorPos();
            this._teleportTo('village', doorPos.x, doorPos.y);
            // 【出门保护期】防止安全网立即把NPC传送回室内
            this._indoorEntryProtection = 5;
            if (this._exitDoorCallback) {
                const cb = this._exitDoorCallback;
                this._exitDoorCallback = null;
                cb();
            }
            return;
        }

        // 继续移动
        if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
            this._followPath(dt, game);
        } else if (this.currentPath.length > 0 && this.pathIndex >= this.currentPath.length) {
            // 走到门口了！传送出去
            this.currentPath = [];
            this.pathIndex = 0;
            this.isMoving = false;
            this._walkingToDoor = false;
            const doorPos = this._getDoorPos();
            this._teleportTo('village', doorPos.x, doorPos.y);
            // 【出门保护期】防止安全网立即把NPC传送回室内
            this._indoorEntryProtection = 5;
            if (this._exitDoorCallback) {
                const cb = this._exitDoorCallback;
                this._exitDoorCallback = null;
                cb();
            }
        } else {
            // 路径为空但还在走门口状态 → 可能寻路失败，直接传送
            this._walkingToDoor = false;
            const doorPos = this._getDoorPos();
            this._teleportTo('village', doorPos.x, doorPos.y);
            // 【出门保护期】防止安全网立即把NPC传送回室内
            this._indoorEntryProtection = 5;
            if (this._exitDoorCallback) {
                const cb = this._exitDoorCallback;
                this._exitDoorCallback = null;
                cb();
            }
        }
    }

    _teleportTo(scene, gx, gy, precise) {
        // 【最终防线】对话中的NPC绝对不能被传送到其他场景
        if (this.state === 'CHATTING' && scene !== this.currentScene) {
            console.warn(`[传送阻止] ${this.name}正在CHATTING，阻止传送到${scene}`);
            return;
        }

        // 【天气保护】从室内传送到village时检查天气
        if (scene === 'village' && this.currentScene !== 'village') {
            const ws = this.game && this.game.weatherSystem;
            if (ws && !ws.canGoOutside()) {
                console.warn(`[NPC-${this.name}] [天气保护] 阻止从${this.currentScene}传送到室外village（极端天气）`);
                return;
            }
        }

        // 【场景有效性校验】确保目标场景存在于已知场景列表中
        const validScenes = this.game && this.game.maps ? Object.keys(this.game.maps) : null;
        if (validScenes && !validScenes.includes(scene)) {
            console.warn(`[传送修正] ${this.name} 目标场景 ${scene} 不存在，回退到 village`);
            scene = 'village';
        }

        this.currentScene = scene;
        // 获取目标场景的地图用于碰撞检测
        const map = this.game && this.game.maps ? this.game.maps[scene] : null;

        // 【坐标边界校验】确保传送坐标在地图有效范围内
        const mapW = map ? map.width : 30;
        const mapH = map ? map.height : 30;
        gx = Math.max(0, Math.min(gx, mapW - 1));
        gy = Math.max(0, Math.min(gy, mapH - 1));

        if (precise === true) {
            // 精确传送（用于进门/回房间等），加微小偏移避免多NPC重叠堵门
            const jitter = 0.6; // ±0.6格的小偏移（缩小避免出界）
            let finalX = gx, finalY = gy;
            // 尝试几次随机偏移，确保落在可行走位置
            for (let attempt = 0; attempt < 5; attempt++) {
                const ox = (Math.random() - 0.5) * jitter * 2;
                const oy = (Math.random() - 0.5) * jitter * 2;
                const testX = Math.floor(gx + ox);
                const testY = Math.floor(gy + oy);
                if (!map || !map.isSolid(testX * GST.TILE + GST.TILE / 2, testY * GST.TILE + GST.TILE / 2)) {
                    finalX = gx + ox;
                    finalY = gy + oy;
                    break;
                }
            }
            // 【边界钳制】确保最终像素坐标在地图范围内
            finalX = Math.max(0, Math.min(finalX, mapW - 1));
            finalY = Math.max(0, Math.min(finalY, mapH - 1));
            this.x = finalX * GST.TILE;
            this.y = finalY * GST.TILE;
        } else {
            // 加入随机偏移（±1~2格），防止多个NPC传送到同一个点导致重叠
            let finalX = gx, finalY = gy;
            for (let attempt = 0; attempt < 5; attempt++) {
                const ox = (Math.random() - 0.5) * 3;
                const oy = (Math.random() - 0.5) * 3;
                const testX = Math.floor(gx + ox);
                const testY = Math.floor(gy + oy);
                if (!map || !map.isSolid(testX * GST.TILE + GST.TILE / 2, testY * GST.TILE + GST.TILE / 2)) {
                    finalX = gx + ox;
                    finalY = gy + oy;
                    break;
                }
            }
            // 【边界钳制】确保最终像素坐标在地图范围内
            finalX = Math.max(0, Math.min(finalX, mapW - 1));
            finalY = Math.max(0, Math.min(finalY, mapH - 1));
            this.x = finalX * GST.TILE;
            this.y = finalY * GST.TILE;
        }
        this.currentPath = [];
        this.pathIndex = 0;
        this.isMoving = false;
        this._pendingEnterScene = null;
        this._pendingEnterKey = null;

        // 【进屋保护期】进入室内场景时设置保护计时器，防止被立即传送回村庄
        if (scene !== 'village') {
            this._indoorEntryProtection = 3; // 3秒保护期
        }
    }

    _pathTo(gx, gy, game) {
        const map = game.maps[this.currentScene];
        if (!map) return;
        const pos = this.getGridPos();
        const dist = Math.abs(pos.x - gx) + Math.abs(pos.y - gy);

        // 【修复】如果NPC已经在目标格子附近（4格内），且有pendingEnterScene，直接进入室内
        if (dist <= 4 && this._pendingEnterScene) {
            this._enterIndoor(this._pendingEnterScene, game);
            return;
        }

        // 【增强】如果NPC被持续碰撞阻挡，寻路时把同场景其他NPC的位置标记为障碍物，强制绕路
        let extraBlocked = null;
        if (this.collisionStallTimer > 0.5 && game.npcs) {
            extraBlocked = new Set();
            for (const other of game.npcs) {
                if (other === this) continue;
                if (other.currentScene !== this.currentScene) continue;
                const ogp = other.getGridPos();
                extraBlocked.add(`${ogp.x},${ogp.y}`);
            }
        }

        const path = GST.findPath(pos.x, pos.y, gx, gy, map, extraBlocked);
        // 如果带障碍物的寻路失败，回退到普通寻路（不绕NPC）
        const finalPath = path || (extraBlocked ? GST.findPath(pos.x, pos.y, gx, gy, map) : null);
        if (finalPath && finalPath.length > 1) {
            this.currentPath = finalPath;
            this.pathIndex = 1; // 跳过起点
            this.state = 'WALKING';
        } else if (finalPath && finalPath.length === 1 && this._pendingEnterScene) {
            // 已在目标点上，直接进入室内
            this._enterIndoor(this._pendingEnterScene, game);
        } else if (!finalPath && this._pendingEnterScene) {
            // 【修复】寻路失败，直接进入室内（不经门口中转）
            if (dist <= 8) {
                this._enterIndoor(this._pendingEnterScene, game);
            } else {
                // 距离太远寻路又失败，清除pendingEnterScene，避免反复尝试
                this._pendingEnterScene = null;
                this._pendingEnterKey = null;
            }
        } else if (!path && this.currentScene !== 'village') {
            // 【兜底】室内寻路失败（可能被传送到了实心位置），直接传送到目标格子
            console.log(`[寻路兜底] ${this.name} 在 ${this.currentScene} 室内寻路失败(${pos.x},${pos.y})->(${gx},${gy})，直接传送`);
            this.x = gx * GST.TILE;
            this.y = gy * GST.TILE;
            this.scheduleReached = true;
            this._arrivalAwarenessApplied = -1;
            this.state = 'IDLE';
        } else if (!finalPath && this.currentScene === 'village' && !this._pendingEnterScene) {
            // 【任务4兜底】村庄场景户外目标寻路失败（非门口目标），直接传送
            // 常见场景：赵铁柱去伐木场被围墙/栅栏挡住
            console.warn(`[寻路兜底] ${this.name} 在村庄寻路失败(${pos.x},${pos.y})->(${gx},${gy})，直接传送`);
            this.x = gx * GST.TILE;
            this.y = gy * GST.TILE;
            this.scheduleReached = true;
            this._arrivalAwarenessApplied = -1;
            this.state = 'IDLE';
        }
    }

    _followPath(dt, game) {
        // 【关键修复】CHATTING状态下暂停移动，防止对话中NPC继续走路被传送到其他场景
        if (this.state === 'CHATTING') {
            return;
        }
        if (this.pathIndex >= this.currentPath.length) {
            this.currentPath = [];
            this.isMoving = false;
            this.state = 'IDLE';

            // 到达门口后自动进入建筑（直接传送到座位）
            if (this._pendingEnterScene) {
                this._enterIndoor(this._pendingEnterScene, this.game);
            } else if (this._enterWalkTarget) {
                // 【修复】进门后走向室内目标的路径走完了，检查是否真正到达
                const pos = this.getGridPos();
                const ewt = this._enterWalkTarget;
                const distToTarget = Math.abs(pos.x - ewt.x) + Math.abs(pos.y - ewt.y);
                if (distToTarget <= 3) {
                    this._enterWalkTarget = null;
                    this.scheduleReached = true;
                } else {
                    console.log(`[进门修复] ${this.name} followPath走完但离室内目标(${ewt.x},${ewt.y})还有${distToTarget}格，直接传送`);
                    this.x = ewt.x * GST.TILE;
                    this.y = ewt.y * GST.TILE;
                    this._enterWalkTarget = null;
                    this.scheduleReached = true;
                }
            } else {
                this.scheduleReached = true;
            }
            return;
        }

        const target = this.currentPath[this.pathIndex];
        const tx = target.x * GST.TILE + GST.TILE / 2 - this.width / 2;
        const ty = target.y * GST.TILE + GST.TILE / 2 - this.height / 2;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            this.x = tx;
            this.y = ty;
            this.pathIndex++;
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        // 限制单帧最大移动距离，防止倍速下跳过目标点导致来回抽搐
        const maxStep = dist - 1; // 不超过到目标点的距离
        const step = Math.min(this.speed * dt, maxStep);
        this.x += nx * step;
        this.y += ny * step;
        this.isMoving = true;

        // 正常移动中，逐渐衰减碰撞累积计时器
        if (this.collisionStallTimer > 0) {
            this.collisionStallTimer = Math.max(0, this.collisionStallTimer - dt * 0.5);
        }

        // 面向方向
        if (Math.abs(dx) >= Math.abs(dy)) {
            this.facing = dx < 0 ? 1 : 2;
        } else {
            this.facing = dy < 0 ? 3 : 0;
        }

        // 卡住检测（缩短到1.5秒，碰撞推挤后更快恢复）
        // 如果被其他NPC持续碰撞阻挡（collisionStallTimer高），缩短检测阈值到0.8秒
        const stuckThreshold = this.collisionStallTimer > 0.5 ? 0.8 : 1.5;
        this.stuckTimer += dt;
        if (this.stuckTimer > stuckThreshold) {
            this.stuckTimer = 0;
            // 检查是否被碰撞推挤导致偏离路径
            if (this.pathIndex < this.currentPath.length) {
                const nextPt = this.currentPath[this.pathIndex];
                const offX = Math.abs(this.x - (nextPt.x * GST.TILE)) / GST.TILE;
                const offY = Math.abs(this.y - (nextPt.y * GST.TILE)) / GST.TILE;
                if (offX > 2 || offY > 2) {
                    // 偏离路径超过2格，重新寻路
                    const finalTarget = this.currentPath[this.currentPath.length - 1];
                    this.currentPath = [];
                    this.pathIndex = 0;
                    this.isMoving = false;
                    // 注意：不在这里重置collisionStallTimer，让_pathTo能判断是否需要绕路
                    this._pathTo(finalTarget.x, finalTarget.y, this.game);
                    this.collisionStallTimer = 0; // 寻路完成后再重置
                    return;
                }
            }
            // 否则跳过当前路点继续
            this.pathIndex++;
        }
    }

    // ---- 渲染 ----

    _clearAllOverrides() {
        console.warn(`[${this.name}] _clearAllOverrides() 执行，清除所有覆盖状态`);
        this._logDebug('override', `[兜底] _clearAllOverrides 清除所有覆盖状态`);
        
        // 清除饥饿覆盖
        this._hungerOverride = false;
        this._hungerTarget = null;
        this._hungerStuckTimer = 0;
        this._hungerTravelTimer = 0;
        this.isEating = false;
        this.eatingTimer = 0;
        
        // 清除状态覆盖
        this._clearStateOverride();
        
        // 清除行动覆盖
        this._clearActionOverride();
        
        // 清除资源采集覆盖
        this._resourceGatherOverride = false;
        this._resourceGatherTarget = null;
        this._resourceGatherType = null;
        this._resourceGatherTravelTimer = 0;
        
        // 清除任务覆盖
        if (this._taskOverride) {
            this._taskOverride.isActive = false;
        }
        
        // 清除行为锁和pending队列
        this._currentBehaviorLock = null;
        this._pendingBehaviors = [];
        this._activeOverride = 'none';
        
        // 恢复日程控制
        this.currentScheduleIdx = -1;
        this.scheduleReached = false;
    }

    /** 构建经营上下文信息（店主角色专用） */

    serialize() {
        return {
            id: this.id,
            scene: this.currentScene,
            x: this.x,
            y: this.y,
            mood: this.mood,
            memories: this.memories.slice(-10),
            affinity: this.affinity,
            // 核心属性 + San值
            stamina: this.stamina,
            health: this.health,
            sanity: this.sanity,
            isSick: this.isSick,
            isCrazy: this.isCrazy,
            crazyTimer: this.crazyTimer,
            // 极寒生存属性
            bodyTemp: this.bodyTemp,
            isDead: this.isDead,
            _deathCause: this._deathCause,
            _deathTime: this._deathTime,
            isHypothermic: this.isHypothermic,
            isSevereHypothermic: this.isSevereHypothermic,
            hunger: this.hunger,
            // 极端状态持续计时器
            _zeroStaminaDuration: this._zeroStaminaDuration,
            _zeroHungerDuration: this._zeroHungerDuration,
            _zeroCrazyDuration: this._zeroCrazyDuration,
            _hypothermiaDuration: this._hypothermiaDuration,
            _isDying: this._isDying,
            _dyingTimer: this._dyingTimer,
            // 强制睡眠状态
            _forcedSleep: this._forcedSleep,
            _forcedSleepTimer: this._forcedSleepTimer,
            // 任务驱动覆盖系统
            _taskOverride: { ...this._taskOverride },
            _behaviorPriority: this._behaviorPriority,
            // 统一行为锁系统
            _currentBehaviorLock: this._currentBehaviorLock ? { ...this._currentBehaviorLock } : null,
            _pendingBehaviors: this._pendingBehaviors ? this._pendingBehaviors.map(b => ({ type: b.type, priority: b.priority })) : [],
            _activeOverride: this._activeOverride || 'none',
        };
    }

    deserialize(data) {
        if (!data) return;
        this.currentScene = data.scene || this.currentScene;
        this.x = data.x ?? this.x;
        this.y = data.y ?? this.y;
        this.mood = data.mood || this.mood;
        if (data.memories) this.memories = data.memories;
        if (data.affinity) this.affinity = data.affinity;
        // 核心属性 + San值恢复
        if (data.stamina !== undefined) this.stamina = data.stamina;
        if (data.health !== undefined) this.health = data.health;
        if (data.sanity !== undefined) this.sanity = data.sanity;
        if (data.isSick !== undefined) this.isSick = data.isSick;
        if (data.isCrazy !== undefined) this.isCrazy = data.isCrazy;
        if (data.crazyTimer !== undefined) this.crazyTimer = data.crazyTimer;
        // 极寒生存属性恢复
        if (data.bodyTemp !== undefined) this.bodyTemp = data.bodyTemp;
        if (data.isDead !== undefined) this.isDead = data.isDead;
        if (data._deathCause !== undefined) this._deathCause = data._deathCause;
        if (data._deathTime !== undefined) this._deathTime = data._deathTime;
        if (data.isHypothermic !== undefined) this.isHypothermic = data.isHypothermic;
        if (data.isSevereHypothermic !== undefined) this.isSevereHypothermic = data.isSevereHypothermic;
        if (data.hunger !== undefined) this.hunger = data.hunger;
        // 极端状态持续计时器恢复
        if (data._zeroStaminaDuration !== undefined) this._zeroStaminaDuration = data._zeroStaminaDuration;
        if (data._zeroHungerDuration !== undefined) this._zeroHungerDuration = data._zeroHungerDuration;
        if (data._zeroCrazyDuration !== undefined) this._zeroCrazyDuration = data._zeroCrazyDuration;
        if (data._hypothermiaDuration !== undefined) this._hypothermiaDuration = data._hypothermiaDuration;
        if (data._isDying !== undefined) this._isDying = data._isDying;
        if (data._dyingTimer !== undefined) this._dyingTimer = data._dyingTimer;
        // 强制睡眠状态恢复
        if (data._forcedSleep !== undefined) this._forcedSleep = data._forcedSleep;
        if (data._forcedSleepTimer !== undefined) this._forcedSleepTimer = data._forcedSleepTimer;
        // 任务驱动覆盖系统恢复
        if (data._taskOverride) {
            this._taskOverride = { ...this._taskOverride, ...data._taskOverride };
        }
        if (data._behaviorPriority) this._behaviorPriority = data._behaviorPriority;
        // 统一行为锁系统恢复
        if (data._currentBehaviorLock) {
            // 格式校验：确保有必要字段
            if (data._currentBehaviorLock.type && typeof data._currentBehaviorLock.priority === 'number' && typeof data._currentBehaviorLock.startTime === 'number') {
                // 安全网检查：如果锁持续时间超过120秒，自动释放
                const lockAge = this.game ? (this.game.gameTime - data._currentBehaviorLock.startTime) : 0;
                if (lockAge > 120) {
                    console.warn(`[反序列化] ${this.name} 行为锁 ${data._currentBehaviorLock.type} 已过期(${lockAge.toFixed(0)}秒)，自动释放`);
                    this._currentBehaviorLock = null;
                } else {
                    this._currentBehaviorLock = { ...data._currentBehaviorLock };
                }
            } else {
                console.warn(`[反序列化] ${this.name} 行为锁数据格式异常，忽略`);
                this._currentBehaviorLock = null;
            }
        }
        if (data._pendingBehaviors && Array.isArray(data._pendingBehaviors)) {
            // pending队列仅恢复type和priority，callback不可序列化
            this._pendingBehaviors = data._pendingBehaviors
                .filter(b => b && b.type && typeof b.priority === 'number')
                .slice(0, 3);
        }
        if (data._activeOverride) this._activeOverride = data._activeOverride;
    }

    }

    GST.NPC = NPC;
})();
