/**
 * 福音镇 - 输入处理
 * 键盘/鼠标输入、WASD移动、点击交互、快捷键
 * 通过 mixin 模式挂载到 Game.prototype
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.Game.prototype;

    proto._nearestNPCToCamera = function(maxDist) {
        const camCenterGX = Math.floor((this.camera.x + this.camera.width / 2) / GST.TILE);
        const camCenterGY = Math.floor((this.camera.y + this.camera.height / 2) / GST.TILE);
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

    // ---- 渲染 ----;

    proto._setupControls = function() {
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
                if (npc) this.switchFollowTarget(npc);
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

    // ---- 侧边栏 Agent 卡片 ----;

    proto._setupInput = function() {
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
                this.switchFollowTarget(this.npcs[num - 1]);
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

    // ---- 顶部控制栏 ----;

    proto._tryInteract = function() {
        if (this.mode !== 'debug') return;
        const nearest = this._nearestNPCToCamera(3);
        if (nearest) {
            this.dialogueManager.startPlayerChat(nearest);
        }
    };

})();
