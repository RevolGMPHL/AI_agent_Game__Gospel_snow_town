/**
 * 福音镇 - CouncilSystem 营地讨论系统
 * 暂停时弹出讨论弹窗，NPC们围绕当前局势进行聊天/分析/规划/抱怨
 * 挂载到 GST.CouncilSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

    // NPC头像颜色映射（与npc-renderer中一致）
    const NPC_COLORS = {
        'zhao_chef':    '#e07040',
        'lu_chen':      '#4080d0',
        'li_shen':      '#d06060',
        'su_doctor':    '#40b080',
        'ling_yue':     '#d0a040',
        'qing_xuan':    '#c070d0',
        'old_qian':     '#a09070',
        'wang_teacher': '#6080b0',
    };

    // NPC名字emoji
    const NPC_EMOJI = {
        'zhao_chef':    '🍳',
        'lu_chen':      '🪖',
        'li_shen':      '🧓',
        'su_doctor':    '🩺',
        'ling_yue':     '🎵',
        'qing_xuan':    '🧪',
        'old_qian':     '👴',
        'wang_teacher': '📚',
    };

    // ============ 投票系统触发阈值配置 ============
    const VOTE_TRIGGER_THRESHOLDS = {
        woodFuel: 15,     // 木柴低于15触发
        food: 20,         // 食物低于20触发
        power: 10,        // 电力低于10触发
        tension: 0.5,     // 综合紧张度超过0.5触发
        cooldownHours: 6, // 触发后冷却6游戏小时
    };

    class CouncilSystem {
        constructor(game) {
            this.game = game;
            this.isActive = false;
            this.messages = [];       // 讨论消息列表 [{ npcId, name, text, emoji }]
            this.participants = [];   // 参与讨论的NPC列表
            this.isGenerating = false;
            this.currentRound = 0;
            this.maxRounds = 6;       // 最多6轮发言（每轮1人）
            this._aborted = false;    // 用户关闭弹窗时中止生成

            // 投票系统状态
            this._isVotingMode = false;     // 是否为投票模式（资源危机触发）
            this._votingPhase = 'idle';     // idle | discuss | propose | vote | result
            this._proposals = [];           // 当前提案列表
            this._voteResults = {};         // 投票结果
            this._winnerProposal = null;    // 获胜方案
            this._lastVoteTriggerHour = -999; // 上次投票触发的游戏小时（用于冷却）
            this._triggerReason = '';        // 触发原因
            this._autoTriggered = false;     // 是否为自动触发（资源危机），自动触发结束后自动关闭弹窗
            this._openingCouncilMode = false; // 是否为首日开局晨会模式
            this._discussionSanRecovered = false; // 当前会议是否已结算讨论San恢复
            this._discussionSanRecoveryInfo = null; // 最近一次讨论San恢复信息

            // DOM缓存
            this.overlay = document.getElementById('council-overlay');
            this.body = document.getElementById('council-body');
            this.statusEl = document.getElementById('council-status');
            this.closeBtn = document.getElementById('council-close');
            this.moreBtn = document.getElementById('council-more');
            this.voteBtn = document.getElementById('council-vote');

            // 绑定事件
            if (this.closeBtn) {
                this.closeBtn.addEventListener('click', () => this.close());
            }
            if (this.overlay) {
                this.overlay.addEventListener('click', (e) => {
                    if (e.target === this.overlay) this.close();
                });
            }
            if (this.moreBtn) {
                this.moreBtn.addEventListener('click', () => this._continueDiscussion());
            }
            if (this.voteBtn) {
                this.voteBtn.addEventListener('click', () => this._startVotingProcess());
            }

            console.log('[CouncilSystem] 初始化完成（含投票系统）');
        }

        // ============ 资源危机检测（由game._onHourChange调用） ============

        /**
         * 检测是否应触发投票会议
         * @returns {boolean} 是否触发了会议
         */
        checkResourceCrisisTrigger() {
            if (this.isActive) return false; // 已在会议中

            const rs = this.game.resourceSystem;
            if (!rs) return false;

            // 冷却检查
            const currentGameHour = (this.game.dayCount - 1) * 24 + Math.floor(this.game.gameTimeSeconds / 3600);
            if (currentGameHour - this._lastVoteTriggerHour < VOTE_TRIGGER_THRESHOLDS.cooldownHours) {
                return false;
            }

            // 检测各项资源是否低于阈值
            const triggers = [];
            if (rs.woodFuel < VOTE_TRIGGER_THRESHOLDS.woodFuel) {
                triggers.push(`🪵木柴告急(${Math.round(rs.woodFuel)})`);
            }
            if (rs.food < VOTE_TRIGGER_THRESHOLDS.food) {
                triggers.push(`🍞食物告急(${Math.round(rs.food)})`);
            }
            if (rs.power < VOTE_TRIGGER_THRESHOLDS.power) {
                triggers.push(`⚡电力告急(${Math.round(rs.power)})`);
            }
            // 综合紧张度检测
            const tension = rs.getResourceTension ? rs.getResourceTension() : 0;
            if (tension >= VOTE_TRIGGER_THRESHOLDS.tension && triggers.length === 0) {
                triggers.push(`⚠️资源综合紧张度过高(${(tension * 100).toFixed(0)}%)`);
            }

            if (triggers.length === 0) return false;

            // 触发！
            this._lastVoteTriggerHour = currentGameHour;
            this._triggerReason = triggers.join('、');
            console.log(`[CouncilSystem] 资源危机触发投票会议: ${this._triggerReason}`);

            // 自动暂停游戏并弹出投票会议
            if (!this.game.paused) {
                this.game.paused = true;
                const btn = document.getElementById('btn-pause');
                if (btn) btn.textContent = '▶️';
            }
            this.game.addEvent(`🗳️ 资源危机！${this._triggerReason} —— 召开紧急决策会议`);
            this._autoTriggered = true; // 标记为自动触发，结束后自动关闭
            this.openVotingCouncil();
            return true;
        }

        /** 打开普通讨论弹窗（暂停时手动触发） */
        open() {
            if (this.isActive) return;
            this._isVotingMode = false;
            this._votingPhase = 'idle';
            this._autoTriggered = false; // 手动触发，不自动关闭
            this._openCommon();
            this._startDiscussion();
        }

        /** 打开投票决策会议（资源危机自动触发） */
        openVotingCouncil() {
            if (this.isActive) return;
            this._openingCouncilMode = false;
            this._isVotingMode = true;
            this._votingPhase = 'discuss';
            this._proposals = [];
            this._voteResults = {};
            this._winnerProposal = null;
            this._openCommon();

            // 投票模式标题不同
            const titleTime = document.getElementById('council-title-time');
            if (titleTime) {
                titleTime.textContent = `🗳️ 紧急决策 · 第${this.game.dayCount}天 ${this.game.getTimeStr()}`;
            }

            // 显示触发原因
            this._appendSystemMessage(`⚠️ ${this._triggerReason}，必须立即召开决策会议！`);

            // 开始讨论阶段（讨论完自动进入投票）
            this._startVotingDiscussion();
        }

        /** 打开首日开局晨会（自动触发） */
        openOpeningCouncil() {
            if (this.isActive) return false;
            if (this.game.dayCount !== 1) return false;

            // 【v4.15修复】晨会期间必须暂停游戏，防止NPC在讨论时还在执行行动（如来回乱跑）
            if (!this.game.paused) {
                this.game.paused = true;
                const btn = document.getElementById('btn-pause');
                if (btn) btn.textContent = '▶️';
            }
            // 冻结所有NPC移动：清除路径、设为IDLE、清除行动覆盖
            if (this.game.npcs) {
                for (const npc of this.game.npcs) {
                    if (npc.isDead) continue;
                    npc.currentPath = [];
                    npc.isMoving = false;
                    if (npc.state === 'WALKING') npc.state = 'IDLE';
                    // 清除正在执行的行动（晨会结束后由投票结果重新分配）
                    if (npc._actionOverride) {
                        npc._clearActionOverride();
                    }
                }
            }

            this._openingCouncilMode = true;
            this._autoTriggered = true;
            this._triggerReason = '天亮后必须先统一讨论今天的工作分配';
            this._isVotingMode = true;
            this._votingPhase = 'discuss';
            this._proposals = [];
            this._voteResults = {};
            this._winnerProposal = null;
            this._openCommon();

            const titleTime = document.getElementById('council-title-time');
            if (titleTime) {
                titleTime.textContent = `🌅 开局晨会 · 第${this.game.dayCount}天 ${this.game.getTimeStr()}`;
            }

            this._updateStatus('🌅 开局晨会——大家先讨论今天怎么分工...');
            this._appendSystemMessage('🌅 天亮了，所有人先回到室内开晨会，讨论今天的工作分配。');
            this._appendSystemMessage('📋 老钱拿出了昨夜整理的分工建议，但今天谁去做什么，要由大家现场讨论后决定。');
            this._startVotingDiscussion();
            return true;
        }

        /** 内部通用打开逻辑 */
        _openCommon() {
            this.isActive = true;
            this._aborted = false;
            this.messages = [];
            this.currentRound = 0;
            this._discussionSanRecovered = false;
            this._discussionSanRecoveryInfo = null;

            // ★ 创建冻结快照（唯一 isDead 过滤点） ★
            this._snapshot = GST.CouncilPromptBuilder.createSnapshot(this.game);
            this.participants = this._snapshot.aliveNpcs;
            if (this.participants.length === 0) {
                this.isActive = false;
                return;
            }

            // 显示弹窗
            this.overlay.style.display = 'flex';
            this.body.innerHTML = '';
            this._updateStatus(this._isVotingMode ? '🗳️ 紧急决策会议 — 讨论阶段...' : '💭 大家围坐在室内，开始讨论当前的处境...');
            if (this.moreBtn) this.moreBtn.style.display = 'none';
            if (this.voteBtn) this.voteBtn.style.display = 'none';

            // 更新标题时间
            const titleTime = document.getElementById('council-title-time');
            if (titleTime) {
                titleTime.textContent = `第${this.game.dayCount}天 ${this.game.getTimeStr()}`;
            }

            // 更新环境信息摘要
            this._renderSituationSummary();
        }

        /** 关闭讨论弹窗 */
        close() {
            this._aborted = true;
            this.isActive = false;
            this.isGenerating = false;
            this.overlay.style.display = 'none';

            // 清除自动关闭计时器（防止用户提前手动关闭时重复触发）
            if (this._autoCloseTimer) {
                clearTimeout(this._autoCloseTimer);
                this._autoCloseTimer = null;
            }

            // 取消暂停，继续游戏
            if (this.game.paused) {
                this.game.paused = false;
                const btn = document.getElementById('btn-pause');
                if (btn) btn.textContent = '⏸️';
            }
        }

        /** 计算讨论结束时的San恢复量（按难度递减） */
        _getDiscussionSanRecoveryAmount() {
            const sanDecayMult = this.game.getDifficultyMult ? this.game.getDifficultyMult('sanDecayMult') : 1.0;

            if (sanDecayMult >= 1.8) return 5;   // hell
            if (sanDecayMult >= 1.5) return 7;   // arctic
            if (sanDecayMult >= 1.3) return 10;  // harder
            if (sanDecayMult >= 1.2) return 12;  // hard
            if (sanDecayMult >= 1.1) return 13;  // normal
            return 15;                           // easy
        }

        /** 讨论结束后统一结算一次San恢复，防止继续讨论反复刷San */
        _applyDiscussionSanRecovery() {
            if (this._discussionSanRecovered) {
                return this._discussionSanRecoveryInfo;
            }

            const aliveParticipants = this._snapshot ? this._snapshot.aliveNpcs : [];
            const amount = this._getDiscussionSanRecoveryAmount();
            let recoveredCount = 0;
            let totalRecovered = 0;

            for (const npc of aliveParticipants) {
                const before = npc.sanity || 0;
                npc.sanity = Math.min(100, before + amount);
                const gained = npc.sanity - before;
                if (gained > 0) {
                    recoveredCount++;
                    totalRecovered += gained;
                }
            }

            const info = {
                amount: amount,
                recoveredCount: recoveredCount,
                totalRecovered: totalRecovered,
                participantCount: aliveParticipants.length,
            };

            this._discussionSanRecovered = true;
            this._discussionSanRecoveryInfo = info;

            if (recoveredCount > 0) {
                const totalRecoveredText = Number.isInteger(totalRecovered) ? totalRecovered : totalRecovered.toFixed(1);
                this._appendSystemMessage(`🧠 讨论让大家缓了口气：参与会议成员San +${amount}（${recoveredCount}人受益，合计恢复${totalRecoveredText}）`);
                if (this.game.addEvent) {
                    this.game.addEvent(`🧠 讨论结束：参与会议成员San +${amount}（${recoveredCount}人受益）`);
                }
            } else {
                this._appendSystemMessage('🧠 讨论让大家稳住了情绪，但本次无人需要恢复San。');
            }

            return info;
        }

        /** 渲染当前环境摘要 */
        _renderSituationSummary() {
            const summaryEl = document.getElementById('council-situation');
            if (!summaryEl) return;

            const game = this.game;
            const rs = game.resourceSystem;
            const ws = game.weatherSystem;
            const alive = this._snapshot.aliveNpcs;
            const deadNames = this._snapshot.deadNames;

            let html = '<div class="council-situation-grid">';

            // 天数/天气
            const dayNames = { 1: '准备日', 2: '寒冷天', 3: '喘息日', 4: '大极寒' };
            const dayName = dayNames[game.dayCount] || `第${game.dayCount}天`;
            html += `<div class="cs-item"><span class="cs-icon">📅</span>${dayName}</div>`;
            html += `<div class="cs-item"><span class="cs-icon">🌡️</span>${ws && ws.getEffectiveTemp ? ws.getEffectiveTemp().toFixed(0) + '°C' : '?'}</div>`;
            html += `<div class="cs-item"><span class="cs-icon">${game.weather === '暴风雪' ? '🌨️' : '☁️'}</span>${game.weather}</div>`;

            // 资源
            if (rs) {
                const woodH = Math.round(rs.getWoodFuelHoursRemaining());
                const foodM = Math.round(rs.getFoodMealsRemaining());
                html += `<div class="cs-item"><span class="cs-icon">🪵</span>木柴${Math.round(rs.woodFuel)}(${woodH}h)</div>`;
                html += `<div class="cs-item"><span class="cs-icon">🍞</span>食物${Math.round(rs.food)}(${foodM}餐)</div>`;
                html += `<div class="cs-item"><span class="cs-icon">⚡</span>电力${Math.round(rs.power)}</div>`;
            }

            // 人员
            html += `<div class="cs-item"><span class="cs-icon">👥</span>存活${alive.length}/${alive.length + deadNames.length}</div>`;
            if (deadNames.length > 0) {
                html += `<div class="cs-item cs-dead"><span class="cs-icon">💀</span>${deadNames.join('、')}</div>`;
            }

            html += '</div>';
            summaryEl.innerHTML = html;
        }

        // _getSituationContext / _buildCharacterCard / _buildAddressRules
        // 已迁移到 CouncilPromptBuilder

        /** 开始讨论 */
        async _startDiscussion() {
            if (this._aborted || !this.isActive) return;
            this.isGenerating = true;

            const speakers = this._selectSpeakers();
            const chatHistory = [];

            for (let i = 0; i < speakers.length; i++) {
                if (this._aborted || !this.isActive) break;

                const npc = speakers[i];
                this._updateStatus(`${NPC_EMOJI[npc.id] || '💬'} ${npc.name} 正在发言...`);

                const text = await this._generateCouncilLine(npc, chatHistory);
                if (this._aborted || !this.isActive) break;

                if (text) {
                    const msg = {
                        npcId: npc.id,
                        name: npc.name,
                        text: text,
                        emoji: NPC_EMOJI[npc.id] || '💬',
                    };
                    this.messages.push(msg);
                    chatHistory.push(`${npc.name}说：${text}`);
                    this._appendMessage(msg);
                    this.currentRound++;
                }

                // 短暂延迟，让用户看到逐条出现的效果
                if (i < speakers.length - 1) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            this.isGenerating = false;
            if (!this._aborted && this.isActive) {
                this._applyDiscussionSanRecovery();
                this._updateStatus('✅ 讨论告一段落，即将发起投票...');
                if (this.moreBtn) this.moreBtn.style.display = 'none';
                if (this.voteBtn) this.voteBtn.style.display = 'none';
                // 讨论结束后自动进入投票流程
                await new Promise(r => setTimeout(r, 1000));
                if (!this._aborted && this.isActive) {
                    await this._startVotingProcess();
                }
            }
        }

        /** 继续讨论（点击"继续讨论"按钮） */
        async _continueDiscussion() {
            if (this.isGenerating || this._aborted) return;
            if (this.moreBtn) this.moreBtn.style.display = 'none';

            this.isGenerating = true;
            const chatHistory = this.messages.map(m => `${m.name}说：${m.text}`);

            // 再选2-3人发言
            const speakers = this._selectSpeakers(2 + Math.floor(Math.random() * 2));

            for (let i = 0; i < speakers.length; i++) {
                if (this._aborted || !this.isActive) break;

                const npc = speakers[i];
                this._updateStatus(`${NPC_EMOJI[npc.id] || '💬'} ${npc.name} 正在发言...`);

                const text = await this._generateCouncilLine(npc, chatHistory);
                if (this._aborted || !this.isActive) break;

                if (text) {
                    const msg = {
                        npcId: npc.id,
                        name: npc.name,
                        text: text,
                        emoji: NPC_EMOJI[npc.id] || '💬',
                    };
                    this.messages.push(msg);
                    chatHistory.push(`${npc.name}说：${text}`);
                    this._appendMessage(msg);
                }

                if (i < speakers.length - 1) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            this.isGenerating = false;
            if (!this._aborted && this.isActive) {
                this._applyDiscussionSanRecovery();
                this._updateStatus('✅ 讨论告一段落，即将发起投票...');
                if (this.moreBtn) this.moreBtn.style.display = 'none';
                if (this.voteBtn) this.voteBtn.style.display = 'none';
                // 继续讨论后也自动进入投票
                await new Promise(r => setTimeout(r, 1000));
                if (!this._aborted && this.isActive) {
                    await this._startVotingProcess();
                }
            }
        }

        /** 选择发言NPC：优先关键角色，随机打乱 */
        _selectSpeakers(count) {
            const alive = this._snapshot.aliveNpcs;
            count = count || Math.min(alive.length, 3 + Math.floor(Math.random() * 3));
            if (alive.length === 0) return [];

            const priority = [];
            const pushPriority = id => {
                if (!priority.includes(id) && alive.some(n => n.id === id)) {
                    priority.push(id);
                }
            };

            pushPriority('old_qian');
            pushPriority('su_doctor');

            const situation = this._snapshot && this._snapshot.situation ? this._snapshot.situation : '';
            if (/自动发电机|自动伐木机|人工发电|木柴|食物|伤员|San/.test(situation)) {
                pushPriority('li_shen');
                pushPriority('lu_chen');
                pushPriority('wang_teacher');
                pushPriority('zhao_chef');
            }

            if (alive.some(n => n.id === 'li_shen') && alive.some(n => n.id === 'lu_chen')) {
                pushPriority('li_shen');
                pushPriority('lu_chen');
            }

            const sorted = [...alive].sort((a, b) => {
                const ai = priority.indexOf(a.id);
                const bi = priority.indexOf(b.id);
                if (ai >= 0 && bi >= 0) return ai - bi;
                if (ai >= 0) return -1;
                if (bi >= 0) return 1;
                return Math.random() - 0.5;
            });

            const selected = [];
            for (const npc of sorted) {
                if (selected.length >= count) break;
                selected.push(npc);
            }

            for (let i = selected.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [selected[i], selected[j]] = [selected[j], selected[i]];
            }
            return selected;
        }

        /** 生成单条讨论发言（委托给 CouncilPromptBuilder） */
        async _generateCouncilLine(npc, chatHistory) {
            const Builder = GST.CouncilPromptBuilder;
            const { systemPrompt, userPrompt, maxTokens } = Builder.buildDiscussionPrompt(this._snapshot, npc, chatHistory);

            try {
                let reply = await GST.callLLMDirect(systemPrompt, userPrompt, maxTokens);
                if (!reply) {
                    reply = Builder.getGroundedFallback(npc.id, this._snapshot);
                }
                const allNames = this.game.npcs.map(n => n.name);
                reply = Builder.cleanReply(reply, allNames);
                if (Builder.isReplyContradictingSnapshot && Builder.isReplyContradictingSnapshot(this._snapshot, reply)) {
                    reply = Builder.getGroundedFallback(npc.id, this._snapshot);
                }
                // 【v4.15】第一世时过滤掉LLM脑补的前世/轮回词汇
                const sit = this._snapshot.situation || '';
                const isFirstLife = !sit.includes('前世记忆') && !sit.includes('已轮回');
                if (isFirstLife && /上辈子|上一世|前世|轮回|上次咱们|上次我们|以前咱们就|以前我们就/.test(reply)) {
                    console.warn(`[CouncilSystem] 第一世过滤：${npc.name}的发言包含前世词汇，使用兜底台词`);
                    reply = Builder.getGroundedFallback(npc.id, this._snapshot);
                }
                return reply;
            } catch (err) {
                console.error('[CouncilSystem] 生成发言失败:', err);
                return Builder.getGroundedFallback(npc.id, this._snapshot);
            }
        }

        /** 向弹窗中追加一条消息 */
        _appendMessage(msg) {
            const div = document.createElement('div');
            div.className = 'council-message';

            const color = NPC_COLORS[msg.npcId] || '#888';
            div.innerHTML = `
                <div class="council-msg-avatar" style="background:${color};">
                    <span class="council-msg-emoji">${msg.emoji}</span>
                </div>
                <div class="council-msg-content">
                    <div class="council-msg-name" style="color:${color};">${msg.name}</div>
                    <div class="council-msg-text">${msg.text}</div>
                </div>
            `;

            // 入场动画
            div.style.opacity = '0';
            div.style.transform = 'translateY(10px)';
            this.body.appendChild(div);

            // 触发动画
            requestAnimationFrame(() => {
                div.style.transition = 'opacity 0.3s, transform 0.3s';
                div.style.opacity = '1';
                div.style.transform = 'translateY(0)';
            });

            // 滚动到底部
            this.body.scrollTop = this.body.scrollHeight;
        }

        /** 更新状态文字 */
        _updateStatus(text) {
            if (this.statusEl) {
                this.statusEl.textContent = text;
            }
        }

        // ============================================================
        //  投票决策系统 — 讨论→提案→投票→结果→应用
        // ============================================================

        /** 投票模式的讨论阶段（讨论完自动进入提案阶段） */
        async _startVotingDiscussion() {
            if (this._aborted || !this.isActive) return;
            this.isGenerating = true;
            this._votingPhase = 'discuss';

            const speakers = this._selectSpeakers(Math.min(this.participants.length, 4));
            const chatHistory = [];

            for (let i = 0; i < speakers.length; i++) {
                if (this._aborted || !this.isActive) break;

                const npc = speakers[i];
                this._updateStatus(`🗣️ ${NPC_EMOJI[npc.id] || '💬'} ${npc.name} 正在分析局势...`);

                const text = await this._generateCouncilLine(npc, chatHistory);
                if (this._aborted || !this.isActive) break;

                if (text) {
                    const msg = {
                        npcId: npc.id,
                        name: npc.name,
                        text: text,
                        emoji: NPC_EMOJI[npc.id] || '💬',
                    };
                    this.messages.push(msg);
                    chatHistory.push(`${npc.name}说：${text}`);
                    this._appendMessage(msg);
                    this.currentRound++;
                }

                if (i < speakers.length - 1) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            this.isGenerating = false;
            if (!this._aborted && this.isActive) {
                this._applyDiscussionSanRecovery();
                // 自动进入提案阶段
                this._appendSystemMessage('📋 讨论结束，开始整理行动方案...');
                await new Promise(r => setTimeout(r, 500));
                await this._generateProposals(chatHistory);
            }
        }

        /** 手动触发投票流程（普通讨论模式下点击"发起投票"按钮） */
        async _startVotingProcess() {
            if (this.isGenerating || this._aborted) return;
            this._isVotingMode = true;
            this._votingPhase = 'propose';
            this._proposals = [];
            this._voteResults = {};
            this._winnerProposal = null;

            if (this.moreBtn) this.moreBtn.style.display = 'none';
            if (this.voteBtn) this.voteBtn.style.display = 'none';

            const chatHistory = this.messages.map(m => `${m.name}说：${m.text}`);

            this._appendSystemMessage('📋 开始整理行动方案...');
            await new Promise(r => setTimeout(r, 300));
            await this._generateProposals(chatHistory);
        }

        /** 提案阶段：用LLM根据讨论内容生成2-3个行动方案 */
        async _generateProposals(chatHistory) {
            if (this._aborted || !this.isActive) return;
            this.isGenerating = true;
            this._votingPhase = 'propose';

            this._updateStatus('📋 正在整理行动方案...');

            const alive = this._snapshot.aliveNpcs;
            const Builder = GST.CouncilPromptBuilder;
            const { systemPrompt, userPrompt, maxTokens } = Builder.buildProposalPrompt(this._snapshot, chatHistory);

            try {
                const reply = await GST.callLLMDirect(systemPrompt, userPrompt, maxTokens);
                const parsed = this._parseJSON(reply);

                if (parsed && parsed.proposals && parsed.proposals.length > 0) {
                    this._proposals = parsed.proposals;
                } else {
                    // 兜底方案
                    this._proposals = this._getDefaultProposals(alive);
                }
            } catch (err) {
                console.error('[CouncilSystem] 提案生成失败:', err);
                this._proposals = this._getDefaultProposals(alive);
            }

            // 【补全】确保每个方案都给所有存活NPC分配了任务
            this._fillMissingAssignments(alive);

            if (this._aborted || !this.isActive) return;

            // 渲染提案卡片
            this._renderProposals();

            // 自动进入投票阶段
            await new Promise(r => setTimeout(r, 800));
            await this._executeVoting();
        }

        /** 渲染提案卡片到弹窗中 */
        _renderProposals() {
            for (let i = 0; i < this._proposals.length; i++) {
                const p = this._proposals[i];
                const div = document.createElement('div');
                div.className = 'council-proposal-card';
                let assignHtml = '';
                if (p.assignments) {
                    assignHtml = Object.entries(p.assignments).map(([name, task]) => {
                        const npc = this.participants.find(n => n.name === name);
                        const emoji = npc ? (NPC_EMOJI[npc.id] || '👤') : '👤';
                        return `<div class="cp-assign">${emoji} ${name} → ${task}</div>`;
                    }).join('');
                }
                div.innerHTML = `
                    <div class="cp-header">
                        <span class="cp-number">${i + 1}</span>
                        <span class="cp-name">${p.name}</span>
                    </div>
                    <div class="cp-desc">${p.description}</div>
                    <div class="cp-assignments">${assignHtml}</div>
                    <div class="cp-reason">${p.reasoning}</div>
                `;
                div.style.opacity = '0';
                div.style.transform = 'translateY(10px)';
                this.body.appendChild(div);
                requestAnimationFrame(() => {
                    div.style.transition = 'opacity 0.4s, transform 0.4s';
                    div.style.opacity = '1';
                    div.style.transform = 'translateY(0)';
                });
            }
            this.body.scrollTop = this.body.scrollHeight;
        }

        /** 投票阶段：每个NPC独立投票 */
        async _executeVoting() {
            if (this._aborted || !this.isActive) return;
            this.isGenerating = true;
            this._votingPhase = 'vote';

            this._appendSystemMessage('🗳️ 开始投票表决！每位成员选择自己支持的方案...');
            await new Promise(r => setTimeout(r, 500));

            const alive = this._snapshot.aliveNpcs;
            this._voteResults = {};
            for (let i = 0; i < this._proposals.length; i++) {
                this._voteResults[i] = { votes: 0, voters: [], reasons: [] };
            }

            const proposalSummary = this._proposals.map((p, i) =>
                `方案${i + 1}「${p.name}」: ${p.description}${p.assignments ? '\n  分工: ' + Object.entries(p.assignments).map(([n, t]) => `${n}→${t}`).join('、') : ''}`
            ).join('\n');

            const Builder = GST.CouncilPromptBuilder;

            for (const npc of alive) {
                if (this._aborted || !this.isActive) break;

                this._updateStatus(`🗳️ ${NPC_EMOJI[npc.id] || '💬'} ${npc.name} 正在投票...`);

                const { systemPrompt: voteSystemPrompt, userPrompt: voteUserPrompt, maxTokens: voteMaxTokens } =
                    Builder.buildVotePrompt(this._snapshot, npc, proposalSummary);

                try {
                    const reply = await GST.callLLMDirect(voteSystemPrompt, voteUserPrompt, voteMaxTokens);
                    const result = this._parseJSON(reply);

                    if (result && result.vote) {
                        const voteIdx = parseInt(result.vote) - 1;
                        if (voteIdx >= 0 && voteIdx < this._proposals.length) {
                            this._voteResults[voteIdx].votes++;
                            this._voteResults[voteIdx].voters.push(npc.name);
                            this._voteResults[voteIdx].reasons.push({ name: npc.name, reason: result.reason || '' });

                            // 渲染投票消息
                            this._appendMessage({
                                npcId: npc.id,
                                name: npc.name,
                                text: `🗳️ 我投 方案${voteIdx + 1}「${this._proposals[voteIdx].name}」—— ${result.reason || ''}`,
                                emoji: NPC_EMOJI[npc.id] || '💬',
                            });
                        } else {
                            this._appendMessage({
                                npcId: npc.id,
                                name: npc.name,
                                text: '🤷 ……（弃权）',
                                emoji: NPC_EMOJI[npc.id] || '💬',
                            });
                        }
                    } else {
                        this._appendMessage({
                            npcId: npc.id,
                            name: npc.name,
                            text: '🤷 ……（弃权）',
                            emoji: NPC_EMOJI[npc.id] || '💬',
                        });
                    }
                } catch (err) {
                    console.error(`[CouncilSystem] ${npc.name}投票失败:`, err);
                    this._appendMessage({
                        npcId: npc.id,
                        name: npc.name,
                        text: '🤷 ……（沉默）',
                        emoji: NPC_EMOJI[npc.id] || '💬',
                    });
                }

                await new Promise(r => setTimeout(r, 300));
            }

            if (this._aborted || !this.isActive) return;

            // ===== 玩家投票阶段（10秒限时） =====
            await this._playerVotePhase();

            if (this._aborted || !this.isActive) return;

            // 显示结果
            await this._showVoteResults();
        }

        /** 玩家投票阶段：显示可点击方案 + 10秒倒计时 */
        async _playerVotePhase() {
            return new Promise((resolve) => {
                if (this._aborted || !this.isActive) { resolve(); return; }

                const TIMEOUT = 10;
                let remaining = TIMEOUT;
                let voted = false;

                // 渲染玩家投票区域
                const voteDiv = document.createElement('div');
                voteDiv.className = 'council-player-vote';
                voteDiv.innerHTML = `
                    <div class="cpv-header">🎮 <b>你的投票</b> <span class="cpv-timer" id="cpv-timer">${remaining}s</span></div>
                    <div class="cpv-hint">点击选择你支持的方案（超时自动弃票）</div>
                    <div class="cpv-options" id="cpv-options"></div>
                `;
                this.body.appendChild(voteDiv);

                const optionsEl = voteDiv.querySelector('#cpv-options');
                for (let i = 0; i < this._proposals.length; i++) {
                    const p = this._proposals[i];
                    const btn = document.createElement('button');
                    btn.className = 'cpv-btn';
                    btn.innerHTML = `<span class="cpv-num">${i + 1}</span> ${p.name}`;
                    btn.addEventListener('click', () => {
                        if (voted) return;
                        voted = true;
                        clearInterval(timer);

                        // 记录玩家投票
                        this._voteResults[i].votes++;
                        this._voteResults[i].voters.push('🎮玩家');
                        this._voteResults[i].reasons.push({ name: '🎮玩家', reason: '' });

                        this._appendSystemMessage(`🎮 你投了 方案${i + 1}「${p.name}」`);

                        // 高亮选中
                        btn.classList.add('cpv-selected');
                        voteDiv.querySelector('.cpv-timer').textContent = '✓';
                        voteDiv.querySelector('.cpv-hint').textContent = '已投票！';

                        setTimeout(resolve, 500);
                    });
                    optionsEl.appendChild(btn);
                }

                this.body.scrollTop = this.body.scrollHeight;

                // 倒计时
                const timerEl = voteDiv.querySelector('#cpv-timer');
                const timer = setInterval(() => {
                    remaining--;
                    if (timerEl) timerEl.textContent = `${remaining}s`;
                    if (remaining <= 0) {
                        clearInterval(timer);
                        if (!voted) {
                            voted = true;
                            this._appendSystemMessage('🎮 玩家超时未投票（弃票）');
                            if (timerEl) timerEl.textContent = '弃票';
                            voteDiv.querySelector('.cpv-hint').textContent = '已超时弃票';
                            setTimeout(resolve, 500);
                        }
                    }
                }, 1000);
            });
        }

        /** 显示投票结果 + 老钱总结 */
        async _showVoteResults() {
            this._votingPhase = 'result';

            // 排序
            const sorted = Object.entries(this._voteResults)
                .map(([idx, data]) => ({ idx: parseInt(idx), ...data, proposal: this._proposals[parseInt(idx)] }))
                .sort((a, b) => b.votes - a.votes);

            const maxVotes = sorted[0] ? sorted[0].votes : 0;
            const totalVoters = this._snapshot.aliveNpcs.length;
            const winners = sorted.filter(r => r.votes === maxVotes);

            // 渲染结果面板
            const resultDiv = document.createElement('div');
            resultDiv.className = 'council-vote-result';
            let resultHtml = '<div class="cvr-title">📊 投票结果</div>';

            for (let i = 0; i < sorted.length; i++) {
                const r = sorted[i];
                const isWinner = i === 0 && r.votes > 0;
                const pct = totalVoters > 0 ? Math.round(r.votes / totalVoters * 100) : 0;
                const barWidth = totalVoters > 0 ? (r.votes / totalVoters * 100) : 0;

                resultHtml += `
                    <div class="cvr-item ${isWinner ? 'cvr-winner' : ''}">
                        <div class="cvr-name">${isWinner ? '🏆' : ''} 方案${r.idx + 1}「${r.proposal.name}」</div>
                        <div class="cvr-bar-wrap">
                            <div class="cvr-bar" style="width:${barWidth}%"></div>
                            <span class="cvr-bar-text">${r.votes}票 (${pct}%)</span>
                        </div>
                        <div class="cvr-voters">${r.voters.join('、') || '无人投票'}</div>
                    </div>`;
            }

            // 平票处理
            if (winners.length > 1 && maxVotes > 0) {
                resultHtml += `<div class="cvr-tie">⚠️ 出现平票！由镇长老钱裁决 → 选择「${winners[0].proposal.name}」</div>`;
            }

            resultDiv.innerHTML = resultHtml;
            resultDiv.style.opacity = '0';
            this.body.appendChild(resultDiv);
            requestAnimationFrame(() => {
                resultDiv.style.transition = 'opacity 0.5s';
                resultDiv.style.opacity = '1';
            });
            this.body.scrollTop = this.body.scrollHeight;

            this._winnerProposal = sorted[0] ? sorted[0].proposal : null;

            // 老钱总结发言
            if (this._winnerProposal) {
                await new Promise(r => setTimeout(r, 600));
                this._updateStatus('👴 老钱正在做总结发言...');

                const Builder = GST.CouncilPromptBuilder;
                const { systemPrompt: sumSys, userPrompt: sumUser, maxTokens: sumMax } =
                    Builder.buildSummaryPrompt(this._snapshot, this._winnerProposal);

                try {
                    let reply = await GST.callLLMDirect(sumSys, sumUser, sumMax);
                    if (reply) {
                        const allNames = this.game.npcs.map(n => n.name);
                        reply = Builder.cleanReply(reply, allNames);
                        this._appendMessage({
                            npcId: 'old_qian',
                            name: '老钱',
                            text: reply,
                            emoji: '👴',
                        });
                    }
                } catch (err) {
                    this._appendMessage({
                        npcId: 'old_qian',
                        name: '老钱',
                        text: '好！就这么定了！大伙儿打起精神来，咱们一起扛过去！',
                        emoji: '👴',
                    });
                }

                // 应用到任务系统
                this._applyWinnerToTaskSystem();
            }

            this.isGenerating = false;
            if (this._openingCouncilMode) {
                this.game.addEvent(`🌅 晨会决议：第1天执行「${this._winnerProposal ? this._winnerProposal.name : '未知'}」方案`);
            } else {
                this.game.addEvent(`🗳️ 决策会议结果：执行「${this._winnerProposal ? this._winnerProposal.name : '未知'}」方案`);
            }

            // 【关键修复】自动触发的投票会议，结束后自动关闭弹窗恢复游戏
            // 手动暂停触发的讨论/投票，需要用户手动关闭
            if (this._autoTriggered) {
                this._updateStatus(this._openingCouncilMode ? '✅ 晨会结束！3秒后开始执行今日分工...' : '✅ 投票决策完成！3秒后自动继续游戏...');
                this._autoCloseTimer = setTimeout(() => {
                    if (this.isActive) {
                        console.log('[CouncilSystem] 自动触发的投票会议结束，自动关闭弹窗恢复游戏');
                        this.close();
                    }
                }, 3000);
            } else {
                this._updateStatus('✅ 投票决策完成！关闭弹窗继续游戏。');
            }
        }

        /** 将获胜方案应用到任务系统 */
        _applyWinnerToTaskSystem() {
            if (!this._winnerProposal || !this._winnerProposal.assignments) return;

            console.log('[CouncilSystem] 将投票结果应用到任务系统:', this._winnerProposal.name);

            if (this._openingCouncilMode && this.game.taskSystem && this.game.taskSystem.applyCouncilAssignments) {
                const applied = this.game.taskSystem.applyCouncilAssignments(this._winnerProposal, { day: this.game.dayCount });
                if (applied) {
                    return;
                }
            }

            // ============================================================
            // 【核心映射表】投票任务关键词 → 目标位置 + stateDesc + resourceType
            // stateDesc 必须精确匹配 ACTION_EFFECT_MAP 中的关键词，这样 NPC 到达后
            // _updateActionEffect 就能检测到关键词并触发实际效果
            // ============================================================
            const TASK_ACTION_MAP = [
                // ---- 采集类（到达坐标区域后 _updateGathering 自动产出）----
                { keywords: ['砍柴', '伐木', '木柴', '木材', '柴火', '木头', '薪火'],
                  target: 'lumber_yard', stateDesc: '砍柴', resourceType: 'woodFuel', desc: '去伐木场砍柴' },
                { keywords: ['捕鱼', '采集食物', '食物', '抓鱼', '钓鱼', '打鱼', '冰湖'],
                  target: 'frozen_lake', stateDesc: '采集食物', resourceType: 'food', desc: '去冰湖采集食物' },
                { keywords: ['采矿', '矿', '矿石', '矿渣'],
                  target: 'ore_pile', stateDesc: '采矿', resourceType: 'power', desc: '去矿渣堆采矿' },
                { keywords: ['探索', '废墟', '搜索', '侦察', '废墟探索', '搜寻'],
                  target: 'ruins_site', stateDesc: '探索废墟', resourceType: null, desc: '去废墟探索物资' },

                // ---- 工坊类（进入workshop室内后 _updateActionEffect 触发效果）----
                // 【重要】精确匹配必须放在通用匹配前面！从上到下first-match，先精确后模糊
                { keywords: ['建造发电机', '自动发电'],
                  target: 'workshop_door', stateDesc: '建造发电机', resourceType: null, desc: '去工坊建造发电机' },
                { keywords: ['建造伐木机', '自动伐木'],
                  target: 'workshop_door', stateDesc: '建造伐木机', resourceType: null, desc: '去工坊建造伐木机' },
                { keywords: ['人工发电', '手摇发电', '手动发电', '发电', '维修发电', '电力', '修发电', '维护电力', '电路', '铺设', '接线', '铜线', '电池', '电力施工'],
                  target: 'workshop_door', stateDesc: '人工发电', resourceType: 'power', desc: '去工坊人工发电' },
                // 【修复】兜底工坊类——通用关键词也要保留正确的stateDesc而不是一律"人工发电"
                { keywords: ['建造', '建设', '搭建', '组装', '施工'],
                  target: 'workshop_door', stateDesc: '建造发电机', resourceType: null, desc: '去工坊建造' },
                { keywords: ['修理', '部件', '指导', '配合', '协助', '辅助', '帮忙'],
                  target: 'workshop_door', stateDesc: '人工发电', resourceType: 'power', desc: '去工坊配合工作' },

                // ---- 室内公共区域类（宿舍/公共空间）----
                { keywords: ['安抚', '士气', '鼓舞', '安慰', '鼓励', '人心', '谈心'],
                  target: 'dorm_a_door', stateDesc: '安抚', resourceType: null, desc: '去室内安抚士气' },
                { keywords: ['巡逻', '守夜', '值班', '看守', '监督', '警戒'],
                  target: 'dorm_a_door', stateDesc: '巡逻', resourceType: null, desc: '去室内巡逻' },

                // ---- 室内场景类（进入对应室内后 _updateActionEffect 触发效果）----
                { keywords: ['做饭', '烹饪', '炊事', '加工食物', '厨房', '煮', '烧饭', '分肉', '分食', '准备早餐', '准备晚餐'],
                  target: 'kitchen_door', stateDesc: '准备早餐', resourceType: null, desc: '去炊事房做饭' },
                { keywords: ['治疗', '医疗', '看病', '急救', '冻伤', '伤员', '救护', '包扎', '药剂', '制药', '草药'],
                  target: 'medical_door', stateDesc: '医疗救治', resourceType: null, desc: '去医疗站治疗' },
                { keywords: ['心理', '疏导', '咨询'],
                  target: 'medical_door', stateDesc: '心理疏导', resourceType: null, desc: '去医疗站心理疏导' },
                { keywords: ['盘点', '仓库', '整理', '库存', '清点', '物资管理'],
                  target: 'warehouse_door', stateDesc: '盘点物资', resourceType: null, desc: '去仓库盘点物资' },

                // ---- 特殊：休息类（不导航，在原地）----
                { keywords: ['休息', '睡觉', '恢复', '养伤'],
                  target: null, stateDesc: '休息', resourceType: null, desc: '回去休息' },
            ];

            const alive = this._snapshot.aliveNpcs;
            for (const [name, task] of Object.entries(this._winnerProposal.assignments)) {
                const npc = alive.find(n => n.name === name);
                if (!npc) continue;

                // 设置投票任务文本（供LLM感知）
                npc._councilTask = task;
                npc._councilTaskTime = Date.now();

                // 模糊匹配任务关键词 → 行动映射
                let matched = null;
                const taskLower = task.toLowerCase();
                for (const mapping of TASK_ACTION_MAP) {
                    if (mapping.keywords.some(kw => taskLower.includes(kw))) {
                        matched = mapping;
                        break;
                    }
                }

                if (matched && matched.target) {
                    // 【关键修复】使用 activateTaskOverride 正规流程激活导航
                    const activated = npc.activateTaskOverride(
                        `council_${this._winnerProposal.name}`,
                        matched.target,
                        'high',
                        matched.resourceType,
                        matched.stateDesc      // 统一通过第5参数传入stateDesc
                    );

                    // 保留 _councilStateDesc 用于向后兼容
                    npc._councilStateDesc = matched.stateDesc;

                    npc._actionDecisionCooldown = 0; // 清零决策冷却，让NPC立即响应

                    console.log(`[CouncilSystem] ${name} → 任务"${task}" → 目标:${matched.target} stateDesc="${matched.stateDesc}" resource:${matched.resourceType || '无'} (${matched.desc})`);
                } else if (matched && !matched.target) {
                    // 休息类任务，不设置导航，设置stateDesc
                    npc.stateDesc = matched.stateDesc;
                    npc._councilStateDesc = matched.stateDesc;
                    console.log(`[CouncilSystem] ${name} → 任务"${task}" → 回家休息 stateDesc="${matched.stateDesc}"`);
                } else {
                    // 无法映射的任务，仅靠LLM感知_councilTask来自行决策
                    npc._actionDecisionCooldown = 0;
                    console.log(`[CouncilSystem] ${name} → 任务"${task}" → 无法精确映射，交由LLM决策`);
                }
            }

            // 通知事件日志（包含实际效果映射信息）
            const assignLog = Object.entries(this._winnerProposal.assignments).map(([n, t]) => {
                const npc = alive.find(np => np.name === n);
                const councilDesc = npc && npc._councilStateDesc ? `(→${npc._councilStateDesc})` : '';
                return `${n}→${t}${councilDesc}`;
            }).join('、');
            this.game.addEvent(`📋 行动分工已更新：${assignLog}`);

            // AI模式日志：投票决策完整记录（用于复盘）
            if (this.game.aiModeLogger) {
                let voteLog = `投票会议结束 | 获胜方案:「${this._winnerProposal.name}」\n`;
                // 记录所有方案和得票
                if (this._voteResults) {
                    const sorted = Object.entries(this._voteResults)
                        .map(([idx, data]) => ({ idx: parseInt(idx), ...data, proposal: this._proposals[parseInt(idx)] }))
                        .sort((a, b) => b.votes - a.votes);
                    for (const r of sorted) {
                        voteLog += `  方案${r.idx + 1}「${r.proposal.name}」: ${r.votes}票 [${r.voters.join('、') || '无'}]\n`;
                        // 记录方案内容摘要
                        if (r.proposal.assignments) {
                            const tasks = Object.entries(r.proposal.assignments).map(([n, t]) => `${n}→${t}`).join(', ');
                            voteLog += `    分工: ${tasks}\n`;
                        }
                    }
                }
                // 记录最终执行的任务分配
                voteLog += `  最终执行分工: ${assignLog}`;
                this.game.aiModeLogger.log('COUNCIL', voteLog);
            }
        }

        /**
         * 清理过期的投票决策（在game update中每帧调用）
         * 投票决策有效期：10分钟真实时间（约对应2+游戏小时）
         */
        static cleanExpiredCouncilTasks(npcs) {
            const EXPIRY_MS = 10 * 60 * 1000; // 10分钟真实时间
            const now = Date.now();
            for (const npc of npcs) {
                if (npc._councilTask && npc._councilTaskTime) {
                    if (now - npc._councilTaskTime > EXPIRY_MS) {
                        console.log(`[CouncilSystem] ${npc.name} 的投票决策已过期，清除`);
                        npc._councilTask = null;
                        npc._councilTaskTime = null;
                        npc._councilStateDesc = null; // 同步清理投票分配的stateDesc
                        // 同时清理投票产生的taskOverride（通过taskId前缀识别）
                        if (npc._taskOverride && npc._taskOverride.taskId &&
                            npc._taskOverride.taskId.startsWith('council_')) {
                            npc._taskOverride.isActive = false;
                            console.log(`[CouncilSystem] ${npc.name} 的投票taskOverride已清除`);
                        }
                    }
                }
            }
        }

        /** 追加系统消息（区别于NPC发言） */
        _appendSystemMessage(text) {
            const div = document.createElement('div');
            div.className = 'council-system-msg';
            div.innerHTML = `<div class="csm-text">${text}</div>`;
            div.style.opacity = '0';
            this.body.appendChild(div);
            requestAnimationFrame(() => {
                div.style.transition = 'opacity 0.3s';
                div.style.opacity = '1';
            });
            this.body.scrollTop = this.body.scrollHeight;
        }

        /** JSON解析（带容错，从testcode迁移） */
        _parseJSON(text) {
            if (!text) return null;
            try {
                // 清理 <think> 标签
                let s = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                s = s.replace(/```json|```/g, '').trim();
                const m = s.match(/\{[\s\S]*\}/);
                if (m) s = m[0];
                return JSON.parse(s);
            } catch (e) {
                // 尝试修复截断JSON
                try {
                    let s = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
                    const idx = s.indexOf('{');
                    if (idx >= 0) {
                        s = s.substring(idx);
                        // 补全缺失的括号
                        let depth = 0;
                        for (let i = 0; i < s.length; i++) {
                            if (s[i] === '{') depth++;
                            if (s[i] === '}') depth--;
                        }
                        while (depth > 0) { s += '}'; depth--; }
                        const brackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
                        for (let i = 0; i < brackets; i++) s += ']';
                        return JSON.parse(s);
                    }
                } catch (e2) { /* ignore */ }
                console.error(`[CouncilSystem-JSON] 解析失败:`, e.message, text.substring(0, 200));
                return null;
            }
        }

        /** 默认方案（LLM失败时的兜底） */
        _getDefaultProposals(aliveNpcs) {
            const names = aliveNpcs.map(n => n.name);
            const assignments1 = {};
            const assignments2 = {};
            const assignments3 = {};
            // 简单分配
            for (let i = 0; i < names.length; i++) {
                if (i % 3 === 0) { assignments1[names[i]] = '砍柴补充木柴'; assignments2[names[i]] = '砍柴'; assignments3[names[i]] = '建造自动设备'; }
                else if (i % 3 === 1) { assignments1[names[i]] = '采集食物'; assignments2[names[i]] = '采集食物'; assignments3[names[i]] = '砍柴维持'; }
                else { assignments1[names[i]] = '安抚士气'; assignments2[names[i]] = '探索废墟'; assignments3[names[i]] = '探索废墟找零件'; }
            }
            return [
                { name: '资源优先', description: '集中力量补充最紧缺的资源', assignments: assignments1, reasoning: '先解决资源燃眉之急' },
                { name: '均衡发展', description: '各项工作均衡推进', assignments: assignments2, reasoning: '虽然慢但稳' },
                { name: '科技冲刺', description: '先建自动化设备，长期收益', assignments: assignments3, reasoning: '牺牲短期换长期' },
            ];
        }

        /** 补全方案中遗漏的NPC，根据角色默认职责分配任务 */
        _fillMissingAssignments(aliveNpcs) {
            const ROLE_DEFAULTS = {
                'old_qian':     '安抚士气',
                'li_shen':      '做饭',
                'zhao_chef':    '砍柴',
                'su_doctor':    '治疗伤员',
                'wang_teacher': '人工发电',
                'lu_chen':      '砍柴',
                'ling_yue':     '探索废墟',
                'qing_xuan':    '治疗伤员',
            };
            for (const proposal of this._proposals) {
                if (!proposal.assignments) proposal.assignments = {};
                for (const npc of aliveNpcs) {
                    if (!proposal.assignments[npc.name]) {
                        const defaultTask = ROLE_DEFAULTS[npc.id] || '休息恢复';
                        proposal.assignments[npc.name] = defaultTask;
                        console.log(`[CouncilSystem] 方案「${proposal.name}」补分配: ${npc.name} → ${defaultTask}`);
                    }
                }
            }
        }
    }

    GST.CouncilSystem = CouncilSystem;
})();
