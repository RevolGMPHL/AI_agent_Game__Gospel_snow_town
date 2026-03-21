/**
 * 福音镇 - NPC AI 思考/决策模块
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：行动执行、同伴系统、空闲监视、社交判断等
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._canChatWith = function(other) {
        const now = Date.now();
        const lastChat = this.chatCooldowns[other.id] || 0;
        // 哲学家/思考型角色更积极地找人聊天，冷却时间减半
        const cooldown = (this.id === 'old_qian') ? 30000 : 60000;
        if ((now - lastChat) <= cooldown) return false;

        // 【新增】taskOverride 工作中禁止聊天（紧急/高优先级任务中不闲聊）
        if (this._taskOverride && this._taskOverride.isActive) {
            this._logDebug && this._logDebug('chat', `正在执行taskOverride任务，禁止与${other.name}聊天`);
            return false;
        }
        if (other._taskOverride && other._taskOverride.isActive) {
            this._logDebug && this._logDebug('chat', `${other.name}正在执行taskOverride任务，禁止聊天`);
            return false;
        }

        // 【新增】生产性工作中禁止聊天（检查当前日程是否命中 GST.ACTION_EFFECT_MAP 中的生产性行为）
        // 老钱的安抚/调解/鼓舞等工作属于其正当职责，豁免此限制
        const _isInProductiveWork = (npc) => {
            if (!npc._currentActionEffect) return false;
            const effect = npc._currentActionEffect;
            // 老钱的 morale_boost（安抚鼓舞）不算闲聊，但算正当工作，不限制
            if (npc.id === 'old_qian' && effect.effectType === 'morale_boost') return false;
            // 有实际产出的工作类型
            const productiveTypes = ['produce_resource', 'build_progress', 'craft_medkit', 'medical_heal', 'reduce_waste'];
            return productiveTypes.includes(effect.effectType);
        };
        if (_isInProductiveWork(this)) {
            this._logDebug && this._logDebug('chat', `正在生产性工作（${this._currentActionEffect.effectType}），禁止与${other.name}聊天`);
            return false;
        }
        if (_isInProductiveWork(other)) {
            this._logDebug && this._logDebug('chat', `${other.name}正在生产性工作，禁止聊天`);
            return false;
        }

        // 【优化】基于 getResourceTension() 统一控制聊天——替换分散的 urgency 判断
        const game = this.game || (typeof window !== 'undefined' && window.game);
        if (game && game.resourceSystem) {
            const tension = game.resourceSystem.getResourceTension();
            if (tension >= 0.3) {
                // 中高紧张度：完全禁止聊天
                // 老钱作为精神领袖的安抚行为豁免（他的"聊天"实际上是工作）
                if (this.id === 'old_qian') {
                    const desc = this.stateDesc || '';
                    if (/安抚|调解|鼓舞|安慰|心理支持|讲故事/.test(desc)) {
                        // 老钱的安抚工作不受限
                        return true;
                    }
                }
                this._logDebug && this._logDebug('chat', `资源紧张度${tension.toFixed(2)}>=0.3，禁止与${other.name}聊天`);
                return false;
            }
            if (tension >= 0.1 && Math.random() > 0.3) {
                // 轻度紧张：70%概率禁止
                this._logDebug && this._logDebug('chat', `资源紧张度${tension.toFixed(2)}>=0.1，聊天概率降低，跳过与${other.name}聊天`);
                return false;
            }
        }
        return true;
    };

    proto._checkCompanionArrival = function(dt, game) {
        if (!this._companionDestination) return;

        const targetKey = this._companionDestination;
        const isDoorTarget = targetKey.endsWith('_door');
        const doorToScene = {
            warehouse_door: 'warehouse', medical_door: 'medical',
            dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
            kitchen_door: 'kitchen', workshop_door: 'workshop',
        };

        let arrived = false;
        if (isDoorTarget) {
            const insideScene = doorToScene[targetKey];
            if (insideScene && this.currentScene === insideScene) arrived = true;
        } else {
            const loc = GST.SCHEDULE_LOCATIONS[targetKey];
            if (loc && this.currentScene === loc.scene) {
                const pos = this.getGridPos();
                const dist = Math.abs(pos.x - loc.x) + Math.abs(pos.y - loc.y);
                if (dist <= 4) arrived = true;
            }
        }

        if (arrived) {
            const leader = game.npcs.find(n => n.id === this._companionLeader);
            if (leader) {
                this.expression = `和${leader.name}一起到了！`;
                this.expressionTimer = 5;
                // 额外好感度奖励
                this.changeAffinity(leader.id, 2);
                leader.changeAffinity(this.id, 2);
                // 【修复】companion到达后自动和leader发起对话
                if (GST.CHAT_ENABLED && game.dialogueManager && leader.currentScene === this.currentScene
                    && leader.state !== 'CHATTING' && this.state !== 'CHATTING'
                    && this._canChatWith(leader)) {
                    const self = this;
                    setTimeout(() => {
                        if (leader.state !== 'CHATTING' && self.state !== 'CHATTING') {
                            game.dialogueManager.startNPCChat(self, leader);
                            if (game.addEvent) {
                                game.addEvent(`🤝 ${self.name} 和 ${leader.name} 到达后开始聊天`);
                            }
                        }
                    }, 1500);
                }
            }
            this._clearCompanionState();
            this._clearActionOverride();
            this.currentScheduleIdx = -1;
            this.scheduleReached = false;
        }
    }

    /** 清除行动覆盖状态 */;

    proto._clearActionOverride = function() {
        const wasActive = this._actionOverride;
        this._actionOverride = false;
        this._currentAction = null;
        this._actionTarget = null;
        this._actionStuckTimer = 0;
        this._actionTravelTimer = 0;
        // 【覆盖快照】清除时重置_activeOverride并检查pending队列
        if (wasActive && this._activeOverride === 'action') {
            const old = this._activeOverride;
            this._activeOverride = 'none';
            this._logDebug('override', `[覆盖切换] ${old} → none（原因: 行动覆盖清除）`);
            this._executePendingBehavior();
        }
    }

    /** 向右侧「决策动态」面板写入NPC决策卡片 */;
    proto._addDecisionCard = function(action, parsed, game) {
        const chatLogEl = document.getElementById('chat-log-content');
        if (!chatLogEl) return;

        const time = game.getTimeStr ? game.getTimeStr() : '';
        const day = game.dayCount || 1;

        // 角色信息
        const roleEmoji = {
            zhao_chef: '👨‍🍳', lu_chen: '💪', li_shen: '👩‍🍳', wang_teacher: '👨‍🏫',
            old_qian: '👴', su_doctor: '👨‍⚕️', ling_yue: '🍄', qing_xuan: '🌿'
        };
        const roleColors = {
            zhao_chef: '#f87171', lu_chen: '#60a5fa', li_shen: '#fb923c', wang_teacher: '#34d399',
            old_qian: '#a78bfa', su_doctor: '#38bdf8', ling_yue: '#f472b6', qing_xuan: '#a3e635'
        };
        const priorityColors = { urgent: '#ef4444', normal: '#3b82f6', low: '#6b7280' };
        const priorityLabels = { urgent: '🔥紧急', normal: '执行', low: '随意' };
        const actionLabels = {
            go_to: '前往', rest: '休息', eat: '吃饭',
            work: '工作', accompany: '陪伴', stay: '留守', wander: '闲逛' // 保留用于系统内部/兼容
        };

        const emoji = roleEmoji[this.id] || '👤';
        const nameColor = roleColors[this.id] || '#e2e8f0';
        const pColor = priorityColors[action.priority] || '#6b7280';
        const pLabel = priorityLabels[action.priority] || action.priority;
        const actionLabel = actionLabels[action.type] || action.type;
        const targetDesc = action.target ? (GST.NPC.ACTION_TARGETS[action.target] || action.target).split('（')[0] : '';

        // 构建卡片HTML — 更像角色内心独白
        let cardHTML = `
            <div class="decision-card" style="border-left:3px solid ${nameColor}; margin:6px 4px; padding:8px 10px; background:rgba(25,25,45,0.75); border-radius:6px; font-size:12px; line-height:1.6;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-weight:bold; font-size:13px; color:${nameColor};">${emoji} ${this.name}</span>
                    <span style="font-size:10px; color:#94a3b8;">D${day} ${time}</span>
                </div>`;

        // 内心独白（reasoning）— 最重要的部分，放在最前面
        if (parsed.reasoning) {
            cardHTML += `<div style="color:#e2e8f0; margin:4px 0; font-size:12px; font-style:italic; padding:4px 8px; background:rgba(255,255,255,0.05); border-radius:4px;">💬 "${parsed.reasoning}"</div>`;
        }

        // 行动决定
        cardHTML += `<div style="color:#94a3b8; margin-top:4px; font-size:11px;">`;
        cardHTML += `<span style="color:${pColor}; font-weight:bold;">${pLabel}</span> `;
        cardHTML += `<span style="color:#e2e8f0;">${actionLabel}</span>`;
        if (targetDesc) {
            cardHTML += ` → <span style="color:#fbbf24;">${targetDesc}</span>`;
        }
        if (action.reason) {
            cardHTML += `<span style="color:#94a3b8; margin-left:4px;">（${action.reason}）</span>`;
        }
        cardHTML += `</div>`;

        // 担忧（threat）
        const threat = parsed.threat_analysis || '';
        if (threat && threat !== '暂时还好' && threat !== '无明显威胁' && threat !== '未分析' && threat !== '无') {
            cardHTML += `<div style="color:#fca5a5; margin-top:3px; font-size:11px;">😟 ${threat}</div>`;
        }

        // 希望（opportunity）
        const oppo = parsed.opportunity_analysis || '';
        if (oppo && oppo !== '先把手头的活干好' && oppo !== '无特别机会' && oppo !== '未分析' && oppo !== '无') {
            cardHTML += `<div style="color:#86efac; margin-top:2px; font-size:11px;">✨ ${oppo}</div>`;
        }

        // 同伴邀请
        if (action.companion) {
            cardHTML += `<div style="color:#c4b5fd; margin-top:2px; font-size:11px;">🤝 想拉上${action.companion}</div>`;
        }

        cardHTML += `</div>`;

        const card = document.createElement('div');
        card.innerHTML = cardHTML;
        chatLogEl.appendChild(card.firstElementChild);
        chatLogEl.scrollTop = chatLogEl.scrollHeight;

        // 限制面板中卡片数量，超过50张时删除旧的
        while (chatLogEl.children.length > 50) {
            chatLogEl.removeChild(chatLogEl.firstChild);
        }
    }

    /** 清除同伴状态 */;

    proto._clearCompanionState = function() {
        this._isCompanion = false;
        this._companionLeader = null;
        this._companionDestination = null;
        this._companionTarget = null;
    }

    // ============ 行为完成统一回调 ============

    /**
     * 吃饭行为完成的统一回调
     * 按需求6.1的顺序执行清理
     */;

    proto._executeAction = function(action, game) {
        // 【关键修复】对话中不执行行动决策（但urgent可以打断）
        if (this.state === 'CHATTING') {
            if (action.priority === 'urgent') {
                console.log(`[行动决策] ${this.name} urgent行动打断CHATTING`);
                this._forceEndChat();
            } else {
                this._logDebug('action', `CHATTING中，放弃执行行动: ${action.type}`);
                return;
            }
        }

        // 【任务6】go_to采集区时自动转化为taskOverride（P1层）
        const gatherTargets = {
            'lumber_camp': 'woodFuel',
            'lumber_camp_door': 'woodFuel',
            'frozen_lake': 'food',
            'frozen_lake_door': 'food',
            'ore_pile': 'power',
            'ore_pile_door': 'power',
            'ruins_site': 'explore',
            'ruins_site_door': 'explore',
            'workshop_door': 'power'
        };
        if (action.type === 'go_to' && action.target && gatherTargets[action.target]) {
            const resType = gatherTargets[action.target];
            const targetLoc = action.target.replace(/_door$/, '');
            const validTarget = GST.SCHEDULE_LOCATIONS[targetLoc] ? targetLoc : action.target;
            const taskId = `action_gather_${resType}_${Date.now()}`;
            const priority = action.priority === 'urgent' ? 'urgent' : 'high';
            
            console.log(`[action→taskOverride] ${this.name}: go_to ${action.target} → taskOverride(${validTarget}, ${priority}, ${resType})`);
            this.activateTaskOverride(taskId, validTarget, priority, resType);
            return; // taskOverride会接管后续导航
        }

        // 清除之前的行动状态
        // 【休息缓冲期】新行动执行时清除缓冲期，允许urgent等新行动打断休息
        if (this._restCooldownTimer > 0) {
            console.log(`[休息打断] ${this.name} 收到新行动 ${action.type}(${action.priority || 'normal'})，打断休息缓冲期`);
            this._restCooldownTimer = 0;
        }
        this._clearActionOverride();

        // 【修复】清除社交走路目标（行动执行优先于社交意愿）
        if (this._chatWalkTarget) {
            this._logDebug('chat', `行动执行(${action.type})打断了走向聊天目标的路径`);
            this._chatWalkTarget = null;
        }

        this._currentAction = action;
        this._actionOverride = true;
        // 【覆盖快照】设置行动覆盖
        const oldOverrideA = this._activeOverride;
        this._activeOverride = 'action';
        if (oldOverrideA !== 'action') {
            this._logDebug('override', `[覆盖切换] ${oldOverrideA} → action（原因: ${action.type}）`);
        }
        this._actionStuckTimer = 0;
        this._actionTravelTimer = 0;
        // 【Debug日志】记录行动执行
        this._logDebug('action', `执行行动: ${action.type} → ${action.target || '无目标'} 理由:${action.reason}`);
        // 【行动日志】输出到右侧事件列表，让用户看到NPC的行动决策
        if (this.game && this.game.addEvent) {
            const actionEmoji = { go_to: '🚶', rest: '😴', eat: '🍽️', work: '⚒️', accompany: '👫', stay: '📍', wander: '🔄' }; // 保留全部emoji用于系统内部行动显示
            const emoji = actionEmoji[action.type] || '🎯';
            this.game.addEvent(`${emoji} ${this.name} ${action.reason || action.type}`);
        }

        // 清除当前移动路径
        this.currentPath = [];
        this.isMoving = false;
        this._pendingEnterScene = null;

        // 【硬保护B6】go_to kitchen_door 且饥饿时自动转换为 eat
        if (action.type === 'go_to' && action.target === 'kitchen_door' && this.hunger < 50 && !this.isEating) {
            console.log(`[行动转换] ${this.name} go_to kitchen_door 自动转换为 eat (hunger=${Math.round(this.hunger)})`);
            this._logDebug('action', `[行动转换] go_to kitchen_door → eat (hunger=${Math.round(this.hunger)})`);
            action.type = 'eat';
        }

        switch (action.type) {
            case 'go_to':
                this._actionTarget = { target: action.target, desc: action.reason };
                this.stateDesc = action.reason;
                this._navigateToScheduleTarget(action.target, game);
                this.scheduleReached = false;
                break;

            case 'rest':
                this._actionTarget = { target: this.homeName + '_door', desc: '回宿舍休息' };
                this.stateDesc = '回宿舍休息';
                this._navigateToScheduleTarget(this.homeName + '_door', game);
                this.scheduleReached = false;
                break;

            case 'eat':
                // 复用饥饿系统
                this._actionTarget = { target: action.target || 'kitchen_door', desc: action.reason || '去吃饭' };
                this.stateDesc = action.reason || '去吃饭';
                this._hungerOverride = true;
                this._hungerTarget = { target: action.target || 'kitchen_door', desc: action.reason || '去吃饭' };
                this._navigateToScheduleTarget(action.target || 'kitchen_door', game);
                this.scheduleReached = false;
                break;

            case 'accompany':
                if (action.companion) {
                    this._initiateCompanion(action, game);
                } else {
                    // 没有companion，退化为go_to
                    this._actionTarget = { target: action.target, desc: action.reason };
                    this.stateDesc = action.reason;
                    this._navigateToScheduleTarget(action.target, game);
                    this.scheduleReached = false;
                }
                break;

            case 'work': {
                // 【优化】work不再空操作，优先检查任务系统，其次回退到角色默认行为
                const currentTask = game.taskSystem?.getCurrentTask?.(this.id);
                if (currentTask && currentTask.targetLocation) {
                    // 有任务系统分配的任务，激活taskOverride导航到任务目标
                    this._actionTarget = { target: currentTask.targetLocation, desc: currentTask.desc };
                    this.stateDesc = currentTask.desc;
                    this._logDebug('action', `work→任务系统: ${currentTask.desc} → ${currentTask.targetLocation}`);
                    this._navigateToScheduleTarget(currentTask.targetLocation, game);
                    this.scheduleReached = false;
                } else {
                    // 无任务分配，回退到角色默认生产行为
                    this._fallbackToRoleDefaultAction(game);
                }
                return;
            }

            case 'stay':
                // 【优化】确保stateDesc有效，使_updateActionEffect能匹配关键词效果
                this.stateDesc = action.reason || '待在原地';
                this._logDebug('action', `stay: stateDesc="${this.stateDesc}"`);
                this._clearActionOverride();
                return;

            case 'wander': {
                // 在当前场景随机走
                this.stateDesc = action.reason || '随便走走';
                const map = game.maps[this.currentScene];
                if (map) {
                    const pos = this.getGridPos();
                    const dx = Math.floor(Math.random() * 9) - 4;
                    const dy = Math.floor(Math.random() * 9) - 4;
                    const tx = Math.max(0, Math.min(map.cols - 1, pos.x + dx));
                    const ty = Math.max(0, Math.min(map.rows - 1, pos.y + dy));
                    if (!map.isSolid(tx * GST.TILE + GST.TILE / 2, ty * GST.TILE + GST.TILE / 2)) {
                        this.currentPath = GST.findPath(pos.x, pos.y, tx, ty, map) || [];
                        this.pathIndex = 0;
                        this.state = 'WALKING';
                    }
                }
                this._clearActionOverride();
                return;
            }
        }

        // 处理companion邀请
        if (action.companion && action.type !== 'accompany') {
            // 非accompany类型但指定了companion，也尝试邀请
            this._tryInviteCompanion(action.companion, action.target, game);
        }

        // 设置表情
        if (action.reason) {
            this.expression = action.reason;
            this.expressionTimer = 6;
        }

        this.addMemory(`[行动] ${action.reason}`);
    }

    /**
     * 发起陪伴行动 — 邀请另一个NPC一起去某地
     */;

    proto._fallbackToRoleDefaultAction = function(game) {
        // 角色→默认行为映射表
        const ROLE_DEFAULT_ACTIONS = {
            'li_shen':      { target: 'kitchen_door',   desc: '去炊事房做饭',         stateDesc: '准备晚餐、分配食物' },
            'zhao_chef':    { target: 'lumber_camp',    desc: '去伐木场砍柴',         stateDesc: '砍柴' },
            'wang_teacher': { target: 'workshop_door',  desc: '去工坊人工发电',       stateDesc: '人工发电' },
            'su_doctor':    { target: 'medical_door',   desc: '去医疗站坐诊',         stateDesc: '坐诊' },
            'old_qian':     { target: 'furnace_plaza',  desc: '去暖炉广场安抚大家',   stateDesc: '安抚' },
            'ling_yue':     { target: 'ore_pile',       desc: '去矿渣堆采矿',         stateDesc: '采矿' },
            'lu_chen':      { target: 'lumber_camp',    desc: '去伐木场搬运',         stateDesc: '搬运木柴' },
            'qing_xuan':    { target: 'medical_door',   desc: '去医疗站制作草药',     stateDesc: '制作草药' },
        };

        const defaultAction = ROLE_DEFAULT_ACTIONS[this.id];
        if (defaultAction) {
            // 【修复】必须设置_actionOverride=true，否则日程系统会立即覆盖fallback目标
            // 导致NPC在原目标和fallback目标之间无限来回跑（歆玥废墟↔矿渣堆bug）
            this._actionOverride = true;
            this._currentAction = { type: 'go_to', target: defaultAction.target, reason: defaultAction.desc };
            this._actionTarget = { target: defaultAction.target, desc: defaultAction.desc };
            this.stateDesc = defaultAction.stateDesc;
            this._logDebug('action', `work→角色默认行为: ${this.name} → ${defaultAction.desc} (${defaultAction.target})`);
            this._navigateToScheduleTarget(defaultAction.target, game);
            this.scheduleReached = false;
        } else {
            // 未知角色，回退到日程系统
            this._logDebug('action', `work→未知角色${this.id}，恢复日程`);
            this._clearActionOverride();
            this.currentScheduleIdx = -1;
            this.scheduleReached = false;
        }
    }

    /**
     * 更新行动覆盖状态 — 在update循环中调用
     * 检查行动是否到达、是否卡住、是否超时
     */;

    proto._forceEndChat = function() {
        if (this.state !== 'CHATTING') return;
        console.log(`[NPC-${this.name}] 强制结束聊天状态`);
        this.state = 'IDLE';
        this.stateDesc = '准备执行任务';
        // 通知对话系统移除该NPC的排队对话
        if (this.game && this.game.dialogueSystem) {
            const ds = this.game.dialogueSystem;
            // 从聊天队列中移除包含此NPC的对话
            if (ds.npcChatQueue) {
                for (let i = ds.npcChatQueue.length - 1; i >= 0; i--) {
                    const chat = ds.npcChatQueue[i];
                    if (chat.npc1 === this || chat.npc2 === this) {
                        // 释放对方的CHATTING状态
                        const other = chat.npc1 === this ? chat.npc2 : chat.npc1;
                        if (other && other.state === 'CHATTING') {
                            other.state = 'IDLE';
                            other._logDebug('chat', `对话被伙伴 ${this.name} 的urgent任务中断`);
                        }
                        ds.npcChatQueue.splice(i, 1);
                    }
                }
            }
        }
        this._logDebug('chat', `聊天被强制中断（urgent任务）`);
    }

    /**
     * 获取任务覆盖的状态描述
     */;

    proto._getBusinessContext = function(game, nearby) {
        // 只有在工作场所（仓库/工坊/医疗站/炊事房）内才生成经营上下文
        const workplaceScenes = { 'warehouse': '仓库', 'workshop': '工坊', 'medical': '医疗站', 'kitchen': '炊事房' };
        const placeName = workplaceScenes[this.currentScene];
        if (!placeName) return '';
        
        // 检查当前NPC是否是这个场所的主人
        if (this.workplaceName !== this.currentScene) return '';

        // 统计当前场所内除自己外的人数
        const othersHere = game.npcs.filter(n => 
            n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping
        );
        const customerCount = othersHere.length;
        
        // 更新客流统计
        if (customerCount > 0) {
            this.shopVisitorCount += customerCount; // 累计（简化统计）
            this.shopLastVisitorTime = game.getTimeStr();
            this.shopAloneMinutes = 0;
        } else {
            this.shopAloneMinutes += Math.round(this.aiInterval / 60 * 10); // 每次think约增加对应分钟
        }

        let ctx = `\n【${placeName}经营状况】\n`;
        if (customerCount > 0) {
            ctx += `- 店里目前有${customerCount}位客人：${othersHere.map(n => n.name).join('、')}\n`;
        } else {
            ctx += `- 店里目前没有客人，空无一人\n`;
        }
        ctx += `- 今天累计接待约${this.shopVisitorCount}人次\n`;
        if (this.shopAloneMinutes > 20) {
            ctx += `- 已经连续约${this.shopAloneMinutes}分钟没有客人了\n`;
            ctx += `- 你应该考虑出门到广场/街上招揽客人或找人聊天\n`;
        }
        if (this.shopLastVisitorTime) {
            ctx += `- 上一个客人来的时间：${this.shopLastVisitorTime}\n`;
        } else {
            ctx += `- 今天还没有客人来过\n`;
        }
        return ctx;
    };

    proto._getNearbyNPCs = function(game, radius) {
        const pos = this.getGridPos();
        const result = [];
        for (const npc of game.npcs) {
            if (npc.id === this.id) continue;
            if (npc.isDead) continue; // 【P0修复】跳过已死亡的NPC
            if (npc.currentScene !== this.currentScene) continue;
            if (npc.isSleeping) continue; // 跳过睡觉中的NPC
            const np = npc.getGridPos();
            const d = Math.abs(pos.x - np.x) + Math.abs(pos.y - np.y);
            if (d <= radius) {
                // 只提取需要的属性，避免展开整个NPC复杂对象
                result.push({
                    id: npc.id,
                    name: npc.name,
                    dist: d,
                    state: npc.state,
                    stateDesc: npc.stateDesc,
                    isCrazy: npc.isCrazy,
                    isSleeping: npc.isSleeping,
                    occupation: npc.occupation,
                    mood: npc.mood,
                    currentScene: npc.currentScene,
                    // 状态感知：让NPC能感知旁人的身心状态
                    stamina: npc.stamina,
                    health: npc.health,
                    sanity: npc.sanity,
                    isSick: npc.isSick,
                    hunger: npc.hunger,
                    isEating: npc.isEating,
                    _stateOverride: npc._stateOverride,
                    _isBeingTreated: npc._isBeingTreated,
                    // 极寒生存状态感知
                    bodyTemp: npc.bodyTemp,
                    isDead: npc.isDead,
                    isHypothermic: npc.isHypothermic,
                    isSevereHypothermic: npc.isSevereHypothermic,
                    _rescueNeeded: npc._rescueNeeded
                });
            }
        }
        return result.sort((a, b) => a.dist - b.dist);
    }

    // ---- 存档 ----;

    proto._getTaskOverrideDesc = function() {
        const override = this._taskOverride;
        if (!override.isActive) return null;
        // 统一优先级：taskOverride.stateDesc > _councilStateDesc > resourceType 映射 > 默认
        const desc = override.stateDesc || this._councilStateDesc;
        if (desc) {
            return this._taskOverrideReached ? desc : `前往${desc}`;
        }
        const resourceNames = { woodFuel: '砍柴', food: '采集食物', explore: '探索废墟', power: '人工发电' };
        if (override.resourceType && resourceNames[override.resourceType]) {
            return this._taskOverrideReached
                ? `正在${resourceNames[override.resourceType]}中...`
                : `前往${resourceNames[override.resourceType]}`;
        }
        return this._taskOverrideReached ? '执行任务中...' : '前往任务目标...';
    }

    /** 到达目的地后的环境感知 —— 动态更新状态描述 */;

    proto._initiateCompanion = function(action, game) {
        const companion = game.npcs.find(n => n.name === action.companion && n.id !== this.id);
        if (!companion) {
            // 找不到这个人，退化为独自前往
            this._actionTarget = { target: action.target, desc: action.reason };
            this.stateDesc = action.reason;
            this._navigateToScheduleTarget(action.target, game);
            this.scheduleReached = false;
            return;
        }

        // 检查companion是否可被邀请（不在聊天、不在睡觉、不在治疗中、不在发疯）
        const canInvite = !companion.isSleeping && companion.state !== 'CHATTING' 
            && !companion._isBeingTreated && !companion.isCrazy
            && !companion._isCompanion; // 不能连锁邀请

        if (!canInvite) {
            // companion不可用，独自前往
            this.expression = `想叫${companion.name}一起，但${companion.name}现在不方便…`;
            this.expressionTimer = 5;
            this._actionTarget = { target: action.target, desc: action.reason };
            this.stateDesc = action.reason;
            this._navigateToScheduleTarget(action.target, game);
            this.scheduleReached = false;
            return;
        }

        // 检查距离（同场景或相邻才能邀请）
        const isSameScene = companion.currentScene === this.currentScene;
        if (!isSameScene) {
            this.expression = `${companion.name}不在附近，只好自己去了`;
            this.expressionTimer = 5;
            this._actionTarget = { target: action.target, desc: action.reason };
            this.stateDesc = action.reason;
            this._navigateToScheduleTarget(action.target, game);
            this.scheduleReached = false;
            return;
        }

        // 成功邀请！
        this._companionTarget = companion.id;
        this._actionTarget = { target: action.target, desc: action.reason };
        this.stateDesc = `和${companion.name}一起${action.reason}`;
this.expression = `${companion.name}，一起去${GST.NPC.ACTION_TARGETS[action.target] || action.target}吧！`;
        this.expressionTimer = 6;

        // 给companion注入跟随任务
        companion._isCompanion = true;
        companion._companionLeader = this.id;
        companion._companionDestination = action.target;
        companion._companionStartTime = Date.now();
        companion._actionOverride = true;
        companion._currentAction = { ...action, type: 'go_to', reason: `陪${this.name}一起去` };
        companion._actionTarget = { target: action.target, desc: `陪${this.name}去${action.reason}` };
        companion.stateDesc = `跟着${this.name}一起走`;
        companion.expression = `好啊，一起去！`;
        companion.expressionTimer = 5;
        companion.currentPath = [];
        companion.isMoving = false;
        companion._pendingEnterScene = null;
        companion.scheduleReached = false;

        // 双方都导航到目标
        this._navigateToScheduleTarget(action.target, game);
        this.scheduleReached = false;
        companion._navigateToScheduleTarget(action.target, game);

        // 好感度增加
        this.changeAffinity(companion.id, 3);
        companion.changeAffinity(this.id, 3);

        // 事件日志
        if (game.addEvent) {
game.addEvent(`🤝 ${this.name} 邀请 ${companion.name} 一起去${GST.NPC.ACTION_TARGETS[action.target] || action.target}`);
        }

        this.addMemory(`[同行] 邀请${companion.name}一起去${action.reason}`);
        companion.addMemory(`[同行] 被${this.name}邀请一起去${action.reason}`);
    }

    /**
     * 尝试邀请某人同行（非accompany类型时的简化版）
     */;

    proto._leaveAndWander = function(game) {
        this.scheduleReached = false;
        this._arrivalAwarenessApplied = -1;
        this._walkToDoorAndExit(game, () => {
            // 回到村庄后立刻去另一个地标
            if (this.currentScene === 'village' && !this.isSleeping && this.state !== 'CHATTING') {
                this._wanderToNearbyLandmark(game);
            }
        });
    };

    proto._onActionArrived = function(game) {
        const action = this._currentAction;
        if (!action) {
            this._clearActionOverride();
            return;
        }

        console.log(`[行动到达] ${this.name} 到达: ${action.target} (类型: ${action.type})`);

        // 根据行动类型执行到达后逻辑
        switch (action.type) {
            case 'rest':
                // 到达宿舍 → 检查是否在睡觉时段
                if (this.currentScene === this.homeName) {
                    // 已在宿舍，检查是否到达床位
                    const bedLoc = GST.SCHEDULE_LOCATIONS[this.homeName + '_inside'];
                    if (bedLoc) {
                        const pos = this.getGridPos();
                        const dist = Math.abs(pos.x - bedLoc.x) + Math.abs(pos.y - bedLoc.y);
                        if (dist > 3) {
                            this._pathTo(bedLoc.x, bedLoc.y, game);
                            return;
                        }
                    }                    // 【修复】只在睡觉时段才真正入睡，否则只是休息恢复体力
                    const restHour = game.getHour();
                    const isNightTime = this._isBedtime(restHour);
                    if (isNightTime) {
                        this.isSleeping = true;
                        this._forcedSleep = false; // 夜间正常入睡，非强制
                        this.stateDesc = '回家睡觉了';
                        this.expression = 'Zzz...';
                        this.expressionTimer = 8;
                        // AI模式日志：行动到达后入睡
                        if (this.game && this.game.aiModeLogger) {
                            const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                            this.game.aiModeLogger.log('SLEEP_START', `${this.name} 回家睡觉 | ${snap} | ${this.currentScene || '?'}`);
                        }
                    } else {
                        // 【硬保护B4】白天只是休息，体力在缓冲期内渐进恢复，不再瞬间恢复
                        // 移除了原来的 this.stamina += 15 瞬间恢复
                        this.stateDesc = '在家休息中';
                        this.expression = '休息一下，恢复精力~';
                        this.expressionTimer = 5;
                        // 【行为锁优化】白天休息改为条件驱动缓冲期：体力>=40或60秒游戏时间
                        this._restCooldownTimer = 60;
                        // 【行为锁】获取休息行为锁（优先级2=恢复行为）
                        this._acquireBehaviorLock('resting', GST.BEHAVIOR_PRIORITY.RECOVERY);
                        console.log(`[行动到达] ${this.name} 白天到家休息，进入休息缓冲期(体力>=40或60s)，体力渐进恢复中`);                    }                }
                break;

            case 'eat':
                // 到达餐饮场所 → 触发吃饭（复用饥饿系统的_startEating）
                if (!this.isEating) {
                    this._startEating(game);
                }
                break;

            case 'accompany':
            case 'go_to':
                // 普通到达
                this.expression = action.reason || '到了';
                this.expressionTimer = 5;
                // 【硬保护B6兜底】到达kitchen场景且饥饿时自动触发进食
                if (this.currentScene === 'kitchen' && this.hunger < 50 && !this.isEating) {
                    console.log(`[行动兜底] ${this.name} go_to到达kitchen且饥饿(${Math.round(this.hunger)})，自动开始吃饭`);
                    this._logDebug('action', `[行动兜底] go_to到达kitchen，自动开始吃饭`);
                    this._startEating(game);
                    this._hungerOverride = true;
                }
                // 【修复】accompany到达后自动和companion发起对话
                if (GST.CHAT_ENABLED && action.type === 'accompany' && this._companionTarget && game.dialogueManager) {
                    const comp = game.npcs.find(n => n.id === this._companionTarget);
                    if (comp && comp.currentScene === this.currentScene 
                        && comp.state !== 'CHATTING' && this.state !== 'CHATTING'
                        && this._canChatWith(comp)) {
                        setTimeout(() => {
                            if (comp.state !== 'CHATTING' && this.state !== 'CHATTING') {
                                game.dialogueManager.startNPCChat(this, comp);
                                if (game.addEvent) {
                                    game.addEvent(`🤝 ${this.name} 到达后和 ${comp.name} 开始聊天`);
                                }
                            }
                        }, 1000);
                    }
                }
                break;
        }

        // 【v4.15 核心修复】行动到达后进入"工作驻留"状态
        // 不立刻清除行动覆盖，而是保持_actionOverride=true + 清除_actionTarget
        // 这样NPC会安静地"在原地工作"，直到下一次LLM决策给出新行动
        // 解决了"NPC到达后立刻空闲 → 兜底分配新目标 → 来回跑"的循环问题
        if (this._restCooldownTimer > 0) {
            this.scheduleReached = true;
            this._actionTarget = null;
            this._currentAction = null;
            console.log(`[休息缓冲] ${this.name} 正在休息缓冲期，清除行动目标但保持覆盖状态`);
        } else {
            // 进入工作驻留：保持_actionOverride=true防止兜底触发，清除_actionTarget防止到达检测循环
            this._actionTarget = null;
            this._currentAction = null;
            this.scheduleReached = true;
            this.currentScheduleIdx = -1;
            // stateDesc保持不变（显示当前工作内容）
            this._logDebug('action', `[驻留] ${this.name} 到达目的地，进入工作驻留状态: ${this.stateDesc}`);
        }

        if (game.addEvent) {
            game.addEvent(`✅ ${this.name} 完成行动：${action.reason || action.type}`);
        }
    }

    /**
     * 同伴到达检测 — 跟随者到达目的地后的处理
     */;

    proto._tryInviteCompanion = function(companionName, targetKey, game) {
        const companion = game.npcs.find(n => n.name === companionName && n.id !== this.id);
        if (!companion) return;
        if (companion.currentScene !== this.currentScene) return;
        if (companion.isSleeping || companion.state === 'CHATTING' || companion._isBeingTreated || companion.isCrazy || companion._isCompanion) return;

        // 简化版邀请：给companion设置跟随
        companion._isCompanion = true;
        companion._companionLeader = this.id;
        companion._companionDestination = targetKey;
        companion._companionStartTime = Date.now();
        companion._actionOverride = true;
        companion._actionTarget = { target: targetKey, desc: `跟${this.name}同行` };
        companion.stateDesc = `跟着${this.name}一起走`;
        companion.currentPath = [];
        companion.isMoving = false;
        companion.scheduleReached = false;
        companion._navigateToScheduleTarget(targetKey, game);

        this.changeAffinity(companion.id, 2);
        companion.changeAffinity(this.id, 2);

        if (game.addEvent) {
            game.addEvent(`🤝 ${companion.name} 跟着 ${this.name} 一起走`);
        }
    }

    /**
     * 【任务3】角色默认生产行为回退 — 当LLM返回work但无任务分配时，根据角色自动选择有意义的行为
     */;

    proto._tryProactiveChat = function(game, nearby) {
        // 【全局聊天开关】开关关闭时不主动发起聊天
        if (!GST.CHAT_ENABLED) return;
        if (this.state === 'CHATTING') return;
        if (!game.dialogueManager) return;

        // 【修复】过了就寝时间禁止主动找人聊天（每个NPC就寝时间不同）
        const hour = game.getHour();
        if (this._isBedtime(hour)) return;

        // 过滤出可以聊天的、没在睡觉或对话中的NPC
        const candidates = nearby.filter(n => {
            const npc = game.npcs.find(np => np.id === n.id);
            return npc && npc.state !== 'CHATTING' && !npc.isSleeping && this._canChatWith(npc);
        });

        if (candidates.length === 0) return;

        // 随机选一个人搭话
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const target = game.npcs.find(np => np.id === pick.id);
        if (target) {
            game.dialogueManager.startNPCChat(this, target);
            if (game.addEvent) {
                game.addEvent(`🤝 ${this.name} 主动找 ${target.name} 聊天`);
            }
        }
    }

    /** 找不到人时，随机游荡到附近另一个户外地标 */;

    proto._updateActionOverride = function(dt, game) {
        const speedMult = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
        const realDt = speedMult > 0 ? dt / speedMult : dt;

        // 冷却递减
        if (this._actionDecisionCooldown > 0) this._actionDecisionCooldown -= realDt;

        // 检查pending intent（被挂起的意图，在高优先级状态解除后重新进入统一仲裁）
        if (this._pendingIntent && !this._actionOverride && !this._stateOverride && !this._hungerOverride
            && !this._isBeingTreated && !this._priorityOverride
            && !this._currentBehaviorLock && this.state !== 'CHATTING') {
            const pendingIntent = this._pendingIntent;
            this._pendingIntent = null;
            this._pendingAction = null;
            this._submitIntent(pendingIntent, game);
        } else if (this._pendingAction && !this._actionOverride && !this._stateOverride && !this._hungerOverride && !this._isBeingTreated) {
            // 兼容旧数据：如果只有pendingAction没有pendingIntent，沿用旧路径执行
            const pa = this._pendingAction;
            this._pendingAction = null;
            this._executeAction(pa, game);
        }

        // 同伴模式到达检测 + 超时释放
        if (this._isCompanion && this._companionDestination) {
            // 【修复】companion超时释放：跟随超过120秒（约2游戏小时）未到达则自动清除，恢复自主行为
            const companionElapsed = (Date.now() - this._companionStartTime) / 1000;
            if (companionElapsed > 120) {
                console.warn(`[NPC-${this.name}] companion跟随超时(${companionElapsed.toFixed(0)}s)，自动释放`);
                if (game.addEvent) {
                    const leader = game.npcs.find(n => n.id === this._companionLeader);
                    game.addEvent(`⏰ ${this.name}跟不上${leader ? leader.name : '同伴'}，决定自行行动`);
                }
                this._clearCompanionState();
                this._clearActionOverride();
                this.currentScheduleIdx = -1;
                this.scheduleReached = false;
            } else {
                this._checkCompanionArrival(dt, game);
            }
        }

        // 行动覆盖中 → 检查到达和卡住
        // 【一致性保护】检测_actionOverride与_actionTarget状态不一致
        // 【休息缓冲期例外】缓冲期中_actionTarget已被清除但_actionOverride保持，这是正常状态
        if (this._actionOverride && !this._actionTarget) {
            if (this._restCooldownTimer > 0) {
                // 休息缓冲期中，_actionTarget=null是预期行为，直接return不做到达检测
                return;
            }
            console.warn(`[NPC-${this.name}] [一致性修复] _actionOverride=true但_actionTarget=null，自动清除`);
            this._clearActionOverride();
            return;
        }
        if (!this._actionOverride && this._actionTarget) {
            console.warn(`[NPC-${this.name}] [一致性修复] _actionOverride=false但_actionTarget存在，清理_actionTarget`);
            this._actionTarget = null;
        }
        if (!this._actionOverride || !this._actionTarget) return;

        // 【关键修复】CHATTING状态下暂停行动覆盖的到达检测和传送，防止对话中被传送走导致隔空聊天
        if (this.state === 'CHATTING') return;

        const targetKey = this._actionTarget.target;
        const loc = GST.SCHEDULE_LOCATIONS[targetKey];
        if (!loc) {
            this._clearActionOverride();
            return;
        }

        // 检查是否到达
        const isDoorTarget = targetKey.endsWith('_door');
        const doorToScene = {
            warehouse_door: 'warehouse', medical_door: 'medical',
            dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
            kitchen_door: 'kitchen', workshop_door: 'workshop',
        };

        if (isDoorTarget) {
            const insideScene = doorToScene[targetKey];
            if (insideScene && this.currentScene === insideScene) {
                // NPC已在目标室内场景中，直接标记行动完成
                this._onActionArrived(game);
                return;
            }
        } else {
            // 户外目标：检查距离
            if (this.currentScene === loc.scene) {
                const pos = this.getGridPos();
                const dist = Math.abs(pos.x - loc.x) + Math.abs(pos.y - loc.y);
                if (dist <= 4) {
                    this._onActionArrived(game);
                    return;
                }
            }
        }

        // 卡住检测
        if (this.isMoving || this.currentPath.length > 0) {
            this._actionStuckTimer = 0;
            return;
        }

        this._actionStuckTimer += realDt;
        if (this._actionStuckTimer > 2) {
            this._actionStuckTimer = 0;
            this._navigateToScheduleTarget(targetKey, game);
        }

        // 超时兜底（20秒真实时间）
        this._actionTravelTimer += realDt;
        if (this._actionTravelTimer > 20) {
            this._actionTravelTimer = 0;
            // 直接传送到目标
            if (isDoorTarget) {
                const insideScene = doorToScene[targetKey];
                if (insideScene) {
                    this._enterIndoor(insideScene, game);
                    this._onActionArrived(game);
                }
            } else if (loc) {
                this._teleportTo(loc.scene, loc.x, loc.y);
                this._onActionArrived(game);
            }
            if (game.addEvent) {
                game.addEvent(`⚡ ${this.name} 赶到了目的地（行动传送兜底）`);
            }
        }
    }

    /**
     * 行动到达回调 — 执行到达后的特殊逻辑
     */;

    proto._updateIdleWatchdog = function(dt, game) {
        // 检测条件：NPC处于"黑洞状态"——没有任何系统在驱动它行动
        const isIdleBlackHole = (
            this.state !== 'CHATTING' &&
            !this.isMoving &&
            this.currentPath.length === 0 &&
            !this.isSleeping &&
            !this.isEating &&
            !(this._taskOverride && this._taskOverride.isActive) &&
            !this._actionOverride &&
            !this._stateOverride &&
            !this._hungerOverride &&
            !this._walkingToDoor &&
            !this._isBeingTreated &&
            !this._yieldMove &&
            !this._chatWalkTarget &&
            !this.isCrazy
        );

        const speedMult = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
        const realDt = speedMult > 0 ? dt / speedMult : dt;

        if (isIdleBlackHole) {
            this._idleWatchdogTimer += realDt;
        } else {
            this._idleWatchdogTimer = 0;
            return;
        }

        // 连续30秒发呆且无决策冷却时，强制触发一次行动决策（防止长时间空闲）
        if (this._idleWatchdogTimer > 30 && this._idleWatchdogTimer <= 40 && this._actionDecisionCooldown > 0) {
            this._actionDecisionCooldown = 0; // 清零冷却，允许立即触发决策
            this._logDebug('schedule', `[兜底] ${this.name} 空闲超过30秒，强制触发行动决策`);
        }

        // 连续20秒发呆，触发恢复（从10秒提高到20秒，减少误触发）
        if (this._idleWatchdogTimer > 20) {
            // 输出详细状态快照
            console.warn(`[NPC-${this.name}] [兜底] 发呆超时${Math.round(this._idleWatchdogTimer)}秒，触发自动恢复`, {
                actionOverride: this._actionOverride,
                actionTarget: this._actionTarget,
                stateOverride: this._stateOverride,
                hungerOverride: this._hungerOverride,
                taskOverride: this._taskOverride ? {
                    isActive: this._taskOverride.isActive,
                    taskId: this._taskOverride.taskId,
                    targetLocation: this._taskOverride.targetLocation
                } : null,
                priorityOverride: this._priorityOverride,
                scheduleReached: this.scheduleReached,
                currentScheduleIdx: this.currentScheduleIdx,
                scene: this.currentScene,
                pos: this.getGridPos()
            });

            // 清除所有可能残留的覆盖状态（使用统一兜底方法）
            this._clearAllOverrides();

            // 如果有被暂停的任务，优先恢复任务
            if (this._taskOverride && this._taskOverride.targetLocation && this._taskOverride.taskId) {
                this._resumeTaskOverride(game, 'idle_watchdog', 'watchdog');
                this._logDebug('schedule', `[兜底] ${this.name} 恢复被暂停的任务: ${this._taskOverride.taskId}`);
            }

            // 如果没有恢复任务，执行角色默认行动（去最擅长的采集点）
            if (!this._taskOverride || !this._taskOverride.isActive) {
                this._fallbackToRoleDefaultAction(game);
            }

            // 不再在事件日志刷屏，只记录debug日志
            this._logDebug('schedule', `[兜底] ${this.name} 发呆超时${Math.round(this._idleWatchdogTimer)}秒，强制恢复`);
            this._idleWatchdogTimer = 0;

            // 累计触发计数
            this._idleWatchdogCount++;
            const now = Date.now();
            if (now - this._idleWatchdogResetTime > 120000) {
                // 超过120秒，重置计数
                this._idleWatchdogCount = 1;
                this._idleWatchdogResetTime = now;
            }

            // 同一NPC在120秒内连续触发超过5次，强制传送到暖炉广场
            // 【修复】行为锁/吃饭/睡觉/治疗/休息缓冲期内不触发强制传送
            if (this._idleWatchdogCount > 5) {
                const isProtected = this.isEating || this.isSleeping || this._isBeingTreated
                    || this._restCooldownTimer > 0 || this._currentBehaviorLock;
                if (isProtected) {
                    console.log(`[NPC-${this.name}] [兜底] 反复发呆但处于保护状态(${this._currentBehaviorLock || 'protected'})，跳过强制传送`);
                    this._idleWatchdogCount = 0;
                } else {
                    // 不再传送到暖炉广场，而是执行角色默认行动
                    console.warn(`[NPC-${this.name}] [兜底] 120秒内发呆超过5次，强制执行默认行动`);
                    this._fallbackToRoleDefaultAction(game);
                    this._idleWatchdogCount = 0;
                }
            }
        }
    }

    // ============ LLM行动决策系统 ============

    /** 可选目标位置列表（供LLM选择） — 挂载到NPC构造函数上作为静态属性 */
    GST.NPC.ACTION_TARGETS = {
        'warehouse_door':  '仓库（盘点物资→减少浪费，辅助效果，室内）',
        'medical_door':    '医疗站（治疗→恢复健康，心理疏导→恢复San值，室内）',
        'dorm_a_door':     '宿舍A（休息、睡觉）',
        'dorm_b_door':     '宿舍B（休息、睡觉）',
        'kitchen_door':    '炊事房（做饭→食物加工减少浪费，辅助效果，室内）',
        'workshop_door':   '工坊（人工发电→电力+8/h，建造发电机/伐木机→自动化产出，室内）',
        'furnace_plaza':   '暖炉广场（取暖/安抚→恢复San值）',
        'lumber_yard':     '伐木场（砍柴→木柴+10/h，户外，需体力）',
        'lumber_camp':     '伐木营地（砍柴→木柴+10/h，户外，需体力）',
        'frozen_lake':     '冰湖（捕鱼→食物+8/h，户外，需体力）',
        'ore_pile':        '矿渣堆（采矿→电力+12/h，户外，需体力）',
        'ruins_site':      '废墟探索点（探索→随机获得物资，每天限3次，户外）',
    };

    /** 行动类型列表 */
    // 【精简行动】LLM可选的行动类型精简为3种，其余保留用于系统内部
    GST.NPC.ACTION_TYPES = ['go_to', 'rest', 'eat'];
    // 系统内部仍可使用的行动类型（拦截器改写、日程fallback等）
    GST.NPC.ALL_ACTION_TYPES = ['go_to', 'rest', 'eat', 'work', 'accompany', 'stay', 'wander'];

    /**
     * LLM行动决策 — 独立的AI调用，决定NPC下一步行动
     * 与think()是两个独立调用，信息汇总后决策
     */
    proto._actionDecision = async function(game) {
        if (this.isDead) return; // 💀 死亡NPC不做决策
        if (this._actionDecisionCooldown > 0) return;
        if (this.state === 'CHATTING') return;
        if (this.isSleeping) return;
        if (this.isCrazy) return; // 发疯中不做决策
        if (this.isSeekingShelter) return;
        if (this._isBeingTreated) return;
        if (this.isEating) return;
        // 【v4.14】夜间(22:00~6:00)不触发LLM决策，由日程系统驱动睡觉
        // 但如果NPC身体状况极差，仍然允许LLM决策（可能需要紧急就医）
        const decisionHour = game.getHour();
        if (this._isBedtime(decisionHour)) {
            const needsEmergencyDecision = this.health < 25 || this.stamina < 15 || this.bodyTemp < 35 || this.hunger < 15;
            if (!needsEmergencyDecision) {
                // 夜间正常状态，不做LLM决策，设一个短冷却让下次检查快速跳过
                this._actionDecisionCooldown = 30;
                return;
            }
        }
        // 如果已有行动在执行中，跳过决策（防止新决策打断正在执行的行动，导致"走一半转头"）
        if (this._actionOverride && this._currentAction) return;
        // 【关键修复v4.13】taskOverride激活时硬跳过LLM决策——
        // 防止LLM返回新决策覆盖stateDesc，导致action-effects关键词匹配串台
        // （如：council分配"建造发电机"→taskOverride设stateDesc="建造发电机"→
        //   LLM做新决策go_to workshop→stateDesc被改成其他→效果匹配成"人工发电"）
        if (this._taskOverride && this._taskOverride.isActive) {
            this._logDebug('action', `[决策跳过] taskOverride激活(${this._taskOverride.taskId})，跳过LLM行动决策`);
            return;
        }
        // 【修复】正在走向聊天目标时，不做新的行动决策（防止打断社交走路）
        if (this._chatWalkTarget) return;

        // 【硬保护】覆盖状态激活时跳过行动决策，防止LLM决策覆盖当前紧急行为
        if (this._hungerOverride) {
            this._logDebug('action', '[决策跳过] 处于饥饿覆盖中，跳过行动决策');
            return;
        }
        if (this._stateOverride) {
            this._logDebug('action', `[决策跳过] 处于状态覆盖(${this._stateOverride})中，跳过行动决策`);
            return;
        }
        if (this._priorityOverride) {
            this._logDebug('action', '[决策跳过] 处于P0紧急中，跳过行动决策');
            return;
        }
        if (this._walkingToDoor) {
            this._logDebug('action', '[决策跳过] 处于出门过程中，跳过行动决策');
            return;
        }
        if (this._currentBehaviorLock) {
            this._logDebug('action', `[决策跳过] 行为锁(${this._currentBehaviorLock.type})激活中，跳过行动决策`);
            return;
        }
        if (this._restCooldownTimer > 0) {
            this._logDebug('action', '[决策跳过] 处于休息缓冲期中，跳过行动决策');
            return;
        }

        // 【优化】动态决策间隔：危急时缩短，平时保持原间隔
        let dynamicInterval = this._actionDecisionInterval;
        const inDanger = this.stamina < 20 || this.health < 30 || this.sanity < 25 || this.hunger < 30;
        if (inDanger) {
            // 属性危险状态：10~20秒（v4.14加快响应）
            dynamicInterval = 10 + Math.random() * 10;
        } else if (game.resourceSystem && game.resourceSystem.getResourceTension() > 0.5) {
            // 资源紧张：15~30秒
            dynamicInterval = 15 + Math.random() * 15;
        }
        this._actionDecisionCooldown = dynamicInterval;

        const map = game.maps[this.currentScene];
        const pos = this.getGridPos();
        const hour = game.getHour();
        const isLateNight = this._isBedtime(hour);

        // 构建环境信息
        const envDesc = map ? map.describe(pos.x, pos.y) : this.currentScene;
        const nearby = this._getNearbyNPCs(game, 16);
        const nearbyStr = nearby.length > 0
            ? nearby.map(n => {
                const tags = [];
                if (n.isSick) tags.push('生病');
                if (n.health < 25) tags.push('健康差');
                if (n.stamina < 15) tags.push('疲惫');
                if (n.sanity < 25) tags.push('精神差');
                if (n.hunger < 20) tags.push('很饿');
                if (n.isCrazy) tags.push('发疯');
                const tagStr = tags.length > 0 ? `(${tags.join('、')})` : '';
                return `${n.name}${tagStr}`;
            }).join('、')
            : '附近没有人';

        // 当前日程信息
        const sched = this.scheduleTemplate;
        let currentScheduleDesc = '无日程';
        for (let i = 0; i < sched.length; i++) {
            const s = sched[i];
            const inRange = s.start <= s.end
                ? (hour >= s.start && hour < s.end)
                : (hour >= s.start || hour < s.end);
            if (inRange) {
                currentScheduleDesc = `${s.start}:00-${s.end}:00 ${s.desc}（目标：${s.target}）`;
                break;
            }
        }

        // 最近记忆
        const recentMemories = this.memories.slice(-5).map(m => `[${m.time}] ${m.text}`).join('\n');

        // think方法上次的思考
        const lastThought = this._lastActionThought || '暂无';

        // 可选目标列表
const targetList = Object.entries(GST.NPC.ACTION_TARGETS)
            .map(([key, desc]) => `  "${key}": ${desc}`)
            .join('\n');

        // 同场景所有NPC状态
        // 【P0修复】过滤已死亡NPC，避免LLM让存活NPC去"安抚"已死角色
        const allNPCStatus = game.npcs
            .filter(n => n.id !== this.id && !n.isDead)
            .map(n => {
                const tags = [];
                if (n.isSick) tags.push('生病');
                if (n.health < 25) tags.push('健康差');
                if (n.stamina < 20) tags.push('疲惫');
                if (n.sanity < 30) tags.push('精神差');
                if (n.hunger < 25) tags.push('饿');
                if (n.isCrazy) tags.push('发疯');
                if (n.isSleeping) tags.push('睡觉中');
                const tagStr = tags.length > 0 ? `[${tags.join('、')}]` : '[正常]';
                // 标注关系
                const aff = this.getAffinity(n.id);
                let relTag = '';
                if (aff >= 90) relTag = '❤️挚友';
                else if (aff >= 70) relTag = '💛好友';
                else if (aff >= 50) relTag = '友好';
                return `${n.name}(${n.getStatusLine()}) ${tagStr} 关系:${relTag || '一般'}`;
            }).join('\n');

        // 【挚友紧急告警】检测好友/挚友中是否有人精神状态极差
        // 【P0修复】过滤已死亡NPC，防止LLM安抚死人
        const friendsInCrisis = game.npcs.filter(n => 
            n.id !== this.id && !n.isDead && !n.isSleeping && this.getAffinity(n.id) >= 70
            && (n.sanity < 25 || n.isCrazy)
        );
        let friendCrisisHint = '';
        if (friendsInCrisis.length > 0 && this.sanity >= 40) {
            friendCrisisHint = `\n\n🚨🚨 紧急关心提醒：你的好朋友${friendsInCrisis.map(f => {
                const aff = this.getAffinity(f.id);
                const rel = aff >= 90 ? '挚友' : '好友';
                return `${f.name}（${rel}，San值:${Math.round(f.sanity)}${f.isCrazy ? '，正在发疯！' : ''}，在${f.getSceneLabel()}）`;
            }).join('、')}状态非常差！作为ta的朋友，你应该立刻去找ta，关心ta、安慰ta、陪ta去看医生。请在action中选择go_to前往ta所在的位置！`;
        }

        const systemPrompt = `你是「${this.name}」的行动决策AI。世界末日来临，极端寒冷天气侵袭小镇。你需要根据角色的当前状态、生存环境和人际关系，决定角色下一步应该做什么。

角色信息：
- 姓名：${this.name}，${this.age}岁，${this.occupation}
- 性格：${this.personality}
- 当前心情：${this.mood}
${game.weatherSystem ? `\n【生存状况】${game.weatherSystem.getSurvivalSummary()}` : ''}
${game.weatherSystem && game.weatherSystem.getBlizzardUrgencyForPrompt ? `\n${game.weatherSystem.getBlizzardUrgencyForPrompt()}` : ''}
${game.resourceSystem ? `资源: ${game.resourceSystem.getResourceStatusForPrompt()}` : ''}
${game.resourceSystem && game.resourceSystem.getUrgencyPrompt ? game.resourceSystem.getUrgencyPrompt() : ''}
${game.resourceSystem && game.resourceSystem.getResourceForecastForPrompt ? game.resourceSystem.getResourceForecastForPrompt() : ''}
${game.resourceSystem && game.resourceSystem.getSupplyRecommendationPrompt ? game.resourceSystem.getSupplyRecommendationPrompt() : ''}
${game.weatherSystem && (game.weatherSystem.currentDay === 1 || game.weatherSystem.currentDay === 3) ? '\n⏰ 现在是补给窗口期，建议全力采集物资！' : ''}
${game.resourceSystem ? `资源紧张度: ${game.resourceSystem.getResourceTension().toFixed(2)}/1.0${game.resourceSystem.getResourceTension() >= 0.3 ? '（紧张！减少社交，优先工作）' : game.resourceSystem.getResourceTension() >= 0.1 ? '（偏紧，注意资源）' : '（正常）'}` : ''}
${game.taskSystem ? `你的任务: ${game.taskSystem.getNpcTaskDescForPrompt(this.id)}` : ''}
${this.bodyTemp < 35 ? `🚨 你正在失温！体温: ${this.bodyTemp.toFixed(1)}°C` : ''}
${game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() > 1 ? game.reincarnationSystem.getPastLifeHintForThinking(game.mode === 'reincarnation') : ''}
${game.reincarnationSystem ? game.reincarnationSystem.getWorkPlanSummaryForNpc(this.id) : ''}
${game.reincarnationSystem ? (() => { const lessons = game.reincarnationSystem.getLessonsForNpc(this.id); return lessons ? '【前世教训·与你相关】' + lessons : ''; })() : ''}

决策规则：
1. 你的首要目标是在末日中存活。其次是帮助同伴存活。
2. 🎯【最高优先】你必须严格执行工作安排表中的分工（见上方安排表中★标记的任务）。安排表是全镇指挥中心基于前世教训制定的最优方案，不要擅自偏离！除非身体状态危急（体力<30/健康<30/体温<35°C），否则必须按安排执行。
3. 你有被分配的生存任务（见「你的任务」），应该优先完成任务。任务完成情况直接影响全镇生存。
3b. 🗳️【投票决策】如果刚开过紧急决策会议（见下方「投票决策分工」），你必须按投票结果行动！这是全体成员投票通过的方案，优先级仅次于生存紧急需求。
4. 🚨如果体力<30/健康<30/体温<35°C，必须立即回暖炉旁休息！priority=urgent！
4. 🚨如果精神<20，必须立刻恢复精神！否则你会发疯攻击朋友！priority=urgent！
5. 如果很饿，应该去吃饭，priority=urgent。
6. ${game.weatherSystem && !game.weatherSystem.canGoOutside() ? '🚨🚨 今天-60°C严禁外出！所有行动必须在室内！选择任何户外目标都等于去送死！' : ''}
7. ${game.weatherSystem && game.weatherSystem.currentDay === 2 ? '⚠️ 户外连续工作不得超过2小时！超时会严重冻伤！' : ''}
8. 如果有同伴倒下（严重失温/昏厥），你应该去救援他们。
9. 优先级：生存紧急需求 > 任务完成 > 健康恢复 > 自主行动。你不需要按照日程表行动，日程只是参考建议。你是一个有自主意志的角色，根据当前局势和你的判断来行动。
10. go_to是你最重要的行动——想砍柴就go_to伐木场，想发电就go_to工坊，想找人聊天就go_to那个人的位置。到达目的地后会自动触发对应的效果（采集/工作/社交等）。
11. priority说明：urgent=生存紧急（生死相关）, normal=立即执行, low=仅记录意向。
12. 下雨/大雪/暴风雪时不要去户外，应该选择室内场所。
13. 资源紧张度>0.3时，体力型角色（体力>30）应优先go_to到采集区产出资源（lumber_yard/frozen_lake/ruins_site），而不是去做辅助性工作。
⚠️ 但是：没有采集专长的角色（如老钱、苏岩）不应该去砍柴/采食物/人工发电，效率极低浪费时间！他们应该做自己擅长的事（安抚士气、治疗伤员等）。只有当所有采集岗位都已有人且自己无事可做时才考虑帮忙采集。
14. 你的角色专长：${this._getSpecialtyDescription()}，擅长的工作效率更高，优先选择擅长的任务。
${game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() > 1 ? '15. 🔮【轮回记忆·参考情报】上方有前世记忆信息。前世记忆是你做决策时的参考情报之一，你可以综合考虑但不需要每次都提及。你的行动决策应基于当前实际状况（资源、体力、天气等），前世经验作为辅助参考。' : '15. 这是第一世，你没有任何前世记忆。不要提及"上一世""前世""轮回"等概念，专注于当前的末日生存处境。'}

可选目标位置：
${targetList}

行动类型说明：
- go_to: 前往某地（必须指定target，到达后根据地点自动触发对应效果：采集资源/工作/社交等）
- rest: 回家休息/睡觉（体力低/天黑时选择）
- eat: 去炊事房吃饭（饥饿时选择，target选kitchen_door）

💡 提示：想找人聊天/陪伴某人？直接go_to到那个人所在的位置，到达后自然会触发对话。想工作？go_to到对应的工作地点即可。
`;
        const userPrompt = `当前时间：第${game.dayCount}天 ${game.getTimeStr()} ${game.getTimePeriod()}
天气：${game.weatherSystem ? game.weatherSystem.getWeatherStr() : game.weather}
温度：${game.weatherSystem ? game.weatherSystem.getEffectiveTemp() + '°C' : '未知'}
位置：${envDesc}
附近的人：${nearbyStr}

【你的状态】
当前位置：${this.getSceneLabel()}（${this.currentScene}）
状态摘要：${this.getStatusLine()}
体力：${Math.round(this.stamina)}/100（${this.getStaminaLevel()}）${this.stamina < 20 ? ' 🚨极低！' : ''}
健康：${Math.round(this.health)}/100${this.isSick ? ' 🤒生病中' : ''}${this.health < 35 ? ' 🚨危险！' : ''}
精神：${Math.round(this.sanity)}/100${this.sanity < 25 ? ' 🚨极度危险！可能随时发疯！' : (this.sanity < 35 ? ' ⚠️警告！' : '')}
饱食：${Math.round(this.hunger)}/100（${this.getHungerStatus()}）${this.hunger < 25 ? ' 🚨很饿！' : ''}
体温：${this.bodyTemp ? this.bodyTemp.toFixed(1) + '°C' : '36.5°C'}${this.bodyTemp < 35 ? ' 🚨失温！' : ''}${this.bodyTemp < 30 ? ' 🧊严重失温！' : ''}
${game.deathSystem && game.deathSystem.isNpcGrieving(this.id) ? '⚠️ 你正处于悲痛状态（效率降低）' : ''}
存款：${Math.round(this.savings)}元
${this.getGoalsSummary() ? `\n【你的目标】\n${this.getGoalsSummary()}\n→ 完成目标可以获得属性奖励（包括San值、魅力等），请主动朝目标努力！` : ''}

【当前日程（仅供参考，你完全可以自主决定做什么）】${currentScheduleDesc}
${isLateNight ? '🌙 现在是深夜了，除非有紧急事务，否则你应该回家休息（选rest）。' : '☀️ 白天时间，你可以自主决定做什么——采集资源、工作、找人聊天、探索废墟……一切由你决定。'}
【最近想法】${lastThought}
【最近记忆】
${recentMemories || '（暂无）'}

${this._hungerOverride ? '🍽️ 【重要】我正在去吃饭/正在吃饭中！除非有更紧急的事（如失温/濒死），否则不要改变目标，选eat！' : ''}
${this._taskOverride && this._taskOverride.isActive ? `📋 【重要】我正在执行任务：${this._taskOverride.taskId}，前往${this._taskOverride.targetLocation}，不要中途改道` : ''}
${this._councilTask ? `🗳️ 【投票决策分工】全体成员刚开过紧急决策会议，投票决定让我执行：「${this._councilTask}」。除非身体状态危急（体力<30/健康<30/体温<35°C），否则我必须按这个决策行动！这是大家投票通过的方案。` : ''}
${this._stateOverride ? `🚨 我正在紧急处理状态覆盖：${this._stateOverride}，选rest！` : ''}
${this._priorityOverride ? `⚠️ 当前P0紧急状态：${this._priorityOverride}，必须优先处理！` : ''}
【全镇NPC状态】
${allNPCStatus}
${friendCrisisHint}

请决定你的下一步行动。以「${this.name}」的第一人称视角思考，用你的性格和口吻来表达。用纯JSON回复：
{
  "threat_analysis": "（用第一人称、角色口吻说出最担心的事）",
  "opportunity_analysis": "（用角色口吻说出看到的希望）",
  "reasoning": "（一句话内心独白，要有角色性格特色）",
  "action": {
    "type": "go_to|rest|eat",
    "target": "目标位置key（从可选列表选，type为rest时可省略）",
    "reason": "行动原因（简短自然的口语化表达）",
    "priority": "urgent|normal|low"
  }
}}`;

        try {
            const raw = await GST.callLLM(systemPrompt, userPrompt, 500);  // 14B模型需要更多token空间

            // 【关键修复】await期间NPC可能已被设为CHATTING，不应再执行行动决策
            if (this.state === 'CHATTING') {
                this._logDebug('action', `行动决策返回时已在CHATTING，放弃决策结果`);
                return;
            }

            const parsed = GST.parseLLMJSON(raw);
            if (parsed && parsed.action) {
                const action = parsed.action;

                // 校验action.type
if (!GST.NPC.ACTION_TYPES.includes(action.type)) {
                    // LLM返回了非法类型，尝试智能纠正
                    if (action.type === 'work' || action.type === 'wander') {
                        // work/wander → 转为角色默认行为(go_to)
                        console.log(`[行动决策] ${this.name} 返回已废弃类型 ${action.type}，自动转为go_to角色默认`);
                        this._fallbackToRoleDefaultAction(game);
                        return;
                    } else if (action.type === 'stay') {
                        // stay → 不执行，让日程接管
                        console.log(`[行动决策] ${this.name} 返回stay，跳过让日程接管`);
                        return;
                    } else if (action.type === 'accompany' && action.target) {
                        // accompany → 转为go_to到目标位置
                        console.log(`[行动决策] ${this.name} 返回accompany，转为go_to ${action.target}`);
                        action.type = 'go_to';
                    } else {
                        console.warn(`[行动决策] ${this.name} 返回无效action.type: ${action.type}`);
                        return;
                    }
                }

                // 校验target（如果需要）
                if (['go_to', 'eat'].includes(action.type)) {
if (!action.target || !GST.NPC.ACTION_TARGETS[action.target]) {
                        // 允许 rest 不需要target（自动导航到家）
                        if (action.type !== 'rest') {
                            console.warn(`[行动决策] ${this.name} 返回无效target: ${action.target}`);
                            return;
                        }
                    }
                }

                // 过了就寝时间强制rest（每个NPC就寝时间不同）
                if (isLateNight && action.type !== 'rest') {
                    action.type = 'rest';
                    action.target = this.homeName + '_door';
                    action.reason = '该回宿舍睡觉了';
                    action.priority = 'normal';
                }

                // 【修复】白天(6:00~21:00)拦截rest决策，除非体力极低或生病
                if (!isLateNight && action.type === 'rest') {
                    const reallyNeedRest = this.stamina < 15 || this.isSick || this.health < 20;
                    if (!reallyNeedRest) {
                        console.log(`[行动决策] ${this.name} 白天想rest但身体状况良好，跳过让日程接管`);
                        return; // 不执行，让日程系统接管
                    }
                }

                // 下雨时修正户外目标
                if (game.isRaining() && action.target && NPC.OUTDOOR_TARGETS.has(action.target)) {
                    const alts = NPC.RAIN_INDOOR_ALTERNATIVES;
                    const alt = alts[Math.floor(Math.random() * alts.length)];
                    action.target = alt.target;
                    action.reason += '（下雨了，改去室内）';
                }

                // ============ 【任务9】决策硬性约束拦截 ============

                // 【拦截1】第4天(暴风雪天)-60°C严禁户外 → 强制回室内
                if (game.weatherSystem && !game.weatherSystem.canGoOutside()) {
                    if (action.target && NPC.OUTDOOR_TARGETS && NPC.OUTDOOR_TARGETS.has(action.target)) {
                        console.log(`[决策拦截] ${this.name} 第4天企图外出(${action.target})，强制回室内！`);
                        if (game.addEvent) game.addEvent(`🚫 ${this.name}想去${action.target}被拦截：暴风雪天严禁外出！`);
                        action.type = 'go_to';
                        action.target = this.homeName + '_door';
                        action.reason = '暴风雪天严禁外出，回室内避难';
                        action.priority = 'urgent';
                        this._logDebug('action', `[硬性拦截] 暴风雪天企图外出→强制回室内`);
                    }
                    // 第4天 rest也只能在室内
                    if (action.type === 'rest' && this.currentScene === 'village') {
                        action.type = 'go_to';
                        action.target = this.homeName + '_door';
                        action.reason = '暴风雪天必须回室内';
                        action.priority = 'urgent';
                    }
                }

                // 【拦截2】暴风雪期间强制户外NPC回室内
                if (game.weatherSystem && game.weatherSystem.currentWeather === '暴风雪' && this.currentScene === 'village') {
                    if (action.type !== 'go_to' || !action.target || NPC.OUTDOOR_TARGETS.has(action.target)) {
                        console.log(`[决策拦截] ${this.name} 暴风雪中在户外(village)，强制回室内！`);
                        if (game.addEvent) game.addEvent(`🌨️ ${this.name}在暴风雪中，被强制回室内避难！`);
                        action.type = 'go_to';
                        action.target = this.homeName + '_door';
                        action.reason = '暴风雪中必须立即回室内！';
                        action.priority = 'urgent';
                        this._logDebug('action', `[硬性拦截] 暴风雪户外→强制回室内`);
                    }
                }

                // 【拦截3】体温极低时强制回暖炉
                if (this.bodyTemp < 33) {
                    if (action.type !== 'rest' && action.type !== 'go_to') {
                        console.log(`[决策拦截] ${this.name} 体温${this.bodyTemp.toFixed(1)}°C极低，强制rest！`);
                        action.type = 'rest';
                        action.target = 'furnace_main';
                        action.reason = '严重失温，必须立即回暖炉旁！';
                        action.priority = 'urgent';
                        this._logDebug('action', `[硬性拦截] 体温${this.bodyTemp.toFixed(1)}°C→强制回暖炉`);
                    }
                }

                // 【拦截4】健康<10时强制去医院
                if (this.health < 10 && !this._isBeingTreated) {
                    if (action.target !== 'medical_door' && action.type !== 'rest') {
                        console.log(`[决策拦截] ${this.name} 健康${Math.round(this.health)}极低，强制去医院！`);
                        action.type = 'go_to';
                        action.target = 'medical_door';
                        action.reason = '健康濒危，必须立即去医院！';
                        action.priority = 'urgent';
                        this._logDebug('action', `[硬性拦截] 健康${Math.round(this.health)}→强制去医院`);
                    }
                }

                // 【拦截5】已废弃 — LLM不再返回wander/work，无需拦截

                // 记录决策理由
                if (parsed.reasoning) {
                    this._lastActionThought = parsed.reasoning;
                }

                // 【奖惩分析日志】记录LLM的威胁/机会分析
                const threatStr = parsed.threat_analysis || '未分析';
                const oppoStr = parsed.opportunity_analysis || '未分析';
                this._logDebug('reward', `⚖️ 奖惩分析 → 威胁:「${threatStr}」 机会:「${oppoStr}」`);

                console.log(`[行动决策] ${this.name}: type=${action.type} target=${action.target} priority=${action.priority} companion=${action.companion || '无'} 理由：${action.reason}`);
                console.log(`[奖惩分析] ${this.name}: 威胁="${threatStr}" 机会="${oppoStr}"`);
                // 【Debug日志】记录行动决策
                this._logDebug('action', `决策:${action.type} 目标:${action.target || '无'} 优先级:${action.priority} 同伴:${action.companion || '无'} 理由:${action.reason}${parsed.reasoning ? ' 思考:' + parsed.reasoning : ''}`);

                const intent = this._createIntentFromAction(action, {
                    source: 'llm',
                    category: 'action',
                    reasoning: parsed.reasoning || '',
                    threatAnalysis: threatStr,
                    opportunityAnalysis: oppoStr,
                });

                // 根据优先级处理
                // 第一阶段统一走意图提交入口，让LLM先形成intent，再由统一仲裁决定执行/挂起
                if (action.priority === 'urgent' || action.priority === 'normal') {
                    this._submitIntent(intent, game);
                } else {
                    // low优先级：仅记录意向，不直接进入执行层
                    this.addMemory(`[意向] ${action.reason}`);
                }

                // 事件日志 — 输出完整决策过程，让玩家看到LLM如何思考和协调
                if (game.addEvent) {
                    const emoji = action.priority === 'urgent' ? '🚨' : action.priority === 'normal' ? '🎯' : '🤔';
                    const targetLabel = GST.NPC.ACTION_TARGETS[action.target] ? action.target : '';
                    game.addEvent(`${emoji} ${this.name} 决策：${action.type}→${targetLabel || action.type} ${action.reason}`);
                }

                // 右侧「决策动态」面板 — 显示每个人的决策卡片
                this._addDecisionCard(action, parsed, game);
            }
        } catch (err) {
            console.error(`[行动决策] ${this.name} 调用失败:`, err);
        }
    }

    /**
     * 执行行动指令 — 将LLM返回的action转化为实际的NPC行为
     */;

    proto._wanderToNearbyLandmark = function(game) {
        if (this.currentScene !== 'village') return;
        // 可游荡的户外地标 + 建筑门口（可以进去找人）
        const landmarks = [
            { key: 'furnace_plaza', x: 25, y: 20, label: '暖炉广场' },
            { key: 'lumber_yard',   x: 8,  y: 8,  label: '伐木场' },
            { key: 'ruins',         x: 42, y: 8,  label: '废墟' },
            { key: 'warehouse_door', x: 16, y: 16, label: '仓库', enter: 'warehouse' },
            { key: 'medical_door',   x: 33, y: 16, label: '医疗站', enter: 'medical' },
            { key: 'dorm_a_door',    x: 16, y: 24, label: '宿舍A', enter: 'dorm_a' },
            { key: 'dorm_b_door',    x: 33, y: 24, label: '宿舍B', enter: 'dorm_b' },
            { key: 'kitchen_door',   x: 15, y: 31, label: '炊事房', enter: 'kitchen' },
            { key: 'workshop_door',  x: 24, y: 31, label: '工坊', enter: 'workshop' },
        ];
        const pos = this.getGridPos();
        // 过滤掉当前已在附近（5格内）的地标，选一个远一点的
        const candidates = landmarks.filter(l => {
            const d = Math.abs(pos.x - l.x) + Math.abs(pos.y - l.y);
            return d > 5;
        });
        if (candidates.length === 0) return;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        this.scheduleReached = false; // 重新标记为未到达，这样到达新地点后会再次触发感知
        this._arrivalAwarenessApplied = -1; // 重置感知标记
        this.stateDesc += `，去${pick.label}看看`;
        // 如果选中的是建筑门口，设置进入标记
        if (pick.enter) {
            this._pendingEnterScene = pick.enter;
            this._pendingEnterKey = pick.key;
        }
        this._pathTo(pick.x, pick.y, game);
    }

    /** 在室内找不到人时，先走到室内门口，再离开建筑回到村庄，再去别处找人 */;

})();
