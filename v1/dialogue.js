/**
 * 福音镇 - 对话系统
 * 管理玩家↔NPC 和 NPC↔NPC 对话
 * 依赖: game.js (callLLM, parseLLMJSON)
 */

class DialogueManager {
    constructor(game) {
        this.game = game;

        // 当前活跃对话
        this.activeDialogue = null; // { type, npc, npc2?, messages[], turn, maxTurns }

    // NPC↔NPC 对话队列（后台处理）
        this.npcChatQueue = [];
        this.isProcessing = false;

        // （已废弃playback队列，改为边生成边显示）

        // NPC AI 思考定时器
        this.aiTickTimer = 0;
        this.aiTickInterval = 3; // 每 3 秒检查一个 NPC 是否需要思考
        this.aiRoundRobinIdx = 0;

        // DOM 引用
        this.panel = document.getElementById('dialogue-panel');
        this.portraitEl = document.getElementById('dialogue-portrait');
        this.nameEl = document.getElementById('dialogue-name');
        this.textEl = document.getElementById('dialogue-text');
        this.inputRow = document.getElementById('dialogue-input-row');
        this.inputEl = document.getElementById('dialogue-input');
        this.sendBtn = document.getElementById('dialogue-send');

        // 聊天记录面板 DOM 引用
        this.chatLogContent = document.getElementById('chat-log-content');
        this.chatLogClearBtn = document.getElementById('btn-clear-chat-log');

        // 绑定事件
        this.sendBtn.addEventListener('click', () => this._onPlayerSend());
        this.inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') this._onPlayerSend();
            if (e.key === 'Escape') this.closeDialogue();
        });

        // 清空聊天记录按钮
        if (this.chatLogClearBtn) {
            this.chatLogClearBtn.addEventListener('click', () => {
                if (this.chatLogContent) this.chatLogContent.innerHTML = '';
            });
        }
    }

    update(dt) {
        // 定期触发 NPC AI 思考（轮询）
        this.aiTickTimer += dt;
        if (this.aiTickTimer >= this.aiTickInterval) {
            this.aiTickTimer = 0;
            this._tickNPCAI();
        }

        // 【聊天超时检测】超过60秒的对话自动结束，释放NPC
        this._checkChatTimeout();

        // 处理 NPC 对话队列（边生成边显示，不再需要playback队列）
        if (!this.isProcessing && this.npcChatQueue.length > 0) {
            this._processNPCChat();
        }
    }

    /**
     * 检测聊天超时，超过60秒的对话自动结束
     * 防止NPC长时间卡在CHATTING状态无法响应紧急任务
     */
    _checkChatTimeout() {
        const now = Date.now();
        const CHAT_TIMEOUT_MS = 60 * 1000; // 60秒超时

        for (let i = this.npcChatQueue.length - 1; i >= 0; i--) {
            const chat = this.npcChatQueue[i];
            if (!chat.startTime) continue;

            const elapsed = now - chat.startTime;
            if (elapsed > CHAT_TIMEOUT_MS) {
                // 正在处理的对话（第一个）也要强制结束
                const isCurrentlyProcessing = (i === 0 && this.isProcessing);

                console.log(`[对话超时] ${chat.npc1?.name} 和 ${chat.npc2?.name} 的对话已超过${Math.round(elapsed/1000)}秒，自动结束`);

                // 释放双方CHATTING状态
                if (chat.npc1 && chat.npc1.state === 'CHATTING') {
                    chat.npc1.state = 'IDLE';
                    chat.npc1.stateDesc = '对话结束';
                    chat.npc1._logDebug('chat', `对话超时自动结束（${Math.round(elapsed/1000)}秒）`);
                }
                if (chat.npc2 && chat.npc2.state === 'CHATTING') {
                    chat.npc2.state = 'IDLE';
                    chat.npc2.stateDesc = '对话结束';
                    chat.npc2._logDebug('chat', `对话超时自动结束（${Math.round(elapsed/1000)}秒）`);
                }

                // 从队列中移除
                this.npcChatQueue.splice(i, 1);

                // 如果是正在处理的对话，重置处理状态
                if (isCurrentlyProcessing) {
                    this.isProcessing = false;
                }
            }
        }
    }

    // ---- NPC AI 轮询思考 ----
    _tickNPCAI() {
        const npcs = this.game.npcs;
        if (npcs.length === 0) return;

        // 深夜时段停止AI思考——取所有NPC中最晚的就寝时间，全员都该睡了才停止
        const hour = this.game.getHour();
        // 凌晨1点后~早6点前，无论谁都该睡了，全面停止思考
        const allShouldSleep = (hour >= 1 && hour < 6);
        if (allShouldSleep) {
            // 【关键修复】深夜清空对话队列，释放卡在CHATTING状态等待排队的NPC
            this._clearChatQueueForNight();
            return; // 深夜完全不思考
        }

        // 每次轮询处理多个NPC（最多3个），加速整体响应
        const processCount = Math.min(3, npcs.length);
        for (let i = 0; i < processCount; i++) {
            this.aiRoundRobinIdx = (this.aiRoundRobinIdx + 1) % npcs.length;
            const npc = npcs[this.aiRoundRobinIdx];

            // 跳过死亡或睡眠中的NPC
            if (npc.isDead || npc.isSleeping) continue;

            if (npc.aiCooldown <= 0 && npc.state !== 'CHATTING') {
                npc.think(this.game);
            }
        }

        // 额外检查：优先处理哲学家/思考型角色，确保他们不会因轮询慢而沉默
        const priorityIds = ['old_qian', 'wang_teacher'];
        for (const pid of priorityIds) {
            const npc = npcs.find(n => n.id === pid);
            if (npc && !npc.isDead && !npc.isSleeping && npc.aiCooldown <= 0 && npc.state !== 'CHATTING') {
                npc.think(this.game);
            }
        }

        // ============ LLM行动决策轮询（独立于think，频率更低） ============
        // 每次轮询处理1个NPC的行动决策（避免同时发出过多AI请求）

        // 【增强】空闲NPC主动社交检查——不依赖LLM的wantChat
        if (!this._socialCheckIdx) this._socialCheckIdx = 0;
        this._socialCheckIdx = (this._socialCheckIdx + 1) % npcs.length;
        const socialNpc = npcs[this._socialCheckIdx];
        if (socialNpc && !socialNpc.isDead && !socialNpc.isSleeping && socialNpc.state === 'IDLE' 
            && !socialNpc._chatWalkTarget && !socialNpc._hungerOverride
            && !this.isProcessing
            && this.npcChatQueue.length === 0) {
            const nearby = socialNpc._getNearbyNPCs(this.game, 6);
            if (nearby.length > 0) {
                socialNpc._tryProactiveChat(this.game, nearby);
            }
        }

        if (!this._actionRoundRobinIdx) this._actionRoundRobinIdx = 0;
        this._actionRoundRobinIdx = (this._actionRoundRobinIdx + 1) % npcs.length;
        const actionNpc = npcs[this._actionRoundRobinIdx];
        if (actionNpc && !actionNpc.isDead && !actionNpc.isSleeping && actionNpc.state !== 'CHATTING' 
            && actionNpc._actionDecisionCooldown <= 0) {
            actionNpc._actionDecision(this.game);
        }
    }

    // ============ 深夜对话队列清理 ============

    /**
     * 深夜时清空排队中的对话，释放卡在CHATTING状态等待的NPC
     * 不会中断正在进行的对话（isProcessing的那个），只清理排队等待的
     */
    _clearChatQueueForNight() {
        if (this.npcChatQueue.length <= (this.isProcessing ? 1 : 0)) return; // 没有排队的

        // 保留正在处理的第一个（如果有），清除后面排队的
        const startIdx = this.isProcessing ? 1 : 0;
        const removed = this.npcChatQueue.splice(startIdx);
        for (const chat of removed) {
            // 释放排队中NPC的CHATTING状态
            if (chat.npc1 && chat.npc1.state === 'CHATTING') {
                chat.npc1.state = 'IDLE';
                chat.npc1._logDebug('chat', `深夜清理：对话队列中释放CHATTING状态`);
            }
            if (chat.npc2 && chat.npc2.state === 'CHATTING') {
                chat.npc2.state = 'IDLE';
                chat.npc2._logDebug('chat', `深夜清理：对话队列中释放CHATTING状态`);
            }
        }
        if (removed.length > 0) {
            console.log(`[深夜清理] 清除${removed.length}组排队对话，释放NPC回去睡觉`);
        }
    }

    // ============ 玩家 ↔ NPC 对话 ============

    startPlayerChat(npc, initialMessage) {
        if (this.activeDialogue) return; // 已经在对话
        if (this.game.mode !== 'debug') return; // AI 模式下不支持玩家对话

        npc.state = 'CHATTING';
        this.activeDialogue = {
            type: 'player',
            npc: npc,
            messages: [],
            turn: 0,
            maxTurns: 50,  // 安全上限，正常情况下LLM会自行结束对话
            npcWantsEnd: false  // NPC是否想结束对话
        };

        // 显示面板
        this._showPanel(npc);

        if (initialMessage) {
            // 玩家已经有消息要发
            this._sendPlayerMessage(initialMessage);
        } else {
            // 显示 NPC 的问候
            this._npcGreeting(npc);
        }
    }

    async _npcGreeting(npc) {
        this.textEl.textContent = '...';

        const systemPrompt = `你是「${npc.name}」，鹈鹕村的${npc.occupation}。
性格：${npc.personality}
心情：${npc.mood}
现在有人来跟你打招呼，请简短回应（1-2句话，口语化，符合你的性格）。`;

        const userPrompt = `时间是${this.game.getTimeStr()}，${this.game.getTimePeriod()}。你正在${npc.stateDesc}。
请直接说出你想说的话（不要JSON格式，直接说话）。`;

        const debugMode = this.game && this.game.mode === 'debug';
const reply = await callLLM(systemPrompt, userPrompt, debugMode ? 100 : 150);
        const text = reply || `哎，你好！我是${npc.name}。`;

        this.textEl.textContent = text;
        this.activeDialogue.messages.push({ role: 'npc', text });

        // 推送到聊天记录面板
        this._addChatLogDivider(`🗣️ 和 ${npc.name} 的对话`);
        this._addChatLogEntry(npc.name, text, 'other');

        this.inputRow.style.display = 'flex';
        this.inputEl.focus();
    }

    _onPlayerSend() {
        const msg = this.inputEl.value.trim();
        if (!msg) return;
        this.inputEl.value = '';
        this._sendPlayerMessage(msg);
    }

    async _sendPlayerMessage(msg) {
        if (!this.activeDialogue || this.activeDialogue.type !== 'player') return;

        const dlg = this.activeDialogue;
        dlg.messages.push({ role: 'player', text: msg });
        dlg.turn++;

        this.inputRow.style.display = 'none';
        this.textEl.textContent = `你: ${msg}\n\n${dlg.npc.name} 正在想...`;

        // 推送玩家消息到聊天记录面板
        this._addChatLogEntry('你', msg, 'self');

        // 安全上限：超过最大轮次强制结束
        const forceEnd = dlg.turn >= dlg.maxTurns;

        // 获取 NPC 回复（让LLM自行判断是否结束对话）
        const { text: reply, wantsEnd } = await this._getNPCReplyWithEndDetect(dlg.npc, dlg.messages, forceEnd);
        this.textEl.textContent = reply;
        dlg.messages.push({ role: 'npc', text: reply });

        // 推送NPC回复到聊天记录面板
        this._addChatLogEntry(dlg.npc.name, reply, 'other');

        // 如果NPC想结束对话 或 达到安全上限
        if (wantsEnd || forceEnd) {
            dlg.npc.addMemory({
                type: 'chat',
                partner: '玩家',
                text: `和玩家聊了${dlg.turn}轮`,
                lines: dlg.messages.map(m => ({
                    speaker: m.role === 'npc' ? dlg.npc.name : '玩家',
                    text: m.text
                }))
            });
            // 【Debug日志】记录玩家对话
            const chatLines = dlg.messages.map(m => ({
                speaker: m.role === 'npc' ? dlg.npc.name : '玩家',
                text: m.text
            }));
            dlg.npc._logDebugDialogue('玩家', chatLines);
            dlg.npc._logDebug('chat', `与玩家对话结束(${dlg.turn}轮)`);

            setTimeout(() => this.closeDialogue(), 3000);
            return;
        }

        // 显示输入框
        this.inputRow.style.display = 'flex';
        this.inputEl.focus();
    }

    /**
     * 获取NPC回复，同时检测NPC是否想结束对话
     * 返回 { text, wantsEnd }
     */
    async _getNPCReplyWithEndDetect(npc, messages, forceEnd) {
        const chatHistory = messages.map(m =>
            m.role === 'player' ? `玩家说：${m.text}` : `${npc.name}说：${m.text}`
        ).join('\n');

        const turnCount = messages.filter(m => m.role === 'player').length;

        const systemPrompt = `你是「${npc.name}」，${npc.age}岁，福音镇的${npc.occupation}。
性格：${npc.personality}
心情：${npc.mood}

对话规则：
1. 请直接说出你的回复（口语化，1-3句话），不要使用JSON格式。
2. 积极回应对方的话，可以追问、分享自己的看法、讲自己的经历，让对话自然延续。
3. 不要急于结束对话，要像真实邻里聊天一样自然地交流。
${turnCount >= (this.game && this.game.mode === 'debug' ? 4 : 8) ? '4. 如果话题真的完全聊尽了，可以自然地说再见，并在回复末尾加上 [END] 标记（[END]不会展示给对方）。但只要还有一点可聊的就继续。' : '4. 请继续积极地聊天，不要急着结束对话。你可以追问细节、延伸话题、分享自己的经历或想法。'}
${forceEnd ? '5. 你们已经聊了很久了，请现在结束对话，说声再见，并在末尾加上 [END]。' : ''}`;

        const userPrompt = `对话记录（已进行${turnCount}轮）：
${chatHistory}

请回复玩家：`;

        const debugMode2 = this.game && this.game.mode === 'debug';
let reply = await callLLM(systemPrompt, userPrompt, debugMode2 ? 100 : 300);
        // 【修复】API失败时使用多样化fallback回复
        if (!reply) {
            if (forceEnd) {
                reply = '好了，我该忙了，下次再聊！';
            } else {
                const fallbacks = [
                    `嗯嗯，我知道了。`,
                    `啊…你说的有道理。`,
                    `是这样啊，我想想…`,
                    `哦哦，然后呢？`,
                    `嗯…我懂你的意思了。`,
                ];
                reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
                console.warn(`[玩家对话fallback] ${npc.name}: API返回空，使用随机回复`);
            }
        }

        // 检测 [END] 标记（前6轮不检测，防止过早结束）
        // 【Debug模式】前3轮不检测即可（加速对话流转）
        const minEndTurn = (this.game && this.game.mode === 'debug') ? 3 : 6;
        const hasEndMark = reply.includes('[END]');
        const wantsEnd = (hasEndMark && turnCount >= minEndTurn) || forceEnd;
        // 移除 [END] 标记，不展示给用户
        const cleanText = reply.replace(/\[END\]/g, '').trim();

        return { text: cleanText, wantsEnd };
    }

    // ============ NPC ↔ NPC 对话 ============

    startNPCChat(npc1, npc2) {
        // 【全局聊天开关】最终防线：开关关闭时所有NPC间聊天一律不执行
        if (!CHAT_ENABLED) return;

        if (npc1.state === 'CHATTING' || npc2.state === 'CHATTING') return;

        // 【关键修复】任一NPC过了就寝时间就不发起新对话
        const chatHour = this.game.getHour();
        if (npc1._isBedtime(chatHour) || npc2._isBedtime(chatHour)) return;

        // 【关键修复】必须在同一场景才能发起对话，防止隔空聊天
        if (npc1.currentScene !== npc2.currentScene) {
            console.warn(`[对话阻止] ${npc1.name}(${npc1.currentScene}) 和 ${npc2.name}(${npc2.currentScene}) 不在同一场景，取消对话`);
            return;
        }

        // 【修复】下雨时禁止在户外发起对话，NPC应该先去避雨
        if (this.game.isRaining()) {
            const isOutdoor1 = npc1.currentScene === 'village';
            const isOutdoor2 = npc2.currentScene === 'village';
            if (isOutdoor1 || isOutdoor2) {
                console.log(`[对话阻止] 下雨天，${npc1.name}或${npc2.name}在户外，应先避雨，取消对话`);
                return;
            }
        }

        // 加入队列
        // 【Debug模式】对话轮数限制，加速测试
        const isDebugMode = this.game.mode === 'debug';
        this.npcChatQueue.push({
            npc1, npc2,
            messages: [],
            turn: 0,
            maxTurns: isDebugMode ? 6 : 10,  // debug=6轮，正常=10轮（14B模型每轮约30秒，10轮≈5分钟真实时间）
            startTime: Date.now() // 记录聊天开始时间，用于超时检测
        });

        npc1.state = 'CHATTING';
        npc2.state = 'CHATTING';

        // 【事件驱动镜头】通知镜头系统：对话开始
        if (this.game && this.game.onNPCEvent) {
            this.game.onNPCEvent(npc1, 'chat_start');
        }

        // 【关键修复】对话开始时立即清除双方的移动路径和相关状态
        // 防止NPC在等待LLM响应时继续沿路径走动、被传送到其他场景
        npc1.currentPath = [];
        npc1.pathIndex = 0;
        npc1.isMoving = false;
        npc1._pendingEnterScene = null;
        npc1._pendingEnterKey = null;
        npc1._chatWalkTarget = null;
        npc1._walkingToDoor = false;
        npc1._exitDoorCallback = null;
        npc2.currentPath = [];
        npc2.pathIndex = 0;
        npc2.isMoving = false;
        npc2._pendingEnterScene = null;
        npc2._pendingEnterKey = null;
        npc2._chatWalkTarget = null;
        npc2._walkingToDoor = false;
        npc2._exitDoorCallback = null;

        // 设置冷却
        const now = Date.now();
        npc1.chatCooldowns[npc2.id] = now;
        npc2.chatCooldowns[npc1.id] = now;
    }

    async _processNPCChat() {
        if (this.npcChatQueue.length === 0) return;
        this.isProcessing = true;

        const chat = this.npcChatQueue[0];
        const { npc1, npc2 } = chat;

        // 【关键修复】如果任一NPC已过就寝时间，直接释放NPC不处理对话
        const processHour = this.game.getHour();
        if (npc1._isBedtime(processHour) || npc2._isBedtime(processHour)) {
            npc1._logDebug('chat', `已过就寝时间(${processHour.toFixed(1)})，跳过与${npc2.name}的对话`);
            npc1.state = 'IDLE';
            npc2.state = 'IDLE';
            this.npcChatQueue.shift();
            this.isProcessing = false;
            return;
        }

        try {
            const allMessages = [];  // 存储完整对话记录

            // 事件日志通知（对话开始时就通知，不要等到结束）
            if (this.game.addEvent) {
                this.game.addEvent(`💬 ${npc1.name} 和 ${npc2.name} 开始聊天`);
            }

            // 在聊天记录面板添加对话分隔（立即显示，不要等到全部生成完）
            this._addChatLogDivider(`🗣️ ${npc1.name} 和 ${npc2.name} 的对话`);

            // ---- 辅助函数：生成一句后立即显示到气泡和聊天记录 ----
            const showLine = (speaker, listener, text) => {
                // 清除上一个说话人的气泡
                listener.expression = '';
                listener.expressionTimer = 0;
                // 当前说话人显示气泡
                speaker.expression = text;
                speaker.expressionTimer = 15; // 气泡持续15秒，等待下一句生成
                // 推送到聊天记录面板（npc1左对齐，npc2右对齐）
                const isNpc1 = speaker === npc1;
                this._addChatLogEntry(speaker.name, text, isNpc1 ? 'other' : 'self');
            };

            // ---- 第1句：npc1 先打招呼（生成后立即显示） ----
            console.log(`[对话调试] ${npc1.name}↔${npc2.name}: 开始生成打招呼 场景=${npc1.currentScene}/${npc2.currentScene}`);
            const greeting = await this._generateNPCLine(npc1, npc2, allMessages, 'greet');
            allMessages.push({ speaker: npc1.name, text: greeting });
            showLine(npc1, npc2, greeting);
            console.log(`[对话调试] ${npc1.name}↔${npc2.name}: 打招呼完成 场景=${npc1.currentScene}/${npc2.currentScene} LLM_DOWN=${typeof LLM_STATUS !== 'undefined' ? LLM_STATUS.isDown : '?'} 内容="${greeting.substring(0,30)}..."`);

            // ---- 多轮对话（边生成边显示） ----
            let chatEnded = false;
            let fallbackCount = 0; // 追踪连续fallback次数
            npc1._logDebug('chat', `对话循环开始 maxTurns=${chat.maxTurns} 场景=${npc1.currentScene}/${npc2.currentScene}`);
            for (let i = 0; i < chat.maxTurns && !chatEnded; i++) {
                npc1._logDebug('chat', `循环i=${i} 场景=${npc1.currentScene}/${npc2.currentScene} state=${npc1.state}/${npc2.state} isDown=${typeof LLM_STATUS !== 'undefined' ? LLM_STATUS.isDown : '?'} fbCount=${fallbackCount}`);
                // 【修复】如果API连续失败太多次，不再浪费请求，直接结束对话
                if (typeof LLM_STATUS !== 'undefined' && LLM_STATUS.isDown) {
                    npc1._logDebug('chat', `⚠️对话中断: API疑似宕机`);
                    chatEnded = true;
                    break;
                }
                if (fallbackCount >= 3) {
                    npc1._logDebug('chat', `⚠️对话中断: 连续${fallbackCount}轮fallback`);
                    chatEnded = true;
                    break;
                }
                // 【关键修复】每轮对话前检查两人是否仍在同一场景
                if (npc1.currentScene !== npc2.currentScene) {
                    npc1._logDebug('chat', `⚠️对话中断: 场景不同 ${npc1.name}(${npc1.currentScene}) vs ${npc2.name}(${npc2.currentScene})`);
                    chatEnded = true;
                    break;
                }

                // 【关键修复】任一NPC过了就寝时间就结束对话——NPC需要回家睡觉
                const chatHour = this.game.getHour();
                if (npc1._isBedtime(chatHour) || npc2._isBedtime(chatHour)) {
                    npc1._logDebug('chat', `⚠️对话强制结束: 已过就寝时间(${chatHour.toFixed(1)})，NPC需要回家睡觉`);
                    chatEnded = true;
                    break;
                }

                // 【修复】户外淋雨检测：下雨且任一方在户外，最多再说1轮就结束
                if (this.game.isRaining() && (npc1.currentScene === 'village' || npc2.currentScene === 'village')) {
                    console.log(`[对话加速结束] 下雨了，${npc1.name}或${npc2.name}在户外淋雨，加速结束对话`);
                    chatEnded = true;
                    // 不break，让当前轮的回复还能生成（自然结束）
                }

                // npc2 回复（生成后立即显示）
                const { text: reply2, wantsEnd: end2, isFallback: fb2 } = await this._generateNPCLineWithEnd(npc2, npc1, allMessages, 'reply', i >= chat.maxTurns - 1);
                allMessages.push({ speaker: npc2.name, text: reply2 });
                showLine(npc2, npc1, reply2);
                if (fb2) fallbackCount++; else fallbackCount = 0;
                npc1._logDebug('chat', `${npc2.name}回复完成: end2=${end2} fb2=${fb2} 场景=${npc1.currentScene}/${npc2.currentScene}`);

                if (end2) { npc1._logDebug('chat', `npc2 wantsEnd=true, 结束`); chatEnded = true; break; }

                // npc1 接着说（生成后立即显示）
                const { text: reply1, wantsEnd: end1, isFallback: fb1 } = await this._generateNPCLineWithEnd(npc1, npc2, allMessages, 'reply', i >= chat.maxTurns - 2);
                allMessages.push({ speaker: npc1.name, text: reply1 });
                showLine(npc1, npc2, reply1);
                if (fb1) fallbackCount++; else fallbackCount = 0;

                if (end1) { chatEnded = true; break; }
            }

            // 对话全部完成，清除双方气泡
            npc1.expression = '';
            npc1.expressionTimer = 0;
            npc2.expression = '';
            npc2.expressionTimer = 0;

            // 记忆（结构化存储完整对话）
            const chatLines = allMessages.map(m => ({
                speaker: m.speaker,
                text: m.text
            }));
            npc1.addMemory({
                type: 'chat',
                partner: npc2.name,
                text: `和${npc2.name}聊天`,
                lines: chatLines
            });
            npc2.addMemory({
                type: 'chat',
                partner: npc1.name,
                text: `和${npc1.name}聊天`,
                lines: chatLines
            });

            // 【Debug日志】记录完整对话到NPC的debug日志
            npc1._logDebugDialogue(npc2.name, chatLines);
            npc2._logDebugDialogue(npc1.name, chatLines);
            npc1._logDebug('chat', `与${npc2.name}对话结束(${allMessages.length}句)`);
            npc2._logDebug('chat', `与${npc1.name}对话结束(${allMessages.length}句)`);

            // 【自动保存】对话完成后追加到当前session的debug log
            this._appendDialogueToLog(npc1, npc2, chatLines);

            // 好感度 & San值影响——根据对话内容情感基调 + San值综合判定
            // 【关键修复v2】综合分析对话内容的情感基调：关键词 + 句式 + 语气
            const allText = allMessages.map(m => m.text).join(' ');
            // 消极/攻击性关键词检测（大幅扩充）
            const negativeWords = [
                // 直接攻击
                '伪善','虚伪','假装','讽刺','嘲讽','指责','批判','说教',
                '荒谬','荒唐','无耻','自私','冷漠','残忍','愚蠢','可笑','废物','没用',
                '闭嘴','滚','别装','恶心','讨厌','烦','不需要你','别管我','少管闲事',
                '傻','蠢','笨','白痴','虚无','无能','卑鄙','阴阳怪气','高高在上',
                '瞧不起','看不起','假惺惺','作秀','掩盖','逃避','懦弱','胆小',
                // 含蓄冲突（日常吵架常用）
                '不懂','不理解','不明白','不在乎','不关心','不在意','不重要',
                '够了','算了','随便','无所谓','爱怎样怎样',
                '失望','伤心','难过','委屈','心寒','心累','受够',
                '别说了','不想说','不想听','不想理','不想管','不想聊',
                '离我远点','离开','走开','别来','别找我',
                '凭什么','为什么总是','到底要怎样','有什么用','说了也没用',
                '你从来','你总是','你每次','你根本','你到底','你究竟',
                '冠冕堂皇','大道理','居高临下','指指点点',
                '真的很烦','真的受够','真的累了','真的不想',
                '不配','不值得','不够格','不需要',
                '敷衍','应付','忽视','无视','冷落','疏远',
                '虚情假意','口是心非','言不由衷','表里不一',
                '受不了','忍不了','看不惯','容不下',
                '吵','怒','骂','怼','嘲','怨','恨','嫌','嫌弃',
                '计较','追究','翻旧账','纠缠'
            ];
            const positiveWords = [
                '谢谢','感谢','关心','温暖','帮助','照顾','喜欢','开心','快乐',
                '理解','支持','陪伴','信任','鼓励','安慰','加油','好朋友',
                '在乎','珍惜','幸福','美好','可爱','善良','真诚','温柔','体贴',
                '抱歉','对不起','没关系','原谅','包容'
            ];
            let negScore = 0;
            let posScore = 0;
            for (const w of negativeWords) {
                const matches = allText.split(w).length - 1;
                negScore += matches;
            }
            for (const w of positiveWords) {
                const matches = allText.split(w).length - 1;
                posScore += matches;
            }

            // 【新增】句式模式检测——识别反问句、质问句等吵架句式
            const conflictPatterns = [
                /你是不是/g, /你到底/g, /你究竟/g, /你凭什么/g,
                /为什么你/g, /为什么总/g, /为什么每次/g,
                /你有没有想过/g, /你考虑过.*吗/g,
                /我真的不/g, /我受够/g, /我不想再/g,
                /是不是.*不.*了/g, /是不是该.*离/g,
                /你.*真的.*吗[？?]/g, /你.*到底.*[？?]/g,
                /别再.*了/g, /不要再.*了/g,
                /你从来.*不/g, /你根本.*不/g,
                /可笑/g, /呵呵/g, /哈.*好啊/g
            ];
            for (const pattern of conflictPatterns) {
                const matches = allText.match(pattern);
                if (matches) negScore += matches.length * 2; // 吵架句式权重×2
            }

            // 【新增】感叹号和问号密集度检测（吵架时常用更多感叹号和反问）
            const exclamations = (allText.match(/[！!]/g) || []).length;
            const questions = (allText.match(/[？?]/g) || []).length;
            if (exclamations >= 3) negScore += 1; // 多个感叹号暗示情绪激动
            if (questions >= 4) negScore += 1;    // 多个问号暗示质问

            // 情感基调判定: 正面(+) / 中性(0) / 负面(-)
            const sentimentScore = posScore - negScore; // >0正面, <0负面
            // 【调整】降低负面判定阈值：只要负面词比正面词多就算负面
            const isNegativeChat = sentimentScore < 0;  // 负面词 > 正面词即判定为负面
            const isPositiveChat = sentimentScore > 2;   // 正面词显著多于负面词

            // 【Debug】记录情感分析结果
            console.log(`[情感分析] ${npc1.name}↔${npc2.name}: neg=${negScore} pos=${posScore} score=${sentimentScore} → ${isNegativeChat ? '负面😤' : isPositiveChat ? '正面😊' : '中性😐'}`);

            const npc1LowSan = npc1.sanity < 30;
            const npc2LowSan = npc2.sanity < 30;

            // 低San值的消极言语伤害（原有逻辑保留）
            if (npc1LowSan) {
                const damage = npc1.sanity < 15 ? 8 : (npc1.sanity < 25 ? 4 : 2);
                const aff = npc2.getAffinity(npc1.id);
                const intimacyMult = aff >= 70 ? 2.5 : (aff >= 40 ? 1.5 : 1.0);
                npc2.sanity = Math.max(0, npc2.sanity - damage * intimacyMult);
                const affDrop = npc1.sanity < 15 ? -4 : -2;
                npc2.changeAffinity(npc1.id, affDrop);
                npc1.changeAffinity(npc2.id, -1);
                if (this.game.addEvent) {
                    this.game.addEvent(`💔 ${npc1.name} 的消极言语伤害了 ${npc2.name} (San-${(damage * intimacyMult).toFixed(1)}, 好感${affDrop})`);
                }
            }
            if (npc2LowSan) {
                const damage = npc2.sanity < 15 ? 8 : (npc2.sanity < 25 ? 4 : 2);
                const aff = npc1.getAffinity(npc2.id);
                const intimacyMult = aff >= 70 ? 2.5 : (aff >= 40 ? 1.5 : 1.0);
                npc1.sanity = Math.max(0, npc1.sanity - damage * intimacyMult);
                const affDrop = npc2.sanity < 15 ? -4 : -2;
                npc1.changeAffinity(npc2.id, affDrop);
                npc2.changeAffinity(npc1.id, -1);
                if (this.game.addEvent) {
                    this.game.addEvent(`💔 ${npc2.name} 的消极言语伤害了 ${npc1.name} (San-${(damage * intimacyMult).toFixed(1)}, 好感${affDrop})`);
                }
            }

            // 【新增】基于对话内容的好感度变化（不受San值限制）
            if (isNegativeChat) {
                // 吵架/攻击性对话 → 双方好感度下降
                const drop = Math.min(12, Math.max(3, Math.abs(sentimentScore) * 1.5)); // 根据严重程度3~12（加大惩罚）
                npc1.changeAffinity(npc2.id, -drop);
                npc2.changeAffinity(npc1.id, -drop);
                // 吵架也会损伤双方San值
                const sanDamage = Math.min(5, drop * 0.5);
                npc1.sanity = Math.max(0, npc1.sanity - sanDamage);
                npc2.sanity = Math.max(0, npc2.sanity - sanDamage);
                // 【关键修复】设置冷淡期：吵架后一段时间内不会被动增加好感度
                // 冷淡期长度与争吵严重程度正相关（300~900秒 = 5~15分钟真实时间）
                const cooldownTime = Math.min(900, 300 + Math.abs(sentimentScore) * 60);
                if (!npc1._affinityCooldown) npc1._affinityCooldown = {};
                if (!npc2._affinityCooldown) npc2._affinityCooldown = {};
                npc1._affinityCooldown[npc2.id] = cooldownTime;
                npc2._affinityCooldown[npc1.id] = cooldownTime;
                if (this.game.addEvent) {
                    this.game.addEvent(`😤 ${npc1.name} 和 ${npc2.name} 发生了争执 (好感-${drop}, San-${sanDamage.toFixed(1)}, 冷淡${Math.round(cooldownTime/60)}分钟)`);
                }
            } else if (isPositiveChat && !npc1LowSan && !npc2LowSan) {
                // 友好对话 → 好感度提升更多
                const bonus = Math.min(5, 2 + Math.floor(sentimentScore / 2));
                npc1.changeAffinity(npc2.id, bonus);
                npc2.changeAffinity(npc1.id, bonus);
            } else if (!npc1LowSan && !npc2LowSan) {
                // 中性对话 → 正常小幅提升
                npc1.changeAffinity(npc2.id, 1);
                npc2.changeAffinity(npc1.id, 1);
            }

            // 【目标追踪】记录聊天对象（用于每日聊天目标统计）
            if (npc1.trackChatWith) npc1.trackChatWith(npc2.id);
            if (npc2.trackChatWith) npc2.trackChatWith(npc1.id);

            // 【关心对话额外效果】如果是关心对话，被关心者恢复一些San值
            const aff12 = npc1.getAffinity(npc2.id);
            const aff21 = npc2.getAffinity(npc1.id);
            if (npc2.sanity < 30 && aff12 >= 70 && npc1.sanity >= 40) {
                // npc1关心npc2，npc2恢复San值
                const recovery = 8;
                npc2.sanity = Math.min(100, npc2.sanity + recovery);
                npc2.changeAffinity(npc1.id, 3); // 被关心后好感度提升
                if (this.game.addEvent) {
                    this.game.addEvent(`💕 ${npc1.name} 的关心让 ${npc2.name} 感到温暖 (San+${recovery})`);
                }
            }
            if (npc1.sanity < 30 && aff21 >= 70 && npc2.sanity >= 40) {
                const recovery = 8;
                npc1.sanity = Math.min(100, npc1.sanity + recovery);
                npc1.changeAffinity(npc2.id, 3);
                if (this.game.addEvent) {
                    this.game.addEvent(`💕 ${npc2.name} 的关心让 ${npc1.name} 感到温暖 (San+${recovery})`);
                }
            }

        } catch (err) {
            console.warn('NPC 对话生成出错:', err);
            // 【修复】在聊天面板显示错误信息，方便调试
            this._addChatLogEntry('⚠️ 系统', `对话生成失败: ${err.message || err}`, 'other');
            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ ${npc1.name}和${npc2.name}的对话异常中断: ${(err.message || '').substring(0, 50)}`);
            }
        }

        // 无论成功/失败都恢复状态
        npc1.state = 'IDLE';
        npc2.state = 'IDLE';
        npc1.expression = '';
        npc1.expressionTimer = 0;
        npc2.expression = '';
        npc2.expressionTimer = 0;
        this.npcChatQueue.shift();
        this.isProcessing = false;
    }

    /**
     * 生成NPC对话（用于打招呼，不检测结束）
     */
    async _generateNPCLine(speaker, listener, messages, mode) {
        const result = await this._generateNPCLineWithEnd(speaker, listener, messages, mode, false);
        return result.text;
    }

    /**
     * 生成NPC对话，同时检测是否想结束
     * 返回 { text, wantsEnd }
     */
    async _generateNPCLineWithEnd(speaker, listener, messages, mode, forceEnd) {
        const chatHistory = messages.map(m => `${m.speaker}说：${m.text}`).join('\n');
        const lastLine = messages.length > 0 ? messages[messages.length - 1] : null;
        const turnCount = Math.floor(messages.length / 2); // 大致轮数

        let situationHint = '';
        if (mode === 'greet') {
            // 随机话题引导，避免每次都是无意义的打招呼
            // 根据当前天数生成围绕暴风雪准备的生存话题
            const day = this.game ? (this.game.weatherSystem ? this.game.weatherSystem.currentDay : this.game.dayCount) : 1;
            let topicPool;
            if (day === 1) {
                topicPool = [
                    `讨论今天的物资收集进展，木柴和食物够不够`,
                    `商量一下暴风雪来之前该怎么分工准备`,
                    `聊聊暖炉的情况，第二座暖炉什么时候能建好`,
                    `讨论谁去砍柴谁去找食物，怎么分配最合理`,
                    `聊聊你对即将到来的暴风雪有多担心`,
                    `商量一下应急方案，万一物资不够怎么办`,
                    `讨论一下今天的任务完成得怎么样了`,
                    `聊聊大家的身体状况，有没有人需要特别照顾`,
                    `分享你在废墟中发现的有用东西`,
                    `聊聊末日前的生活，你最想念什么`,
                ];
            } else if (day === 2) {
                topicPool = [
                    `讨论在-30°C大雪天怎么安全地完成户外任务`,
                    `聊聊今天外面的风雪有多可怕，户外最多只能待2小时`,
                    `商量明天（喘息日）的计划，那是暴风雪前最后机会`,
                    `讨论物资储备够不够撑过第4天的大极寒`,
                    `聊聊暖炉的燃料消耗情况，木柴够烧吗`,
                    `关心一下刚从户外回来的同伴，有没有冻伤`,
                    `聊聊你对后天暴风雪的恐惧和准备`,
                    `讨论第二座暖炉的修建进展`,
                ];
            } else if (day === 3) {
                topicPool = [
                    `紧急讨论今晚24点暴风雪就到了，还缺什么物资`,
                    `商量最后几个小时该怎么分配时间，优先做什么`,
                    `讨论第二座暖炉能不能在今天内建好`,
                    `检查物资清单，木柴食物电力够不够撑过明天`,
                    `聊聊你对今晚暴风雪的恐惧，大家能活下来吗`,
                    `互相打气鼓劲，商量怎么一起扛过明天`,
                    `讨论无线电修好了没有，能不能联系到救援`,
                    `最后检查一下大家的身体状况，确保没人掉队`,
                    `聊聊如果物资不够，明天该怎么度过最艰难的时刻`,
                ];
            } else {
                topicPool = [
                    `互相鼓励坚持住，暴风雪正在外面肆虐`,
                    `讨论暖炉的木柴还够烧多久`,
                    `关心对方的身体状况，有没有失温迹象`,
                    `聊聊我们能不能撑到救援到来`,
                    `回忆那些已经不在的同伴，为他们祈祷`,
                    `讨论食物还剩多少，要不要省着吃`,
                    `互相打气，坚持到日落就能迎来救援`,
                ];
            }
            const topic = topicPool[Math.floor(Math.random() * topicPool.length)];
            situationHint = `你刚遇到${listener.name}，请自然地打个招呼，然后试着${topic}。`;
        } else if (lastLine) {
            // 检测对话是否陷入重复循环
            let repetitionWarning = '';
            if (messages.length >= 4) {
                const recentTexts = messages.slice(-4).map(m => m.text);
                // 提取高频词（出现3次以上的2字以上词汇）
                const allWords = recentTexts.join('').match(/[\u4e00-\u9fa5]{2,4}/g) || [];
                const freq = {};
                for (const w of allWords) { freq[w] = (freq[w] || 0) + 1; }
                const repeatedWords = Object.keys(freq).filter(w => freq[w] >= 3);
                if (repeatedWords.length > 0) {
                    repetitionWarning = `\n⚠️ 注意：你们的对话中"${repeatedWords.slice(0,2).join('""')}"等词出现过多次了，请换一个新的角度或话题来回应，不要重复相同的内容和用词。`;
                }
            }
            situationHint = `${lastLine.speaker}刚对你说了"${lastLine.text}"，你必须针对这句话回应。${repetitionWarning}`;
        }

        // 判断是否涉及哲学家/思考型角色的对话
        const philoIds = ['old_qian', 'wang_teacher'];
        const isPhiloChat = philoIds.includes(speaker.id) || philoIds.includes(listener.id);
        let philoHint = '';
        if (isPhiloChat) {
            if (speaker.id === 'wang_teacher') {
                philoHint = `\n6. 这是一场哲学教学式的对话。你是专注于康德哲学的哲学教师，你善于用日常生活的例子来讲解康德的批判哲学（纯粹理性批判、实践理性批判、判断力批判）、道德律令（定言命令）、先验唯心论等概念。你也会引用黑格尔辩证法、叔本华意志哲学、尼采超人哲学等来丰富讨论。请用通俗易懂的语言，让对方也能参与思考。`;
            } else if (speaker.id === 'old_qian') {
                philoHint = `\n6. 这是一场涉及哲学思考的对话。你是退休镇长，也是哲学爱好者，善于用深入浅出的方式提出哲学问题，结合人生阅历分享智慧。你特别喜欢关心晚辈的感情生活。`;
            } else {
                philoHint = `\n6. 对方想和你讨论哲学话题，请用你自己的生活经验和理解来回应，不要敷衍，认真地分享你的看法。即使你不是哲学家，你也可以从${speaker.occupation}的角度谈谈自己对生活和人生的理解。`;
            }
        }

        // 【San值影响对话风格】低San值NPC说话变得尖锐、攻击性强
        let sanityHint = '';
        if (speaker.sanity < 15) {
            sanityHint = `\n⚠️ 你现在精神状态极度糟糕（San值:${Math.round(speaker.sanity)}），你说话会变得非常尖锐、暴躁、带有攻击性。你可能会无端指责对方、说出伤人的话、阴阳怪气、冷嘲热讽。你内心充满愤怒和绝望，觉得没人理解你。`;
        } else if (speaker.sanity < 30) {
            sanityHint = `\n你现在精神状态很差（San值:${Math.round(speaker.sanity)}），说话容易急躁、不耐烦，可能会无意间说出伤人的话或者抱怨。你情绪不稳定，容易被小事激怒。`;
        } else if (speaker.sanity < 45) {
            sanityHint = `\n你现在有些焦虑和疲惫，说话可能带点消极情绪。`;
        }

        // 【悲痛状态注入】检查说话者是否处于悲痛中，影响对话内容和行为决策
        if (this.game && this.game.deathSystem && this.game.deathSystem.isNpcGrieving(speaker.id)) {
            const griefEffects = this.game.deathSystem._griefEffects.filter(g => g.npcId === speaker.id);
            const deadNames = griefEffects.map(g => g.deadNpcName).join('、');
            sanityHint += `\n😢 你正因${deadNames}的死亡陷入深深的悲痛，做事效率大幅降低，情绪极度低落。你会时不时提到逝者，说话带着哀伤和无力感。`;
        }

        // 【关心对话模式】如果是关心低San值的朋友
        let careHint = '';
        if (listener.sanity < 30 && speaker.getAffinity(listener.id) >= 70) {
            careHint = `\n💕 你注意到${listener.name}精神状态很差，你很担心ta。你会主动关心ta、安慰ta、问ta怎么了，提议陪ta去看医生或者休息。你是ta的好朋友，你真心在乎ta。`;
        }

        // 【悲痛状态注入】检查对话对象是否处于悲痛中
        if (this.game && this.game.deathSystem && this.game.deathSystem.isNpcGrieving(listener.id)) {
            const listenerGriefEffects = this.game.deathSystem._griefEffects.filter(g => g.npcId === listener.id);
            const listenerDeadNames = listenerGriefEffects.map(g => g.deadNpcName).join('、');
            careHint += `\n🕊️ ${listener.name}正因失去${listenerDeadNames}而悲痛不已，你能感受到ta的哀伤。`;
        }

        // 【关键】注入好感度和关系状态，让LLM感知两人真实关系
        const affinity = speaker.getAffinity(listener.id);
        let relationDesc = '';
        if (affinity >= 90) {
            relationDesc = `你和${listener.name}关系非常亲密（好感度${affinity}），是知心好友，聊天时会很热情、亲切。`;
        } else if (affinity >= 70) {
            relationDesc = `你和${listener.name}关系很好（好感度${affinity}），是不错的朋友，聊天比较轻松自然。`;
        } else if (affinity >= 50) {
            relationDesc = `你和${listener.name}关系一般（好感度${affinity}），是普通邻居/熟人，聊天比较客气。`;
        } else if (affinity >= 30) {
            relationDesc = `你和${listener.name}关系比较差（好感度${affinity}），你对ta有些不满或疏远，聊天时态度冷淡、敷衍。`;
        } else {
            relationDesc = `你和${listener.name}关系很差（好感度${affinity}），你对ta很反感甚至厌恶，聊天时态度很差，可能会冷嘲热讽、不耐烦。`;
        }

        // 【关键】注入冷淡期状态（吵架后的情绪延续）
        let cooldownHint = '';
        if (speaker._affinityCooldown && speaker._affinityCooldown[listener.id] > 0) {
            const cooldownLeft = Math.round(speaker._affinityCooldown[listener.id] / 60);
            cooldownHint = `\n😤 你们最近刚发生过争执/吵架，你现在对${listener.name}还有气（冷淡期还剩约${cooldownLeft}分钟）。你不会主动示好，说话带刺、冷淡、不想搭理对方。除非对方真诚道歉，否则你不会轻易原谅。`;
        }

        // 【关键】注入与对方相关的近期对话记忆（让LLM知道之前聊过什么）
        let memoryHint = '';
        const relatedMemories = speaker.memories
            .filter(m => m.partner === listener.name || (m.text && m.text.includes(listener.name)))
            .slice(-3);  // 最近3条与对方相关的记忆
        if (relatedMemories.length > 0) {
            const memTexts = relatedMemories.map(m => {
                let desc = `[${m.time}] ${m.text}`;
                // 如果有对话详情，提取关键内容（最后2句）
                if (m.lines && m.lines.length > 0) {
                    const lastLines = m.lines.slice(-2).map(l => `${l.speaker}:${l.text}`).join(' / ');
                    desc += `（${lastLines}）`;
                }
                return desc;
            }).join('\n');
            memoryHint = `\n你和${listener.name}的近期记忆：\n${memTexts}`;
        }

        // 【关键】注入暴风雪紧迫感和生存信息
        let blizzardContext = '';
        if (this.game && this.game.weatherSystem && this.game.weatherSystem.getBlizzardUrgencyForPrompt) {
            blizzardContext = this.game.weatherSystem.getBlizzardUrgencyForPrompt();
        }
        let survivalContext = '';
        if (this.game && this.game.weatherSystem) {
            survivalContext = this.game.weatherSystem.getSurvivalSummary();
        }
        let taskContext = '';
        if (this.game && this.game.taskSystem) {
            taskContext = `你的当前任务: ${this.game.taskSystem.getNpcTaskDescForPrompt(speaker.id)}`;
        }

        // 【死亡系统】注入死亡记录摘要
        let deathContext = '';
        if (this.game && this.game.deathSystem) {
            deathContext = this.game.deathSystem.getDeathSummaryForPrompt();
        }

        // 【轮回系统】注入前世记忆提示
        let pastLifeHint = '';
        if (this.game && this.game.reincarnationSystem && this.game.reincarnationSystem.getLifeNumber() > 1) {
            const isReincarnationMode = this.game.mode === 'reincarnation';
            pastLifeHint = this.game.reincarnationSystem.getPastLifeHintForDialogue(isReincarnationMode);
        }

        const systemPrompt = `你是「${speaker.name}」，${speaker.age}岁，${speaker.gender || '男'}性，${speaker.occupation}。
性格：${speaker.personality}。心情：${speaker.mood}。
你正在和「${listener.name}」（${listener.gender || '男'}性，${listener.occupation}）面对面聊天。
${relationDesc}${cooldownHint}${memoryHint}${sanityHint}${careHint}

${blizzardContext ? blizzardContext + '\n' : ''}${survivalContext ? survivalContext + '\n' : ''}${taskContext ? taskContext + '\n' : ''}${deathContext ? deathContext + '\n' : ''}${pastLifeHint ? pastLifeHint + '\n' : ''}
重要规则：
1. 你必须直接回应对方刚说的话，不能各说各的。
2. 说话要口语化、自然（1-3句话）。每次说话要有新的信息量，不要重复之前说过的内容和用词。
3. 你的说话态度、语气必须严格符合上面描述的关系状态和好感度。关系差就态度差，刚吵过架就冷淡。
4. 不要JSON格式，直接说话。
5. 🚨 你们正处于末日生存环境！暴风雪随时可能夺走所有人的生命！你的对话内容必须围绕生存——讨论物资准备、暖炉修建、任务进展、身体状况、逃生计划等。不要聊无关紧要的闲话！每一句话都应该对度过暴风雪有帮助。可以互相鼓励、商量对策、交流信息、协调分工。
6. 积极回应，可以追问、分享看法、讲自身经历，让对话有深度和趣味。如果当前话题快说完了，可以自然地转到另一个与生存相关的话题。
${turnCount >= (this.game && this.game.mode === 'debug' ? 3 : 6) ? '6. 如果话题真的完全聊尽了，你可以自然地说再见/告辞，并在回复末尾加 [END] 标记（不会展示给对方）。但只要还有一点可聊的就继续。' : '6. 请继续积极聊天，不要急着结束对话。你可以追问细节、延伸话题、聊聊自己的经历或想法。'}${forceEnd ? '\n你们已经聊了很久了，请现在结束对话，在末尾加 [END]。' : ''}${philoHint}`;

        const userPrompt = `${chatHistory ? '对话记录（已' + turnCount + '轮）：\n' + chatHistory + '\n\n' : ''}${situationHint}
你说：`;

        const debugMode3 = this.game && this.game.mode === 'debug';
let reply = await callLLM(systemPrompt, userPrompt, debugMode3 ? 300 : 500);
        // 【修复】API失败时使用角色化的fallback回复，避免所有人都说"嗯嗯。"
        let isFallback = false;
        if (!reply) {
            isFallback = true;
            if (forceEnd) {
                reply = '好了，下次再聊！';
            } else {
                const fallbacks = [
                    `嗯…我在想…`,
                    `啊…你说得对。`,
                    `是这样啊…`,
                    `哦，这样…`,
                    `嗯嗯，然后呢？`,
                    `啊，我刚才走神了，你说什么？`,
                    `嗯…让我想想怎么说…`,
                    `哈哈，是吗。`,
                ];
                reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
                console.warn(`[对话fallback] ${speaker.name}→${listener.name}: API返回空，使用随机回复: "${reply}"`);
            }
        }

        // 检测 [END] 标记（前几轮不检测，防止过早结束）
        // debug=3轮后可结束，正常=4轮后可结束（降低是因为14B模型推理慢，避免对话过长）
        const minEndTurnNPC = (this.game && this.game.mode === 'debug') ? 3 : 4;
        const hasEndMark = reply.includes('[END]');
        const wantsEnd = (hasEndMark && turnCount >= minEndTurnNPC) || forceEnd;
        const cleanText = reply.replace(/\[END\]/g, '').trim();

        return { text: cleanText.substring(0, 480), wantsEnd, isFallback };
    }

    // ============ 聊天记录面板 ============

    /** 向聊天记录面板添加一条消息 */
    _addChatLogEntry(speakerName, text, type) {
        if (!this.chatLogContent) return;
        const entry = document.createElement('div');
        // type: 'self' -> right(玩家/自己), 'other' -> left(NPC/对方)
        const align = type === 'self' ? 'right' : 'left';
        entry.className = `chat-log-msg ${align} new`;

        const time = this.game.getTimeStr();
        entry.innerHTML = `
            <span class="chat-log-speaker">${speakerName} <span class="chat-log-time">${time}</span></span>
            <div class="chat-log-text">${text}</div>
        `;

        this.chatLogContent.appendChild(entry);
        // 自动滚动到底部
        this.chatLogContent.scrollTop = this.chatLogContent.scrollHeight;
    }

    /** 添加对话分隔标记 */
    _addChatLogDivider(label) {
        if (!this.chatLogContent) return;
        const divider = document.createElement('div');
        divider.className = 'chat-log-divider';
        divider.textContent = label;
        this.chatLogContent.appendChild(divider);
        this.chatLogContent.scrollTop = this.chatLogContent.scrollHeight;
    }

    /** 自动追加对话记录到服务器debug log文件 */
    async _appendDialogueToLog(npc1, npc2, chatLines) {
        try {
            const time = this.game.getTimeStr();
            const day = this.game.dayCount;
            let logContent = `[D${day} ${time}] ${npc1.name} ↔ ${npc2.name} (${chatLines.length}句)`;
            chatLines.forEach(l => {
                logContent += `\n  ${l.speaker}: ${l.text}`;
            });
            logContent += '\n';

await fetch('http://localhost:8080/api/append-debug-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: 'current_session.log',
                    content: logContent
                })
            });
        } catch (err) {
            // 静默失败，不影响游戏运行
            console.warn('[debug log] 追加对话记录失败:', err.message);
        }
    }

    // ============ UI 管理 ============

    _showPanel(npc) {
        this.panel.style.display = 'block';
        this.portraitEl.src = npc.portrait.src || '';
        this.portraitEl.style.display = npc.portrait.src ? 'block' : 'none';
        this.nameEl.textContent = npc.name;
        this.textEl.textContent = '';
        this.inputRow.style.display = 'none';
    }

    closeDialogue() {
        if (this.activeDialogue) {
            if (this.activeDialogue.npc) {
                this.activeDialogue.npc.state = 'IDLE';
            }
            this.activeDialogue = null;
        }
        this.panel.style.display = 'none';
        this.inputRow.style.display = 'none';
    }
}
