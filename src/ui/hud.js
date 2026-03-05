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
        if (npc.isWatchingShow) hints.push({ text: '🎵 正在看歆玥的演出，San值恢复中', cls: 'good' });
        if (npc.isInTherapy) hints.push({ text: '💬 正在接受苏医生心理咨询，San值快速恢复中', cls: 'good' });
        if (npc.stamina < 20) hints.push({ text: '⚠️ 体力极低，急需休息', cls: 'warn' });
        if (npc.sanity < 30 && !npc.isCrazy) hints.push({ text: '🧠 精神状态很差，建议去医院找苏医生咨询或看歆玥演出', cls: 'warn' });
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

    /** 资源条更新辅助 */;

    proto.addEvent = function(text) {
        const time = this.getTimeStr();
        this.eventLog.unshift({ time, text });
        if (this.eventLog.length > this.maxEventLog) this.eventLog.pop();
        this._renderEventLog();
    };

})();
