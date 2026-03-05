/**
 * 福音镇 - 游戏主逻辑
 * 双模式：AI 观察模式 / Debug 模式
 * 依赖: maps.js, npc.js, dialogue.js
 */

// ============ LLM API 配置 ============
// --- Ollama 本地模式（免费，需先运行 ollama serve）---
const API_KEY = '';  // Ollama 不需要 API Key
const API_URL = '/ollama/v1/chat/completions';  // Ollama OpenAI 兼容接口（云端GLM-4用）
const OLLAMA_NATIVE_URL = '/ollama/api/chat';    // Ollama 原生接口（本地模型用，支持关闭think）
const USE_OLLAMA_NATIVE = true;  // 使用Ollama原生接口（解决Qwen3思考模式导致content为空的问题）
let AI_MODEL = 'qwen3:14b-q8_0';  // Qwen3-14B Q8量化 本地模型（启动界面可选）
// --- 如需切回 GLM-4 云端，取消下面注释 ---
// const API_KEY = '632ac37d12b6436391d339d3a8a56332.2vADw9DHvjxeEwE0';
// const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// const AI_MODEL = 'glm-4-flash';

// 【全局API状态跟踪】
const LLM_STATUS = {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    lastError: null,
    lastErrorTime: null,
    consecutiveFails: 0,  // 连续失败次数
    lastSuccessTime: null,
    isDown: false,         // API是否疑似宕机
};

// 【LLM请求串行化队列】Ollama 本地推理同一时间只能处理一个请求
// 多个NPC同时想聊天时，排队依次处理，避免并发导致超时失败
let _llmQueuePromise = Promise.resolve();

async function callLLM(systemPrompt, userPrompt, maxTokens = 500) {
    // 将请求排入队列，确保串行执行
    const result = await new Promise((resolve) => {
        _llmQueuePromise = _llmQueuePromise.then(async () => {
            const r = await _callLLMInternal(systemPrompt, userPrompt, maxTokens);
            resolve(r);
        }).catch((err) => {
            console.error('[LLM Queue] 队列异常:', err);
            resolve(null);
        });
    });
    return result;
}

async function _callLLMInternal(systemPrompt, userPrompt, maxTokens = 500) {
    // 【保护】如果连续失败超过10次，暂停60秒避免无意义请求
    if (LLM_STATUS.consecutiveFails >= 10) {
        const elapsed = Date.now() - (LLM_STATUS.lastErrorTime || 0);
        if (elapsed < 60000) {
            console.warn(`[LLM] API连续失败${LLM_STATUS.consecutiveFails}次，暂停中(剩余${Math.round((60000 - elapsed) / 1000)}秒)`);
            LLM_STATUS.isDown = true;
            return null;
        }
        // 超过60秒，重置计数器，允许重试
        console.log('[LLM] 暂停结束，重新尝试API调用...');
        LLM_STATUS.consecutiveFails = 0;
        LLM_STATUS.isDown = false;
    }

    const MAX_RETRIES = 2; // 最多重试2次（共3次调用）
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        LLM_STATUS.totalCalls++;
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

            // 根据模式选择不同的URL和请求体
            let requestUrl, requestBody;
            if (USE_OLLAMA_NATIVE) {
                // Ollama 原生接口：支持 think:false 关闭思考模式
                requestUrl = OLLAMA_NATIVE_URL;
                requestBody = JSON.stringify({
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    think: false,
                    stream: false,
                    options: {
                        num_predict: maxTokens,
                        temperature: 0.85
                    }
                });
            } else {
                // OpenAI 兼容接口（GLM-4等云端模型）
                requestUrl = API_URL;
                requestBody = JSON.stringify({
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: maxTokens,
                    temperature: 0.85
                });
            }

            // 【关键修复】添加90秒超时（14B模型推理较慢，且Ollama串行处理请求需要排队等待）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);
            let resp;
            try {
                resp = await fetch(requestUrl, {
                    method: 'POST',
                    headers,
                    body: requestBody,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            // 检查HTTP状态码
            if (!resp.ok) {
                const errorText = await resp.text().catch(() => '无法读取响应体');
                const errMsg = `HTTP ${resp.status} ${resp.statusText}: ${errorText.substring(0, 200)}`;
                console.error(`[LLM] API HTTP错误(第${attempt + 1}次): ${errMsg}`);
                LLM_STATUS.lastError = errMsg;
                LLM_STATUS.lastErrorTime = Date.now();
                LLM_STATUS.failedCalls++;
                LLM_STATUS.consecutiveFails++;
                // 429 Too Many Requests → 等待后重试
                if (resp.status === 429 && attempt < MAX_RETRIES) {
                    const waitMs = (attempt + 1) * 2000;
                    console.warn(`[LLM] 速率限制，等待${waitMs}ms后重试...`);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }
                // 其他错误也重试
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                return null;
            }

            const data = await resp.json();

            // 统一提取content：兼容Ollama原生格式和OpenAI格式
            let content = null;
            if (USE_OLLAMA_NATIVE && data.message) {
                // Ollama 原生格式: { message: { role, content } }
                content = data.message.content;
            } else if (data.choices && data.choices[0] && data.choices[0].message) {
                // OpenAI 兼容格式: { choices: [{ message: { content } }] }
                content = data.choices[0].message.content;
                // 【Qwen3兼容】如果content为空但reasoning有内容，记录warning
                if ((!content || !content.trim()) && data.choices[0].message.reasoning) {
                    console.warn(`[LLM] content为空但reasoning有内容(第${attempt + 1}次)，建议开启USE_OLLAMA_NATIVE模式`);
                }
            }

            if (content && content.trim()) {
                // 【Qwen3兼容】清理 <think>...</think> 思考标签，只保留实际回复
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                if (!content) {
                    console.warn(`[LLM] 清理think标签后content为空(第${attempt + 1}次)`);
                    // 继续重试
                } else {
                    LLM_STATUS.successCalls++;
                    LLM_STATUS.consecutiveFails = 0;
                    LLM_STATUS.lastSuccessTime = Date.now();
                    LLM_STATUS.isDown = false;
                    return content;
                }
            }

            if (data.error) {
                // API返回了错误对象
                const errMsg = `API Error: ${data.error.message || data.error.code || JSON.stringify(data.error).substring(0, 200)}`;
                console.error(`[LLM] ${errMsg}`);
                LLM_STATUS.lastError = errMsg;
                LLM_STATUS.lastErrorTime = Date.now();
                LLM_STATUS.failedCalls++;
                LLM_STATUS.consecutiveFails++;
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }
                return null;
            } else {
                console.warn(`[LLM] API返回异常格式(第${attempt + 1}次):`, JSON.stringify(data).substring(0, 300));
            }

            LLM_STATUS.failedCalls++;
            LLM_STATUS.consecutiveFails++;
            LLM_STATUS.lastError = '返回格式异常或content为空';
            LLM_STATUS.lastErrorTime = Date.now();

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return null;

        } catch (err) {
            LLM_STATUS.failedCalls++;
            LLM_STATUS.consecutiveFails++;
            LLM_STATUS.lastError = err.message || String(err);
            LLM_STATUS.lastErrorTime = Date.now();
            console.error(`[LLM] 调用异常(第${attempt + 1}次):`, err);
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return null;
        }
    }
    return null;
}

function parseLLMJSON(text) {
    if (!text) return null;
    try {
        let s = text.replace(/```json|```/g, '').trim();
        const m = s.match(/\{[\s\S]*\}/);
        if (m) s = m[0];
        return JSON.parse(s);
    } catch (e) {
        // 【14B兼容】尝试修复被token截断的不完整JSON
        try {
            let s = text.replace(/```json|```/g, '').trim();
            // 提取从第一个 { 开始的内容
            const idx = s.indexOf('{');
            if (idx >= 0) {
                s = s.substring(idx);
                // 移除末尾不完整的value（可能在字符串中间被截断）
                // 先尝试补全：去掉最后一个不完整的key-value对，然后闭合
                // 策略1: 如果最后一个完整的引号对之后有未闭合的内容，截断到最后一个完整的value
                const lastCompleteComma = s.lastIndexOf('",');
                const lastCompleteQuote = s.lastIndexOf('"');
                if (lastCompleteComma > 0) {
                    // 截断到最后一个 ", 然后闭合
                    const truncated = s.substring(0, lastCompleteComma + 1) + '}';
                    const result = JSON.parse(truncated);
                    console.log('[parseLLMJSON] 修复截断JSON成功(策略1-截断到最后完整值)');
                    return result;
                }
            }
        } catch (e2) {
            // 策略2: 更激进的修复——逐步去掉末尾字符直到能解析
            try {
                let s = text.replace(/```json|```/g, '').trim();
                const idx = s.indexOf('{');
                if (idx >= 0) {
                    s = s.substring(idx);
                    // 补全所有未闭合的引号和大括号
                    let fixed = s;
                    // 统计未闭合的引号
                    const quoteCount = (fixed.match(/"/g) || []).length;
                    if (quoteCount % 2 !== 0) fixed += '"';
                    // 确保以 } 结尾
                    if (!fixed.trimEnd().endsWith('}')) fixed += '}';
                    const result = JSON.parse(fixed);
                    console.log('[parseLLMJSON] 修复截断JSON成功(策略2-补全引号和括号)');
                    return result;
                }
            } catch (e3) {
                // 所有修复尝试都失败了
            }
        }
        console.warn('JSON 解析失败(含修复尝试):', e.message, text?.substring(0, 200));
        return null;
    }
}


// ============ Camera ============
class Camera {
    constructor(w, h) {
        this.x = 0;
        this.y = 0;
        this.width = w;
        this.height = h;
        // 平滑跟随
        this.targetX = 0;
        this.targetY = 0;
        this.smoothSpeed = 3; // 值越大跟随越快
    }

    /** 立即跳到目标 */
    jumpTo(tx, ty, mapW, mapH) {
        this.targetX = tx - this.width / 2;
        this.targetY = ty - this.height / 2;
        this.targetX = Math.max(0, Math.min(this.targetX, mapW - this.width));
        this.targetY = Math.max(0, Math.min(this.targetY, mapH - this.height));
        this.x = this.targetX;
        this.y = this.targetY;
    }

    /** 平滑跟随 */
    followSmooth(tx, ty, mapW, mapH, dt) {
        this.targetX = tx - this.width / 2;
        this.targetY = ty - this.height / 2;
        this.targetX = Math.max(0, Math.min(this.targetX, mapW - this.width));
        this.targetY = Math.max(0, Math.min(this.targetY, mapH - this.height));
        const lerp = 1 - Math.exp(-this.smoothSpeed * dt);
        this.x += (this.targetX - this.x) * lerp;
        this.y += (this.targetY - this.y) * lerp;
    }

    /** Debug 模式: WASD 直接移动 */
    moveBy(dx, dy, mapW, mapH) {
        this.x += dx;
        this.y += dy;
        this.x = Math.max(0, Math.min(this.x, mapW - this.width));
        this.y = Math.max(0, Math.min(this.y, mapH - this.height));
        this.targetX = this.x;
        this.targetY = this.y;
    }
}


// ============ Game 主类 ============
class Game {
    constructor(mode) {
        // 模式: 'agent' = AI 观察模式, 'debug' = 手动模式, 'reincarnation' = 轮回模式
        this.mode = mode;
        // 轮回模式继承AI观察模式的全部行为（自动跟随、NPC自主行动等）
        this.isAgentMode = (mode === 'agent' || mode === 'reincarnation');

        // 【难度系统】读取当前难度配置
        this.difficulty = getDifficulty();
        console.log(`[Game] 难度: ${this.difficulty.stars} ${this.difficulty.name} (key=${this.difficulty.key})`);

        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ui = document.getElementById('ui');

        // 视口 — 高 DPI 适配，画面放大 1.5 倍且文字高清
        this.viewW = 20 * TILE;
        this.viewH = 15 * TILE;
        this.displayScale = 1.5; // 画面整体放大倍数
        this.dpr = window.devicePixelRatio || 1;
        // 内部渲染分辨率 = 逻辑尺寸 × displayScale × dpr，确保文字不模糊
        const renderScale = this.displayScale * this.dpr;
        this.canvas.width = this.viewW * renderScale;
        this.canvas.height = this.viewH * renderScale;
        this.canvas.style.width = (this.viewW * this.displayScale) + 'px';
        this.canvas.style.height = (this.viewH * this.displayScale) + 'px';
        this.ctx.scale(renderScale, renderScale);
        this.camera = new Camera(this.viewW, this.viewH);

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
            village:   new VillageMap(),
            dorm_a:    new DormAMap(),
            dorm_b:    new DormBMap(),
            medical:   new MedicalMap(),
            warehouse: new WarehouseMap(),
            workshop:  new WorkshopMap(),
            kitchen:   new KitchenMap(),
        };

        // 当前观察的场景（AI 模式下跟随 NPC 自动切换）
        this.currentScene = 'village';

        // NPC 系统
        this.npcs = [];
        this._initNPCs();

        // 对话系统
        this.dialogueManager = new DialogueManager(this);

        // ============ 极寒生存系统初始化 ============
        this.weatherSystem = (typeof WeatherSystem !== 'undefined') ? new WeatherSystem(this) : null;
        // 【修复】初始化时同步WeatherSystem天气到game.weather，避免两套天气系统冲突
        if (this.weatherSystem) {
            this.weather = this.weatherSystem.currentWeather;
        }
        this.resourceSystem = (typeof ResourceSystem !== 'undefined') ? new ResourceSystem(this) : null;
        this.furnaceSystem = (typeof FurnaceSystem !== 'undefined') ? new FurnaceSystem(this) : null;
        this.deathSystem = (typeof DeathSystem !== 'undefined') ? new DeathSystem(this) : null;
        this.taskSystem = (typeof TaskSystem !== 'undefined') ? new TaskSystem(this) : null;
        this.eventSystem = (typeof EventSystem !== 'undefined') ? new EventSystem(this) : null;

        // 轮回记忆系统（非轮回模式下构造函数内部自动强制第1世）
        this.reincarnationSystem = (typeof ReincarnationSystem !== 'undefined') ? new ReincarnationSystem(this) : null;

        // 【智能分工系统】生成workPlan并存储到老钱
        this._initWorkPlan();

        // AI模式日志系统（仅 agent/reincarnation 模式下启用）
        this.aiModeLogger = (this.isAgentMode && typeof AIModeLogger !== 'undefined') ? new AIModeLogger(this) : null;

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

        // 设置输入
        this._setupInput();
        this._setupControls();
        this._setupSidebar();

        // 初始化摄像机位置 — 对准新地图中心（主暖炉附近）
        const map = this.maps[this.currentScene];
        this.camera.jumpTo(25 * TILE, 20 * TILE, map.width * TILE, map.height * TILE);

        // 初始跟随
        if (this.isAgentMode && this.npcs.length > 0) {
            this.followTarget = this.npcs[0];
        }

        // 自动存档
        this.autoSaveTimer = 0;
        this.autoSaveInterval = 120;

        // 主循环
        this.lastTime = performance.now();
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
            this._pendingWorkPlanEvent = `📋 ${holder.name}制定了第${lifeNum}世分工方案: ${workPlan.workPlanSummary}`;
        }

        // 日志输出
        if (workPlan.dayPlans) {
            const days = Object.keys(workPlan.dayPlans);
            const npcCounts = days.map(d => workPlan.dayPlans[d].length);
            console.log(`[WorkPlan] 第${this.reincarnationSystem.getLifeNumber()}世分工方案生成完毕: { ${days.map((d, i) => `day${d}: ${npcCounts[i]}人`).join(', ')} }`);
        }
    }

    // ---- NPC 初始化 ----
    _initNPCs() {
        if (typeof NPC_CONFIGS === 'undefined') return;
        for (const cfg of NPC_CONFIGS) {
            this.npcs.push(new NPC(cfg, this));
        }
    }

    // ---- 输入系统 ----
    _setupInput() {
        window.addEventListener('keydown', e => {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 's' || e.key === 'S') {
                    e.preventDefault();
                    this.save();
                }
                return;
            }
            this.keys[e.key] = true;

            // 通用快捷键
            if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
            if (e.key === '+' || e.key === '=') this.cycleSpeed();

            // Debug 模式快捷键
            if (this.mode === 'debug') {
                if (e.key === 'g' || e.key === 'G') this.showGrid = !this.showGrid;
                if (e.key === 'e' || e.key === 'E') this._tryInteract();
                if (e.key === 't' || e.key === 'T') {
                    e.preventDefault();
                    const chatUI = document.getElementById('chat-container');
                    chatUI.style.display = 'flex';
                    document.getElementById('chat-input').focus();
                }
            }

            // 数字键 1-8 跟随对应 NPC
            const num = parseInt(e.key);
            if (num >= 1 && num <= 8 && num <= this.npcs.length) {
                this.setFollowTarget(this.npcs[num - 1]);
            }
        });
        window.addEventListener('keyup', e => this.keys[e.key] = false);
        window.addEventListener('blur', () => { this.keys = {}; });

        // Debug 模式聊天
        if (this.mode === 'debug') {
            const chatInput = document.getElementById('chat-input');
            const btnSend = document.getElementById('btn-send-chat');
            const sendChat = () => {
                const msg = chatInput.value.trim();
                if (!msg) return;
                chatInput.value = '';
                chatInput.blur();
                const nearest = this._nearestNPCToCamera(5);
                if (nearest) {
                    this.dialogueManager.startPlayerChat(nearest, msg);
                }
            };
            if (btnSend) btnSend.addEventListener('click', sendChat);
            if (chatInput) chatInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') sendChat();
                if (e.key === 'Escape') { chatInput.blur(); document.getElementById('chat-container').style.display = 'none'; }
            });
        }
    }

    // ---- 顶部控制栏 ----
    _setupControls() {
        const btnPause = document.getElementById('btn-pause');
        const btnSpeed = document.getElementById('btn-speed');
        const btnFollow = document.getElementById('btn-follow');
        const selTarget = document.getElementById('sel-follow-target');

        btnPause.addEventListener('click', () => this.togglePause());
        btnSpeed.addEventListener('click', () => this.cycleSpeed());
        btnFollow.addEventListener('click', () => {
            this.autoFollow = !this.autoFollow;
            btnFollow.classList.toggle('active', !this.autoFollow);
            btnFollow.textContent = this.autoFollow ? '📷 自由' : '📷 跟随';
            // 无论切到哪个模式，都清除事件锁定状态
            this._cameraLockTimer = 0;
            this._cameraLockPriority = 0;
            if (this.autoFollow) {
                // 切到自由模式：立即触发一次自动切换，避免镜头卡住不动
                this.followSwitchTimer = 0;
                this._autoSwitchFollow();
            }
        });

        // 填充 NPC 选择
        for (const npc of this.npcs) {
            const opt = document.createElement('option');
            opt.value = npc.id;
            opt.textContent = npc.name;
            selTarget.appendChild(opt);
        }
        selTarget.addEventListener('change', () => {
            const val = selTarget.value;
            if (val === 'auto') {
                this.autoFollow = true;
                btnFollow.classList.remove('active');
                btnFollow.textContent = '📷 自由';
                // 立即触发一次自动切换
                this.followSwitchTimer = 0;
                this._autoSwitchFollow();
            } else {
                const npc = this.npcs.find(n => n.id === val);
                if (npc) this.setFollowTarget(npc);
            }
        });

        // Debug 模式: 显示额外 UI
        if (this.mode === 'debug') {
            document.getElementById('instructions').style.display = 'block';
        }

        // 📦 顶部物资栏（始终可见，无需折叠逻辑）

        // 💾 Debug Log 保存按钮
        const btnSaveLog = document.getElementById('btn-save-debug-log');
        if (btnSaveLog) {
            btnSaveLog.addEventListener('click', () => this._saveDebugLogToServer());
        }

        // 【自动保存】每5分钟自动保存一次debug log到服务器
        this._debugLogAutoSaveInterval = setInterval(() => {
            this._saveDebugLogToServer(true); // quiet模式，不弹提示
        }, 5 * 60 * 1000);
    }

    // ---- 侧边栏 Agent 卡片 ----
    _setupSidebar() {
        const list = document.getElementById('agent-list');
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
            list.appendChild(card);
        }
        // 详情面板事件绑定
        this._setupNPCDetailPanel();
    }

    /** 更新侧边栏信息 */
    _updateSidebar() {
        // 时间
        const ws = this.weatherSystem;
        document.getElementById('sidebar-time').textContent =
            `第${this.dayCount}天 ${this.getTimeStr()} ${ws ? ws.weatherEmoji : ''} ${this.weather}`;

        // ============ 生存状态栏更新 ============
        const survDayEl = document.getElementById('surv-day-val');
        const survTempEl = document.getElementById('surv-temp-val');
        const survWeatherEl = document.getElementById('surv-weather-val');
        const survWeatherIcon = document.getElementById('surv-weather-icon');
        const survAliveEl = document.getElementById('surv-alive-val');
        const survFurnaceEl = document.getElementById('surv-furnace-val');

        if (survDayEl) survDayEl.textContent = `第${this.dayCount}天`;
        if (ws) {
            const temp = ws.getEffectiveTemp();
            if (survTempEl) {
                survTempEl.textContent = `${temp}°C`;
                survTempEl.className = 'surv-value' + (temp <= -30 ? ' danger' : temp < 0 ? ' cold' : '');
            }
            if (survWeatherEl) survWeatherEl.textContent = ws.currentWeather;
            if (survWeatherIcon) survWeatherIcon.textContent = ws.weatherEmoji;
        }
        const aliveCount = this.npcs.filter(n => !n.isDead).length;
        if (survAliveEl) {
            survAliveEl.textContent = `${aliveCount}/8`;
            survAliveEl.className = 'surv-value' + (aliveCount <= 4 ? ' danger' : '');
        }
        if (survFurnaceEl && this.furnaceSystem) {
            const active = this.furnaceSystem.getActiveFurnaceCount();
            const total = this.furnaceSystem.furnaces.length;
            let furnaceText;
            if (total === 1 && !this.furnaceSystem.secondFurnaceBuilt) {
                furnaceText = active > 0 ? '1座(运转中)' : '1座(已熄灭)';
            } else {
                furnaceText = `${total}座(${active}运转)`;
            }
            if (this.furnaceSystem.isBuildingSecondFurnace) {
                const pct = Math.round(this.furnaceSystem.buildProgress * 100);
                furnaceText += ` 🔨建造${pct}%`;
            }
            survFurnaceEl.textContent = furnaceText;
        }

        // ============ 资源面板更新 ============
        const rs = this.resourceSystem;
        if (rs) {
            const maxWood = 120, maxFood = 80, maxPower = 120, maxMaterial = 80;
            this._updateResBar('res-wood-fill', 'res-wood-val', rs.woodFuel, maxWood);
            this._updateResBar('res-food-fill', 'res-food-val', rs.food, maxFood);
            this._updateResBar('res-power-fill', 'res-power-val', rs.power, maxPower);
            this._updateResBar('res-material-fill', 'res-material-val', rs.material, maxMaterial);

            // 急救包数量显示
            const medkitVal = document.getElementById('res-medkit-val');
            if (medkitVal) {
                const count = this._medkitCount || 0;
                medkitVal.textContent = count;
                medkitVal.style.color = count === 0 ? '#f87171' : '';
            }
            // 急救包不足提示（每60秒最多提示一次）
            if (this._medkitCount <= 0) {
                const hasLowHpNpc = this.npcs.some(n => !n.isDead && n.health < 30);
                if (hasLowHpNpc) {
                    const now = Date.now();
                    if (!this._medkitLastWarnTime || (now - this._medkitLastWarnTime) >= 60000) {
                        this.addEvent('⚠️ 急救包不足！需要药剂师制作急救包');
                        this._medkitLastWarnTime = now;
                    }
                }
            } else {
                this._medkitLastWarnTime = 0;
            }
        }
        if (this.taskSystem) {
            const taskEl = document.getElementById('task-progress-val');
            if (taskEl) taskEl.textContent = this.taskSystem.getTaskSummaryForPrompt();
        }

        // Agent 卡片
        for (const npc of this.npcs) {
            const statusEl = document.getElementById(`status-${npc.id}`);
            const moodEl = document.getElementById(`mood-${npc.id}`);
            const thoughtEl = document.getElementById(`thought-${npc.id}`);
            const cardEl = document.getElementById(`agent-card-${npc.id}`);

            if (npc.isDead) {
                if (statusEl) statusEl.textContent = `💀 已死亡 — ${npc._deathCause || '未知'}`;
                if (moodEl) moodEl.textContent = '💀';
                if (cardEl) cardEl.style.opacity = '0.4';
                continue;
            }

            if (statusEl) {
                const roleIcons = { worker: '🔨', engineer: '🔧', support: '📋', special: '⭐' };
                const roleIcon = roleIcons[npc.config.role] || '';
                statusEl.textContent = `${roleIcon} ${npc.occupation} · ${npc.getStatusLine()}${npc.isCrazy ? ' · 🤯发疯中' : ''}${npc.isHypothermic ? ' · 🥶失温' : ''}${npc.isWatchingShow ? ' · 🎵看演出' : ''}${npc.isInTherapy ? ' · 💬咨询中' : ''}`;
            }
            // 更新迷你属性条 — 添加体温
            const attrsEl = document.getElementById(`attrs-${npc.id}`);
            if (attrsEl) {
                const bodyTempColor = npc.bodyTemp >= 36 ? '#4ade80' : npc.bodyTemp >= 35 ? '#facc15' : npc.bodyTemp >= 32 ? '#f87171' : '#c084fc';
                attrsEl.innerHTML = [
                    { label: '体力', e: '💪', v: npc.stamina, c: '#6BC98A' },
                    { label: '饱腹', e: '🍚', v: npc.hunger, c: '#F0C050' },
                    { label: 'San', e: '🧠', v: npc.sanity, c: '#C49BDB' },
                    { label: '体温', e: '🌡️', v: npc.bodyTemp, max: 36.5, c: bodyTempColor, suffix: '°C' },
                ].map(a => {
                    const max = a.max || 100;
                    const pct = Math.round(Math.min(a.v, max) / max * 100);
                    const val = a.suffix ? a.v.toFixed(1) + a.suffix : Math.round(a.v);
                    return `<span class="mini-attr-labeled"><span class="mini-attr-label">${a.e}${a.label}</span><span class="mini-bar-bg-wide"><span class="mini-bar" style="width:${pct}%;background:${a.c}"></span></span><span class="mini-attr-val">${val}</span></span>`;
                }).join('');
            }
            if (moodEl) moodEl.textContent = npc.isSleeping ? '😴' : this._moodEmoji(npc.mood);
            if (thoughtEl && npc.expression) {
                thoughtEl.textContent = `💬 "${npc.expression}"`;
                thoughtEl.style.display = 'block';
            } else if (thoughtEl) {
                thoughtEl.style.display = 'none';
            }

            // 高亮当前跟随的
            if (cardEl) {
                cardEl.classList.toggle('active', this.followTarget === npc);
            }
        }
    }

    /** 资源条更新辅助 */
    _updateResBar(fillId, valId, current, max) {
        const fill = document.getElementById(fillId);
        const val = document.getElementById(valId);
        if (fill) fill.style.width = `${Math.min(100, (current / max) * 100)}%`;
        if (val) {
            const rounded = Math.round(current);
            const prevKey = `_prevRes_${valId}`;
            const prev = this[prevKey];
            if (prev !== undefined && prev !== rounded) {
                // 移除旧的动画class再添加新的
                val.classList.remove('res-increase', 'res-decrease');
                // 强制reflow以重新触发动画
                void val.offsetWidth;
                val.classList.add(rounded > prev ? 'res-increase' : 'res-decrease');
                // 1秒后移除动画class
                clearTimeout(this[`_resTimer_${valId}`]);
                this[`_resTimer_${valId}`] = setTimeout(() => {
                    val.classList.remove('res-increase', 'res-decrease');
                }, 1000);
            }
            this[prevKey] = rounded;
            val.textContent = rounded;
        }
    }

    _moodEmoji(mood) {
        const map = {
            '平静': '😊', '开心': '😄', '高兴': '😁', '兴奋': '🤩',
            '疲惫': '😮‍💨', '困倦': '😴', '烦躁': '😤', '生气': '😠',
            '郁闷': '😞', '压抑': '😫',
            '好奇': '🤔', '思考': '🧐', '满足': '😌', '愧疚': '😔',
            '紧张': '😰', '期待': '🥰', '无聊': '😑', '惊讶': '😲',
            '睡眠': '😴',
        };
        return map[mood] || '😊';
    }

    // ---- NPC 详情面板 ----
    _setupNPCDetailPanel() {
        const overlay = document.getElementById('npc-detail-overlay');
        const closeBtn = document.getElementById('npc-detail-close');

        // 关闭按钮
        closeBtn.addEventListener('click', () => this._closeNPCDetail());

        // 点击遮罩关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeNPCDetail();
        });

        // ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display !== 'none') {
                this._closeNPCDetail();
            }
        });

        // Tab 切换
        const tabs = document.querySelectorAll('.npc-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.npc-tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            });
        });
    }

    _openNPCDetail(npc) {
        this._currentDetailNPC = npc;

        // 同时也跟随该 NPC
        this.setFollowTarget(npc);

        // 填充头部信息
        const avatarEl = document.getElementById('npc-detail-avatar');
        if (npc.portrait && npc.portrait.src) {
            avatarEl.innerHTML = `<img src="${npc.portrait.src}" alt="${npc.name}">`;
        } else {
            avatarEl.textContent = npc.name[0];
        }
        document.getElementById('npc-detail-name').textContent = npc.name;
        document.getElementById('npc-detail-meta').textContent =
            `${npc.age}岁 · ${npc.occupation} · 心情: ${npc.mood} · 🧠San:${npc.getSanityLevel()} · ${npc.getHungerEmoji()} ${npc.getHungerStatus()}${npc.isSick ? ' 🤒生病中' : ''}${npc.isCrazy ? ' 🤯发疯中' : ''}`;

        // 渲染四个 Tab
        this._renderAttributesTab(npc);
        this._renderScheduleTab(npc);
        this._renderMemoryTab(npc);
        this._renderRelationsTab(npc);

        // Debug模式下显示Debug Tab并渲染
        const debugTabBtn = document.getElementById('npc-tab-debug');
        if (debugTabBtn) {
            debugTabBtn.style.display = this.mode === 'debug' ? '' : 'none';
        }
        if (this.mode === 'debug') {
            this._renderDebugTab(npc);
        }

        // 重置到属性 Tab
        document.querySelectorAll('.npc-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.npc-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.npc-tab[data-tab="attributes"]').classList.add('active');
        document.getElementById('tab-attributes').classList.add('active');

        // 显示面板
        document.getElementById('npc-detail-overlay').style.display = 'flex';

        // 启动实时刷新
        this._detailRefreshTimer = setInterval(() => {
            if (this._currentDetailNPC) {
                this._renderMemoryTab(this._currentDetailNPC);
                this._renderAttributesTab(this._currentDetailNPC);
                if (this.mode === 'debug') {
                    this._renderDebugTab(this._currentDetailNPC);
                }
                document.getElementById('npc-detail-meta').textContent =
                    `${this._currentDetailNPC.age}岁 · ${this._currentDetailNPC.occupation} · 心情: ${this._currentDetailNPC.mood} · 🧠San:${this._currentDetailNPC.getSanityLevel()} · ${this._currentDetailNPC.getHungerEmoji()} ${this._currentDetailNPC.getHungerStatus()}${this._currentDetailNPC.isSick ? ' 🤒生病中' : ''}${this._currentDetailNPC.isCrazy ? ' 🤯发疯中' : ''}`;
            }
        }, 3000);
    }

    _closeNPCDetail() {
        document.getElementById('npc-detail-overlay').style.display = 'none';
        this._currentDetailNPC = null;
        if (this._detailRefreshTimer) {
            clearInterval(this._detailRefreshTimer);
            this._detailRefreshTimer = null;
        }
    }

    _renderAttributesTab(npc) {
        const el = document.getElementById('tab-attributes');
        const attrs = [
            { key: 'stamina',   label: '💪 体力', value: npc.stamina,   level: npc.getStaminaLevel(),   max: 100 },
            { key: 'sanity',    label: '🧠 San值', value: npc.sanity,    level: npc.getSanityLevel(),    max: 100 },
            { key: 'health',    label: '🫀 健康', value: npc.health,    level: npc.getHealthLevel(),    max: 100 },
            { key: 'bodyTemp',  label: '🌡️ 体温', value: npc.bodyTemp || 36.5, level: npc.getBodyTempStatus ? npc.getBodyTempStatus() : '正常', max: 36.5, isTemp: true },
            { key: 'charisma',  label: '✨ 魅力', value: npc.charisma,  level: npc.getCharismaLevel(),  max: 100 },
            { key: 'wisdom',    label: '🧠 智慧', value: npc.wisdom,    level: npc.getWisdomLevel(),    max: 100 },
            { key: 'empathy',   label: '💬 情商', value: npc.empathy,   level: npc.getEmpathyLevel(),   max: 100 },
            { key: 'savings',   label: '💰 存款', value: npc.savings,   level: npc.getSavingsLevel(),   max: null },
        ];

        let html = '<div class="attr-grid">';
        for (const a of attrs) {
            const val = Math.round(a.value);
            if (a.key === 'savings') {
                // 存款：不用进度条，直接显示数值
                html += `<div class="attr-card savings-card">
                    <div class="attr-card-header">
                        <span class="attr-label">${a.label}</span>
                    </div>
                    <div class="attr-value" style="color:#F0C050;">¥${val}</div>
                    <div class="attr-level">${a.level}</div>
                </div>`;
            } else {
                const pct = a.isTemp ? Math.min(100, Math.max(0, (val / a.max) * 100)) : Math.min(100, Math.max(0, val));
                const displayVal = a.isTemp ? a.value.toFixed(1) + '°C' : val;
                let barColor;
                if (val >= 60) barColor = '';
                else if (val >= 30) barColor = '';
                else barColor = '';
                html += `<div class="attr-card">
                    <div class="attr-card-header">
                        <span class="attr-label">${a.label}</span>
                        <span class="attr-value"${a.isTemp && npc.getBodyTempColor ? ` style="color:${npc.getBodyTempColor()}"` : ''}>${displayVal}</span>
                    </div>
                    <div class="attr-bar-bg">
                        <div class="attr-bar ${a.key}" style="width:${pct}%"></div>
                    </div>
                    <div class="attr-level">${a.level}</div>
                </div>`;
            }
        }
        html += '</div>';

        // 状态提示
        const hints = [];
        if (npc.isHypothermic) hints.push({ text: '🥶 失温中！行动迟缓，体力快速下降，必须立即回暖炉旁！', cls: 'warn' });
        if (npc.isSevereHypothermic) hints.push({ text: '🧊 严重失温！倒地不起，需要紧急救援！', cls: 'warn' });
        if (npc.isFrostbitten) hints.push({ text: '🫨 手脚冻伤，需要治疗', cls: 'warn' });
        if (npc.isSick) hints.push({ text: '🤒 正在生病中，需要休息或去医院看病', cls: 'warn' });
        if (npc.isCrazy) hints.push({ text: '🤯 精神崩溃发疯中！需要找苏医生治疗或睡觉恢复', cls: 'warn' });
        if (npc.isWatchingShow) hints.push({ text: '🎵 正在看凌玥的演出，San值恢复中', cls: 'good' });
        if (npc.isInTherapy) hints.push({ text: '💬 正在接受苏医生心理咨询，San值快速恢复中', cls: 'good' });
        if (npc.stamina < 20) hints.push({ text: '⚠️ 体力极低，急需休息', cls: 'warn' });
        if (npc.sanity < 30 && !npc.isCrazy) hints.push({ text: '🧠 精神状态很差，建议去医院找苏医生咨询或看凌玥演出', cls: 'warn' });
        if (npc.health < 30) hints.push({ text: '⚠️ 健康状况很差，容易生病', cls: 'warn' });
        if (npc.savings < 50) hints.push({ text: '💸 手头拮据，需要节省开支', cls: 'warn' });
        if (npc.stamina >= 80) hints.push({ text: '💪 精力充沛，做事效率高', cls: 'good' });
        if (npc.sanity >= 80) hints.push({ text: '🧠 精神充沛，头脑清晰', cls: 'good' });
        if (npc.charisma >= 80) hints.push({ text: '✨ 魅力十足，社交能力强', cls: 'good' });
        if (npc.wisdom >= 80) hints.push({ text: '🧠 非常睿智，思维敏捷', cls: 'good' });
        if (npc.empathy >= 80) hints.push({ text: '💬 情商极高，善解人意', cls: 'good' });
        if (npc.health >= 80) hints.push({ text: '🫀 身体强健', cls: 'good' });

        if (hints.length > 0) {
            html += '<div class="attr-status-hints">';
            html += hints.map(h => `<div class="attr-hint-item ${h.cls}">${h.text}</div>`).join('');
            html += '</div>';
        }

        // 饥饿值独立显示
        html += `<div style="margin-top:10px;font-size:12px;color:#8a8a9a;">
            🍽️ 饱食度: ${Math.round(npc.hunger)}/100 (${npc.getHungerStatus()})
        </div>`;

        // ============ 目标系统展示 ============
        if (npc.goals && npc.goals.length > 0) {
            html += '<div class="goal-section" style="margin-top:14px;">';
            html += '<div style="font-size:13px;font-weight:bold;color:#e0e0e0;margin-bottom:8px;">🎯 人生目标</div>';
            for (const g of npc.goals) {
                const pct = g.targetValue > 0 ? Math.min(100, Math.round((g.progress / g.targetValue) * 100)) : 0;
                const isComplete = g.completed;
                const typeIcon = g.type === 'daily' ? '📅' : '🏆';
                const statusIcon = isComplete ? '✅' : (pct >= 50 ? '🔶' : '⬜');
                const barColor = isComplete ? '#6BC98A' : (pct >= 50 ? '#F0C050' : '#5a5a6a');
                html += `<div class="goal-item" style="margin-bottom:6px;padding:4px 8px;background:${isComplete ? 'rgba(107,201,138,0.12)' : 'rgba(255,255,255,0.04)'};border-radius:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
                        <span style="color:${isComplete ? '#6BC98A' : '#c0c0d0'};">${statusIcon} ${typeIcon} ${g.desc}</span>
                        <span style="color:#8a8a9a;font-size:11px;">${isComplete ? '已完成!' : `${pct}%`}</span>
                    </div>
                    <div style="height:3px;background:#2a2a3a;border-radius:2px;margin-top:3px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;transition:width 0.5s;"></div>
                    </div>
                    <div style="font-size:10px;color:#6a6a7a;margin-top:2px;">奖励: ${g.rewardDesc}</div>
                </div>`;
            }
            html += '</div>';
        }

        el.innerHTML = html;
    }

    _renderScheduleTab(npc) {
        const el = document.getElementById('tab-schedule');
        const currentHour = this.getHour();
        const schedule = npc.scheduleTemplate || [];

        if (schedule.length === 0) {
            el.innerHTML = '<div class="memory-empty">暂无日程安排</div>';
            return;
        }

        el.innerHTML = schedule.map(s => {
            // 判断是否是当前时段
            let isCurrent = false;
            if (s.start < s.end) {
                isCurrent = currentHour >= s.start && currentHour < s.end;
            } else {
                // 跨午夜（如 22:00 ~ 6:00）
                isCurrent = currentHour >= s.start || currentHour < s.end;
            }

            const startStr = String(s.start).padStart(2, '0') + ':00';
            const endStr = String(s.end).padStart(2, '0') + ':00';

            return `<div class="schedule-item${isCurrent ? ' current' : ''}">
                <span class="schedule-time">${startStr} - ${endStr}</span>
                <span class="schedule-desc">${s.desc}</span>
            </div>`;
        }).join('');
    }

    _renderMemoryTab(npc) {
        const el = document.getElementById('tab-memory');
        const memories = npc.memories || [];

        if (memories.length === 0) {
            el.innerHTML = '<div class="memory-empty">还没有任何记录</div>';
            return;
        }

        // 倒序显示（最新的在上面）
        el.innerHTML = [...memories].reverse().map(m => {
            const type = m.type || 'event';

            if (type === 'chat' && m.lines && m.lines.length > 0) {
                // 聊天记录 — 气泡样式
                const bubbles = m.lines.map(line => {
                    const isSelf = line.speaker === npc.name;
                    return `<div class="chat-bubble ${isSelf ? 'self' : 'other'}">
                        <span class="chat-speaker">${line.speaker}</span>
                        <span class="chat-text">${line.text}</span>
                    </div>`;
                }).join('');

                return `<div class="mem-block mem-chat">
                    <div class="mem-header">
                        <span class="mem-time">${m.time || '--:--'}</span>
                        <span class="mem-tag tag-chat">💬 ${m.text}</span>
                    </div>
                    <div class="chat-bubbles">${bubbles}</div>
                </div>`;
            }

            if (type === 'thought') {
                // 想法 — 卡片样式
                const content = m.text.replace(/^\[想法\]\s*/, '');
                return `<div class="mem-block mem-thought">
                    <div class="mem-header">
                        <span class="mem-time">${m.time || '--:--'}</span>
                        <span class="mem-tag tag-thought">💭 想法</span>
                    </div>
                    <div class="thought-content">${content}</div>
                </div>`;
            }

            // 普通事件
            return `<div class="mem-block mem-event">
                <div class="mem-header">
                    <span class="mem-time">${m.time || '--:--'}</span>
                    <span class="mem-tag tag-event">📌 事件</span>
                </div>
                <div class="event-content">${m.text}</div>
            </div>`;
        }).join('');
    }

    _renderRelationsTab(npc) {
        const el = document.getElementById('tab-relations');
        const otherNPCs = this.npcs.filter(n => n.id !== npc.id);

        if (otherNPCs.length === 0) {
            el.innerHTML = '<div class="memory-empty">暂无关系数据</div>';
            return;
        }

        el.innerHTML = otherNPCs.map(other => {
            const value = npc.getAffinity(other.id);
            // 颜色：红(<30) 黄(30-60) 绿(>60)
            let barColor;
            if (value < 30) barColor = '#E06060';
            else if (value < 60) barColor = '#D0A040';
            else barColor = '#4A9F6E';

            let label;
            if (value < 20) label = '冷淡';
            else if (value < 40) label = '一般';
            else if (value < 70) label = '友好';
            else if (value < 90) label = '亲近';
            else label = '挚友';

            return `<div class="relation-item">
                <span class="relation-name" style="color:${other.color}">${other.name}</span>
                <div class="relation-bar-bg">
                    <div class="relation-bar" style="width:${value}%;background:${barColor}"></div>
                </div>
                <span class="relation-value">${value} ${label}</span>
            </div>`;
        }).join('');
    }

    // ---- Debug Tab 渲染 ----
    _renderDebugTab(npc) {
        const el = document.getElementById('tab-debug');
        if (!el) return;
        if (this.mode !== 'debug') {
            el.innerHTML = '';
            return;
        }

        // 当前状态概览
        const stateInfo = `<div class="debug-section">
            <div class="debug-section-title">⚡ 当前状态</div>
            <div class="debug-state-grid">
                <div class="debug-state-item"><span class="debug-label">状态</span><span class="debug-val">${npc.state || '—'}</span></div>
                <div class="debug-state-item"><span class="debug-label">描述</span><span class="debug-val">${npc.stateDesc || '—'}</span></div>
                <div class="debug-state-item"><span class="debug-label">场景</span><span class="debug-val">${npc.currentScene || '—'}</span></div>
                <div class="debug-state-item"><span class="debug-label">心情</span><span class="debug-val">${npc.mood || '—'}</span></div>
                <div class="debug-state-item"><span class="debug-label">移动中</span><span class="debug-val">${npc.isMoving ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">睡眠中</span><span class="debug-val">${npc.isSleeping ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">生病</span><span class="debug-val">${npc.isSick ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">发疯</span><span class="debug-val">${npc.isCrazy ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">饥饿覆盖</span><span class="debug-val">${npc._hungerOverride ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">行动覆盖</span><span class="debug-val">${npc._actionOverride ? '✅' : '❌'}</span></div>
                <div class="debug-state-item"><span class="debug-label">状态覆盖</span><span class="debug-val">${npc._stateOverrideType || '无'}</span></div>
                <div class="debug-state-item"><span class="debug-label">聊天目标</span><span class="debug-val">${npc._chatWalkTarget || '无'}</span></div>
                <div class="debug-state-item"><span class="debug-label">坐标</span><span class="debug-val">(${Math.round(npc.x)}, ${Math.round(npc.y)})</span></div>
                <div class="debug-state-item"><span class="debug-label">路径长度</span><span class="debug-val">${npc.currentPath ? npc.currentPath.length : 0}</span></div>
                <div class="debug-state-item"><span class="debug-label">🌐 API</span><span class="debug-val" style="color:${typeof LLM_STATUS !== 'undefined' && LLM_STATUS.isDown ? '#E06060' : (typeof LLM_STATUS !== 'undefined' && LLM_STATUS.consecutiveFails > 0 ? '#F0C050' : '#6BC98A')}">${typeof LLM_STATUS !== 'undefined' ? (LLM_STATUS.isDown ? '❌宕机' : `✅${LLM_STATUS.successCalls}/${LLM_STATUS.totalCalls}`) : '未知'}</span></div>
                ${typeof LLM_STATUS !== 'undefined' && LLM_STATUS.lastError ? `<div class="debug-state-item" style="grid-column:span 2;"><span class="debug-label">上次错误</span><span class="debug-val" style="color:#E06060;font-size:10px;">${LLM_STATUS.lastError.substring(0, 60)}</span></div>` : ''}
            </div>
        </div>`;

        // 当前行动
        const actionInfo = npc._currentAction ? `<div class="debug-section">
            <div class="debug-section-title">🎯 当前行动</div>
            <div class="debug-action-detail">
                <div>类型: ${npc._currentAction.type}</div>
                <div>目标: ${npc._currentAction.target || '无'}</div>
                <div>同伴: ${npc._currentAction.companion || '无'}</div>
                <div>优先级: ${npc._currentAction.priority || '—'}</div>
                <div>理由: ${npc._currentAction.reason || '—'}</div>
            </div>
        </div>` : '';

        // 行动轨迹日志
        const logText = npc.getDebugLogText();
        const actionLog = `<div class="debug-section">
            <div class="debug-section-title">📋 行动轨迹 (最近50条)</div>
            <div class="debug-log-content">${logText.split('\n').map(l => `<div class="debug-log-line">${l}</div>`).join('')}</div>
        </div>`;

        // 对话记录日志
        const dialogueText = npc.getDebugDialogueText();
        const dialogueLog = `<div class="debug-section">
            <div class="debug-section-title">💬 对话记录 (最近20条)</div>
            <div class="debug-log-content debug-dialogue-log">${dialogueText.split('\n').map(l => {
                if (l.startsWith('===')) return `<div class="debug-dialogue-header">${l}</div>`;
                return `<div class="debug-log-line">${l}</div>`;
            }).join('')}</div>
        </div>`;

        // ============ 目标系统 & 奖惩日志 ============
        let goalSection = '';
        if (npc.goals && npc.goals.length > 0) {
            const goalRows = npc.goals.map(g => {
                const pct = g.targetValue > 0 ? Math.min(100, Math.round((g.progress / g.targetValue) * 100)) : 0;
                const typeIcon = g.type === 'daily' ? '📅' : '🏆';
                const statusIcon = g.completed ? '✅' : (pct >= 50 ? '🔶' : '⬜');
                const barColor = g.completed ? '#6BC98A' : (pct >= 50 ? '#F0C050' : '#5a5a6a');
                return `<div style="margin-bottom:4px;">
                    <div style="display:flex;justify-content:space-between;font-size:11px;">
                        <span>${statusIcon} ${typeIcon} ${g.desc}</span>
                        <span style="color:#8a8a9a;">${g.completed ? '已完成!' : `${pct}% (${typeof g.progress === 'number' ? Math.round(g.progress * 10) / 10 : g.progress}/${g.targetValue})`}</span>
                    </div>
                    <div style="height:2px;background:#2a2a3a;border-radius:1px;margin-top:2px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:1px;"></div>
                    </div>
                </div>`;
            }).join('');
            goalSection = `<div class="debug-section">
                <div class="debug-section-title">🎯 目标系统</div>
                ${goalRows}
                <div style="margin-top:6px;font-size:10px;color:#6a6a7a;">
                    关注: ${npc._lastConcern || '无'} | 聚焦: ${npc._lastGoalFocus || '无'}
                </div>
            </div>`;
        }

        // 奖惩专用日志（只显示reward/penalty/goal类型的日志）
        const rewardLogs = npc._debugLog
            .filter(e => e.type === 'reward' || e.type === 'penalty' || e.type === 'goal')
            .slice(0, 30);
        let rewardLogHtml = '';
        if (rewardLogs.length > 0) {
            const logLines = rewardLogs.map(e => {
                const icon = { 'reward': '⚖️', 'penalty': '⚠️', 'goal': '🎯' }[e.type] || '📝';
                const dayStr = e.day !== undefined ? `D${e.day} ` : '';
                const color = e.type === 'penalty' ? '#E06060' : (e.type === 'goal' ? '#6BC98A' : '#C0C0D0');
                return `<div class="debug-log-line" style="color:${color};">[${dayStr}${e.time}] ${icon} ${e.detail}</div>`;
            }).join('');
            rewardLogHtml = `<div class="debug-section">
                <div class="debug-section-title">⚖️ 奖惩日志 (最近30条)</div>
                <div class="debug-log-content">${logLines}</div>
            </div>`;
        }

        el.innerHTML = stateInfo + actionInfo + goalSection + rewardLogHtml + actionLog + dialogueLog;
    }

    // ---- 保存 Debug Log 到服务器 ----
    async _saveDebugLogToServer(quiet = false) {
        try {
            // 收集所有NPC的debug log
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const dayStr = `day${this.dayCount}`;
            const filename = `debug_${dayStr}_${timestamp}.log`;

            let content = `=== 福音镇 Debug Log ===\n`;
            content += `时间: ${new Date().toLocaleString()}\n`;
            content += `游戏日: 第${this.dayCount}天 ${this.getTimeStr()}\n`;
            content += `模式: ${this.mode}\n`;
            content += `模型: ${typeof AI_MODEL !== 'undefined' ? AI_MODEL : '未知'}\n`;
            content += `LLM状态: 总调用${typeof LLM_STATUS !== 'undefined' ? LLM_STATUS.totalCalls : '?'} 成功${typeof LLM_STATUS !== 'undefined' ? LLM_STATUS.successCalls : '?'} 失败${typeof LLM_STATUS !== 'undefined' ? LLM_STATUS.failedCalls : '?'}\n`;
            content += `${'='.repeat(50)}\n\n`;

            // 各NPC状态和日志
            for (const npc of this.npcs) {
                content += `【${npc.name}】${npc.occupation} | ${npc.state} | San:${Math.round(npc.sanity)} HP:${Math.round(npc.health)} 饥饿:${Math.round(npc.hunger)}\n`;
                content += `  位置: ${npc.currentScene} (${Math.round(npc.x)},${Math.round(npc.y)})\n`;
                content += `  心情: ${npc.mood}\n`;

                // 行动轨迹
                if (npc._debugLog && npc._debugLog.length > 0) {
                    content += `  --- 行动轨迹 (最近${Math.min(50, npc._debugLog.length)}条) ---\n`;
                    npc._debugLog.slice(0, 50).forEach(e => {
                        const dayPrefix = e.day !== undefined ? `D${e.day} ` : '';
                        content += `  [${dayPrefix}${e.time}] ${e.type}: ${e.detail}\n`;
                    });
                }

                // 对话记录
                if (npc._dialogueLog && npc._dialogueLog.length > 0) {
                    content += `  --- 对话记录 (最近${Math.min(20, npc._dialogueLog.length)}条) ---\n`;
                    npc._dialogueLog.slice(0, 20).forEach(d => {
                        content += `  === ${d.time} 与 ${d.partner} ===\n`;
                        if (d.lines) {
                            d.lines.forEach(l => {
                                content += `    ${l.speaker}: ${l.text}\n`;
                            });
                        }
                    });
                }

                content += `\n`;
            }

            // 事件日志
            content += `${'='.repeat(50)}\n`;
            content += `【事件日志】(最近${Math.min(50, this.eventLog.length)}条)\n`;
            this.eventLog.slice(0, 50).forEach(e => {
                content += `  [${e.time}] ${e.text}\n`;
            });

            // 聊天记录面板内容
            const chatLogEl = document.getElementById('chat-log-content');
            if (chatLogEl) {
                content += `\n${'='.repeat(50)}\n`;
                content += `【聊天记录面板】\n`;
                content += chatLogEl.innerText || '(空)';
            }

            // 发送到服务器
const resp = await fetch('http://localhost:8080/api/save-debug-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content })
            });

            if (resp.ok) {
                const result = await resp.json();
                console.log(`📝 Debug log 已保存: ${result.filename}`);
                if (!quiet) {
                    this.addEvent(`💾 Debug log 已保存: ${filename}`);
                }
            } else {
                throw new Error(`HTTP ${resp.status}`);
            }
        } catch (err) {
            console.warn('保存debug log失败:', err.message);
            if (!quiet) {
                // 如果服务器不可用，降级为浏览器下载
                this._downloadDebugLog();
            }
        }
    }

    // 降级方案：浏览器下载debug log
    _downloadDebugLog() {
        try {
            let content = `=== 福音镇 Debug Log (浏览器导出) ===\n`;
            content += `时间: ${new Date().toLocaleString()}\n`;
            content += `游戏日: 第${this.dayCount}天 ${this.getTimeStr()}\n\n`;

            for (const npc of this.npcs) {
                content += `【${npc.name}】${npc.state} | San:${Math.round(npc.sanity)}\n`;
                content += npc.getDebugLogText() + '\n\n';
            }

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `debug_day${this.dayCount}_${Date.now()}.log`;
            a.click();
            URL.revokeObjectURL(url);
            this.addEvent(`💾 Debug log 已下载到本地`);
        } catch (err) {
            console.error('下载debug log也失败了:', err);
        }
    }

    // ---- 事件日志 ----
    addEvent(text) {
        const time = this.getTimeStr();
        this.eventLog.unshift({ time, text });
        if (this.eventLog.length > this.maxEventLog) this.eventLog.pop();
        this._renderEventLog();
    }

    _renderEventLog() {
        const el = document.getElementById('event-log');
        if (!el) return;
        el.innerHTML = this.eventLog.slice(0, 30).map(e =>
            `<div class="event-item"><span class="event-time">${e.time}</span> ${e.text}</div>`
        ).join('');
    }

    // ---- 跟随系统 ----
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

    /** NPC 之间碰撞推挤 —— 圆形碰撞体，互相排斥不重叠 */
    _resolveNPCCollisions() {
        const radius = TILE * 0.45; // 每个NPC的碰撞半径
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

                const ax = a.x + TILE / 2;
                const ay = a.y + TILE / 2;
                const bx = b.x + TILE / 2;
                const by = b.y + TILE / 2;

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
                        if (map.isSolid(a.x + TILE / 2, a.y + TILE / 2)) {
                            a.x = aOldX;
                            a.y = aOldY;
                        }
                        if (map.isSolid(b.x + TILE / 2, b.y + TILE / 2)) {
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
                        const nudge = TILE * 0.3 * nudgeScale;
                        const angle = Math.random() * Math.PI * 2;
                        const nudgeX = Math.cos(angle) * nudge;
                        const nudgeY = Math.sin(angle) * nudge;
                        // 随机推力也要检查墙壁
                        if (!bHasLock && (!map || !map.isSolid(b.x + nudgeX + TILE / 2, b.y + nudgeY + TILE / 2))) {
                            b.x += nudgeX;
                            b.y += nudgeY;
                        } else if (!aHasLock && (!map || !map.isSolid(a.x - nudgeX + TILE / 2, a.y - nudgeY + TILE / 2))) {
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

        const gx = Math.floor((toMove.x + TILE / 2) / TILE);
        const gy = Math.floor((toMove.y + TILE / 2) / TILE);

        // 搜索半径1~2格内的空位（限制搜索范围避免大范围"闪现"）
        const candidates = [];
        for (let r = 1; r <= 2; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只检查外圈
                    const nx = gx + dx;
                    const ny = gy + dy;
                    if (map && !map.isSolid(nx * TILE + TILE / 2, ny * TILE + TILE / 2)) {
                        // 确保不会传送到另一个NPC身上
                        const ox = Math.floor((other.x + TILE / 2) / TILE);
                        const oy = Math.floor((other.y + TILE / 2) / TILE);
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
            toMove.x = target.x * TILE;
            toMove.y = target.y * TILE;
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

        if (!map.isSolid(tx * TILE + TILE / 2, ty * TILE + TILE / 2)) {
            npc.currentPath = findPath(pos.x, pos.y, tx, ty, map) || [];
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

        const gx = Math.floor((yielder.x + TILE / 2) / TILE);
        const gy = Math.floor((yielder.y + TILE / 2) / TILE);

        // mover 的移动方向（用来判断垂直于移动方向的让路方向）
        const mgx = Math.floor((mover.x + TILE / 2) / TILE);
        const mgy = Math.floor((mover.y + TILE / 2) / TILE);
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
            if (map && !map.isSolid(nx * TILE + TILE / 2, ny * TILE + TILE / 2)) {
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
                if (dist < TILE * 3) {
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
                    const snap = AIModeLogger.npcAttrSnapshot(npc);
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
                    this.camera.jumpTo(npc.x + TILE / 2, npc.y + TILE / 2, map.width * TILE, map.height * TILE);
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

            if (this.followTarget && this.followTarget.currentScene === this.currentScene) {
                this.camera.followSmooth(
                    this.followTarget.x + TILE / 2,
                    this.followTarget.y + TILE / 2,
                    map.width * TILE, map.height * TILE, dt
                );
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
                    map.width * TILE, map.height * TILE);
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
    _tryInteract() {
        if (this.mode !== 'debug') return;
        const nearest = this._nearestNPCToCamera(3);
        if (nearest) {
            this.dialogueManager.startPlayerChat(nearest);
        }
    }

    _nearestNPCToCamera(maxDist) {
        const camCenterGX = Math.floor((this.camera.x + this.camera.width / 2) / TILE);
        const camCenterGY = Math.floor((this.camera.y + this.camera.height / 2) / TILE);
        let best = null, bestDist = Infinity;
        for (const npc of this.npcs) {
            if (npc.currentScene !== this.currentScene) continue;
            const np = npc.getGridPos();
            const d = Math.abs(camCenterGX - np.x) + Math.abs(camCenterGY - np.y);
            if (d <= maxDist && d < bestDist) {
                bestDist = d;
                best = npc;
            }
        }
        return best;
    }

    // ---- 渲染 ----
    draw() {
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
            ctx.strokeStyle = 'rgba(74, 159, 110, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(ft.x - 2, ft.y - 2, TILE + 4, TILE + 4);
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

    /** 昼夜光照遮罩 */
    _drawDayNightOverlay() {
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

    /** 绘制雨滴效果 */
    _drawRain() {
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
    }

    _drawDebugGrid(map) {
        const ctx = this.ctx;
        const sx = Math.floor(this.camera.x / TILE);
        const sy = Math.floor(this.camera.y / TILE);
        const ex = sx + Math.ceil(this.canvas.width / TILE) + 1;
        const ey = sy + Math.ceil(this.canvas.height / TILE) + 1;

        ctx.strokeStyle = 'rgba(255,255,0,0.2)';
        ctx.lineWidth = 0.5;
        for (let x = sx; x <= ex; x++) {
            ctx.beginPath();
            ctx.moveTo(x * TILE, sy * TILE);
            ctx.lineTo(x * TILE, ey * TILE);
            ctx.stroke();
        }
        for (let y = sy; y <= ey; y++) {
            ctx.beginPath();
            ctx.moveTo(sx * TILE, y * TILE);
            ctx.lineTo(ex * TILE, y * TILE);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255,0,0,0.15)';
        for (let x = sx; x <= Math.min(ex, map.width - 1); x++) {
            for (let y = sy; y <= Math.min(ey, map.height - 1); y++) {
                if (x >= 0 && y >= 0 && map.isSolid(x * TILE + TILE / 2, y * TILE + TILE / 2)) {
                    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
                }
            }
        }

        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,255,0,0.4)';
        for (let x = sx; x <= ex; x++) {
            for (let y = sy; y <= ey; y++) {
                if (x % 5 === 0 && y % 5 === 0 && x >= 0 && y >= 0) {
                    ctx.fillText(`${x},${y}`, x * TILE + 1, y * TILE + 9);
                }
            }
        }
    }

    _drawHUD() {
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
    }

    _drawMinimap() {
        const map = this.maps[this.currentScene];
        const scale = 2;
        const pad = 14;
        const mw = map.width * scale;
        const mh = map.height * scale;
        const mx = pad;
        const my = this.viewH - mh - pad;

        const ctx = this.ctx;

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 6);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my, mw, mh);
        ctx.clip();
        for (let gy = 0; gy < map.height; gy++) {
            for (let gx = 0; gx < map.width; gx++) {
                ctx.fillStyle = map.getTileColor(gx, gy);
                ctx.fillRect(mx + gx * scale, my + gy * scale, scale, scale);
            }
        }
        ctx.restore();

        // NPC 点
        for (const npc of this.npcs) {
            if (npc.currentScene !== this.currentScene) continue;
            const np = npc.getGridPos();
            ctx.fillStyle = npc.color || C.NPC;
            ctx.fillRect(mx + np.x * scale - 1, my + np.y * scale - 1, 3, 3);
        }

        // 跟随高亮
        if (this.followTarget && this.followTarget.currentScene === this.currentScene) {
            const fp = this.followTarget.getGridPos();
            ctx.strokeStyle = '#4A9F6E';
            ctx.lineWidth = 1;
            ctx.strokeRect(mx + fp.x * scale - 3, my + fp.y * scale - 3, 7, 7);
        }

        // 视口框
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            mx + (this.camera.x / TILE) * scale,
            my + (this.camera.y / TILE) * scale,
            (this.viewW / TILE) * scale,
            (this.viewH / TILE) * scale
        );
    }

    // ---- 轮回重生 ----
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
        this.speedIdx = 0;
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
        this.weatherSystem = (typeof WeatherSystem !== 'undefined') ? new WeatherSystem(this) : null;
        // 【修复】重置时同步天气
        if (this.weatherSystem) {
            this.weather = this.weatherSystem.currentWeather;
        }
        this.resourceSystem = (typeof ResourceSystem !== 'undefined') ? new ResourceSystem(this) : null;
        this.furnaceSystem = (typeof FurnaceSystem !== 'undefined') ? new FurnaceSystem(this) : null;
        this.deathSystem = (typeof DeathSystem !== 'undefined') ? new DeathSystem(this) : null;
        this.taskSystem = (typeof TaskSystem !== 'undefined') ? new TaskSystem(this) : null;
        this.eventSystem = (typeof EventSystem !== 'undefined') ? new EventSystem(this) : null;

        // 8. 重新初始化轮回系统（更新世数）
        if (this.reincarnationSystem) {
            this.reincarnationSystem.advanceLife();
        }

        // 8.5 重建AI模式日志系统（新会话文件）
        this.aiModeLogger = (this.isAgentMode && typeof AIModeLogger !== 'undefined') ? new AIModeLogger(this) : null;

        // 9. 重新初始化NPC（从NPC_CONFIGS重新创建，但会在之后应用轮回加成）
        this.npcs = [];
        if (typeof NPC_CONFIGS !== 'undefined') {
            for (const cfg of NPC_CONFIGS) {
                this.npcs.push(new NPC(cfg, this));
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
        this.camera.jumpTo(25 * TILE, 20 * TILE, map.width * TILE, map.height * TILE);

        // 15. 更新UI控件
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.textContent = '⏸️';
        const btnSpeed = document.getElementById('btn-speed');
        if (btnSpeed) btnSpeed.textContent = '1×';
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

        // 18. 清除旧存档
        localStorage.removeItem('tihutown_save');

        // 通知
        const lifeNum = this.reincarnationSystem ? this.reincarnationSystem.getLifeNumber() : 1;
        this.addEvent(`🔄 轮回重生！第${lifeNum}世开始`);
        this.addEvent(`📅 第1天 08:00 — 带着前世的记忆重新开始`);

        console.log(`[Game] 🔄 轮回重生完成！进入第${lifeNum}世`);
    }

    /** 更新轮回世数UI显示 */
    _updateReincarnationUI() {
        const el = document.getElementById('surv-reincarnation');
        if (!el) return;
        // 轮回模式下始终显示当前世数（包括第1世），agent/debug模式隐藏
        if (this.mode === 'reincarnation' && this.reincarnationSystem) {
            el.style.display = '';
            const valEl = document.getElementById('surv-reincarnation-val');
            const lifeNum = this.reincarnationSystem.getLifeNumber();
            if (valEl) valEl.textContent = `第${lifeNum}世`;

            // 绑定点击事件（只绑一次）
            if (!el._pastLivesClickBound) {
                el._pastLivesClickBound = true;
                el.addEventListener('click', () => this._showPastLivesPanel());
            }
        } else {
            el.style.display = 'none';
        }

        // 【难度系统】更新难度状态栏显示
        const diffEl = document.getElementById('surv-difficulty');
        if (diffEl) {
            if (this.mode === 'reincarnation' && this.difficulty) {
                diffEl.style.display = '';
                const diffValEl = document.getElementById('surv-difficulty-val');
                if (diffValEl) {
                    diffValEl.textContent = `${this.difficulty.stars} ${this.difficulty.name}`;
                }
                // 悬停提示显示核心倍率参数
                const d = this.difficulty;
                diffEl.title = `难度: ${d.stars} ${d.name}\n` +
                    `消耗倍率: 木柴×${d.consumptionMult.wood} 电力×${d.consumptionMult.power} 食物×${d.consumptionMult.food}\n` +
                    `初始资源: ×${d.initialResources.woodFuel}\n` +
                    `采集效率: ×${d.gatherEfficiencyMult}\n` +
                    `属性衰减: 饱腹×${d.hungerDecayMult} 体力×${d.staminaDrainMult} San×${d.sanDecayMult}\n` +
                    `温度偏移: -${d.tempOffset}°C\n` +
                    `轮回Buff: ×${d.reincarnationBuffMult}`;
            } else {
                diffEl.style.display = 'none';
            }
        }
    }

    /** 显示往世结局弹窗 */
    _showPastLivesPanel() {
        const overlay = document.getElementById('past-lives-overlay');
        const body = document.getElementById('past-lives-body');
        const closeBtn = document.getElementById('past-lives-close');
        if (!overlay || !body) return;

        const rs = this.reincarnationSystem;
        if (!rs) return;

        const pastLives = rs.pastLives || [];
        const currentLife = rs.getLifeNumber();

        // 结局类型映射
        const endingMap = {
            perfect: { text: '✨ 完美结局', cls: 'perfect' },
            normal:  { text: '😌 普通结局', cls: 'normal' },
            bleak:   { text: '😰 惨淡结局', cls: 'bleak' },
            extinction: { text: '💀 全灭结局', cls: 'extinction' },
            unknown: { text: '❓ 未知', cls: 'unknown' },
        };

        let html = '';

        if (pastLives.length === 0) {
            html = `
                <div class="past-lives-empty">
                    <span class="past-lives-empty-icon">📜</span>
                    这是第一世，还没有往世记录。<br>
                    <span style="font-size:11px; opacity:0.6; margin-top:8px; display:inline-block;">
                        当这一世结束后，结局会被记录在这里
                    </span>
                </div>
            `;
        } else {
            // 从最近的世代开始显示
            for (let i = pastLives.length - 1; i >= 0; i--) {
                const life = pastLives[i];
                const ending = endingMap[life.endingType] || endingMap.unknown;
                const lifeNum = life.lifeNumber || (i + 1);

                // 存活统计
                const aliveCount = life.aliveCount || 0;
                const deadCount = life.deadCount || (8 - aliveCount);

                // 资源快照
                const res = life.resourceSnapshot;
                let resHtml = '';
                if (res) {
                    resHtml = `
                        <div class="past-life-stats">
                            <span class="past-life-stat">🪵 <span class="past-life-stat-val">${res.woodFuel}</span></span>
                            <span class="past-life-stat">🍞 <span class="past-life-stat-val">${res.food}</span></span>
                            <span class="past-life-stat">⚡ <span class="past-life-stat-val">${res.power}</span></span>
                            <span class="past-life-stat">🧱 <span class="past-life-stat-val">${res.material}</span></span>
                            <span class="past-life-stat">🔥 第二暖炉 <span class="past-life-stat-val">${life.secondFurnaceBuilt ? '✅' : '❌'}</span></span>
                        </div>
                    `;
                }

                // 死亡记录
                let deathHtml = '';
                if (life.deathRecords && life.deathRecords.length > 0) {
                    deathHtml = '<div class="past-life-deaths">';
                    for (const d of life.deathRecords) {
                        deathHtml += `<div class="past-life-death-item">${d.name} — 第${d.day}天${d.time || ''} ${d.cause}${d.location ? '（' + d.location + '）' : ''}</div>`;
                    }
                    deathHtml += '</div>';
                }

                // 教训
                let lessonHtml = '';
                if (life.lessons && life.lessons.length > 0) {
                    lessonHtml = '<div class="past-life-lessons">';
                    for (const l of life.lessons) {
                        lessonHtml += `<div class="past-life-lesson-item">${l}</div>`;
                    }
                    lessonHtml += '</div>';
                }

                html += `
                    <div class="past-life-card">
                        <div class="past-life-card-header">
                            <span class="past-life-num">🔄 第${lifeNum}世</span>
                            <span class="past-life-ending ${ending.cls}">${ending.text}</span>
                        </div>
                        <div class="past-life-stats">
                            <span class="past-life-stat">👥 存活 <span class="past-life-stat-val">${aliveCount}/8</span></span>
                            <span class="past-life-stat">💀 死亡 <span class="past-life-stat-val">${deadCount}人</span></span>
                        </div>
                        ${resHtml}
                        ${deathHtml}
                        ${lessonHtml}
                    </div>
                `;
            }

            // 末尾加当前世提示
            html += `
                <div class="past-life-card past-life-current">
                    <div class="past-life-card-header">
                        <span class="past-life-num">🔄 第${currentLife}世（当前）</span>
                        <span class="past-life-ending unknown">⏳ 进行中</span>
                    </div>
                    <div style="font-size:12px; color:rgba(200,210,220,0.5); padding:4px 0;">
                        这一世的结局尚未揭晓...
                    </div>
                </div>
            `;
        }

        body.innerHTML = html;
        overlay.style.display = 'flex';

        // 关闭逻辑
        const closeFn = () => { overlay.style.display = 'none'; };
        closeBtn.onclick = closeFn;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeFn();
        };
    }

    // ---- 存档 ----
    save() {
        const data = {
            ver: 1,
            day: this.dayCount,
            time: this.gameTimeSeconds,
            scene: this.currentScene,
            weather: this.weather,
            npcs: this.npcs.map(n => n.serialize()),
            eventLog: this.eventLog.slice(0, 20),
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
            this.dayCount = d.day || 1;
            this.gameTimeSeconds = d.time || 8 * 3600;
            this.currentScene = d.scene || 'village';
            this.weather = d.weather || '晴天';
            if (d.npcs) {
                for (let i = 0; i < this.npcs.length && i < d.npcs.length; i++) {
                    this.npcs[i].deserialize(d.npcs[i]);
                }
            }
            if (d.eventLog) this.eventLog = d.eventLog;
            return true;
        } catch (e) {
            console.warn('存档加载失败:', e);
            return false;
        }
    }

    _showToast(msg) {
        const el = document.getElementById('save-toast');
        el.textContent = msg;
        el.style.display = 'block';
        el.style.opacity = '1';
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; }, 300);
        }, 1200);
    }

    // ---- 工具方法 ----
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


// ============ 可用模型列表 ============
const AVAILABLE_MODELS = [
    'qwen3:4b-instruct-2507-q8_0',
    'qwen3:14b-q8_0',
    'qwen3:14b-fp16'
];

// ============ 模型切换：加载指定模型并卸载其他模型 ============
async function switchModel(targetModel) {
    const statusEl = document.getElementById('model-status');
    if (statusEl) {
        statusEl.textContent = `⏳ 正在检查 ${targetModel} ...`;
        statusEl.className = 'model-status loading';
    }

    try {
        // 0) 先查询Ollama当前已加载的模型
        let loadedModels = [];
        try {
const psResp = await fetch('/ollama/api/ps');
            if (psResp.ok) {
                const psData = await psResp.json();
                loadedModels = (psData.models || []).map(m => m.name);
            }
        } catch (e) { /* 查询失败则当作没有已加载模型 */ }

        const targetAlreadyLoaded = loadedModels.includes(targetModel);
        console.log(`[模型切换] 已加载模型: ${loadedModels.join(', ') || '无'}, 目标${targetAlreadyLoaded ? '已' : '未'}在内存中`);

        // 1) 卸载其他已加载的模型（只卸载真正在内存里的，避免无效请求）
        const modelsToUnload = loadedModels.filter(m => m !== targetModel);
        if (modelsToUnload.length > 0) {
            if (statusEl) statusEl.textContent = `⏳ 卸载旧模型 ...`;
            const unloadPromises = modelsToUnload.map(m =>
fetch('/ollama/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: m, keep_alive: 0 })
                }).catch(() => {})
            );
            await Promise.all(unloadPromises);
            console.log(`[模型切换] 已卸载: ${modelsToUnload.join(', ')}`);
        }

        // 2) 如果目标模型已在显存中，跳过预热，秒启动
        if (targetAlreadyLoaded) {
            console.log(`[模型切换] ${targetModel} 已在显存中，跳过预热`);
        } else {
            // 目标模型不在内存中，需要预热加载
            if (statusEl) statusEl.textContent = `⏳ 正在加载 ${targetModel} ...（首次较慢）`;
const resp = await fetch('/ollama/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: targetModel,
                    prompt: 'hi',
                    stream: false,
                    options: { num_predict: 1 }
                })
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
        }

        // 3) 更新全局模型变量
        AI_MODEL = targetModel;

        if (statusEl) {
            statusEl.textContent = `✅ ${targetModel} 已就绪`;
            statusEl.className = 'model-status success';
        }
        console.log(`[模型切换] ${targetModel} 就绪${targetAlreadyLoaded ? '（秒启动）' : '（新加载）'}`);
        return true;
    } catch (err) {
        console.error('[模型切换] 失败:', err);
        if (statusEl) {
            statusEl.textContent = `❌ 加载失败: ${err.message}`;
            statusEl.className = 'model-status error';
        }
        return false;
    }
}

// ============ 启动：模式选择 + 模型选择 ============
window.addEventListener('load', () => {
    const overlay = document.getElementById('mode-select-overlay');
    const btnAgent = document.getElementById('btn-mode-agent');
    const btnDebug = document.getElementById('btn-mode-debug');
    const btnReincarnation = document.getElementById('btn-mode-reincarnation');

    // --- 检测并显示轮回历史状态 ---
    try {
        const lifeNumRaw = localStorage.getItem('gospel_reincarnation_life_num');
        const lifeNum = lifeNumRaw ? parseInt(lifeNumRaw, 10) : 0;
        if (lifeNum > 1) {
            const hintEl = document.getElementById('reincarnation-status-hint');
            const hintText = document.getElementById('reincarnation-hint-text');
            if (hintEl && hintText) {
                hintEl.style.display = '';
                hintText.textContent = `🔄 检测到轮回存档：当前第${lifeNum}世`;
            }
        }
    } catch (e) { /* ignore */ }

    // --- 难度选择器初始化 ---
    const difficultySelectorEl = document.getElementById('difficulty-selector');
    const difficultyOptionsEl = document.getElementById('difficulty-options');
    const difficultyLockedText = document.getElementById('difficulty-locked-text');
    let selectedDifficultyKey = null;

    // 辅助函数：锁定所有难度卡片
    function lockDifficultyCards(currentKey) {
        if (!difficultyOptionsEl) return;
        difficultyOptionsEl.querySelectorAll('.difficulty-option').forEach(c => {
            c.classList.add('locked');
            // 移除之前的🔒标记
            const oldLock = c.querySelector('.lock-badge');
            if (oldLock) oldLock.remove();
            if (c.dataset.key === currentKey) {
                c.classList.add('current-locked');
                const lockBadge = document.createElement('span');
                lockBadge.className = 'lock-badge';
                lockBadge.textContent = '🔒';
                lockBadge.style.cssText = 'position:absolute;top:4px;right:6px;font-size:12px;';
                c.appendChild(lockBadge);
            }
        });
        if (difficultyLockedText) difficultyLockedText.style.display = '';
    }

    // 辅助函数：解锁所有难度卡片
    function unlockDifficultyCards() {
        if (!difficultyOptionsEl) return;
        difficultyOptionsEl.querySelectorAll('.difficulty-option').forEach(c => {
            c.classList.remove('locked', 'current-locked');
            const oldLock = c.querySelector('.lock-badge');
            if (oldLock) oldLock.remove();
        });
        if (difficultyLockedText) difficultyLockedText.style.display = 'none';
    }

    // 渲染难度卡片
    if (difficultyOptionsEl) {
        const levels = getDifficultyList();
        levels.forEach(level => {
            const card = document.createElement('div');
            card.className = 'difficulty-option';
            card.dataset.key = level.key;
            card.innerHTML = `
                <div class="difficulty-stars">${level.stars}</div>
                <div class="difficulty-name">${level.name}</div>
                <div class="difficulty-desc">${level.desc}</div>
                <div class="difficulty-lives">预期 ${level.expectedLives} 通关</div>
            `;
            card.addEventListener('click', () => {
                difficultyOptionsEl.querySelectorAll('.difficulty-option').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedDifficultyKey = level.key;
            });
            difficultyOptionsEl.appendChild(card);
        });
        // 默认选中"简单"
        const easyCard = difficultyOptionsEl.querySelector('[data-key="easy"]');
        if (easyCard) {
            easyCard.classList.add('selected');
            selectedDifficultyKey = 'easy';
        }
    }

    // --- 根据轮回存档状态锁定/解锁难度卡片 ---
    try {
        const savedLifeNum = localStorage.getItem('gospel_reincarnation_life_num');
        const savedLife = savedLifeNum ? parseInt(savedLifeNum, 10) : 0;
        if (savedLife > 1) {
            const savedDiff = getDifficulty();
            lockDifficultyCards(savedDiff.key);
            // 选中已保存的难度卡片
            if (difficultyOptionsEl) {
                difficultyOptionsEl.querySelectorAll('.difficulty-option').forEach(c => c.classList.remove('selected'));
                const savedCard = difficultyOptionsEl.querySelector(`[data-key="${savedDiff.key}"]`);
                if (savedCard) {
                    savedCard.classList.add('selected');
                    selectedDifficultyKey = savedDiff.key;
                }
            }
        }
    } catch (e) { /* ignore */ }

    // --- 模型选择交互 ---
    const modelOptions = document.querySelectorAll('.model-option');
    modelOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            modelOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            opt.querySelector('input[type="radio"]').checked = true;
        });
    });

    // --- 获取选中模型 ---
    function getSelectedModel() {
        const checked = document.querySelector('input[name="ai-model"]:checked');
        return checked ? checked.value : 'qwen3:14b-q8_0';
    }

    // --- 启动游戏（先切换模型再启动） ---
    let isStarting = false;
    async function startGame(mode) {
        if (isStarting) return;
        isStarting = true;

        // 非轮回模式强制使用简单难度
        if (mode !== 'reincarnation') {
            setDifficulty('easy');
        }

        // 禁用按钮防止重复点击
        btnAgent.disabled = true;
        btnDebug.disabled = true;
        btnReincarnation.disabled = true;
        btnAgent.style.opacity = '0.5';
        btnDebug.style.opacity = '0.5';
        btnReincarnation.style.opacity = '0.5';

        const selectedModel = getSelectedModel();
        const success = await switchModel(selectedModel);

        if (success) {
            // 短暂延迟让用户看到成功提示
            await new Promise(r => setTimeout(r, 600));

            // 轮回模式：如果用户勾选了"从第1世重新开始"，先清除轮回数据
            if (mode === 'reincarnation') {
                const chkReset = document.getElementById('chk-reset-reincarnation');
                if (chkReset && chkReset.checked) {
                    try {
                        localStorage.removeItem('gospel_reincarnation');
                        localStorage.removeItem('gospel_reincarnation_life_num');
                        clearDifficulty();
                        console.log('[启动] 用户选择从第1世重新开始，轮回数据和难度设置已清除');
                    } catch (e) { /* ignore */ }
                }
            }

            overlay.style.display = 'none';
            document.getElementById('app-layout').style.display = 'flex';
            window.game = new Game(mode);

            // ============ 调试命令 ============
            /**
             * 手动触发资源紧急分配，验证完整的采集流程
             * 用法：在浏览器控制台输入 debugGather()
             */
            window.debugGather = function() {
                const g = window.game;
                if (!g) { console.error('game未初始化'); return; }
                
                console.log('=== debugGather: 开始端到端验证 ===');
                
                // 1. 检查当前资源状态
                const rs = g.resourceSystem;
                if (rs) {
                    console.log(`[资源] 木柴:${Math.round(rs.woodFuel)} 食物:${Math.round(rs.food)} 电力:${Math.round(rs.power)} 建材:${Math.round(rs.material)}`);
                    const urg = rs.getResourceUrgency();
                    console.log(`[紧急度] 木柴:${urg.wood} 食物:${urg.food} 电力:${urg.power}`);
                }
                
                // 2. 手动触发紧急任务分配给第一个空闲NPC
                const idleNpc = g.npcs.find(n => !n.isDead && n.state !== 'CHATTING' && !n._taskOverride?.isActive);
                if (idleNpc) {
                    console.log(`[分配] 将 ${idleNpc.name} 分配到伐木场 (urgent)`);
                    idleNpc.activateTaskOverride('debug_gather_wood', 'lumber_camp', 'urgent', 'woodFuel');
                    console.log(`[状态] ${idleNpc.name}: state=${idleNpc.state}, stateDesc=${idleNpc.stateDesc}, taskOverride=${JSON.stringify(idleNpc._taskOverride)}`);
                } else {
                    console.warn('[分配] 没有空闲NPC可分配');
                }
                
                // 3. 显示所有NPC状态
                for (const npc of g.npcs) {
                    if (npc.isDead) continue;
                    const pos = npc.getGridPos();
                    const gatherArea = g.taskSystem ? g.taskSystem._detectGatherArea(npc) : null;
                    console.log(`  ${npc.name}: scene=${npc.currentScene} pos=(${pos.x},${pos.y}) state=${npc.state} stateDesc="${npc.stateDesc}" gathering=${npc._gatheringResource || '无'} inArea=${gatherArea || '无'} override=${npc._taskOverride?.isActive ? npc._taskOverride.targetLocation : '无'}`);
                }
                
                console.log('=== debugGather: 完成（观察控制台和资源栏变化） ===');
            };
            
            /**
             * 强制传送指定NPC到采集区并验证产出
             * 用法：debugTeleportGather('赵铁柱', 'lumber_camp')
             */
            window.debugTeleportGather = function(npcName, areaKey) {
                const g = window.game;
                if (!g) { console.error('game未初始化'); return; }
                
                const npc = g.npcs.find(n => n.name === npcName);
                if (!npc) { console.error(`找不到NPC: ${npcName}`); return; }
                
                const loc = { lumber_camp: {x:6,y:5}, frozen_lake: {x:6,y:35}, ruins_site: {x:43,y:5}, ore_pile: {x:43,y:35} };
                const target = loc[areaKey];
                if (!target) { console.error(`无效区域: ${areaKey}`); return; }
                
                console.log(`[debugTeleport] 传送 ${npcName} 到 ${areaKey} (${target.x},${target.y})`);
                npc._teleportTo('village', target.x, target.y);
                npc.activateTaskOverride(`debug_${areaKey}`, areaKey, 'urgent', areaKey === 'lumber_camp' ? 'woodFuel' : areaKey === 'frozen_lake' ? 'food' : areaKey === 'ore_pile' ? 'power' : 'material');
                
                const gatherArea = g.taskSystem ? g.taskSystem._detectGatherArea(npc) : null;
                console.log(`[验证] ${npcName} 现在在 ${gatherArea || '未检测到'} 采集区`);
            };
        } else {
            // 加载失败，恢复按钮
            isStarting = false;
            btnAgent.disabled = false;
            btnDebug.disabled = false;
            btnReincarnation.disabled = false;
            btnAgent.style.opacity = '1';
            btnDebug.style.opacity = '1';
            btnReincarnation.style.opacity = '1';
        }
    }

    btnAgent.addEventListener('click', () => startGame('agent'));
    btnDebug.addEventListener('click', () => startGame('debug'));
    // 轮回模式按钮：保存选中难度后直接启动游戏
    btnReincarnation.addEventListener('click', () => {
        const lifeNumRaw = localStorage.getItem('gospel_reincarnation_life_num');
        const lifeNum = lifeNumRaw ? parseInt(lifeNumRaw, 10) : 0;
        const chkReset = document.getElementById('chk-reset-reincarnation');
        const isResetting = chkReset && chkReset.checked;

        if (lifeNum > 1 && !isResetting) {
            // 轮回中途：使用已保存的难度，直接启动
            startGame('reincarnation');
        } else {
            // 新轮回或重置：保存界面上选中的难度后启动
            if (selectedDifficultyKey) {
                setDifficulty(selectedDifficultyKey);
            }
            startGame('reincarnation');
        }
    });

    // "从第1世重新开始"勾选变化时，解锁/锁定难度卡片
    const chkResetEl = document.getElementById('chk-reset-reincarnation');
    if (chkResetEl) {
        chkResetEl.addEventListener('change', () => {
            const savedLifeNum = localStorage.getItem('gospel_reincarnation_life_num');
            const savedLife = savedLifeNum ? parseInt(savedLifeNum, 10) : 0;
            if (chkResetEl.checked) {
                // 勾选重置：解锁难度卡片，允许重新选择
                unlockDifficultyCards();
            } else {
                // 取消勾选：如果有存档则重新锁定
                if (savedLife > 1) {
                    const savedDiff = getDifficulty();
                    lockDifficultyCards(savedDiff.key);
                }
            }
        });
    }
});
