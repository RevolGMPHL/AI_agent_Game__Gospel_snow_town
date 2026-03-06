/**
 * 福音镇 - Game 主类（精简调度中心）
 * 游戏主循环、子系统初始化/调度、场景切换、存档/读档
 * 挂载到 GST.Game
 */
(function() {
    'use strict';
    const GST = window.GST;

    class Game {
    constructor(mode) {
        // 模式: 'agent' = AI 观察模式, 'debug' = 手动模式, 'reincarnation' = 轮回模式
        this.mode = mode;
        // 轮回模式继承AI观察模式的全部行为（自动跟随、NPC自主行动等）
        this.isAgentMode = (mode === 'agent' || mode === 'reincarnation');

        // 【难度系统】读取当前难度配置
        this.difficulty = GST.getDifficulty();
        console.log(`[Game] 难度: ${this.difficulty.stars} ${this.difficulty.name} (key=${this.difficulty.key})`);

        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ui = document.getElementById('ui');

        // 视口 — 高 DPI 适配，画面放大 1.5 倍且文字高清
        this.viewW = 20 * GST.TILE;
        this.viewH = 15 * GST.TILE;
        this.displayScale = 1.5; // 画面整体放大倍数
        this.dpr = window.devicePixelRatio || 1;
        // 内部渲染分辨率 = 逻辑尺寸 × displayScale × dpr，确保文字不模糊
        const renderScale = this.displayScale * this.dpr;
        this.canvas.width = this.viewW * renderScale;
        this.canvas.height = this.viewH * renderScale;
        this.canvas.style.width = (this.viewW * this.displayScale) + 'px';
        this.canvas.style.height = (this.viewH * this.displayScale) + 'px';
        this.ctx.scale(renderScale, renderScale);
        this.camera = new GST.Camera(this.viewW, this.viewH);

        // 时间系统
        this.gameTimeSeconds = 8 * 3600;
        this.dayCount = 1;
        this.timeSpeed = 60;
        this.paused = false;

        // 速度档位
        this.speedOptions = [1, 2, 5, 10];
        this.speedIdx = 0;

        // 全员入睡跳夜系统
        this._nightSkipDone = false; // 当天是否已执行过跳夜（每天只跳一次）
        this._allSleepingFrames = 0; // 连续多少帧全员在睡觉（防抖动）

        // 天气系统
        this.weather = '晴天';
        this.rainDrops = [];     // 雨滴粒子
        this.rainIntensity = 0;  // 雨的强度 0~1
        this.weatherChangeTimer = 0;
        this.weatherChangeInterval = 3600; // 游戏内1小时可能变天

        // 地图 — 末日据点
        this.maps = {
            village:   new GST.VillageMap(),
            dorm_a:    new GST.DormAMap(),
            dorm_b:    new GST.DormBMap(),
            medical:   new GST.MedicalMap(),
            warehouse: new GST.WarehouseMap(),
            workshop:  new GST.WorkshopMap(),
            kitchen:   new GST.KitchenMap(),
            command:   new GST.CommandMap(),
        };

        // 当前观察的场景（AI 模式下跟随 NPC 自动切换）
        this.currentScene = 'village';

        // NPC 系统
        this.npcs = [];
        this._initNPCs();

        // 对话系统
        this.dialogueManager = new GST.DialogueManager(this);

        // ============ 极寒生存系统初始化 ============
this.weatherSystem = GST.WeatherSystem ? new GST.WeatherSystem(this) : null;
        // 【修复】初始化时同步WeatherSystem天气到game.weather，避免两套天气系统冲突
        if (this.weatherSystem) {
            this.weather = this.weatherSystem.currentWeather;
        }
this.resourceSystem = GST.ResourceSystem ? new GST.ResourceSystem(this) : null;
this.furnaceSystem = GST.FurnaceSystem ? new GST.FurnaceSystem(this) : null;
this.deathSystem = GST.DeathSystem ? new GST.DeathSystem(this) : null;
this.taskSystem = GST.TaskSystem ? new GST.TaskSystem(this) : null;
this.eventSystem = GST.EventSystem ? new GST.EventSystem(this) : null;

        // 轮回记忆系统（非轮回模式下构造函数内部自动强制第1世）
this.reincarnationSystem = GST.ReincarnationSystem ? new GST.ReincarnationSystem(this) : null;

        // 【智能分工系统】生成workPlan并存储到老钱
        this._initWorkPlan();

        // AI模式日志系统（仅 agent/reincarnation 模式下启用）
this.aiModeLogger = (this.isAgentMode && GST.AIModeLogger) ? new GST.AIModeLogger(this) : null;

        // ============ 全局物品/状态系统 ============
        // 急救包系统
        this._medkitCount = 0;           // 急救包库存
        this._medkitCraftProgress = 0;   // 制作进度
        // 无线电修理系统
        this._radioRepairProgress = 0;   // 修理进度 (0~1)
        this._radioRepaired = false;     // 是否已修好
        this._radioRescueTriggered = false; // 是否已触发求救
        // 食物浪费减少标记
        this._foodWasteReduction = false;
        this._foodWasteReductionTimer = 0;
        // 巡逻加成标记
        this._patrolBonus = false;
        this._patrolBonusTimer = 0;
        // 暖炉维护标记
        this._furnaceMaintained = false;

        // ---- AI 观察模式 ----
        this.followTarget = null;    // 当前跟随的 NPC
        this.autoFollow = true;      // 自动切换跟随
        this.followSwitchTimer = 0;
        this.followSwitchInterval = 30; // 每 30 秒兜底自动切换一次

        // ---- 事件驱动镜头切换 ----
        this._cameraLockTimer = 0;       // 事件锁定倒计时（秒），>0 时不响应低优先级切换
        this._cameraLockDuration = 5;    // 事件驱动切换后的锁定观看时长（秒）
        this._cameraLockPriority = 0;    // 当前锁定事件的优先级（0=无锁定）
        this._deathViewTimer = 0;        // 当前跟随目标死亡后延迟切走计时器

        // ---- Debug 模式 ----
        this.debugCamSpeed = 300;
        this.showGrid = false;

        // 输入
        this.keys = {};

        // 淡入淡出
        this.fadeAlpha = 0;
        this.fadeDirection = 0;
        this.nextScene = null;
        this.pendingFollowTarget = null;

// 事件日志
        this.eventLog = [];
        this.maxEventLog = 50;

        // 补发 _initWorkPlan 延迟的事件（因为 eventLog 在其之后才初始化）
        if (this._pendingWorkPlanEvent) {
            this.addEvent(this._pendingWorkPlanEvent);
            delete this._pendingWorkPlanEvent;
        }

        // 向右侧「决策动态」面板写入第1天分工方案卡片
        this._addWorkPlanCardToDecisionPanel();

        // 设置输入
        this._setupInput();
        this._setupControls();
        this._setupSidebar();

        // 初始化摄像机位置 — 对准新地图中心（主暖炉附近）
        const map = this.maps[this.currentScene];
        this.camera.jumpTo(25 * GST.TILE, 20 * GST.TILE, map.width * GST.TILE, map.height * GST.TILE);

        // 初始跟随
        if (this.isAgentMode && this.npcs.length > 0) {
            this.followTarget = this.npcs[0];
        }

        // 自动存档
        this.autoSaveTimer = 0;
        this.autoSaveInterval = 120;

        // 主循环（支持后台运行）
        this.lastTime = performance.now();
        this._bgTimerId = null;  // 后台 setTimeout ID
        this._isBgMode = false;  // 当前是否后台模式
        this._BG_FPS = 15;      // 后台帧率

        // 监听标签页可见性变化，实现前台/后台自动切换
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 切到后台：取消 rAF，启动 setTimeout 驱动
                this._isBgMode = true;
                this.lastTime = performance.now();
                this._bgLoop();
                console.log('🔄 游戏循环模式切换: 后台(setTimeout, ' + this._BG_FPS + 'fps)');
            } else {
                // 切回前台：取消 setTimeout，恢复 rAF 驱动
                this._isBgMode = false;
                if (this._bgTimerId) {
                    clearTimeout(this._bgTimerId);
                    this._bgTimerId = null;
                }
                this.lastTime = performance.now();
                requestAnimationFrame(t => this.loop(t));
                console.log('🔄 游戏循环模式切换: 前台(rAF)');
            }
        });

        requestAnimationFrame(t => this.loop(t));

        // 更新轮回世数UI
        this._updateReincarnationUI();

console.log(`🏘️ 福音镇已启动！模式: ${mode}`);
    }

    /**
     * 【难度系统】获取指定参数的难度倍率
     * @param {string} paramName - 参数名（如 'hungerDecayMult', 'staminaDrainMult' 等）
     * @returns {number} 对应的倍率值，默认返回 1.0
     */

    getDifficultyMult(paramName) {
        return (this.difficulty && this.difficulty[paramName] != null) ? this.difficulty[paramName] : 1.0;
    }

    // ---- 【智能分工系统】workPlan初始化 ----

    _initWorkPlan() {
        if (!this.reincarnationSystem) return;

        // 生成分工方案
        const workPlan = this.reincarnationSystem.generateWorkPlan();
        if (!workPlan) return;

        // 存储到老钱（或继任者）
        const holder = this.reincarnationSystem.getWorkPlanHolder();
        if (holder) {
            holder.workPlan = workPlan;
            const lifeNum = this.reincarnationSystem.getLifeNumber();
            console.log(`[WorkPlan] 第${lifeNum}世分工方案已存储到${holder.name}`);
            // 延迟添加事件，因为构造函数中 eventLog 可能尚未初始化
            // 构建详细的分工方案日志
            const strategyLabel = workPlan.strategy || '默认';
            let detailLog = `\n📋━━━ 第${lifeNum}世·${holder.name}的分工方案（策略:${strategyLabel}）━━━\n`;
            detailLog += `${workPlan.summary || workPlan.workPlanSummary}\n`;
            // 显示第1天的分工详情
            if (workPlan.dayPlans && workPlan.dayPlans[1]) {
                const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
                const taskShort = { COLLECT_WOOD: '砍柴', COLLECT_FOOD: '采食物', COLLECT_MATERIAL: '探索废墟', MAINTAIN_POWER: '维护电力', COORDINATE: '统筹协调', PREPARE_MEDICAL: '医疗', SCOUT_RUINS: '侦察', BOOST_MORALE: '鼓舞士气', BUILD_FURNACE: '建暖炉', MAINTAIN_FURNACE: '维护暖炉', MAINTAIN_ORDER: '维持秩序', REST_RECOVER: '休息' };
                for (const a of workPlan.dayPlans[1]) {
                    const name = nameMap[a.npcId] || a.npcId;
                    const task = taskShort[a.task] || a.task;
                    detailLog += `  ${name}→${task}${a.reason ? '(' + a.reason + ')' : ''}\n`;
                }
            }
            detailLog += `📋━━━ 方案已下达，各人按此执行 ━━━`;
            this._pendingWorkPlanEvent = detailLog;
        }

        // 日志输出
        if (workPlan.dayPlans) {
            const days = Object.keys(workPlan.dayPlans);
            const npcCounts = days.map(d => workPlan.dayPlans[d].length);
            console.log(`[WorkPlan] 第${this.reincarnationSystem.getLifeNumber()}世分工方案生成完毕: { ${days.map((d, i) => `day${d}: ${npcCounts[i]}人`).join(', ')} }`);
        }
    }

    // ---- 向决策面板写入分工方案卡片 ----

    _addWorkPlanCardToDecisionPanel() {
        if (!this.reincarnationSystem) return;
        const holder = this.reincarnationSystem.getWorkPlanHolder();
        if (!holder || !holder.workPlan) return;

        const chatLogEl = document.getElementById('chat-log-content');
        if (!chatLogEl) return;

        const workPlan = holder.workPlan;
        const lifeNum = this.reincarnationSystem.getLifeNumber();
        const strategyLabel = workPlan.strategy || '默认';
        const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
        const roleEmoji = { zhao_chef: '👨‍🍳', lu_chen: '💪', li_shen: '👩‍🍳', wang_teacher: '👨‍🏫', old_qian: '👴', su_doctor: '👨‍⚕️', ling_yue: '🔍', qing_xuan: '🧪' };
        const taskShort = { COLLECT_WOOD: '🪓 收集木柴', COLLECT_FOOD: '🍞 收集食物', COLLECT_MATERIAL: '🔍 探索废墟', MAINTAIN_POWER: '⚡ 维护电力', COORDINATE: '📢 维持秩序', PREPARE_MEDICAL: '💊 医疗救治', SCOUT_RUINS: '🗺️ 鼓舞士气', BOOST_MORALE: '🎵 鼓舞士气', BUILD_FURNACE: '🔥 建暖炉', MAINTAIN_FURNACE: '🔥 维护暖炉', MAINTAIN_ORDER: '🛡️ 维持秩序', DISTRIBUTE_FOOD: '🍳 分配食物', REST_RECOVER: '💤 休息', REPAIR_RADIO: '📻 修电台', SET_TRAP: '🪤 设陷阱' };

        let planHTML = `<div class="decision-card" style="border-left:3px solid #c084fc; margin:8px 4px; padding:10px 12px; background:linear-gradient(135deg, rgba(55,30,100,0.85), rgba(30,20,60,0.85)); border-radius:8px; font-size:12px; line-height:1.7;">`;
        planHTML += `<div style="font-weight:bold; color:#e9d5ff; font-size:14px; margin-bottom:6px;">📋 第${lifeNum}世 · 第1天分工方案</div>`;
        planHTML += `<div style="color:#a78bfa; font-size:11px; margin-bottom:6px;">策略: ${strategyLabel} · ${workPlan.summary || ''}</div>`;

        const day1 = workPlan.dayPlans && workPlan.dayPlans[1];
        if (day1) {
            for (const a of day1) {
                const name = nameMap[a.npcId] || a.npcId;
                const em = roleEmoji[a.npcId] || '👤';
                const task = taskShort[a.task] || a.task;
                const npc = this.npcs.find(n => n.id === a.npcId);
                const stBar = npc ? `<span style="color:#6b7280; font-size:10px; margin-left:4px;">体力${Math.round(npc.stamina)}</span>` : '';
                planHTML += `<div style="color:#e2e8f0; padding:1px 0;">${em} <b>${name}</b>：${task}${stBar}</div>`;
            }
        }
        planHTML += `</div>`;

        const planCard = document.createElement('div');
        planCard.innerHTML = planHTML;
        chatLogEl.appendChild(planCard.firstElementChild);
        chatLogEl.scrollTop = chatLogEl.scrollHeight;
    }

    // ---- NPC 初始化 ----

    _initNPCs() {
        if (typeof GST.NPC_CONFIGS === 'undefined') return;
        for (const cfg of GST.NPC_CONFIGS) {
            this.npcs.push(new GST.NPC(cfg, this));
        }
    }

    // ---- 输入系统 ----

    setFollowTarget(npc) {
        this.followTarget = npc;
        this.autoFollow = false;
        this.followSwitchTimer = 0;
        // 清除事件驱动锁定
        this._cameraLockTimer = 0;
        this._cameraLockPriority = 0;

        // 更新 UI — 切到跟随模式（锁定该角色）
        const btnFollow = document.getElementById('btn-follow');
        if (btnFollow) {
            btnFollow.classList.add('active');
            btnFollow.textContent = '📷 跟随';
        }
        const sel = document.getElementById('sel-follow-target');
        if (sel) sel.value = npc.id;

        // 如果 NPC 在不同场景，切换过去
        if (npc.currentScene !== this.currentScene) {
            this._switchScene(npc.currentScene, npc);
        }

        this.addEvent(`📷 镜头切换到 ${npc.name}`);
    }

    /**
     * 智能切换跟随目标：
     * - 自由模式下：只切换目标但保持自由模式，用事件锁定临时观看10秒后恢复自动切换
     * - 跟随模式下：直接调用 setFollowTarget 锁定
     */

    switchFollowTarget(npc) {
        if (!npc) return;
        if (this.autoFollow) {
            // 自由模式下：切换目标但不退出自由模式
            this.followTarget = npc;
            this.followSwitchTimer = 0;
            // 设置事件锁定，临时观看10秒后恢复自动切换
            this._cameraLockTimer = 10;
            this._cameraLockPriority = 0;

            // 同步下拉选择器
            const sel = document.getElementById('sel-follow-target');
            if (sel) sel.value = npc.id;

            // 如果 NPC 在不同场景，切换过去
            if (npc.currentScene !== this.currentScene) {
                this._switchScene(npc.currentScene, npc);
            }

            this.addEvent(`📷 切换观看 ${npc.name}`);
        } else {
            // 跟随模式下：直接锁定
            this.setFollowTarget(npc);
        }
    }

    /** NPC 之间碰撞推挤 —— 圆形碰撞体，互相排斥不重叠 */

    _resolveNPCCollisions() {
        const radius = GST.TILE * 0.45; // 每个NPC的碰撞半径
        const minDist = radius * 2;  // 两个NPC之间的最小距离
        const pushStrength = 2.0;    // 推挤力度（加大）

        // 按场景分组，对所有场景都做碰撞检测，而不只是摄像机当前场景
        const sceneGroups = {};
        for (const n of this.npcs) {
            if (n.isDead) continue;  // 死亡NPC不参与碰撞
            if (n.isSleeping) continue;
            if (n.isEating) continue;  // 吃饭中NPC不参与碰撞（与睡觉对齐）
            if (!sceneGroups[n.currentScene]) sceneGroups[n.currentScene] = [];
            sceneGroups[n.currentScene].push(n);
        }

        for (const scene in sceneGroups) {
            const sceneNPCs = sceneGroups[scene];
            const map = this.maps[scene];
            this._resolveGroupCollisions(sceneNPCs, minDist, pushStrength, map);
        }

        // 气泡偏移只计算当前场景
const visibleNPCs = this.npcs.filter(n => n.currentScene === this.currentScene && !n.isSleeping && !n.isEating && !n.isDead);
        this._computeBubbleOffsets(visibleNPCs, minDist);
    }

    _resolveGroupCollisions(sceneNPCs, minDist, pushStrength, map) {

        for (let i = 0; i < sceneNPCs.length; i++) {
            for (let j = i + 1; j < sceneNPCs.length; j++) {
                const a = sceneNPCs[i];
                const b = sceneNPCs[j];

                const ax = a.x + GST.TILE / 2;
                const ay = a.y + GST.TILE / 2;
                const bx = b.x + GST.TILE / 2;
                const by = b.y + GST.TILE / 2;

                const dx = bx - ax;
                const dy = by - ay;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist && dist > 0.1) {
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const push = overlap * pushStrength * 0.5;

                    // 正在移动的NPC被推少一些；吃饭/治疗中的NPC不可推动；持有行为锁的NPC大幅减少推力
                    let aMoving = a.isMoving ? 0.3 : 0.7;
                    let bMoving = b.isMoving ? 0.3 : 0.7;
                    // 吃饭/治疗中的NPC完全不可推动
                    if (a.isEating || a._isBeingTreated) aMoving = 0;
                    if (b.isEating || b._isBeingTreated) bMoving = 0;
                    // 持有行为锁且不在移动的NPC大幅减少推力
                    if (!a.isMoving && a._currentBehaviorLock && aMoving > 0) aMoving = 0.1;
                    if (!b.isMoving && b._currentBehaviorLock && bMoving > 0) bMoving = 0.1;

                    // 保存推挤前的位置
                    const aOldX = a.x, aOldY = a.y;
                    const bOldX = b.x, bOldY = b.y;

                    a.x -= nx * push * aMoving;
                    a.y -= ny * push * aMoving;
                    b.x += nx * push * bMoving;
                    b.y += ny * push * bMoving;

                    // 【修复】推挤后检查是否推进了墙壁/实体区域，如果是则回退
                    if (map) {
                        if (map.isSolid(a.x + GST.TILE / 2, a.y + GST.TILE / 2)) {
                            a.x = aOldX;
                            a.y = aOldY;
                        }
                        if (map.isSolid(b.x + GST.TILE / 2, b.y + GST.TILE / 2)) {
                            b.x = bOldX;
                            b.y = bOldY;
                        }
                    }

                    // 【修复】碰撞后加速卡住检测计时器，让NPC更快跳过被卡的路点
                    a.stuckTimer = Math.max(a.stuckTimer, 1.0);
                    b.stuckTimer = Math.max(b.stuckTimer, 1.0);

                    // 【增强】持续碰撞计时 —— 累积碰撞时间
                    a.collisionStallTimer = (a.collisionStallTimer || 0) + 0.016;
                    b.collisionStallTimer = (b.collisionStallTimer || 0) + 0.016;

                    // 【增强】移动NPC优先通过，静止NPC主动让路
                    // 当一个在走路、一个不在走路，且碰撞持续超过0.3秒时，静止的NPC让路
                    const aCanYield = !a.isSleeping && a.state !== 'CHATTING';
                    const bCanYield = !b.isSleeping && b.state !== 'CHATTING';

                    if (a.isMoving && !b.isMoving && bCanYield && b.collisionStallTimer > 0.3) {
                        this._tryYieldNPC(b, a, map);
                    } else if (b.isMoving && !a.isMoving && aCanYield && a.collisionStallTimer > 0.3) {
                        this._tryYieldNPC(a, b, map);
                    } else if (a.isMoving && b.isMoving) {
                        // 两个都在移动，碰撞超过1秒时，路径更长的那个暂停让路
                        if (a.collisionStallTimer > 1.0 && b.collisionStallTimer > 1.0) {
                            const aRemain = a.currentPath.length - a.pathIndex;
                            const bRemain = b.currentPath.length - b.pathIndex;
                            if (aRemain > bRemain && aCanYield) {
                                this._tryYieldNPC(a, b, map);
                            } else if (bCanYield) {
                                this._tryYieldNPC(b, a, map);
                            }
                        }

                        // 【增强】碰撞持续超过2.5秒 → 强制传送脱困（解决室内死锁）
                        if (a.collisionStallTimer > 2.5 && b.collisionStallTimer > 2.5) {
                            // 【修复】双方都有保护状态时跳过传送，仅使用推力
                            const aProtected = a.isEating || a.isSleeping || a._isBeingTreated || a._currentBehaviorLock;
                            const bProtected = b.isEating || b.isSleeping || b._isBeingTreated || b._currentBehaviorLock;
                            if (aProtected && bProtected) {
                                // 双方都有保护，不传送，仅给轻微推力
                                if (a.collisionStallTimer > 10) {
                                    console.warn(`[碰撞警告] ${a.name} 和 ${b.name} 双方都有行为锁，无法脱困`);
                                }
                            } else {
                                const teleported = this._forceUnstuck(a, b, map);
                                if (teleported) {
                                    console.log(`[碰撞脱困] ${a.name} 和 ${b.name} 碰撞死锁${a.collisionStallTimer.toFixed(1)}秒，强制脱困`);
                                    if (this.addEvent) {
                                        this.addEvent(`⚠️ ${a.name} 和 ${b.name} 在${a.currentScene}卡住了，强制脱困`);
                                    }
                                }
                            }
                        }
                    }

                    // 【增强】发疯NPC碰撞逃逸：发疯NPC遇到长时间碰撞，立即换方向重新寻路
                    if (a.collisionStallTimer > 1.5 && a.isCrazy) {
                        this._forceCrazyEscape(a, map);
                    }
                    if (b.collisionStallTimer > 1.5 && b.isCrazy) {
                        this._forceCrazyEscape(b, map);
                    }

                    // 【修复】如果两个NPC都没在移动且都不在对话/睡觉/吃饭，给随机推力
                    // 避免两个NPC面对面卡死不动
                    if (!a.isMoving && !b.isMoving && a.state !== 'CHATTING' && b.state !== 'CHATTING'
                        && !a.isSleeping && !b.isSleeping && !a.isEating && !b.isEating) {
                        // 持有行为锁的NPC大幅减弱推力
                        const aHasLock = a._currentBehaviorLock;
                        const bHasLock = b._currentBehaviorLock;
                        const nudgeScale = (aHasLock || bHasLock) ? 0.1 : 1.0;
                        const nudge = GST.TILE * 0.3 * nudgeScale;
                        const angle = Math.random() * Math.PI * 2;
                        const nudgeX = Math.cos(angle) * nudge;
                        const nudgeY = Math.sin(angle) * nudge;
                        // 随机推力也要检查墙壁
                        if (!bHasLock && (!map || !map.isSolid(b.x + nudgeX + GST.TILE / 2, b.y + nudgeY + GST.TILE / 2))) {
                            b.x += nudgeX;
                            b.y += nudgeY;
                        } else if (!aHasLock && (!map || !map.isSolid(a.x - nudgeX + GST.TILE / 2, a.y - nudgeY + GST.TILE / 2))) {
                            // b方向推不动或b有锁，尝试推a
                            a.x -= nudgeX;
                            a.y -= nudgeY;
                        }

                        // 双方都有行为锁且碰撞>10秒，打印警告日志
                        if (aHasLock && bHasLock && a.collisionStallTimer > 10) {
                            console.warn(`[碰撞警告] ${a.name} 和 ${b.name} 双方都有行为锁，无法脱困`);
                        }

                        // 【增强】两个都静止碰撞超过3秒 → 也强制脱困（但需检查保护状态）
                        if (a.collisionStallTimer > 3.0 && b.collisionStallTimer > 3.0) {
                            const aProtected = a._isBeingTreated || a._currentBehaviorLock;
                            const bProtected = b._isBeingTreated || b._currentBehaviorLock;
                            if (aProtected && bProtected) {
                                // 双方都有保护，不传送
                            } else {
                                this._forceUnstuck(a, b, map);
                                console.log(`[碰撞脱困] ${a.name} 和 ${b.name} 双静止死锁，强制脱困`);
                            }
                        }
                    }
                }
            }
        }

    }

    /**
     * 【新增】强制脱困：将其中一个NPC传送到附近的空位
     * 返回 true 如果成功传送
     */

    _forceUnstuck(a, b, map) {
        // 【修复】行为锁保护：正在吃饭/睡觉/治疗的NPC不可被传送
        const aProtected = a.isEating || a.isSleeping || a._isBeingTreated;
        const bProtected = b.isEating || b.isSleeping || b._isBeingTreated;
        const aHasLock = !!a._currentBehaviorLock;
        const bHasLock = !!b._currentBehaviorLock;

        // 双方都在保护状态（吃饭/睡觉/治疗），拒绝传送
        if (aProtected && bProtected) {
            console.log(`[碰撞脱困] ${a.name} 和 ${b.name} 双方都在保护状态，跳过传送`);
            return false;
        }
        // 双方都有行为锁，拒绝传送
        if (aHasLock && bHasLock) {
            console.log(`[碰撞脱困] ${a.name} 和 ${b.name} 双方都有行为锁，跳过传送`);
            return false;
        }

        // 选择传送哪个NPC：优先传送没有行为锁/没有保护状态的
        let toMove = b;
        let other = a;
        // 优先级1：传送没有保护状态的NPC
        if (aProtected && !bProtected) { toMove = b; other = a; }
        else if (bProtected && !aProtected) { toMove = a; other = b; }
        // 优先级2：传送没有行为锁的NPC
        else if (aHasLock && !bHasLock) { toMove = b; other = a; }
        else if (bHasLock && !aHasLock) { toMove = a; other = b; }
        // 优先级3：原有选择逻辑
        else if (a.isCrazy && !b.isCrazy) { toMove = a; other = b; }
        else if (!a.isMoving && b.isMoving) { toMove = a; other = b; }
        else if (a.currentPath.length < b.currentPath.length) { toMove = a; other = b; }

        // 最终安全检查：如果被选中传送的NPC处于保护状态，拒绝传送
        if (toMove.isEating || toMove.isSleeping || toMove._isBeingTreated) {
            console.log(`[碰撞脱困] ${toMove.name} 处于保护状态，拒绝传送`);
            return false;
        }

        const gx = Math.floor((toMove.x + GST.TILE / 2) / GST.TILE);
        const gy = Math.floor((toMove.y + GST.TILE / 2) / GST.TILE);

        // 搜索半径1~2格内的空位（限制搜索范围避免大范围"闪现"）
        const candidates = [];
        for (let r = 1; r <= 2; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只检查外圈
                    const nx = gx + dx;
                    const ny = gy + dy;
                    if (map && !map.isSolid(nx * GST.TILE + GST.TILE / 2, ny * GST.TILE + GST.TILE / 2)) {
                        // 确保不会传送到另一个NPC身上
                        const ox = Math.floor((other.x + GST.TILE / 2) / GST.TILE);
                        const oy = Math.floor((other.y + GST.TILE / 2) / GST.TILE);
                        if (Math.abs(nx - ox) > 1 || Math.abs(ny - oy) > 1) {
                            candidates.push({ x: nx, y: ny });
                        }
                    }
                }
            }
            if (candidates.length > 0) break; // 找到就停
        }

        if (candidates.length > 0) {
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            toMove.x = target.x * GST.TILE;
            toMove.y = target.y * GST.TILE;
            toMove.collisionStallTimer = 0;
            toMove.stuckTimer = 0;
            toMove.currentPath = [];
            toMove.pathIndex = 0;
            toMove.isMoving = false;
            toMove._yieldMove = null;
            other.collisionStallTimer = 0;
            other.stuckTimer = 0;
            // 记录碰撞debug日志
            if (toMove._logDebug) toMove._logDebug('collision', `与${other.name}碰撞死锁，被传送到(${target.x},${target.y})脱困`);
            if (other._logDebug) other._logDebug('collision', `与${toMove.name}碰撞死锁，对方被传送脱困`);
            return true;
        }
        return false;
    }

    /**
     * 【新增】发疯NPC碰撞逃逸：清空当前路径，朝反方向找一个较远的空位重新寻路
     */

    _forceCrazyEscape(npc, map) {
        if (!map || !npc.isCrazy) return;
        const pos = npc.getGridPos();
        // 随机选一个5~8格远的方向
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.floor(Math.random() * 4);
        const tx = Math.max(0, Math.min(map.cols - 1, pos.x + Math.round(Math.cos(angle) * dist)));
        const ty = Math.max(0, Math.min(map.rows - 1, pos.y + Math.round(Math.sin(angle) * dist)));

        if (!map.isSolid(tx * GST.TILE + GST.TILE / 2, ty * GST.TILE + GST.TILE / 2)) {
            npc.currentPath = GST.findPath(pos.x, pos.y, tx, ty, map) || [];
            npc.pathIndex = 0;
            npc.collisionStallTimer = 0;
            npc.stuckTimer = 0;
            if (npc.currentPath.length > 0) {
                npc.isMoving = true;
                npc.state = 'WALKING';
                if (npc._logDebug) npc._logDebug('collision', `发疯碰撞逃逸→(${tx},${ty})，路径${npc.currentPath.length}步`);
            }
        }
    }

    /**
     * 【增强】让路机制：让 yielder（静止/路径较长的NPC）主动移动到旁边的空位，
     * 给 mover（正在移动/路径较短的NPC）让出通道。
     */

    _tryYieldNPC(yielder, mover, map) {
        // 如果已经在让路状态中，不重复触发
        if (yielder._yieldMove) return;

        const gx = Math.floor((yielder.x + GST.TILE / 2) / GST.TILE);
        const gy = Math.floor((yielder.y + GST.TILE / 2) / GST.TILE);

        // mover 的移动方向（用来判断垂直于移动方向的让路方向）
        const mgx = Math.floor((mover.x + GST.TILE / 2) / GST.TILE);
        const mgy = Math.floor((mover.y + GST.TILE / 2) / GST.TILE);
        const mdx = mgx - gx;
        const mdy = mgy - gy;

        // 候选让路方向：优先垂直于 mover 的移动方向，然后是后退方向
        const candidates = [];
        if (Math.abs(mdx) >= Math.abs(mdy)) {
            // mover 从左/右方向来，yielder 往上下让
            candidates.push({ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -mdx, dy: 0 });
        } else {
            // mover 从上/下方向来，yielder 往左右让
            candidates.push({ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -mdy });
        }
        // 补充对角线方向
        candidates.push({ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 });

        for (const c of candidates) {
            const nx = gx + c.dx;
            const ny = gy + c.dy;
            if (map && !map.isSolid(nx * GST.TILE + GST.TILE / 2, ny * GST.TILE + GST.TILE / 2)) {
                // 找到了空位，让 yielder 临时移动过去
                yielder._yieldMove = { x: nx, y: ny };
                yielder._yieldTimer = 0;
                yielder.collisionStallTimer = 0;
                // 保存原路径，让路完成后恢复
                if (yielder.currentPath.length > 0 && !yielder._savedPath) {
                    yielder._savedPath = { path: [...yielder.currentPath], index: yielder.pathIndex };
                }
                return;
            }
        }
        // 所有方向都被墙挡住，无法让路 → 重置碰撞计时，避免一直尝试
        yielder.collisionStallTimer = 0;
    }

    _computeBubbleOffsets(sceneNPCs, minDist) {
        // 计算每个NPC附近的重叠NPC数量和排序偏移（用于气泡错开）
        for (const npc of sceneNPCs) {
            npc._bubbleOffset = 0;
        }
        for (let i = 0; i < sceneNPCs.length; i++) {
            let overlapCount = 0;
            for (let j = 0; j < sceneNPCs.length; j++) {
                if (i === j) continue;
                const dx = sceneNPCs[j].x - sceneNPCs[i].x;
                const dy = sceneNPCs[j].y - sceneNPCs[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < GST.TILE * 3) {
                    // 在3格范围内的NPC，按索引给气泡一个纵向偏移
                    if (j < i) overlapCount++;
                }
            }
            sceneNPCs[i]._bubbleOffset = overlapCount * 35; // 每个多35px向上（适配多行气泡）
        }
    }

    _autoSwitchFollow() {
        if (!this.autoFollow || this.npcs.length === 0) return;

        // 过滤掉已死亡的 NPC
        const alive = this.npcs.filter(n => !n.isDead);
        if (alive.length === 0) return; // 所有NPC都死了，保持当前镜头

        // 优先级1：正在对话的 NPC（排除当前目标）
        const chatting = alive.filter(n => n.state === 'CHATTING' && n !== this.followTarget);
        if (chatting.length > 0) {
            const pick = chatting[Math.floor(Math.random() * chatting.length)];
            this._doAutoSwitch(pick, '正在对话');
            return;
        }

        // 优先级2：正在移动的 NPC（排除当前目标）
        const walking = alive.filter(n => n.isMoving && n !== this.followTarget);
        if (walking.length > 0) {
            const pick = walking[Math.floor(Math.random() * walking.length)];
            this._doAutoSwitch(pick, '正在移动');
            return;
        }

        // 优先级3：任意存活的其他 NPC
        const others = alive.filter(n => n !== this.followTarget);
        if (others.length > 0) {
            const pick = others[Math.floor(Math.random() * others.length)];
            this._doAutoSwitch(pick);
        }
        // 如果只剩当前跟随的NPC存活，则保持不动
    }

    /** 自动切换辅助：执行切换并同步UI */

    _doAutoSwitch(npc, reason) {
        this.followTarget = npc;
        if (npc.currentScene !== this.currentScene) {
            this._switchScene(npc.currentScene, npc);
        }
        const label = reason ? `（${reason}）` : '';
        this.addEvent(`📷 自动切换到 ${npc.name}${label}`);
        // 同步下拉选择器显示当前NPC
        const sel = document.getElementById('sel-follow-target');
        if (sel) sel.value = npc.id;
    }

    // ---- 事件驱动镜头切换 ----
    /** 事件优先级映射 */
    static get CAMERA_EVENT_PRIORITY() {
        return { chat_start: 1, crazy: 2, death: 3 };
    }

    /**
     * NPC 重大事件通知 —— 由外部（dialogue.js / npc.js / death-system.js）调用
     * @param {NPC} npc - 触发事件的 NPC
     * @param {'chat_start'|'crazy'|'death'} eventType - 事件类型
     */

    onNPCEvent(npc, eventType) {
        // 仅在自由模式下生效
        if (!this.autoFollow) return;
        if (!npc) return;

        const priority = Game.CAMERA_EVENT_PRIORITY[eventType] || 0;

        // 如果当前有锁定且新事件优先级不高于当前锁定，忽略
        if (this._cameraLockTimer > 0 && priority <= this._cameraLockPriority) return;

        // 执行事件驱动切换
        this._eventDrivenSwitch(npc, eventType);

        // 设置锁定
        this._cameraLockTimer = this._cameraLockDuration;
        this._cameraLockPriority = priority;

        // 重置兜底轮询计时器，避免刚切过去又被轮询切走
        this.followSwitchTimer = 0;
    }

    /**
     * 事件驱动切换：立即将镜头切到指定 NPC
     * @param {NPC} npc - 目标 NPC
     * @param {string} eventType - 事件类型
     */

    _eventDrivenSwitch(npc, eventType) {
        this.followTarget = npc;

        // 跨场景切换
        if (npc.currentScene !== this.currentScene) {
            this._switchScene(npc.currentScene, npc);
        }

        // 事件日志（区分类型）
        const eventLabels = {
            chat_start: '开始对话',
            crazy: '发疯了！',
            death: '死亡'
        };
        const label = eventLabels[eventType] || eventType;
        this.addEvent(`📷 紧急切换到 ${npc.name}（${label}）`);

        // 同步下拉选择器
        const sel = document.getElementById('sel-follow-target');
        if (sel) sel.value = npc.id;
    }

    _switchScene(scene, npc) {
        if (!this.maps[scene]) return;
        if (this.fadeDirection !== 0) return;
        this.nextScene = scene;
        this.pendingFollowTarget = npc;
        this.fadeDirection = 1;
    }

    // ---- 主循环 ----

    loop(time) {
        // 如果已切到后台模式，不再通过 rAF 驱动
        if (this._isBgMode) return;

        const dt = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;

        if (!this.paused) {
            this.update(dt);
        }
        this.draw();

        // 自动存档
        this.autoSaveTimer += dt;
        if (this.autoSaveTimer >= this.autoSaveInterval) {
            this.autoSaveTimer = 0;
            this.autoSave();
        }
        requestAnimationFrame(t => this.loop(t));
    }

    /**
     * 后台循环 — 标签页隐藏时用 setTimeout 驱动，不受浏览器节流
     * 只执行 update()，不执行 draw()（后台没人看，省 CPU）
     */
    _bgLoop() {
        if (!this._isBgMode) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1);
        this.lastTime = now;

        if (!this.paused) {
            this.update(dt);
        }

        // 自动存档
        this.autoSaveTimer += dt;
        if (this.autoSaveTimer >= this.autoSaveInterval) {
            this.autoSaveTimer = 0;
            this.autoSave();
        }

        this._bgTimerId = setTimeout(() => this._bgLoop(), 1000 / this._BG_FPS);
    }

    update(dt) {
        const gameDt = dt * this.speedOptions[this.speedIdx];

        // 时间流逝
        const oldH = Math.floor(this.gameTimeSeconds / 3600);
        this.gameTimeSeconds += gameDt * this.timeSpeed;
        const newH = Math.floor(this.gameTimeSeconds / 3600);
        if (newH > oldH) this._onHourChange(newH);
        if (this.gameTimeSeconds >= 24 * 3600) {
            this.gameTimeSeconds -= 24 * 3600;
            this.dayCount++;
            this._nightSkipDone = false; // 新的一天重置跳夜标志
            this.addEvent(`🌅 新的一天！第 ${this.dayCount} 天`);
            // 重置所有NPC的每日客流统计和饥饿值
            for (const npc of this.npcs) {
                npc.shopVisitorCount = 0;
                npc.shopLastVisitorTime = null;
                npc.shopAloneMinutes = 0;
                
                // 【修复】如果NPC正在睡觉，保护睡眠状态，避免属性突变导致起床震荡
                if (npc.isSleeping) {
                    npc._dayChangeWhileSleeping = true; // 标记日切换发生在睡眠中
                    npc._forcedSleep = false;  // 【硬保护】日切换清除强制睡眠标记，新的一天恢复正常日程
                    npc._forcedSleepTimer = 0;
                    npc.hunger = Math.max(npc.hunger, 80); // 温和恢复，不强制重置为100
                    npc.isEating = false;
                    npc._hungerOverride = false;
                    npc._hungerTarget = null;
                    // 睡眠中体力和San值正常恢复
                    npc.stamina = Math.min(100, npc.stamina + 30);
                    npc.sanity = Math.min(100, npc.sanity + 15);
                } else {
                    npc.hunger = 100; // 新的一天，饱食重置
                    npc.isEating = false;
                    npc._hungerOverride = false;
                    npc._hungerTarget = null;
                    // 新的一天：体力部分恢复（睡了一晚）
                    npc.stamina = Math.min(100, npc.stamina + 30);
                    // 新的一天：San值部分恢复
                    npc.sanity = Math.min(100, npc.sanity + 15);
                }
                // 工作日薪结算（简化：每天结算一次固定收入）
                if (npc.workplaceName) {
                    npc.savings += 30; // 基础日薪
                } else if (npc.age >= 55) {
                    npc.savings += 20; // 退休金
                }
            }

            // ============ 通知极寒生存系统：天数切换 ============
            if (this.weatherSystem && this.weatherSystem.onDayChange) {
                this.weatherSystem.onDayChange(this.dayCount);
            }
            if (this.resourceSystem && this.resourceSystem.generateDayReport) {
                const report = this.resourceSystem.generateDayReport(this.dayCount - 1);
                if (report) {
                    console.log('[Game] 日结算报告:', this.resourceSystem.formatDayReport(report));
                    // AI模式日志：每日资源报告
                    if (this.aiModeLogger) {
                        this.aiModeLogger.log('DAILY_RESOURCE', this.resourceSystem.formatDayReport(report));
                    }
                }
            }
            // AI模式日志：每日总结（所有NPC属性快照）
            if (this.aiModeLogger && this.npcs.length > 0) {
                const aliveNpcs = this.npcs.filter(n => !n.isDead);
                const lines = aliveNpcs.map(npc => {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(npc);
                    return `  ${npc.name} | ${npc.state || '?'}/${npc.stateDesc || '?'} | ${snap} | ${npc.currentScene || '?'}`;
                });
                const deadCount = this.npcs.length - aliveNpcs.length;
                this.aiModeLogger.log('DAY_SUMMARY', `第${this.dayCount}天开始 | 存活${aliveNpcs.length}人 死亡${deadCount}人:\n${lines.join('\n')}`);
            }
            if (this.furnaceSystem && this.furnaceSystem.onDayChange) {
                this.furnaceSystem.onDayChange(this.dayCount);
            }
            if (this.taskSystem && this.taskSystem.onDayChange) {
                this.taskSystem.onDayChange(this.dayCount);
            }
            if (this.deathSystem && this.deathSystem.addMilestone) {
                this.deathSystem.addMilestone(`🌅 第${this.dayCount}天开始`);
            }
        }

        // 淡入淡出
        if (this.fadeDirection !== 0) {
            this.fadeAlpha += this.fadeDirection * dt * 3;
            if (this.fadeAlpha >= 1) {
                this.fadeAlpha = 1;
                this.fadeDirection = -1;
                this.currentScene = this.nextScene;
                if (this.pendingFollowTarget) {
                    const npc = this.pendingFollowTarget;
                    const map = this.maps[this.currentScene];
                    this.camera.jumpTo(npc.x + GST.TILE / 2, npc.y + GST.TILE / 2, map.width * GST.TILE, map.height * GST.TILE);
                    this.pendingFollowTarget = null;
                }
            } else if (this.fadeAlpha <= 0) {
                this.fadeAlpha = 0;
                this.fadeDirection = 0;
            }
            // 淡入淡出期间仍然更新 NPC
        }

        // ============ 极寒生存系统更新 ============
        if (this.weatherSystem) this.weatherSystem.update(gameDt);
        if (this.resourceSystem) this.resourceSystem.update(gameDt);
        if (this.furnaceSystem) this.furnaceSystem.update(gameDt);
        if (this.deathSystem) this.deathSystem.update(gameDt);
        if (this.taskSystem) this.taskSystem.update(gameDt);
        if (this.eventSystem) this.eventSystem.update(gameDt);
        if (this.aiModeLogger) this.aiModeLogger.update(gameDt);

        // 【任务5】无线电求救检测：修好无线电 + 第4天时触发救援信号
        if (this._radioRepaired && !this._radioRescueTriggered && this.dayCount >= 4) {
            this._radioRescueTriggered = true;
            if (this.addEvent) {
                this.addEvent(`📻🆘 无线电发出了求救信号！远方传来微弱的回应："坚持住…救援队正在路上…"`);
                this.addEvent(`🎉 这给了所有人莫大的希望！全员San值+10`);
            }
            // 全员San值+10
            for (const npc of this.npcs) {
                if (!npc.isDead) {
                    npc.sanity = Math.min(100, npc.sanity + 10);
                }
            }
        }

        // NPC 更新（传入 gameDt 使饥饿、移动等都受倍速影响）
        for (const npc of this.npcs) {
            npc.update(gameDt, this);
        }

        // NPC 之间碰撞推挤 —— 防止重叠站在一起
        this._resolveNPCCollisions();

        // ============ 全员入睡跳夜检测（必须在NPC update之后，确保isSleeping状态是最新的） ============
        this._checkNightSkip();

        // 对话更新
        this.dialogueManager.update(dt);

        // 摄像机
        const map = this.maps[this.currentScene];
        if (this.isAgentMode) {
            // AI/轮回 模式：自动跟随

            // 事件驱动锁定计时器递减
            if (this._cameraLockTimer > 0) {
                this._cameraLockTimer -= dt;
                if (this._cameraLockTimer <= 0) {
                    this._cameraLockTimer = 0;
                    this._cameraLockPriority = 0;
                }
            }

            // 死亡延迟切走计时器
            if (this._deathViewTimer > 0) {
                this._deathViewTimer -= dt;
                if (this._deathViewTimer <= 0) {
                    this._deathViewTimer = 0;
                    this._autoSwitchFollow();
                }
            }

            // 兜底轮询：锁定期间不触发
            this.followSwitchTimer += dt;
            if (this.followSwitchTimer >= this.followSwitchInterval && this.autoFollow && this._cameraLockTimer <= 0) {
                this.followSwitchTimer = 0;
                this._autoSwitchFollow();
            }

            if (this.followTarget) {
                if (this.followTarget.currentScene === this.currentScene) {
                    this.camera.followSmooth(
                        this.followTarget.x + GST.TILE / 2,
                        this.followTarget.y + GST.TILE / 2,
                        map.width * GST.TILE, map.height * GST.TILE, dt
                    );
                } else if (this.fadeDirection === 0) {
                    // 【修复】跟随目标已经切换了场景（进入/离开建筑），自动同步切换
                    this._switchScene(this.followTarget.currentScene, this.followTarget);
                }
            }
        } else {
            // Debug 模式：WASD 移动镜头
            let dx = 0, dy = 0;
            if (this.keys['w'] || this.keys['W'] || this.keys['ArrowUp'])    dy = -1;
            if (this.keys['s'] || this.keys['S'] || this.keys['ArrowDown'])  dy = 1;
            if (this.keys['a'] || this.keys['A'] || this.keys['ArrowLeft'])  dx = -1;
            if (this.keys['d'] || this.keys['D'] || this.keys['ArrowRight']) dx = 1;
            if (dx !== 0 || dy !== 0) {
                this.camera.moveBy(dx * this.debugCamSpeed * dt, dy * this.debugCamSpeed * dt,
                    map.width * GST.TILE, map.height * GST.TILE);
            }
        }

        // 更新侧边栏（每帧更新太频繁，降为 0.5s 一次）
        this._sidebarTimer = (this._sidebarTimer || 0) + dt;
        if (this._sidebarTimer >= 0.5) {
            this._sidebarTimer = 0;
            this._updateSidebar();
        }
    }

    _onHourChange(hour) {
        // 【修复】废掉旧的随机天气系统，统一使用 WeatherSystem 的预设天气
        // 每小时同步 WeatherSystem 的天气到 this.weather，确保全局一致
        if (this.weatherSystem) {
            this.weather = this.weatherSystem.currentWeather;
            this._updateRainIntensity();
        }
    }

    /**
     * 全员入睡跳夜机制：所有存活NPC都在睡觉时，直接跳到早6点
     * - 仅在深夜时段（22:00~05:59）生效
     * - 每天只触发一次，防止反复跳
     * - 跳过期间补算NPC的体力/San值/体温恢复
     * - 正确处理跨午夜日切换
     */

    _checkNightSkip() {
        // 已经跳过了今晚，不再重复
        if (this._nightSkipDone) return;

        // 【修复】第4天及以后禁止跳夜，必须让时间正常走到18:00触发结局
        if (this.dayCount >= 4) return;

        const hour = this.getHour();
        // 放宽检测时段：20:00~05:59（NPC可能因体力不支在20点就开始强制入睡）
        const isNightTime = hour >= 20 || hour < 6;
        if (!isNightTime) {
            this._allSleepingFrames = 0; // 非夜间重置计数
            return;
        }

        // 检测所有存活NPC是否都在睡觉
        const aliveNpcs = this.npcs.filter(n => !n.isDead);
        if (aliveNpcs.length === 0) return; // 无存活NPC不跳
        
        // 允许 isSleeping=true 或者 state==='SLEEPING' 都算在睡觉
        const allSleeping = aliveNpcs.every(n => n.isSleeping || n.state === 'SLEEPING');
        
        // 调试日志：每5秒打印一次跳夜检测状态
        if (!this._lastNightSkipLog || Date.now() - this._lastNightSkipLog > 5000) {
            this._lastNightSkipLog = Date.now();
            const statusList = aliveNpcs.map(n => `${n.name}:sleeping=${n.isSleeping},state=${n.state},scene=${n.currentScene}`).join(' | ');
            console.log(`[跳夜检测] hour=${hour} allSleeping=${allSleeping} frames=${this._allSleepingFrames} alive=${aliveNpcs.length} | ${statusList}`);
        }
        
        if (!allSleeping) {
            this._allSleepingFrames = 0; // 有人醒着，重置计数
            return;
        }

        // 防抖动：需要连续多帧（约0.5秒，30帧@60fps）全员在睡才触发跳夜
        // 这样即使有NPC被短暂饿醒又重新入睡，也不会阻止跳夜
        this._allSleepingFrames = (this._allSleepingFrames || 0) + 1;
        if (this._allSleepingFrames < 30) return; // 等待约0.5秒稳定

        // ✅ 全员入睡持续稳定 → 执行跳夜
        this._nightSkipDone = true;
        this._allSleepingFrames = 0;

        // 计算需要跳过的游戏秒数（跳到早6点=21600秒）
        const targetSeconds = 6 * 3600; // 06:00
        const currentSeconds = this.gameTimeSeconds;
        let skipSeconds;
        if (currentSeconds >= 20 * 3600) {
            // 20:00~23:59 → 需要跨午夜：先到24:00再到06:00
            skipSeconds = (24 * 3600 - currentSeconds) + targetSeconds;
        } else {
            // 00:00~05:59 → 直接跳到06:00
            skipSeconds = targetSeconds - currentSeconds;
        }

        if (skipSeconds <= 0) return; // 安全保护

        const skipHours = skipSeconds / 3600;
        console.log(`[跳夜] 全员入睡！从 ${this.getTimeStr()} 跳到 06:00（跳过 ${skipHours.toFixed(1)} 小时）`);

        // 1. 补算NPC睡眠恢复（按跳过的时间量）
        for (const npc of aliveNpcs) {
            // 体力恢复：睡眠中每游戏小时恢复约8点（正常tick中是 0.002*dt*60≈0.12/s → 7.2/h）
            const staminaGain = skipHours * 8;
            npc.stamina = Math.min(100, npc.stamina + staminaGain);

            // San值恢复：睡眠中每游戏小时恢复约3点
            const sanityGain = skipHours * 3;
            npc.sanity = Math.min(100, npc.sanity + sanityGain);

            // 健康恢复：睡眠中每游戏小时恢复约1点
            const healthGain = skipHours * 1;
            npc.health = Math.min(100, npc.health + healthGain);

            // 体温：如果在室内睡觉，体温缓慢回升到36度
            if (npc.bodyTemp !== undefined && npc.bodyTemp < 36) {
                npc.bodyTemp = Math.min(36, npc.bodyTemp + skipHours * 0.5);
            }

            // 清除强制睡眠标记（跳夜后相当于睡够了）
            if (npc._forcedSleep) {
                npc._forcedSleep = false;
                npc._forcedSleepTimer = 0;
            }
        }

        // 2. 处理跨午夜日切换
        const needDayChange = currentSeconds >= 20 * 3600; // 20点以后需要跨日
        if (needDayChange) {
            // 先推进到午夜，触发日切换
            this.gameTimeSeconds = 24 * 3600; // 会在下一帧的时间流逝中触发日切换
            // 手动触发日切换逻辑（因为我们直接设置时间，不经过正常tick）
            this.gameTimeSeconds = 0; // 重置为0:00
            this.dayCount++;
            this._nightSkipDone = false; // 新的一天，但立刻会再设为true
            this._nightSkipDone = true;  // 防止新的一天0:00再次触发跳夜检测

            // 触发跨过的每个小时的天气变化
            for (let h = hour + 1; h <= 23; h++) {
                this._onHourChange(h);
            }
            for (let h = 0; h <= 6; h++) {
                this._onHourChange(h);
            }

            // 日切换时的NPC属性处理（简化版，避免重复完整日切换逻辑）
            for (const npc of this.npcs) {
                npc._dayChangeWhileSleeping = true;
                npc.shopVisitorCount = 0;
                npc.shopLastVisitorTime = null;
                npc.shopAloneMinutes = 0;
                npc.hunger = Math.max(npc.hunger, 80);
                npc.isEating = false;
                npc._hungerOverride = false;
                npc._hungerTarget = null;
            }

            // 通知各子系统
            if (this.weatherSystem && this.weatherSystem.onDayChange) {
                this.weatherSystem.onDayChange(this.dayCount);
            }
            if (this.resourceSystem && this.resourceSystem.generateDayReport) {
                const report = this.resourceSystem.generateDayReport(this.dayCount - 1);
                if (report) {
                    console.log('[Game] 跳夜日结算报告:', this.resourceSystem.formatDayReport(report));
                }
            }
            if (this.furnaceSystem && this.furnaceSystem.onDayChange) {
                this.furnaceSystem.onDayChange(this.dayCount);
            }
            if (this.taskSystem && this.taskSystem.onDayChange) {
                this.taskSystem.onDayChange(this.dayCount);
            }
            if (this.deathSystem && this.deathSystem.addMilestone) {
                this.deathSystem.addMilestone(`🌅 第${this.dayCount}天开始（跳夜）`);
            }

            this.addEvent(`🌅 新的一天！第 ${this.dayCount} 天`);
        } else {
            // 不跨日（0~5点），只需补触发跳过的小时
            for (let h = hour + 1; h <= 6; h++) {
                this._onHourChange(h);
            }
        }

        // 3. 补算资源消耗（木柴+电力在跳过期间仍然需要持续消耗）
        if (this.resourceSystem) {
            const rs = this.resourceSystem;
            // 模拟跳过时段的资源消耗（传入跳过的总秒数）
            rs._tickConsumption(skipSeconds);
            console.log(`[跳夜] 资源补算: 木柴=${rs.woodFuel.toFixed(1)} 电力=${rs.power.toFixed(1)} (消耗${skipHours.toFixed(1)}小时)`);
        }

        // 4. 设置最终时间为06:00
        this.gameTimeSeconds = targetSeconds;

        // 5. 添加UI事件通知
        this.addEvent(`🌙💤 全员入睡，夜间快进到早上 06:00`);

        // AI模式日志
        if (this.aiModeLogger) {
            this.aiModeLogger.log('NIGHT_SKIP', `全员入睡跳夜 → 06:00 | 跳过${skipHours.toFixed(1)}小时 | 第${this.dayCount}天`);
        }

        console.log(`[跳夜] 完成！当前时间: ${this.getTimeStr()} 第${this.dayCount}天`);
    }

    _updateRainIntensity() {
        switch (this.weather) {
            case '小雨': this.rainIntensity = 0.4; break;
            case '大雨': this.rainIntensity = 1.0; break;
            default:     this.rainIntensity = 0; break;
        }
    }

    isRaining() {
        return this.weather === '小雨' || this.weather === '大雨';
    }

    togglePause() {
        this.paused = !this.paused;
        const btn = document.getElementById('btn-pause');
        btn.textContent = this.paused ? '▶️' : '⏸️';
        if (this.paused) this.addEvent('⏸️ 已暂停');
    }

    cycleSpeed() {
        this.speedIdx = (this.speedIdx + 1) % this.speedOptions.length;
        const btn = document.getElementById('btn-speed');
        btn.textContent = `${this.speedOptions[this.speedIdx]}×`;
        this.addEvent(`⏩ 速度 ${this.speedOptions[this.speedIdx]}×`);
    }

    // Debug 模式: 交互

    reincarnate() {
        console.log('[Game] 🔄 轮回重生开始...');

        // 1. 保存当前世的轮回记忆
        if (this.reincarnationSystem) {
            this.reincarnationSystem.savePastLife();
        }

        // 1.5 刷盘AI模式日志并重建
        if (this.aiModeLogger) {
            this.aiModeLogger.forceFlush();
        }

        // 2. 清除自动保存的debug log定时器
        if (this._debugLogAutoSaveInterval) {
            clearInterval(this._debugLogAutoSaveInterval);
        }

        // 2.5 清除轮回模式相关的自动轮回定时器（防止泄漏）
        if (this._reincarnationCountdownTimer) {
            clearTimeout(this._reincarnationCountdownTimer);
            this._reincarnationCountdownTimer = null;
        }
        if (this._reincarnationCountdownInterval) {
            clearInterval(this._reincarnationCountdownInterval);
            this._reincarnationCountdownInterval = null;
        }

        // 3. 清除NPC详情面板刷新定时器
        if (this._detailRefreshTimer) {
            clearInterval(this._detailRefreshTimer);
            this._detailRefreshTimer = null;
        }
        this._currentDetailNPC = null;
        const detailOverlay = document.getElementById('npc-detail-overlay');
        if (detailOverlay) detailOverlay.style.display = 'none';

        // 4. 清除对话系统状态
        if (this.dialogueManager) {
            this.dialogueManager.npcChatQueue = [];
            this.dialogueManager.isProcessing = false;
            this.dialogueManager.activeDialogue = null;
            if (this.dialogueManager.panel) this.dialogueManager.panel.style.display = 'none';
            // 清空聊天记录面板
            if (this.dialogueManager.chatLogContent) this.dialogueManager.chatLogContent.innerHTML = '';
        }

        // 5. 移除结局遮罩
        const endingOverlay = document.getElementById('ending-overlay');
        if (endingOverlay) endingOverlay.remove();

        // 6. 重置游戏时间
        this.gameTimeSeconds = 8 * 3600; // 第1天 08:00
        this.dayCount = 1;
        this.paused = false;
        // 【修复】轮回后保持用户的速度档位，不再强制重置为x1
        // this.speedIdx = 0;  // 移除：保持当前速度
        this.weather = '晴天';
        this.rainDrops = [];
        this.rainIntensity = 0;
        this.autoSaveTimer = 0;
        this.followSwitchTimer = 0;
        this.currentScene = 'village';
        this.fadeAlpha = 0;
        this.fadeDirection = 0;
        this.nextScene = null;
        this.pendingFollowTarget = null;

        // 清空事件日志
        this.eventLog = [];
        this._renderEventLog();

        // 7. 重建所有子系统（最干净的重置方式）
this.weatherSystem = GST.WeatherSystem ? new GST.WeatherSystem(this) : null;
        // 【修复】重置时同步天气
        if (this.weatherSystem) {
            this.weather = this.weatherSystem.currentWeather;
        }
this.resourceSystem = GST.ResourceSystem ? new GST.ResourceSystem(this) : null;
this.furnaceSystem = GST.FurnaceSystem ? new GST.FurnaceSystem(this) : null;
this.deathSystem = GST.DeathSystem ? new GST.DeathSystem(this) : null;
this.taskSystem = GST.TaskSystem ? new GST.TaskSystem(this) : null;
this.eventSystem = GST.EventSystem ? new GST.EventSystem(this) : null;

        // 8. 重新初始化轮回系统（更新世数）
        if (this.reincarnationSystem) {
            this.reincarnationSystem.advanceLife();
        }

        // 8.5 重建AI模式日志系统（新会话文件）
this.aiModeLogger = (this.isAgentMode && GST.AIModeLogger) ? new GST.AIModeLogger(this) : null;

        // 9. 重新初始化NPC（从NPC_CONFIGS重新创建，但会在之后应用轮回加成）
        this.npcs = [];
        if (typeof GST.NPC_CONFIGS !== 'undefined') {
            for (const cfg of GST.NPC_CONFIGS) {
                this.npcs.push(new GST.NPC(cfg, this));
            }
        }

        // 9.5 【智能分工系统】轮回后重新生成workPlan
        this._initWorkPlan();

        // 10. 重新设置对话管理器的game引用
        if (this.dialogueManager) {
            this.dialogueManager.game = this;
            this.dialogueManager.aiRoundRobinIdx = 0;
            this.dialogueManager.aiTickTimer = 0;
        }

        // 11. 重建侧边栏Agent卡片
        const agentList = document.getElementById('agent-list');
        if (agentList) {
            agentList.innerHTML = '';
            for (const npc of this.npcs) {
                const card = document.createElement('div');
                card.className = 'agent-card';
                card.id = `agent-card-${npc.id}`;
                card.innerHTML = `
                    <div class="agent-card-header">
                        <span class="agent-dot" style="background:${npc.color}"></span>
                        <span class="agent-name">${npc.name}</span>
                        <span class="agent-mood" id="mood-${npc.id}">😊</span>
                    </div>
                    <div class="agent-status" id="status-${npc.id}">${npc.occupation} · ${npc.stateDesc}</div>
                    <div class="agent-attrs-mini" id="attrs-${npc.id}"></div>
                    <div class="agent-thought" id="thought-${npc.id}"></div>
                `;
                card.addEventListener('click', () => this._openNPCDetail(npc));
                agentList.appendChild(card);
            }
        }

        // 12. 重建NPC跟随选择列表
        const selTarget = document.getElementById('sel-follow-target');
        if (selTarget) {
            // 保留第一个"自动切换"选项，删除其余
            while (selTarget.options.length > 1) selTarget.options.remove(1);
            for (const npc of this.npcs) {
                const opt = document.createElement('option');
                opt.value = npc.id;
                opt.textContent = npc.name;
                selTarget.appendChild(opt);
            }
            selTarget.value = 'auto';
        }

        // 13. 设置初始跟随目标
        if (this.isAgentMode && this.npcs.length > 0) {
            this.followTarget = this.npcs[0];
            this.autoFollow = true;
        }

        // 14. 重置摄像机位置
        const map = this.maps[this.currentScene];
        this.camera.jumpTo(25 * GST.TILE, 20 * GST.TILE, map.width * GST.TILE, map.height * GST.TILE);

        // 15. 更新UI控件
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.textContent = '⏸️';
        // 【修复】速度按钮文字同步当前实际速度（轮回后保持原速度）
        const btnSpeed = document.getElementById('btn-speed');
        if (btnSpeed) btnSpeed.textContent = `${this.speedOptions[this.speedIdx]}×`;
        const btnFollow = document.getElementById('btn-follow');
        if (btnFollow) {
            btnFollow.classList.remove('active');
            btnFollow.textContent = '📷 自由';
        }

        // 16. 更新轮回世数显示
        this._updateReincarnationUI();

        // 17. 重新启动debug log自动保存
        this._debugLogAutoSaveInterval = setInterval(() => {
            this._saveDebugLogToServer(true);
        }, 5 * 60 * 1000);

        // 18. 立即保存新世代的初始状态（断点续玩支持：刷新后可继续）
        this.save();

        // 通知
        const lifeNum = this.reincarnationSystem ? this.reincarnationSystem.getLifeNumber() : 1;
        this.addEvent(`🔄 轮回重生！第${lifeNum}世开始`);
        this.addEvent(`📅 第1天 08:00 — 带着前世的记忆重新开始`);

        console.log(`[Game] 🔄 轮回重生完成！进入第${lifeNum}世`);
    }

    /** 更新轮回世数UI显示 */

    save() {
        const data = {
            ver: 2,
            mode: this.mode,
            day: this.dayCount,
            time: this.gameTimeSeconds,
            scene: this.currentScene,
            weather: this.weather,
            speedIdx: this.speedIdx,
            npcs: this.npcs.map(n => n.serialize()),
            eventLog: this.eventLog.slice(0, 30),
            // 子系统状态
            resourceSystem: this.resourceSystem ? this.resourceSystem.serialize() : null,
            furnaceSystem: this.furnaceSystem ? this.furnaceSystem.serialize() : null,
            deathSystem: this.deathSystem ? this.deathSystem.serialize() : null,
            taskSystem: this.taskSystem ? this.taskSystem.serialize() : null,
            eventSystem: this.eventSystem ? this.eventSystem.serialize() : null,
            reincarnationSystem: this.reincarnationSystem ? this.reincarnationSystem.serialize() : null,
            // 全局物品/状态
            _medkitCount: this._medkitCount,
            _medkitCraftProgress: this._medkitCraftProgress,
            _radioRepairProgress: this._radioRepairProgress,
            _radioRepaired: this._radioRepaired,
            _radioRescueTriggered: this._radioRescueTriggered,
            _foodWasteReduction: this._foodWasteReduction,
            _patrolBonus: this._patrolBonus,
            _furnaceMaintained: this._furnaceMaintained,
            _nightSkipDone: this._nightSkipDone,
            // 保存时间戳
            savedAt: Date.now(),
        };
        localStorage.setItem('tihutown_save', JSON.stringify(data));
        this._showToast('💾 已保存');
    }

    autoSave() { this.save(); }

    load() {
        const raw = localStorage.getItem('tihutown_save');
        if (!raw) return false;
        try {
            const d = JSON.parse(raw);
            // 基本游戏状态
            this.dayCount = d.day || 1;
            this.gameTimeSeconds = d.time || 8 * 3600;
            this.currentScene = d.scene || 'village';
            this.weather = d.weather || '晴天';
            if (d.speedIdx !== undefined) {
                this.speedIdx = d.speedIdx;
                const btnSpeed = document.getElementById('btn-speed');
                if (btnSpeed) btnSpeed.textContent = `${this.speedOptions[this.speedIdx]}×`;
            }
            // NPC状态
            if (d.npcs) {
                for (let i = 0; i < this.npcs.length && i < d.npcs.length; i++) {
                    this.npcs[i].deserialize(d.npcs[i]);
                }
            }
            if (d.eventLog) this.eventLog = d.eventLog;
            // 子系统状态恢复
            if (d.resourceSystem && this.resourceSystem && this.resourceSystem.deserialize) {
                this.resourceSystem.deserialize(d.resourceSystem);
            }
            if (d.furnaceSystem && this.furnaceSystem && this.furnaceSystem.deserialize) {
                this.furnaceSystem.deserialize(d.furnaceSystem);
            }
            if (d.deathSystem && this.deathSystem && this.deathSystem.deserialize) {
                this.deathSystem.deserialize(d.deathSystem);
            }
            if (d.taskSystem && this.taskSystem && this.taskSystem.deserialize) {
                this.taskSystem.deserialize(d.taskSystem);
            }
            if (d.eventSystem && this.eventSystem && this.eventSystem.deserialize) {
                this.eventSystem.deserialize(d.eventSystem);
            }
            if (d.reincarnationSystem && this.reincarnationSystem && this.reincarnationSystem.deserialize) {
                this.reincarnationSystem.deserialize(d.reincarnationSystem);
            }
            // 全局物品/状态恢复
            if (d._medkitCount !== undefined) this._medkitCount = d._medkitCount;
            if (d._medkitCraftProgress !== undefined) this._medkitCraftProgress = d._medkitCraftProgress;
            if (d._radioRepairProgress !== undefined) this._radioRepairProgress = d._radioRepairProgress;
            if (d._radioRepaired !== undefined) this._radioRepaired = d._radioRepaired;
            if (d._radioRescueTriggered !== undefined) this._radioRescueTriggered = d._radioRescueTriggered;
            if (d._foodWasteReduction !== undefined) this._foodWasteReduction = d._foodWasteReduction;
            if (d._patrolBonus !== undefined) this._patrolBonus = d._patrolBonus;
            if (d._furnaceMaintained !== undefined) this._furnaceMaintained = d._furnaceMaintained;
            if (d._nightSkipDone !== undefined) this._nightSkipDone = d._nightSkipDone;
            // 同步天气系统
            if (this.weatherSystem) {
                this.weatherSystem.currentWeather = this.weather;
            }
            this._updateRainIntensity();
            console.log(`[Game] 存档加载成功：第${this.dayCount}天 ${this.getTimeStr()} 模式=${d.mode || 'unknown'}`);
            return true;
        } catch (e) {
            console.warn('存档加载失败:', e);
            return false;
        }
    }

    /**
     * 获取存档摘要信息（用于启动页面显示，不实际加载）
     * @returns {Object|null} 存档摘要或null
     */
    static getSaveInfo() {
        try {
            const raw = localStorage.getItem('tihutown_save');
            if (!raw) return null;
            const d = JSON.parse(raw);
            // ver=2才是完整存档，ver=1是旧版不完整存档（不支持断点续玩）
            if (!d.ver || d.ver < 2) return null;
            const aliveCount = d.npcs ? d.npcs.filter(n => !n.isDead).length : '?';
            const totalCount = d.npcs ? d.npcs.length : 8;
            const h = Math.floor((d.time / 3600) % 24);
            const m = Math.floor((d.time / 60) % 60);
            const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            const savedDate = d.savedAt ? new Date(d.savedAt) : null;
            const savedStr = savedDate ? `${savedDate.getMonth()+1}/${savedDate.getDate()} ${savedDate.getHours()}:${String(savedDate.getMinutes()).padStart(2,'0')}` : '未知';
            return {
                mode: d.mode || 'unknown',
                day: d.day || 1,
                timeStr: timeStr,
                aliveCount: aliveCount,
                totalCount: totalCount,
                savedAt: savedStr,
                weather: d.weather || '晴天',
            };
        } catch (e) {
            return null;
        }
    }

    getTimeStr() {
        const h = Math.floor((this.gameTimeSeconds / 3600) % 24);
        const m = Math.floor((this.gameTimeSeconds / 60) % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    getHour() {
        return Math.floor((this.gameTimeSeconds / 3600) % 24);
    }

    getTimePeriod() {
        const h = this.getHour();
        if (h >= 5 && h < 8) return '清晨';
        if (h >= 8 && h < 11) return '上午';
        if (h >= 11 && h < 14) return '中午';
        if (h >= 14 && h < 17) return '下午';
        if (h >= 17 && h < 20) return '傍晚';
        if (h >= 20 && h < 23) return '晚上';
        return '深夜';
    }

    }

    GST.Game = Game;
})();
