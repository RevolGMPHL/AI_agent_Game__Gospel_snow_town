/**
 * 福音镇 - HUD / UI 面板
 * 侧边栏、NPC详情面板、资源面板、事件日志、轮回UI、Toast
 * 通过 mixin 模式挂载到 Game.prototype
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.Game.prototype;

    proto._closeNPCDetail = function() {
        document.getElementById('npc-detail-overlay').style.display = 'none';
        this._currentDetailNPC = null;
        if (this._detailRefreshTimer) {
            clearInterval(this._detailRefreshTimer);
            this._detailRefreshTimer = null;
        }
    };

    proto._downloadDebugLog = function() {
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

    // ---- 事件日志 ----;

    proto._moodEmoji = function(mood) {
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

    // ---- NPC 详情面板 ----;

    proto._openNPCDetail = function(npc) {
        this._currentDetailNPC = npc;

        // 同时也跟随该 NPC（使用智能切换，自由模式下不退出自由模式）
        this.switchFollowTarget(npc);

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
    };

    proto._renderAttributesTab = function(npc) {
        const el = document.getElementById('tab-attributes');
        const attrs = [
            { key: 'stamina',   label: '💪 体力', value: npc.stamina,   level: npc.getStaminaLevel(),   max: 100 },
            { key: 'sanity',    label: '🧠 San值', value: npc.sanity,    level: npc.getSanityLevel(),    max: 100 },
            { key: 'health',    label: '🫀 健康', value: npc.health,    level: npc.getHealthLevel(),    max: 100 },
            { key: 'hunger',    label: '🍖 饱腹', value: npc.hunger || 50, level: npc.getHungerStatus ? npc.getHungerStatus() : '正常', max: 100 },
            { key: 'bodyTemp',  label: '🌡️ 体温', value: npc.bodyTemp || 36.5, level: npc.getBodyTempStatus ? npc.getBodyTempStatus() : '正常', max: 36.5, isTemp: true },
        ];

        let html = '<div class="attr-grid">';
        for (const a of attrs) {
            const val = Math.round(a.value);
            {
                const pct = a.isTemp ? Math.min(100, Math.max(0, (val / a.max) * 100)) : Math.min(100, Math.max(0, val));
                const displayVal = a.isTemp ? a.value.toFixed(1) + '°C' : val;
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
if (npc.isHypothermic) hints.push({ text: '🥶 失温中！行动迟缓，体力快速下降，必须立即回室内取暖！', cls: 'warn' });
        if (npc.isSevereHypothermic) hints.push({ text: '🧊 严重失温！倒地不起，需要紧急救援！', cls: 'warn' });
        if (npc.isFrostbitten) hints.push({ text: '🫨 手脚冻伤，需要治疗', cls: 'warn' });
        if (npc.isSick) hints.push({ text: '🤒 正在生病中，需要休息或去医院看病', cls: 'warn' });
        if (npc.isCrazy) hints.push({ text: '🤯 精神崩溃发疯中！需要找苏医生治疗或睡觉恢复', cls: 'warn' });
        if (npc.isWatchingShow) hints.push({ text: '🎵 受到歆玥的鼓舞，精神状态恢复中', cls: 'good' });
        if (npc.isInTherapy) hints.push({ text: '💬 正在接受苏岩的心理疏导，精神状态恢复中', cls: 'good' });
        if (npc.stamina < 20) hints.push({ text: '⚠️ 体力极低，急需休息', cls: 'warn' });
        if (npc.sanity < 30 && !npc.isCrazy) hints.push({ text: '🧠 精神状态很差，需要想办法恢复精神', cls: 'warn' });
        if (npc.health < 30) hints.push({ text: '⚠️ 健康状况很差，容易生病', cls: 'warn' });
        if (npc.stamina >= 80) hints.push({ text: '💪 精力充沛，做事效率高', cls: 'good' });
        if (npc.sanity >= 80) hints.push({ text: '🧠 精神充沛，头脑清晰', cls: 'good' });
        if (npc.health >= 80) hints.push({ text: '🫀 身体强健', cls: 'good' });
        if (npc.hunger < 20) hints.push({ text: '🍖 非常饥饿，急需进食', cls: 'warn' });

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
    };

    proto._renderDebugTab = function(npc) {
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
    proto._saveDebugLogToServer = async function(quiet = false) {
        try {
            // 收集所有NPC的debug log
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const dayStr = `day${this.dayCount}`;
            const filename = `debug_${dayStr}_${timestamp}.log`;

            let content = `=== 福音镇 Debug Log ===\n`;
            content += `时间: ${new Date().toLocaleString()}\n`;
            content += `游戏日: 第${this.dayCount}天 ${this.getTimeStr()}\n`;
            content += `模式: ${this.mode}\n`;
            content += `模型: ${GST.LLM ? GST.LLM.model : '未知'}\n`;
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

    // 降级方案：浏览器下载debug log;

    proto._renderEventLog = function() {
        const el = document.getElementById('event-log');
        if (!el) return;
        el.innerHTML = this.eventLog.slice(0, 30).map(e =>
            `<div class="event-item"><span class="event-time">${e.time}</span> ${e.text}</div>`
        ).join('');
    }

    // ---- 跟随系统 ----;

    proto._renderMemoryTab = function(npc) {
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
    };

    proto._renderRelationsTab = function(npc) {
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

    // ---- Debug Tab 渲染 ----;

    proto._renderScheduleTab = function(npc) {
        const el = document.getElementById('tab-schedule');

        // === 【v4.17】改为显示AI行动状态，不再显示旧的固定日程 ===
        const stateDesc = npc.stateDesc || '待命中';
        const action = npc._currentAction;
        const behaviorOwner = npc._behaviorOwner || 'unknown';
        const behaviorReason = npc._behaviorReason || '';
        const scene = npc.currentScene || '未知';
        const councilDesc = npc._councilStateDesc || '';
        const taskOverride = npc._taskOverride;
        const isMoving = npc.isMoving;
        const isSleeping = npc.isSleeping;
        const isEating = npc.isEating;

        // 状态emoji
        let statusEmoji = '🟢';
        let statusText = '正常';
        if (npc.isDead) { statusEmoji = '💀'; statusText = '已死亡'; }
        else if (isSleeping) { statusEmoji = '😴'; statusText = '睡眠中'; }
        else if (isEating) { statusEmoji = '🍽️'; statusText = '进食中'; }
        else if (isMoving) { statusEmoji = '🚶'; statusText = '移动中'; }

        // 行为控制方中文映射
        const ownerMap = {
            priority: '🔴 紧急优先级',
            task: '📋 任务系统',
            hunger: '🍽️ 饥饿驱动',
            state: '⚠️ 状态紧急',
            resource: '📦 资源巡检',
            action: '🤖 AI行动决策',
            schedule: '📅 日程兜底'
        };
        const ownerLabel = ownerMap[behaviorOwner] || behaviorOwner;

        let html = '';

        // 当前行动
        html += `<div class="action-status-section">
            <div class="action-status-title">🎯 当前行动</div>
            <div class="action-status-main">${stateDesc}</div>
        </div>`;

        // 状态概览
        html += `<div class="action-status-section">
            <div class="action-status-title">📊 状态</div>
            <div class="action-status-row">
                <span class="action-label">状态</span>
                <span class="action-value">${statusEmoji} ${statusText}</span>
            </div>
            <div class="action-status-row">
                <span class="action-label">场景</span>
                <span class="action-value">📍 ${scene}</span>
            </div>
            <div class="action-status-row">
                <span class="action-label">控制方</span>
                <span class="action-value">${ownerLabel}</span>
            </div>
        </div>`;

        // 晨会分配
        if (councilDesc) {
            html += `<div class="action-status-section">
                <div class="action-status-title">🗳️ 晨会分配</div>
                <div class="action-status-main council">${councilDesc}</div>
            </div>`;
        }

        // 任务覆盖信息
        if (taskOverride && taskOverride.isActive) {
            html += `<div class="action-status-section">
                <div class="action-status-title">📌 执行任务</div>
                <div class="action-status-main task">${taskOverride.desc || taskOverride.effectKey || '任务执行中'}</div>
            </div>`;
        }

        // 行动详情
        if (action) {
            html += `<div class="action-status-section">
                <div class="action-status-title">🔧 行动详情</div>
                <div class="action-status-row">
                    <span class="action-label">类型</span>
                    <span class="action-value">${action.type || '-'}</span>
                </div>`;
            if (action.target) {
                html += `<div class="action-status-row">
                    <span class="action-label">目标</span>
                    <span class="action-value">${action.target}</span>
                </div>`;
            }
            if (action.reason) {
                html += `<div class="action-status-row">
                    <span class="action-label">原因</span>
                    <span class="action-value">${action.reason}</span>
                </div>`;
            }
            html += `</div>`;
        }

        el.innerHTML = html;
    };

    proto._setupNPCDetailPanel = function() {
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
    };

    proto._setupSidebar = function() {
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

    /** 更新侧边栏信息 */;

    proto._showPastLivesPanel = function() {
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
                <span class="past-life-stat">🔍 <span class="past-life-stat-val">探索</span></span>
                <span class="past-life-stat">🌡️ 供暖 <span class="past-life-stat-val">${life.heatingStrength !== undefined ? Math.round(life.heatingStrength * 100) + '%' : '—'}</span></span>
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

    // ---- 存档 ----;

    proto._showToast = function(msg) {
        const el = document.getElementById('save-toast');
        el.textContent = msg;
        el.style.display = 'block';
        el.style.opacity = '1';
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => { el.style.display = 'none'; }, 300);
        }, 1200);
    }

    // ---- 工具方法 ----;

    proto._updateReincarnationUI = function() {
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

    /** 显示往世结局弹窗 */;

    proto._updateResBar = function(fillId, valId, current, max) {
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
    };

    proto._updateSidebar = function() {
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
            const fs = this.furnaceSystem;
            const pct = Math.round(fs.heatingStrength * 100);
            const label = fs.getHeatingLevelLabel();
            survFurnaceEl.textContent = `${pct}%(${label})`;
            // 颜色提示：稳定=绿，吃紧=黄，危险/失效=红
            if (fs.heatingStatus === 'stable') {
                survFurnaceEl.className = 'surv-value';
            } else if (fs.heatingStatus === 'strained') {
                survFurnaceEl.className = 'surv-value cold';
            } else {
                survFurnaceEl.className = 'surv-value danger';
            }
        }

        // ============ 资源面板更新 ============
        const rs = this.resourceSystem;
        if (rs) {
            const maxWood = 120, maxFood = 80, maxPower = 120;
            this._updateResBar('res-wood-fill', 'res-wood-val', rs.woodFuel, maxWood);
            this._updateResBar('res-food-fill', 'res-food-val', rs.food, maxFood);
            this._updateResBar('res-power-fill', 'res-power-val', rs.power, maxPower);

            // 废墟探索次数显示
            const exploreRemaining = rs.getRuinsExploresRemaining ? rs.getRuinsExploresRemaining() : 3;
            const exploreMax = 3;
            const exploreFill = document.getElementById('res-explore-fill');
            const exploreVal = document.getElementById('res-explore-val');
            if (exploreFill) exploreFill.style.width = `${(exploreRemaining / exploreMax) * 100}%`;
            if (exploreVal) {
                exploreVal.textContent = `${exploreRemaining}/${exploreMax}`;
                exploreVal.style.color = exploreRemaining === 0 ? '#f87171' : '';
            }

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
        // ============ 自动化机器状态更新 ============
        if (this.machineSystem) {
            const ms = this.machineSystem;
            const cfg = GST.MACHINE_CONFIG;
            const canUnlockGen = ms.canUnlockGenerator();
            const canUnlockLum = ms.canUnlockLumberMill();

            // --- 发电机 ---
            const genBar = document.getElementById('machine-generator-bar');
            const genFill = document.getElementById('machine-generator-fill');
            const genVal = document.getElementById('machine-generator-val');
            const showGen = ms.shouldShowGenerator ? ms.shouldShowGenerator() : (ms.generator.built || ms.generator.building || canUnlockGen);
            if (genBar) genBar.style.display = showGen ? '' : 'none';
            if (showGen && genFill && genVal) {
                if (ms.generator.building) {
                    // 建造中 — 进度条显示建造进度
                    const pct = Math.round(ms.generator.buildProgress * 100);
                    genFill.style.width = `${Math.max(pct, 3)}%`; // 最小3%宽度，确保可见
                    genFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
                    genFill.classList.add('building');
                    genVal.textContent = `🔨${pct}% (${ms.generator.buildWorkers.length}人)`;
                    genVal.style.color = '#fbbf24';
                    genVal.classList.add('building-text');
                    genBar.title = `⚡ 自动发电机建造中 ${pct}%\n工人: ${ms.generator.buildWorkers.length}人${ms.generator.buildPaused ? '\n⏸️ 已暂停（木柴不足）' : ''}`;
                } else if (ms.generator.built) {
                    // 已建成 — 进度条满格，显示效率
                    genFill.style.width = '100%';
                    genFill.classList.remove('building');
                    genVal.classList.remove('building-text');
                    if (ms.generator.broken) {
                        genFill.style.background = 'linear-gradient(90deg, #dc2626, #f87171)';
                        const repairPct = Math.round((ms.generator._repairProgress || 0) * 100);
                        genVal.textContent = repairPct > 0 ? `🔧故障 修${repairPct}%` : '🔧故障!';
                        genVal.style.color = '#f87171';
                        genVal.classList.add('building-text');
                        genBar.title = `⚡ 自动发电机故障停机！\n维修进度: ${repairPct}%\n需要NPC在工坊维修\n累计产电: ${Math.round(ms.generator.totalProduced)}`;
                    } else if (ms.generator.running) {
                        genFill.style.background = 'linear-gradient(90deg, #4A90D9, #68B8FF)';
                        const c = cfg.generator;
                        genVal.textContent = `+${c.powerOutputPerHour}⚡/h`;
                        genVal.style.color = '#34d399';
                        genBar.title = `⚡ 自动发电机运行中\n产出: 电力 +${c.powerOutputPerHour}/h\n消耗: 木柴 -${c.woodConsumptionPerHour}/h\n累计产电: ${Math.round(ms.generator.totalProduced)}\n累计耗柴: ${Math.round(ms.generator.totalConsumed)}`;
                    } else {
                        genFill.style.background = 'linear-gradient(90deg, #6b7280, #9ca3af)';
                        genVal.textContent = '停机';
                        genVal.style.color = '#f87171';
                        genBar.title = `⚡ 自动发电机已停机\n原因: 木柴不足（<${cfg.generator.minWoodToRun}）\n累计产电: ${Math.round(ms.generator.totalProduced)}`;
                    }
                } else if (canUnlockGen) {
                    // 已解锁但未建造 — 显示待建造状态
                    genFill.style.width = '0%';
                    genFill.style.background = 'linear-gradient(90deg, #6b7280, #9ca3af)';
                    genFill.classList.remove('building');
                    genVal.textContent = '待建造';
                    genVal.style.color = '#a78bfa';
                    genVal.classList.remove('building-text');
                    genBar.title = `⚡ 自动发电机已解锁\n建造需要: 电力${cfg.generator.buildMaterialCost} + 木柴${cfg.generator.buildWoodCost}\n建造时间: ${cfg.generator.buildTimeSeconds / 3600}小时\n建成后: 产电${cfg.generator.powerOutputPerHour}/h，耗柴${cfg.generator.woodConsumptionPerHour}/h`;
                } else {
                    // 未解锁 — 灰色显示
                    genFill.style.width = '0%';
                    genFill.style.background = 'linear-gradient(90deg, #374151, #4b5563)';
                    genFill.classList.remove('building');
                    genVal.textContent = '🔒未解锁';
                    genVal.style.color = '#6b7280';
                    genVal.classList.remove('building-text');
                    genBar.title = `⚡ 自动发电机未解锁\n解锁条件: 电力>${cfg.generator.buildUnlockPower}（当前${Math.round(this.resourceSystem?.power || 0)}）\n建造需要: 电力${cfg.generator.buildMaterialCost} + 木柴${cfg.generator.buildWoodCost}`;
                }
            }

            // --- 伐木机 ---
            const lumBar = document.getElementById('machine-lumber-bar');
            const lumFill = document.getElementById('machine-lumber-fill');
            const lumVal = document.getElementById('machine-lumber-val');
            const showLum = ms.shouldShowLumberMill ? ms.shouldShowLumberMill() : (ms.lumberMill.built || ms.lumberMill.building || canUnlockLum);
            if (lumBar) lumBar.style.display = showLum ? '' : 'none';
            if (showLum && lumFill && lumVal) {
                if (ms.lumberMill.building) {
                    const pct = Math.round(ms.lumberMill.buildProgress * 100);
                    lumFill.style.width = `${Math.max(pct, 3)}%`; // 最小3%宽度，确保可见
                    lumFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
                    lumFill.classList.add('building');
                    lumVal.textContent = `🔨${pct}% (${ms.lumberMill.buildWorkers.length}人)`;
                    lumVal.style.color = '#fbbf24';
                    lumVal.classList.add('building-text');
                    lumBar.title = `🪵 自动伐木机建造中 ${pct}%\n工人: ${ms.lumberMill.buildWorkers.length}人${ms.lumberMill.buildPaused ? '\n⏸️ 已暂停（木柴不足）' : ''}`;
                } else if (ms.lumberMill.built) {
                    lumFill.style.width = '100%';
                    lumFill.classList.remove('building');
                    lumVal.classList.remove('building-text');
                    if (ms.lumberMill.broken) {
                        lumFill.style.background = 'linear-gradient(90deg, #dc2626, #f87171)';
                        const repairPct = Math.round((ms.lumberMill._repairProgress || 0) * 100);
                        lumVal.textContent = repairPct > 0 ? `🔧故障 修${repairPct}%` : '🔧故障!';
                        lumVal.style.color = '#f87171';
                        lumVal.classList.add('building-text');
                        lumBar.title = `🪵 自动伐木机故障停机！\n维修进度: ${repairPct}%\n需要NPC在工坊维修\n累计产柴: ${Math.round(ms.lumberMill.totalProduced)}`;
                    } else if (ms.lumberMill.running) {
                        lumFill.style.background = 'linear-gradient(90deg, #8B5E3C, #C4863C)';
                        const c = cfg.lumberMill;
                        lumVal.textContent = `+${c.woodOutputPerHour}🪵/h`;
                        lumVal.style.color = '#34d399';
                        lumBar.title = `🪵 自动伐木机运行中\n产出: 木柴 +${c.woodOutputPerHour}/h\n消耗: 电力 -${c.powerConsumptionPerHour}/h\n累计产柴: ${Math.round(ms.lumberMill.totalProduced)}\n累计耗电: ${Math.round(ms.lumberMill.totalConsumed)}`;
                    } else {
                        lumFill.style.background = 'linear-gradient(90deg, #6b7280, #9ca3af)';
                        lumVal.textContent = '停机';
                        lumVal.style.color = '#f87171';
                        lumBar.title = `🪵 自动伐木机已停机\n原因: 电力不足（<${cfg.lumberMill.minPowerToRun}）\n累计产柴: ${Math.round(ms.lumberMill.totalProduced)}`;
                    }
                } else if (canUnlockLum) {
                    // 已解锁但未建造 — 显示待建造状态
                    lumFill.style.width = '0%';
                    lumFill.style.background = 'linear-gradient(90deg, #6b7280, #9ca3af)';
                    lumFill.classList.remove('building');
                    lumVal.textContent = '待建造';
                    lumVal.style.color = '#a78bfa';
                    lumVal.classList.remove('building-text');
                    lumBar.title = `🪵 自动伐木机已解锁\n建造需要: 电力${cfg.lumberMill.buildMaterialCost} + 木柴${cfg.lumberMill.buildWoodCost}\n建造时间: ${cfg.lumberMill.buildTimeSeconds / 3600}小时\n建成后: 产柴${cfg.lumberMill.woodOutputPerHour}/h，耗电${cfg.lumberMill.powerConsumptionPerHour}/h`;
                } else {
                    // 未解锁 — 灰色显示
                    lumFill.style.width = '0%';
                    lumFill.style.background = 'linear-gradient(90deg, #374151, #4b5563)';
                    lumFill.classList.remove('building');
                    lumVal.textContent = '🔒未解锁';
                    lumVal.style.color = '#6b7280';
                    lumVal.classList.remove('building-text');
                    lumBar.title = `🪵 自动伐木机未解锁\n解锁条件: 木柴>${cfg.lumberMill.buildUnlockWood}（当前${Math.round(this.resourceSystem?.woodFuel || 0)}）\n建造需要: 电力${cfg.lumberMill.buildMaterialCost} + 木柴${cfg.lumberMill.buildWoodCost}`;
                }
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
                statusEl.textContent = `${roleIcon} ${npc.occupation} · ${npc.getStatusLine()}${npc.isCrazy ? ' · 🤯发疯中' : ''}${npc.isHypothermic ? ' · 🥶失温' : ''}${npc.isWatchingShow ? ' · 🎵受鼓舞' : ''}${npc.isInTherapy ? ' · 💬疏导中' : ''}`;
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

        // 决策分工对比面板
        this._updateCouncilPanel();

        // 【v4.16】右上角常驻分工方案面板
        this._updateWorkPlanPanel();
    }

    // ---- 决策分工对比面板 ----
    proto._updateCouncilPanel = function() {
        const panel = document.getElementById('council-decision-panel');
        if (!panel) return;

        const cs = this.councilSystem;
        if (!cs || !cs._winnerProposal || !cs._winnerProposal.assignments) {
            panel.classList.add('hidden');
            return;
        }

        // 检查是否所有 council 任务都已过期
        const hasActive = this.npcs.some(n => n._councilTask);
        if (!hasActive) {
            panel.classList.add('hidden');
            return;
        }

        const proposal = cs._winnerProposal;
        const assignments = proposal.assignments;
        const rows = [];

        // 先渲染被分配任务的 NPC
        const assignedNames = new Set(Object.keys(assignments));
        for (const [name, task] of Object.entries(assignments)) {
            const npc = this.npcs.find(n => n.name === name);
            if (!npc) continue;

            const planned = npc._councilStateDesc || task;
            const actual = npc.stateDesc || npc.state || '—';
            const icon = this._councilStatusIcon(npc, planned, actual);

            // 根据状态选择actual的显示颜色
            let actualStyle = '';
            if (icon === '🔄') actualStyle = 'color:#4ade80';     // 绿色=执行中
            else if (icon === '⏳') actualStyle = 'color:#facc15'; // 黄色=途中
            else if (icon === '📋') actualStyle = 'color:#94a3b8'; // 灰色=待执行

            rows.push(
                `<div class="cdp-row">` +
                `<span class="cdp-icon">${icon}</span>` +
                `<span class="cdp-name">${name}</span>` +
                `<span class="cdp-plan" title="计划: ${task}">${planned}</span>` +
                `<span class="cdp-arrow">→</span>` +
                `<span class="cdp-actual" title="实际: ${actual}" style="${actualStyle}">${actual}</span>` +
                `</div>`
            );
        }

        // 补充未被分配的存活 NPC（兜底 — 动态补入 assignments，不应出现"自行安排"）
        const ROLE_DEFAULTS = {
            'old_qian': '安抚士气', 'li_shen': '做饭', 'zhao_chef': '砍柴',
            'su_doctor': '治疗伤员', 'wang_teacher': '人工发电', 'lu_chen': '砍柴',
            'ling_yue': '探索废墟', 'qing_xuan': '治疗伤员',
        };
        for (const npc of this.npcs) {
            if (npc.isDead || assignedNames.has(npc.name)) continue;
            // 动态补入 winner 方案
            const fallbackTask = ROLE_DEFAULTS[npc.id] || '休息恢复';
            assignments[npc.name] = fallbackTask;

            const planned = npc._councilStateDesc || fallbackTask;
            const actual = npc.stateDesc || npc.state || '—';
            const icon = this._councilStatusIcon(npc, planned, actual);
            let actualStyle = '';
            if (icon === '🔄') actualStyle = 'color:#4ade80';
            else if (icon === '⏳') actualStyle = 'color:#facc15';
            else if (icon === '📋') actualStyle = 'color:#94a3b8';
            rows.push(
                `<div class="cdp-row">` +
                `<span class="cdp-icon">${icon}</span>` +
                `<span class="cdp-name">${npc.name}</span>` +
                `<span class="cdp-plan" title="计划: ${fallbackTask}">${planned}</span>` +
                `<span class="cdp-arrow">→</span>` +
                `<span class="cdp-actual" title="实际: ${actual}" style="${actualStyle}">${actual}</span>` +
                `</div>`
            );
        }

        // 决策时间（取第一个有 _councilTaskTime 的NPC）
        const tNpc = this.npcs.find(n => n._councilTaskTime);
        const timeStr = tNpc ? new Date(tNpc._councilTaskTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';

        panel.innerHTML =
            `<div class="cdp-header">` +
            `<span class="cdp-title">📋 ${proposal.name}</span>` +
            `<span class="cdp-time">${timeStr}</span>` +
            `</div>` +
            rows.join('');
        panel.classList.remove('hidden');
    };

    proto._councilMatchCheck = function(planned, actual) {
        if (!planned || !actual) return false;
        const p = planned.toLowerCase();
        const a = actual.toLowerCase();
        const keywords = p.match(/[\u4e00-\u9fff]{2,}|[a-z]{3,}/g);
        if (!keywords) return false;
        return keywords.some(kw => a.includes(kw));
    };

    proto._councilStatusIcon = function(npc, planned, actual) {
        if (npc.isDead) return '💀';
        if (npc.isSleeping) return '💤';
        if (npc.state === 'eating' || (actual && actual.includes('吃'))) return '🍜';
        if (npc.state === 'healing' || npc.isInTherapy) return '💊';
        if (planned && actual && this._councilMatchCheck(planned, actual)) {
            // 在目标位置执行中
            if (npc.isMoving || npc._walkingToDoor) return '⏳'; // 虽然匹配但还在移动
            return '🔄'; // 正在执行
        }
        if (npc.isMoving || npc._walkingToDoor) return '⏳'; // 途中
        return '📋'; // 待执行/尚未匹配
    };

    /** 资源条更新辅助 */;

    // ====== 【v4.16】右上角常驻分工方案面板 ======

    proto._initWorkPlanPanel = function() {
        const toggleBtn = document.getElementById('wpp-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const panel = document.getElementById('work-plan-panel');
                if (panel) panel.classList.toggle('collapsed');
            });
        }
    };

    /**
     * 每帧更新右上角分工方案面板
     * 数据来源优先级：
     * 1. TaskSystem.dailyTasks（当天正式任务）
     * 2. CouncilSystem._winnerProposal（晨会投票结果）
     * 3. WorkPlan（轮回建议稿）
     */
    proto._updateWorkPlanPanel = function() {
        const panel = document.getElementById('work-plan-panel');
        if (!panel) return;

        // 首次调用时自动初始化折叠按钮事件
        if (!this._wppInitialized) {
            this._wppInitialized = true;
            this._initWorkPlanPanel();
        }

        // 节流：每1秒更新一次DOM（分工方案不需要每帧刷新）
        const now = Date.now();
        if (this._wppLastUpdate && now - this._wppLastUpdate < 1000) return;
        this._wppLastUpdate = now;

        const body = document.getElementById('wpp-body');
        const timeEl = document.getElementById('wpp-time');
        if (!body) return;

        const nameMap = { zhao_chef: '赵铁柱', lu_chen: '陆辰', li_shen: '李婶', wang_teacher: '王策', old_qian: '老钱', su_doctor: '苏岩', ling_yue: '歆玥', qing_xuan: '清璇' };
        const roleEmoji = { zhao_chef: '👨‍🍳', lu_chen: '💪', li_shen: '👩‍🍳', wang_teacher: '👨‍🏫', old_qian: '👴', su_doctor: '👨‍⚕️', ling_yue: '🔍', qing_xuan: '🧪' };

        // 时间显示
        if (timeEl) {
            timeEl.textContent = `第${this.dayCount}天 ${this.getTimeStr()}`;
        }

        // 获取数据：优先从TaskSystem获取正式任务分工
        const ts = this.taskSystem;
        const cs = this.councilSystem;
        const rs = this.reincarnationSystem;
        const aliveNpcs = this.npcs.filter(n => !n.isDead);
        const deadNpcs = this.npcs.filter(n => n.isDead);

        let rows = [];
        let sourceLabel = '';

        // 来源1: TaskSystem正式任务
        if (ts && ts.dailyTasks && ts.dailyTasks.length > 0) {
            sourceLabel = '📋 今日任务分工';
            const completed = ts.dailyTasks.filter(t => t.status === 'completed').length;
            const total = ts.dailyTasks.length;
            sourceLabel += ` (${completed}/${total}完成)`;

            // 按NPC分组
            const tasksByNpc = {};
            for (const task of ts.dailyTasks) {
                const npcId = task.assignedNpcId || 'unassigned';
                if (!tasksByNpc[npcId]) tasksByNpc[npcId] = [];
                tasksByNpc[npcId].push(task);
            }

            for (const npc of this.npcs) {
                const tasks = tasksByNpc[npc.id];
                if (!tasks) continue;
                const taskStr = tasks.map(t => {
                    const progress = t.target > 0 ? Math.min(100, Math.round(t.progress / t.target * 100)) : (t.status === 'completed' ? 100 : 0);
                    const statusMark = t.status === 'completed' ? '✅' : (progress > 0 ? `${progress}%` : '');
                    return t.name + (statusMark ? `(${statusMark})` : '');
                }).join('+');

                const actual = npc.stateDesc || npc.state || '—';
                let statusIcon = '📋';
                if (npc.isDead) statusIcon = '💀';
                else if (npc.isSleeping) statusIcon = '💤';
                else if (actual.includes('砍') || actual.includes('采') || actual.includes('修') || actual.includes('探') || actual.includes('巡')) statusIcon = '🔄';
                else if (npc.isMoving) statusIcon = '⏳';

                rows.push({
                    npcId: npc.id,
                    name: npc.name,
                    emoji: roleEmoji[npc.id] || '👤',
                    task: taskStr,
                    status: statusIcon,
                    stamina: Math.round(npc.stamina || 0),
                    isDead: npc.isDead,
                    isExecuting: statusIcon === '🔄',
                    isTraveling: statusIcon === '⏳'
                });
            }
        }
        // 来源2: CouncilSystem晨会投票结果
        else if (cs && cs._winnerProposal && cs._winnerProposal.assignments) {
            sourceLabel = `🗳️ 晨会决议: ${cs._winnerProposal.name || '今日方案'}`;
            const assignments = cs._winnerProposal.assignments;
            for (const [name, task] of Object.entries(assignments)) {
                const npc = this.npcs.find(n => n.name === name);
                if (!npc) continue;
                const actual = npc.stateDesc || npc.state || '—';
                let statusIcon = '📋';
                if (npc.isDead) statusIcon = '💀';
                else if (npc.isSleeping) statusIcon = '💤';
                else if (this._councilMatchCheck && this._councilMatchCheck(task, actual)) statusIcon = '🔄';
                else if (npc.isMoving) statusIcon = '⏳';

                rows.push({
                    npcId: npc.id,
                    name: name,
                    emoji: roleEmoji[npc.id] || '👤',
                    task: npc._councilStateDesc || task,
                    status: statusIcon,
                    stamina: Math.round(npc.stamina || 0),
                    isDead: npc.isDead,
                    isExecuting: statusIcon === '🔄',
                    isTraveling: statusIcon === '⏳'
                });
            }
        }
        // 来源3: WorkPlan轮回建议稿
        else if (rs) {
            const holder = rs.getWorkPlanHolder && rs.getWorkPlanHolder();
            if (holder && holder.workPlan) {
                const wp = holder.workPlan;
                const day = this.dayCount || 1;
                const dayPlan = wp.dayPlans && wp.dayPlans[day];
                sourceLabel = `📝 建议稿 (${wp.strategy || '默认'})`;
                if (dayPlan) {
                    const taskShort = { COLLECT_WOOD: '收集木柴', COLLECT_FOOD: '收集食物', COLLECT_MATERIAL: '探索废墟', MAINTAIN_POWER: '维护电力', COORDINATE: '统筹协调', PREPARE_MEDICAL: '医疗救治', SCOUT_RUINS: '侦察废墟', BOOST_MORALE: '鼓舞士气', BUILD_FURNACE: '建暖炉', PREPARE_WARMTH: '御寒', MAINTAIN_ORDER: '维持秩序', DISTRIBUTE_FOOD: '分配食物', REST_RECOVER: '休息' };
                    for (const a of dayPlan) {
                        const npc = this.npcs.find(n => n.id === a.npcId);
                        rows.push({
                            npcId: a.npcId,
                            name: nameMap[a.npcId] || a.npcId,
                            emoji: roleEmoji[a.npcId] || '👤',
                            task: taskShort[a.task] || a.task,
                            status: npc && npc.isDead ? '💀' : '📋',
                            stamina: npc ? Math.round(npc.stamina || 0) : 0,
                            isDead: npc ? npc.isDead : false,
                            isExecuting: false,
                            isTraveling: false
                        });
                    }
                }
            }
        }

        // 没有任何分工数据
        if (rows.length === 0) {
            body.innerHTML = '<div class="wpp-empty">等待分工...</div>';
            return;
        }

        // 添加已死亡但不在列表中的NPC
        for (const npc of deadNpcs) {
            if (!rows.find(r => r.npcId === npc.id)) {
                rows.push({
                    npcId: npc.id,
                    name: npc.name,
                    emoji: roleEmoji[npc.id] || '👤',
                    task: '已死亡',
                    status: '💀',
                    stamina: 0,
                    isDead: true,
                    isExecuting: false,
                    isTraveling: false
                });
            }
        }

        // 构建HTML
        let html = `<div class="wpp-source">${sourceLabel}</div>`;
        for (const row of rows) {
            const cls = row.isDead ? ' dead' : (row.isExecuting ? ' executing' : (row.isTraveling ? ' traveling' : ''));
            html += `<div class="wpp-row${cls}">`
                + `<span class="wpp-row-icon">${row.emoji}</span>`
                + `<span class="wpp-row-name">${row.name}</span>`
                + `<span class="wpp-row-task" title="${row.task}">${row.task}</span>`
                + `<span class="wpp-row-status">${row.status}</span>`
                + `<span class="wpp-row-stamina">${row.isDead ? '' : row.stamina}</span>`
                + `</div>`;
        }

        body.innerHTML = html;
    };

    proto.addEvent = function(text) {
        const time = this.getTimeStr();
        this.eventLog.unshift({ time, text });
        if (this.eventLog.length > this.maxEventLog) this.eventLog.pop();
        this._renderEventLog();
    };

})();
