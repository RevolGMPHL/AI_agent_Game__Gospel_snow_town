/**
 * 福音镇 - 输入处理
 * 键盘/鼠标输入、WASD移动、点击交互、快捷键
 * 通过 mixin 模式挂载到 Game.prototype
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.Game.prototype;

    const COMMANDER_ALIAS_MAP = {
        zhao_chef: ['赵铁柱', '赵大厨', '老赵'],
        lu_chen: ['陆沉', '阿沉'],
        li_shen: ['李婶'],
        wang_teacher: ['王策', '王老师', '老师'],
        old_qian: ['老钱', '钱叔'],
        su_doctor: ['苏医生', '老苏'],
        ling_yue: ['凌月', '小凌'],
        qing_xuan: ['清漩', '青玄', '小青'],
    };

    const COMMANDER_NAME_MAP = {
        zhao_chef: '赵铁柱',
        lu_chen: '陆辰',
        li_shen: '李婶',
        wang_teacher: '王策',
        old_qian: '老钱',
        su_doctor: '苏岩',
        ling_yue: '歆玥',
        qing_xuan: '清璇',
    };

    const COMMANDER_ROLE_EMOJI = {
        zhao_chef: '👨‍🍳',
        lu_chen: '💪',
        li_shen: '👩‍🍳',
        wang_teacher: '👨‍🏫',
        old_qian: '👴',
        su_doctor: '👨‍⚕️',
        ling_yue: '🔍',
        qing_xuan: '🧪',
    };

    const COMMANDER_TASK_LABELS = {
        BUILD_LUMBER_MILL: '建造伐木机',
        BUILD_GENERATOR: '建造发电机',
        DISTRIBUTE_FOOD: '做饭',
        PREPARE_MEDICAL: '医疗救治',
        MAINTAIN_POWER: '维护电力',
        COLLECT_WOOD: '收集木柴',
        COLLECT_FOOD: '收集食物',
        COLLECT_MATERIAL: '探索废墟',
        BOOST_MORALE: '安抚众人',
        MAINTAIN_ORDER: '巡逻警戒',
    };

    const COMMANDER_TASK_DEFAULTS = {
        BUILD_LUMBER_MILL: {
            targetLocation: 'workshop_door',
            stateDesc: '建造伐木机',
            reason: '去工坊建造伐木机',
            effectKey: 'build_machine_lumber',
            targetValue: 1,
            priority: 'urgent',
        },
        BUILD_GENERATOR: {
            targetLocation: 'workshop_door',
            stateDesc: '建造发电机',
            reason: '去工坊建造发电机',
            effectKey: 'build_machine_generator',
            targetValue: 1,
            priority: 'urgent',
        },
        DISTRIBUTE_FOOD: {
            targetLocation: 'kitchen_door',
            stateDesc: '做饭',
            reason: '去炊事房做饭',
            targetValue: 1,
            priority: 'high',
        },
        PREPARE_MEDICAL: {
            targetLocation: 'medical_door',
            stateDesc: '医疗救治',
            reason: '去医疗站治疗',
            targetValue: 1,
            priority: 'urgent',
        },
        MAINTAIN_POWER: {
            targetLocation: 'workshop_door',
            stateDesc: '人工发电',
            reason: '去工坊人工发电',
            effectKey: 'maintain_power',
            targetValue: 20,
            priority: 'urgent',
        },
        COLLECT_WOOD: {
            targetLocation: 'lumber_camp',
            stateDesc: '砍柴',
            reason: '去伐木场砍柴',
            targetValue: 30,
            priority: 'high',
        },
        COLLECT_FOOD: {
            targetLocation: 'frozen_lake',
            stateDesc: '采集食物',
            reason: '去冰湖采集食物',
            targetValue: 20,
            priority: 'high',
        },
        COLLECT_MATERIAL: {
            targetLocation: 'ruins_site',
            stateDesc: '探索废墟',
            reason: '去废墟探索物资',
            targetValue: 1,
            priority: 'high',
        },
        BOOST_MORALE: {
            targetLocation: 'furnace_plaza',
            stateDesc: '安抚',
            reason: '去暖炉广场安抚大家',
            targetValue: 1,
            priority: 'high',
        },
        MAINTAIN_ORDER: {
            targetLocation: 'furnace_plaza',
            stateDesc: '巡逻',
            reason: '去暖炉广场巡逻',
            targetValue: 1,
            priority: 'high',
        },
    };

    const COMMANDER_ACTION_PRESETS = [
        {
            match: text => /建.*伐木机|伐木机|自动伐木/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'BUILD_LUMBER_MILL',
                targetLocation: 'workshop_door',
                stateDesc: '建造伐木机',
                reason: '去工坊建造伐木机',
                effectKey: 'build_machine_lumber',
                targetValue: 1,
                priority: 'urgent'
            }
        },
        {
            match: text => /建.*发电机|发电机|自动发电/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'BUILD_GENERATOR',
                targetLocation: 'workshop_door',
                stateDesc: '建造发电机',
                reason: '去工坊建造发电机',
                effectKey: 'build_machine_generator',
                targetValue: 1,
                priority: 'urgent'
            }
        },
        { match: text => /休息|睡觉|睡一会|太累|累了|歇会/.test(text), action: { type: 'rest', reason: '回宿舍休息' } },
        { match: text => /吃饭|吃点东西|进食|开饭|去吃/.test(text), action: { type: 'eat', target: 'kitchen_door', reason: '去吃饭' } },
        {
            match: text => /做饭|烹饪|炊事|煮饭|烧饭|准备晚餐|准备早餐/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'DISTRIBUTE_FOOD',
                targetLocation: 'kitchen_door',
                stateDesc: '准备早餐',
                reason: '去炊事房做饭',
                targetValue: 1,
                priority: 'high'
            }
        },
        {
            match: text => /医疗|治疗|看病|救人|包扎|制药|草药/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'PREPARE_MEDICAL',
                targetLocation: 'medical_door',
                stateDesc: '医疗救治',
                reason: '去医疗站治疗',
                targetValue: 1,
                priority: 'urgent'
            }
        },
        {
            match: text => /人工发电|手摇发电|手动发电|维护电力|修电|发电|电力/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'MAINTAIN_POWER',
                targetLocation: 'workshop_door',
                stateDesc: '人工发电',
                reason: '去工坊人工发电',
                effectKey: 'maintain_power',
                targetValue: 20,
                priority: 'urgent'
            }
        },
        {
            match: text => /砍柴|伐木|搬木|柴火|木柴|木头/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'COLLECT_WOOD',
                targetLocation: 'lumber_camp',
                stateDesc: '砍柴',
                reason: '去伐木场砍柴',
                targetValue: 30,
                priority: 'high'
            }
        },
        {
            match: text => /捕鱼|抓鱼|钓鱼|采集食物|找吃的|食物/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'COLLECT_FOOD',
                targetLocation: 'frozen_lake',
                stateDesc: '采集食物',
                reason: '去冰湖采集食物',
                targetValue: 20,
                priority: 'high'
            }
        },
        { match: text => /采矿|挖矿|矿石|矿渣/.test(text), action: { type: 'go_to', target: 'ore_pile', reason: '去矿渣堆采矿' } },
        {
            match: text => /探索|废墟|搜寻|侦察/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'COLLECT_MATERIAL',
                targetLocation: 'ruins_site',
                stateDesc: '探索废墟',
                reason: '去废墟探索物资',
                targetValue: 1,
                priority: 'high'
            }
        },
        {
            match: text => /安抚|鼓舞|打气|安慰|谈心|稳定士气/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'BOOST_MORALE',
                targetLocation: 'furnace_plaza',
                stateDesc: '安抚',
                reason: '去暖炉广场安抚大家',
                targetValue: 1,
                priority: 'high'
            }
        },
        {
            match: text => /巡逻|守夜|警戒|看守/.test(text),
            action: {
                mode: 'task_system',
                taskType: 'MAINTAIN_ORDER',
                targetLocation: 'furnace_plaza',
                stateDesc: '巡逻',
                reason: '去暖炉广场巡逻',
                targetValue: 1,
                priority: 'high'
            }
        },
        { match: text => /仓库|整理物资|盘点|清点库存/.test(text), action: { type: 'go_to', target: 'warehouse_door', reason: '去仓库整理物资' } },
        { match: text => /待命|原地|别动|守在这/.test(text), action: { type: 'go_to', target: 'furnace_plaza', reason: '去暖炉广场原地待命' } },
        { match: text => /巡视|逛逛|转转|随便走走/.test(text), action: { type: 'go_to', target: 'furnace_plaza', reason: '去广场巡视' } },
        { match: text => /工作|干活|忙起来|去干活/.test(text), action: { type: 'go_to', target: 'workshop_door', reason: '去工坊工作' } },
    ];

    const COMMANDER_LLM_INTENT_LIBRARY = {
        BUILD_LUMBER_MILL: { mode: 'task_system', taskType: 'BUILD_LUMBER_MILL', resourceType: null, desc: '去工坊建造自动伐木机，建成后可自动产柴', ...COMMANDER_TASK_DEFAULTS.BUILD_LUMBER_MILL },
        BUILD_GENERATOR: { mode: 'task_system', taskType: 'BUILD_GENERATOR', resourceType: null, desc: '去工坊建造自动发电机，建成后可自动产电', ...COMMANDER_TASK_DEFAULTS.BUILD_GENERATOR },
        DISTRIBUTE_FOOD: { mode: 'task_system', taskType: 'DISTRIBUTE_FOOD', resourceType: null, desc: '去炊事房做饭，减少食物浪费', ...COMMANDER_TASK_DEFAULTS.DISTRIBUTE_FOOD },
        PREPARE_MEDICAL: { mode: 'task_system', taskType: 'PREPARE_MEDICAL', resourceType: null, desc: '去医疗站治疗伤员或处理医疗事务', ...COMMANDER_TASK_DEFAULTS.PREPARE_MEDICAL },
        MAINTAIN_POWER: { mode: 'task_system', taskType: 'MAINTAIN_POWER', resourceType: 'power', desc: '去工坊人工发电，紧急补电', ...COMMANDER_TASK_DEFAULTS.MAINTAIN_POWER },
        COLLECT_WOOD: { mode: 'task_system', taskType: 'COLLECT_WOOD', resourceType: 'woodFuel', desc: '去伐木场砍柴补充木柴', ...COMMANDER_TASK_DEFAULTS.COLLECT_WOOD },
        COLLECT_FOOD: { mode: 'task_system', taskType: 'COLLECT_FOOD', resourceType: 'food', desc: '去冰湖采集食物', ...COMMANDER_TASK_DEFAULTS.COLLECT_FOOD },
        COLLECT_MATERIAL: { mode: 'task_system', taskType: 'COLLECT_MATERIAL', resourceType: null, desc: '去废墟探索物资', ...COMMANDER_TASK_DEFAULTS.COLLECT_MATERIAL },
        BOOST_MORALE: { mode: 'task_system', taskType: 'BOOST_MORALE', resourceType: null, desc: '去安抚和鼓舞大家，恢复士气', ...COMMANDER_TASK_DEFAULTS.BOOST_MORALE },
        MAINTAIN_ORDER: { mode: 'task_system', taskType: 'MAINTAIN_ORDER', resourceType: null, desc: '去暖炉广场巡逻警戒', ...COMMANDER_TASK_DEFAULTS.MAINTAIN_ORDER },
        MINE_POWER: { mode: 'task_system', taskType: 'MINE_POWER', targetLocation: 'ore_pile', stateDesc: '采矿', reason: '去矿渣堆采矿', targetValue: 20, priority: 'high', resourceType: 'power', desc: '去矿渣堆采矿发电' },
        // MAINTAIN_FURNACE已移除（v4.13: 暖炉是被动系统，不需要人维护）
        PSYCHOLOGY: { mode: 'task_system', taskType: 'PSYCHOLOGY', targetLocation: 'medical_door', stateDesc: '心理疏导', reason: '去医疗站心理疏导', targetValue: 1, priority: 'high', resourceType: null, desc: '去医疗站做心理疏导' },
        WAREHOUSE: { mode: 'task_system', taskType: 'WAREHOUSE', targetLocation: 'warehouse_door', stateDesc: '盘点物资', reason: '去仓库盘点物资', targetValue: 1, priority: 'high', resourceType: null, desc: '去仓库盘点物资，减少浪费' },
        REST: { type: 'rest', reason: '回宿舍休息', priority: 'urgent', desc: '回宿舍休息恢复体力' },
        EAT: { type: 'eat', target: 'kitchen_door', reason: '去吃饭', priority: 'urgent', desc: '去炊事房吃饭' },
        WORK: { type: 'go_to', target: 'workshop_door', reason: '去工坊工作', priority: 'normal', desc: '去工坊工作' },
        STAY: { type: 'go_to', target: 'furnace_plaza', reason: '去广场待命', priority: 'normal', desc: '去暖炉广场待命' },
        WANDER: { type: 'go_to', target: 'furnace_plaza', reason: '去广场巡视', priority: 'low', desc: '去暖炉广场巡视' },
    };

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

    proto._escapeCommanderHtml = function(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    proto._getCommanderDisplayName = function(npc) {
        return COMMANDER_NAME_MAP[npc?.id] || npc?.name || npc?.id || '幸存者';
    }

    proto._syncPauseButtonState = function() {
        const btn = document.getElementById('btn-pause');
        if (btn) btn.textContent = this.paused ? '▶️' : '⏸️';
    }

    proto._ensureCommanderState = function() {
        if (typeof this.commandModeActive !== 'boolean') this.commandModeActive = false;
        if (!Array.isArray(this.commandHistory)) this.commandHistory = [];
        if (typeof this._commanderPauseWasPaused !== 'boolean') this._commanderPauseWasPaused = false;
        if (typeof this._commanderBusy !== 'boolean') this._commanderBusy = false;
        if (!this._commanderUI) this._createCommanderUI();
    }

    proto._createCommanderUI = function() {
        const overlay = document.createElement('div');
        overlay.id = 'commander-overlay';
        overlay.style.cssText = [
            'display:none',
            'position:fixed',
            'left:50%',
            'top:50%',
            'transform:translate(-50%, -50%)',
            'width:min(780px, calc(100vw - 32px))',
            'max-height:calc(100vh - 32px)',
            'overflow:hidden',
            'z-index:10020',
            'background:linear-gradient(180deg, rgba(10,18,28,0.97), rgba(6,10,18,0.94))',
            'border:1px solid rgba(120,190,255,0.28)',
            'border-radius:16px',
            'box-shadow:0 30px 80px rgba(0,0,0,0.45)',
            'backdrop-filter:blur(10px)',
            'color:#e6f4ff',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
        ].join(';');
        overlay.innerHTML = `
            <div style="padding:18px 20px 14px;border-bottom:1px solid rgba(120,190,255,0.16);display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                    <div style="font-size:20px;font-weight:700;letter-spacing:0.5px;">🧭 指挥暂停</div>
                    <div style="margin-top:6px;font-size:12px;color:rgba(214,234,255,0.72);">按下命令后，NPC 会立刻改令并重新行动。也支持点名提问，比如“老钱，我问你发电机还差什么，现在进度怎么样了”。</div>
                </div>
                <button id="commander-close" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;">继续观察</button>
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,0.8fr);gap:16px;padding:16px;align-items:start;">
                <div style="display:flex;flex-direction:column;gap:12px;min-width:0;">
                    <textarea id="commander-input" placeholder="例如：
全员吃饭
王策，你太累了，快去休息
老钱，你去建伐木机
老钱，我问你发电机需要什么条件，现在进度怎么样了" style="min-height:180px;resize:vertical;background:rgba(255,255,255,0.06);border:1px solid rgba(120,190,255,0.18);border-radius:12px;padding:14px 16px;color:#f8fbff;font-size:14px;line-height:1.7;outline:none;"></textarea>
                    <div id="commander-feedback" style="min-height:22px;font-size:12px;color:#9ed0ff;"></div>
                    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
                        <button id="commander-submit" style="background:linear-gradient(135deg,#4ea8ff,#5ce1e6);color:#07131f;border:none;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer;">下达并继续</button>
                        <button id="commander-keep-paused" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);color:#e6f4ff;border-radius:10px;padding:10px 14px;cursor:pointer;">下达但保持暂停</button>
                        <span style="font-size:12px;color:rgba(214,234,255,0.6);">快捷键：Q 打开/关闭，Ctrl/⌘ + Enter 下达命令，Esc 退出</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(120,190,255,0.12);border-radius:12px;padding:12px;">
                        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">最近指挥记录</div>
                        <div id="commander-history" style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow:auto;"></div>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:12px;min-width:0;">
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(120,190,255,0.12);border-radius:12px;padding:12px;">
                        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">当前队伍状态</div>
                        <div id="commander-status" style="display:flex;flex-direction:column;gap:8px;max-height:470px;overflow:auto;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#commander-input');
        const submitBtn = overlay.querySelector('#commander-submit');
        const keepPausedBtn = overlay.querySelector('#commander-keep-paused');
        const closeBtn = overlay.querySelector('#commander-close');
        const feedback = overlay.querySelector('#commander-feedback');
        const history = overlay.querySelector('#commander-history');
        const status = overlay.querySelector('#commander-status');

        closeBtn.addEventListener('click', () => {
            if (this._commanderBusy) return;
            this._closeCommandMode({ restorePreviousPause: true });
        });
        submitBtn.addEventListener('click', () => {
            if (this._commanderBusy) return;
            this._submitCommanderCommand({ keepPaused: false });
        });
        keepPausedBtn.addEventListener('click', () => {
            if (this._commanderBusy) return;
            this._submitCommanderCommand({ keepPaused: true });
        });
        input.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (this._commanderBusy) return;
                this._submitCommanderCommand({ keepPaused: false });
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (this._commanderBusy) return;
                this._closeCommandMode({ restorePreviousPause: true });
            }
        });

        this._commanderUI = { overlay, input, submitBtn, keepPausedBtn, closeBtn, feedback, history, status };
    }

    proto._getCommanderAliasesForNpc = function(npc) {
        const extras = COMMANDER_ALIAS_MAP[npc.id] || [];
        const aliases = [npc.name, npc.id, ...extras]
            .map(v => (v || '').trim())
            .filter(Boolean);
        return [...new Set(aliases)];
    }

    proto._getCommanderSubjects = function() {
        const subjects = [
            { type: 'all', alias: '全员' },
            { type: 'all', alias: '所有人' },
            { type: 'all', alias: '大家' },
            { type: 'all', alias: '全部人' },
        ];
        for (const npc of this.npcs) {
            for (const alias of this._getCommanderAliasesForNpc(npc)) {
                subjects.push({ type: 'npc', alias, npc });
            }
        }
        return subjects;
    }

    proto._splitCommanderStatements = function(rawText) {
        const roughParts = String(rawText || '')
            .replace(/[；;！!？?]/g, '。')
            .split(/[。\n]+/)
            .map(part => part.trim())
            .filter(Boolean);

        const results = [];
        for (const part of roughParts) {
            const matches = [];
            for (const subject of this._getCommanderSubjects()) {
                const idx = part.indexOf(subject.alias);
                if (idx >= 0) matches.push({ ...subject, idx });
            }
            matches.sort((a, b) => a.idx - b.idx || b.alias.length - a.alias.length);

            const splitPoints = [];
            for (const match of matches) {
                const lastPoint = splitPoints[splitPoints.length - 1];
                if (lastPoint === match.idx) continue;
                if (match.idx > 0) splitPoints.push(match.idx);
            }

            if (!splitPoints.length) {
                results.push(part);
                continue;
            }

            let start = 0;
            for (const point of splitPoints) {
                if (point <= start) continue;
                const section = part.slice(start, point).trim().replace(/^，|^,/, '').trim();
                if (section) results.push(section);
                start = point;
            }
            const tail = part.slice(start).trim();
            if (tail) results.push(tail);
        }
        return results;
    }

    proto._resolveCommanderTargets = function(statement, allowFallbackAll) {
        const text = String(statement || '');
        const liveNpcs = this.npcs.filter(npc => !npc.isDead);
        if (!liveNpcs.length) return [];

        if (/(全员|所有人|大家|全部人)/.test(text)) return liveNpcs;

        const targets = [];
        for (const npc of liveNpcs) {
            const matched = this._getCommanderAliasesForNpc(npc).some(alias => alias && text.includes(alias));
            if (matched) targets.push(npc);
        }
        if (targets.length) return targets;
        return allowFallbackAll ? liveNpcs : [];
    }

    proto._setCommanderBusy = function(isBusy, text) {
        this._ensureCommanderState();
        this._commanderBusy = !!isBusy;
        if (!this._commanderUI) return;

        const ui = this._commanderUI;
        if (ui.input) ui.input.disabled = !!isBusy;
        if (ui.submitBtn) ui.submitBtn.disabled = !!isBusy;
        if (ui.keepPausedBtn) ui.keepPausedBtn.disabled = !!isBusy;
        if (ui.closeBtn) ui.closeBtn.disabled = !!isBusy;

        if (ui.submitBtn) ui.submitBtn.style.opacity = isBusy ? '0.65' : '1';
        if (ui.keepPausedBtn) ui.keepPausedBtn.style.opacity = isBusy ? '0.65' : '1';
        if (ui.closeBtn) ui.closeBtn.style.opacity = isBusy ? '0.55' : '1';
        if (ui.submitBtn) ui.submitBtn.style.cursor = isBusy ? 'wait' : 'pointer';
        if (ui.keepPausedBtn) ui.keepPausedBtn.style.cursor = isBusy ? 'wait' : 'pointer';
        if (ui.closeBtn) ui.closeBtn.style.cursor = isBusy ? 'not-allowed' : 'pointer';

        if (typeof text === 'string') {
            ui.feedback.textContent = text;
        }
    }

    proto._analyzeCommanderQuestion = function(statement) {
        const rawText = String(statement || '').trim();
        const compactText = rawText.replace(/[\s，,、：:“”"'‘’？?！!。\.]/g, '');
        const aboutGenerator = /发电机|自动发电/.test(compactText);
        const aboutLumberMill = /伐木机|自动伐木/.test(compactText);
        const asksResources = /资源|物资|库存|木柴|食物|电力/.test(compactText);
        const asksConditions = /条件|需要什么|缺什么|还差什么|门槛|解锁|怎么建|可建|能建/.test(compactText);
        const asksProgress = /进度|进展|做到哪|进行到哪|完成了没|完成没有|什么情况|怎么样了/.test(compactText);
        const asksTeamStatus = /全员|大家|所有人|全部人|队伍|分工|安排|都在干什么|都在忙什么/.test(compactText);
        const asksSelfStatus = /(你现在|你在干什么|你干什么|你忙什么|你的任务|你负责|你那边)/.test(compactText)
            || (!asksTeamStatus && !aboutGenerator && !aboutLumberMill && /在干什么|干什么|忙什么|进度|进展|怎么样了|完成了没|完成没有/.test(compactText));
        const isQuestion = /我问你|问你|问下|问问|请问|回答我|告诉我|说说|汇报|报告一下|什么条件|需要什么|缺什么|还差什么|进度|进展|做到哪|进行到哪|怎么样了|什么情况|在干什么|干什么|忙什么|完成了没|完成没有|资源怎么样|物资怎么样|解锁|可建|能建|现在怎么样/.test(compactText);

        return {
            rawText,
            compactText,
            isQuestion,
            aboutGenerator,
            aboutLumberMill,
            asksResources,
            asksConditions,
            asksProgress,
            asksTeamStatus,
            asksSelfStatus,
            sharedTopic: asksTeamStatus || aboutGenerator || aboutLumberMill || asksResources,
        };
    }

    proto._resolveCommanderQuestionTargets = function(statement, allowFallbackSingle) {
        const targets = this._resolveCommanderTargets(statement, false);
        if (targets.length) return targets;
        if (!allowFallbackSingle) return [];

        const nearest = this._nearestNPCToCamera(999);
        if (nearest && !nearest.isDead) return [nearest];

        const fallback = this.npcs.find(npc => !npc.isDead);
        return fallback ? [fallback] : [];
    }

    proto._parseCommanderQuestion = function(statement, allowFallbackSingle) {
        const analysis = this._analyzeCommanderQuestion(statement);
        if (!analysis.isQuestion) return null;

        return {
            raw: statement,
            analysis,
            targets: this._resolveCommanderQuestionTargets(statement, allowFallbackSingle),
        };
    }

    proto._parseCommanderAction = function(statement) {
        const compactText = String(statement || '').replace(/[\s，,、：:“”"'‘’]/g, '');
        for (const preset of COMMANDER_ACTION_PRESETS) {
            if (preset.match(compactText)) {
                return { ...preset.action };
            }
        }
        return null;
    }

    proto._parseCommanderDirective = function(statement, allowFallbackAll) {
        const action = this._parseCommanderAction(statement);
        if (!action) return null;
        return {
            raw: statement,
            action,
            targets: this._resolveCommanderTargets(statement, allowFallbackAll),
        };
    }

    proto._getCommanderActiveDirectiveDesc = function(npc) {
        if (!npc) return '';

        if (npc._taskOverride && npc._taskOverride.isActive) {
            if (typeof npc._getTaskOverrideDesc === 'function') {
                const taskDesc = npc._getTaskOverrideDesc();
                if (taskDesc) return taskDesc;
            }
            if (npc._taskOverride.stateDesc) {
                return npc._taskOverrideReached
                    ? npc._taskOverride.stateDesc
                    : `前往${npc._taskOverride.stateDesc}`;
            }
        }

        if (npc._resourceGatherOverride && npc._resourceGatherTarget) {
            const gatherNames = {
                wood: '砍柴',
                woodFuel: '砍柴',
                food: '采集食物',
                power: '采矿',
                explore: '探索废墟',
            };
            const gatherDesc = gatherNames[npc._resourceGatherType] || '采集物资';
            return `前往${gatherDesc}`;
        }

        if (npc._actionOverride && npc._currentAction) {
            return npc._currentAction.reason || npc.stateDesc || npc._currentAction.type || '';
        }

        return '';
    }

    proto._normalizeCommanderReplyText = function(text) {
        const cleaned = String(text || '').trim();
        if (!cleaned) return '';
        if (/^指挥官[，,:：]?/.test(cleaned)) {
            return cleaned.replace(/^指挥官[,:：]?/, '指挥官，');
        }
        return `指挥官，${cleaned.replace(/^，+/, '')}`;
    }

    proto._getCommanderWorldSummaryForLLM = function() {
        const lines = [];
        const timeStr = typeof this.getTimeStr === 'function' ? this.getTimeStr() : '';
        const period = typeof this.getTimePeriod === 'function' ? this.getTimePeriod() : '';
        const header = `当前时间：第${this.dayCount}天 ${timeStr} ${period}`.replace(/\s+/g, ' ').trim();
        if (header) lines.push(header);

        if (this.weatherSystem && typeof this.weatherSystem.getWeatherStr === 'function') {
            lines.push(`天气：${this.weatherSystem.getWeatherStr()}`);
        } else if (this.weather) {
            lines.push(`天气：${this.weather}`);
        }

        if (this.weatherSystem && typeof this.weatherSystem.getSurvivalSummary === 'function') {
            lines.push(`生存状况：${this.weatherSystem.getSurvivalSummary()}`);
        }
        if (this.weatherSystem && typeof this.weatherSystem.getBlizzardUrgencyForPrompt === 'function') {
            const urgency = this.weatherSystem.getBlizzardUrgencyForPrompt();
            if (urgency) lines.push(urgency);
        }
        if (this.resourceSystem && typeof this.resourceSystem.getResourceStatusForPrompt === 'function') {
            lines.push(`资源：${this.resourceSystem.getResourceStatusForPrompt()}`);
        }
        if (this.taskSystem && typeof this.taskSystem.getTaskSummaryForPrompt === 'function') {
            lines.push(`任务汇总：${this.taskSystem.getTaskSummaryForPrompt()}`);
        }
        if (this.machineSystem && typeof this.machineSystem.getMachineStatusForPrompt === 'function') {
            lines.push(`设施：${this.machineSystem.getMachineStatusForPrompt()}`);
        }
        if (this.deathSystem && typeof this.deathSystem.getDeathSummaryForPrompt === 'function') {
            const deathSummary = this.deathSystem.getDeathSummaryForPrompt();
            if (deathSummary) lines.push(`死亡情况：${deathSummary}`);
        }

        const aliveSummary = this.npcs
            .filter(npc => !npc.isDead)
            .map(npc => {
                const scene = typeof npc.getSceneLabel === 'function' ? npc.getSceneLabel() : (npc.currentScene || '未知场景');
                const currentTask = this._getCommanderDisplayTaskForNpc(npc);
                const bodyTemp = Number.isFinite(npc.bodyTemp) ? npc.bodyTemp.toFixed(1) : '?';
                return `${npc.id}/${this._getCommanderDisplayName(npc)}：场景${scene}，状态${currentTask}，体力${Math.round(npc.stamina || 0)}，健康${Math.round(npc.health || 0)}，San${Math.round(npc.sanity || 0)}，饱腹${Math.round(npc.hunger || 0)}，体温${bodyTemp}°C`;
            });
        if (aliveSummary.length) {
            lines.push(`存活成员：${aliveSummary.join('；')}`);
        }

        return lines.filter(Boolean).join('\n');
    }

    proto._getCommanderPlannerIntentCatalog = function() {
        return Object.entries(COMMANDER_LLM_INTENT_LIBRARY)
            .map(([key, action]) => {
                if (action.mode === 'task_system') {
                    return `${key}: ${action.desc || action.reason}（目标:${action.targetLocation}，持续状态:${action.stateDesc}，优先级:${action.priority || 'normal'}）`;
                }
                const targetLabel = action.target && GST.NPC.ACTION_TARGETS
                    ? (GST.NPC.ACTION_TARGETS[action.target] || action.target)
                    : '无固定目标';
                return `${key}: ${action.desc || action.reason}（动作:${action.type}，目标:${targetLabel}，优先级:${action.priority || 'normal'}）`;
            })
            .join('\n');
    }

    proto._resolveCommanderPlanTargets = function(targetSpecs, statement, allowFallbackSingle, isQuestion) {
        const liveNpcs = this.npcs.filter(npc => !npc.isDead);
        if (!liveNpcs.length) return [];

        const fallbackTargets = isQuestion
            ? this._resolveCommanderQuestionTargets(statement, allowFallbackSingle)
            : this._resolveCommanderTargets(statement, allowFallbackSingle);

        if (!Array.isArray(targetSpecs) || !targetSpecs.length) {
            return fallbackTargets;
        }

        const normalizedSpecs = targetSpecs
            .map(spec => String(spec || '').trim())
            .filter(Boolean);
        if (!normalizedSpecs.length) return fallbackTargets;

        if (normalizedSpecs.some(spec => /^(all|ALL|全员|大家|所有人|全部人)$/.test(spec))) {
            return liveNpcs;
        }

        const results = [];
        for (const spec of normalizedSpecs) {
            for (const npc of liveNpcs) {
                const aliases = [
                    npc.id,
                    npc.name,
                    this._getCommanderDisplayName(npc),
                    ...this._getCommanderAliasesForNpc(npc),
                ].filter(Boolean);
                const matched = aliases.some(alias => alias === spec || alias.includes(spec) || spec.includes(alias));
                if (matched) {
                    if (!results.includes(npc)) results.push(npc);
                    break;
                }
            }
        }

        return results.length ? results : fallbackTargets;
    }

    proto._normalizeCommanderPlanAction = function(plan) {
        if (!plan || typeof plan !== 'object') return null;

        const key = String(plan.intentKey || plan.actionKey || '').trim().toUpperCase();
        if (key && COMMANDER_LLM_INTENT_LIBRARY[key]) {
            const preset = COMMANDER_LLM_INTENT_LIBRARY[key];
            const customReason = String(plan.reason || '').trim();
            return {
                ...preset,
                reason: customReason || preset.reason,
                displayDesc: customReason || preset.reason,
            };
        }

        const rawAction = plan.action && typeof plan.action === 'object' ? plan.action : null;
        if (!rawAction) return null;

        const type = String(rawAction.type || '').trim();
        if (!GST.NPC.ACTION_TYPES || !GST.NPC.ACTION_TYPES.includes(type)) return null;

        const action = {
            type,
            target: rawAction.target || null,
            reason: String(rawAction.reason || plan.reason || '').trim() || '执行命令',
            priority: 'normal',
        };

        const priority = String(rawAction.priority || '').trim();
        if (priority === 'urgent' || priority === 'normal' || priority === 'low') {
            action.priority = priority;
        } else if (type === 'rest' || type === 'eat') {
            action.priority = 'urgent';
        }

        if (rawAction.companion) action.companion = rawAction.companion;
        if (action.target && GST.NPC.ACTION_TARGETS && !GST.NPC.ACTION_TARGETS[action.target]) {
        if (!['rest'].includes(type)) {
                return null;
            }
        }
        return action;
    }

    proto._planCommanderStatementWithLLM = async function(statement, allowFallbackSingle) {
        if (!GST || typeof GST.parseLLMJSON !== 'function') return null;
        const callLLM = typeof GST.callLLMDirect === 'function' ? GST.callLLMDirect : GST.callLLM;
        if (typeof callLLM !== 'function') return null;

        const liveNpcs = this.npcs.filter(npc => !npc.isDead);
        if (!liveNpcs.length) return null;

        const npcCatalog = liveNpcs.map(npc => {
            const aliases = this._getCommanderAliasesForNpc(npc).join('/');
            return `${npc.id}（显示名:${this._getCommanderDisplayName(npc)}，别名:${aliases || npc.name}）`;
        }).join('\n');

        const fallbackHint = allowFallbackSingle
            ? '这是一条单独语句。如果没有明确点名，你可以自行选择最合适的幸存者，或在明显是群体命令时使用 ["all"]。'
            : '如果语句已明确点名或上下文限定，请优先使用被点名的幸存者。';

        const systemPrompt = `你是末日生存游戏中的“玩家指挥解析器”。你的任务是把一条中文指挥语句解析成结构化JSON，并在需要时生成一句自然、简短、贴合当前局势的NPC回复。
只输出JSON，不要Markdown，不要解释。
必须只使用提供的存活NPC id；不要让死人执行任务。
如果是提问，kind 必须是 question，并写出给指挥官的回复文本。
如果是命令，kind 必须是 directive，并且 intentKey 只能从允许列表中选择；如果允许列表都不合适，返回 unknown。
targets 是 NPC id 数组；如果明确是全员就填 ["all"]。
replyMode 只能是 single 或 all。
question 的 reply 要用幸存者口吻，简洁自然，可以以“指挥官，”开头。
directive 的 reply 是收到命令后的简短回应，可以留空。
优先理解真实意图，不要机械照抄原句。`;

        const userPrompt = `【世界状态】
${this._getCommanderWorldSummaryForLLM()}

【存活NPC】
${npcCatalog}

【可选命令意图键】
${this._getCommanderPlannerIntentCatalog()}

【解析要求】
- 如果语句是在询问现状、进度、资源、条件、谁在做什么，用 question。
- 如果语句是在安排工作、命令人行动，用 directive。
- 如果是问“大家/全员/队伍”情况，replyMode 通常用 single，让最合适的一个人代表回答。
- 不要发明新的 intentKey。
- 回复内容要贴合当前世界状态。
- 如果明显无法理解，就返回 {"kind":"unknown"}。
- ${fallbackHint}

【待解析语句】
${statement}

【输出JSON示例】
{"kind":"directive","targets":["lu_chen"],"replyMode":"all","reply":"指挥官，收到，我这就去补木柴。","intentKey":"COLLECT_WOOD","reason":"去伐木场砍柴"}
{"kind":"question","targets":["old_qian"],"replyMode":"single","reply":"指挥官，发电机还没开工，现在还差木柴和电力。"}
{"kind":"unknown"}`;

        try {
            const raw = await callLLM(systemPrompt, userPrompt, 700);
            const parsed = GST.parseLLMJSON(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (err) {
            console.warn('[CommanderLLM] 解析指挥语句失败:', err);
            return null;
        }
    }

    proto._getCommanderResourceReply = function() {
        const rs = this.resourceSystem;
        if (!rs) return '我这边暂时拿不到仓库账本。';

        const formatRemain = value => {
            if (!Number.isFinite(value) || value >= 999) return '∞';
            return String(Math.max(0, Math.round(value)));
        };

        const woodHours = typeof rs.getWoodFuelHoursRemaining === 'function' ? rs.getWoodFuelHoursRemaining() : 0;
        const foodMeals = typeof rs.getFoodMealsRemaining === 'function' ? rs.getFoodMealsRemaining() : 0;
        const powerHours = typeof rs.getPowerHoursRemaining === 'function' ? rs.getPowerHoursRemaining() : 0;

        let reply = `现在仓库里木柴${Math.round(rs.woodFuel || 0)}（大概还能撑${formatRemain(woodHours)}小时），食物${Math.round(rs.food || 0)}（够${formatRemain(foodMeals)}餐），电力${Math.round(rs.power || 0)}（还能用${formatRemain(powerHours)}小时）`;
        if (typeof rs.hasAnyCrisis === 'function' && rs.hasAnyCrisis()) {
            const crisis = [];
            if (rs.crisisFlags?.noFood) crisis.push('食物见底');
            if (rs.crisisFlags?.noPower) crisis.push('电力告急');
            if (rs.crisisFlags?.noWoodFuel) crisis.push('木柴见底');
            if (crisis.length) {
                reply += `，眼下最危险的是${crisis.join('、')}`;
            }
        }
        return `${reply}。`;
    }

    proto._getCommanderNpcTaskReply = function(npc) {
        if (!npc) return '我这边暂时汇报不了。';

        const activeDirectiveDesc = this._getCommanderActiveDirectiveDesc(npc);
        if (activeDirectiveDesc) {
            if (/建造发电机/.test(activeDirectiveDesc) && this.machineSystem && typeof this.machineSystem.getMachineDetail === 'function') {
                const detail = this.machineSystem.getMachineDetail('generator');
                if (detail?.built) return `我这边刚忙完，${detail.name}已经建好了。`;
                if (detail?.building) return `我现在在${activeDirectiveDesc}，现场进度${detail.buildProgressPercent}%。`;
            }
            if (/建造伐木机/.test(activeDirectiveDesc) && this.machineSystem && typeof this.machineSystem.getMachineDetail === 'function') {
                const detail = this.machineSystem.getMachineDetail('lumberMill');
                if (detail?.built) return `我这边刚忙完，${detail.name}已经建好了。`;
                if (detail?.building) return `我现在在${activeDirectiveDesc}，现场进度${detail.buildProgressPercent}%。`;
            }
            return `我现在在${activeDirectiveDesc}。`;
        }

        const taskSystem = this.taskSystem;
        const task = taskSystem && typeof taskSystem.getNpcTask === 'function'
            ? taskSystem.getNpcTask(npc.id)
            : null;
        const state = taskSystem?.npcTaskState ? taskSystem.npcTaskState[npc.id] : null;

        if (task) {
            const label = COMMANDER_TASK_LABELS[task.type] || task.name || task.type || '任务';
            let reply = `我现在负责${label}`;

            if (task.type === 'BUILD_GENERATOR' || task.type === 'BUILD_LUMBER_MILL') {
                const machineType = task.type === 'BUILD_GENERATOR' ? 'generator' : 'lumberMill';
                const detail = this.machineSystem && typeof this.machineSystem.getMachineDetail === 'function'
                    ? this.machineSystem.getMachineDetail(machineType)
                    : null;
                if (detail?.built) {
                    reply += '，已经建好了';
                } else if (detail?.building) {
                    reply += `，现场建造进度${detail.buildProgressPercent}%`;
                    if (detail.buildPaused) reply += '，不过现在暂时停工了';
                } else if (detail) {
                    reply += '，还没正式开工';
                }
            } else if (task.status === 'completed') {
                reply += '，已经完成了';
            } else if (state && state.paused) {
                reply += `，目前暂停着，原因是${state.pauseReason || '条件不足'}`;
            } else if (task.target > 0) {
                const pct = Math.max(0, Math.min(100, Math.round((task.progress / task.target) * 100)));
                reply += `，进度大约${pct}%`;
            }

            const stateDesc = npc.stateDesc || npc._currentAction?.reason || '';
            if (stateDesc && !reply.includes(stateDesc)) {
                reply += `，眼下在${stateDesc}`;
            }
            return `${reply}。`;
        }

        const stateDesc = npc.stateDesc || npc._currentAction?.reason || npc.state || '待命';
        return `我现在在${stateDesc}。`;
    }

    proto._getCommanderTeamSummaryReply = function() {
        const living = this.npcs.filter(npc => !npc.isDead);
        if (!living.length) return '现在没有还能行动的人手了。';

        const summary = living.map(npc => {
            const name = this._getCommanderDisplayName(npc);
            const task = this._getCommanderDisplayTaskForNpc(npc);
            return `${name}在${task}`;
        });
        return `我看了一圈，目前${summary.join('；')}。`;
    }

    proto._formatCommanderMachineReply = function(machineType, analysis) {
        const detail = this.machineSystem && typeof this.machineSystem.getMachineDetail === 'function'
            ? this.machineSystem.getMachineDetail(machineType)
            : null;
        if (!detail) return '';

        const parts = [];

        if (detail.built) {
            let status = `${detail.name}已经建成${detail.running ? '，现在在运行' : '，但现在停机了'}`;
            status += `，每小时产出${detail.outputLabel}${detail.outputPerHour}，消耗${detail.consumeLabel}${detail.consumePerHour}`;
            if (!detail.running) {
                status += `，当前${detail.runtimeRequirement.label}${detail.runtimeRequirement.current}`;
            }
            parts.push(status);

            if (analysis.asksConditions) {
                parts.push(`开建前要木柴${detail.buildWoodCost}、电力${detail.buildMaterialCost}，至少${detail.buildMinWorkers}人，大约${detail.buildTimeHours}小时`);
            }
            if (analysis.asksProgress || analysis.asksConditions) {
                parts.push(`累计产出${Math.round(detail.totalProduced)}${detail.outputLabel}，累计消耗${Math.round(detail.totalConsumed)}${detail.consumeLabel}`);
            }
        } else if (detail.building) {
            let status = `${detail.name}正在建造，当前进度${detail.buildProgressPercent}%`;
            if (detail.buildWorkers.length) {
                status += `，施工人手有${detail.buildWorkers.join('、')}`;
            }
            if (detail.buildPaused) {
                status += '，不过现在因为木柴储备过低暂停了';
            }
            parts.push(status);
            parts.push(`建造要木柴${detail.buildWoodCost}、电力${detail.buildMaterialCost}，至少${detail.buildMinWorkers}人，大约${detail.buildTimeHours}小时`);
        } else {
            const unmet = detail.unlockMissing.length
                ? `解锁还差${detail.unlockMissing.join('，')}`
                : '解锁条件已经满足';
            parts.push(`${detail.name}还没开工，${unmet}`);
            parts.push(`正式建造要木柴${detail.buildWoodCost}、电力${detail.buildMaterialCost}，至少${detail.buildMinWorkers}人，大约${detail.buildTimeHours}小时`);
        }

        return parts
            .filter(Boolean)
            .map(text => String(text).replace(/。+$/g, ''))
            .join('。') + '。';
    }

    proto._buildCommanderQuestionReply = function(npc, question) {
        if (!npc || !question || !question.analysis) return '';

        const { analysis } = question;
        if (analysis.asksTeamStatus) {
            return `指挥官，${this._getCommanderTeamSummaryReply()}`;
        }

        const parts = [];
        if (analysis.aboutGenerator) {
            parts.push(this._formatCommanderMachineReply('generator', analysis));
        }
        if (analysis.aboutLumberMill) {
            parts.push(this._formatCommanderMachineReply('lumberMill', analysis));
        }

        if (analysis.asksResources && !analysis.aboutGenerator && !analysis.aboutLumberMill) {
            parts.push(this._getCommanderResourceReply());
        }

        if ((analysis.aboutGenerator || analysis.aboutLumberMill) && (analysis.asksConditions || analysis.asksResources || analysis.asksProgress)) {
            parts.push(this._getCommanderResourceReply());
        }

        if (analysis.asksSelfStatus || !parts.length) {
            parts.push(this._getCommanderNpcTaskReply(npc));
        }

        const merged = parts
            .filter(Boolean)
            .map(text => String(text).trim())
            .join('');

        return merged ? `指挥官，${merged}` : '';
    }

    proto._buildCommanderDirectiveReply = function(npc, directive) {
        if (!npc || !directive || !directive.action) return '';

        const action = directive.action;
        const baseReason = String(action.reason || action.stateDesc || '执行命令').replace(/。+$/g, '');

        if (action.mode === 'task_system' && (action.taskType === 'BUILD_GENERATOR' || action.taskType === 'BUILD_LUMBER_MILL')) {
            const machineType = action.taskType === 'BUILD_GENERATOR' ? 'generator' : 'lumberMill';
            const detail = this.machineSystem && typeof this.machineSystem.getMachineDetail === 'function'
                ? this.machineSystem.getMachineDetail(machineType)
                : null;

            if (detail) {
                if (detail.built) {
                    return `指挥官，收到，${detail.name}已经建好了，我先去检查运行情况。`;
                }

                if (detail.building) {
                    let reply = `指挥官，收到，我会去支援${detail.name}建设，现场进度${detail.buildProgressPercent}%`;
                    if (detail.buildWorkers.length) {
                        reply += `，现在施工的是${detail.buildWorkers.join('、')}`;
                    }
                    if (detail.buildPaused) {
                        reply += '，不过现在暂时停工了';
                    }
                    return `${reply}。`;
                }

                if (detail.unlockMissing.length) {
                    return `指挥官，收到，我会${baseReason}，不过现在还差${detail.unlockMissing.join('，')}。`;
                }

                return `指挥官，收到，我会${baseReason}，建造条件已经满足。`;
            }
        }

        return `指挥官，收到，我会${baseReason}。`;
    }

    proto._snapshotCommanderReplaceableContext = function(npc) {
        if (!npc) return null;

        const cloneAction = action => (action ? { ...action } : null);
        const cloneIntent = intent => intent ? {
            ...intent,
            action: cloneAction(intent.action),
            metadata: intent.metadata ? { ...intent.metadata } : null,
        } : null;

        return {
            taskOverride: npc._taskOverride ? { ...npc._taskOverride } : null,
            taskOverrideReached: !!npc._taskOverrideReached,
            taskOverrideStuckTimer: npc._taskOverrideStuckTimer || 0,
            taskOverrideTravelTimer: npc._taskOverrideTravelTimer || 0,
            resourceGatherOverride: !!npc._resourceGatherOverride,
            resourceGatherTarget: npc._resourceGatherTarget || null,
            resourceGatherType: npc._resourceGatherType || null,
            resourceGatherTravelTimer: npc._resourceGatherTravelTimer || 0,
            resourceGatherCooldown: npc._resourceGatherCooldown || 0,
            councilTask: npc._councilTask || null,
            councilTaskTime: npc._councilTaskTime || null,
            councilStateDesc: npc._councilStateDesc || null,
            currentIntent: cloneIntent(npc._currentIntent),
            pendingIntent: cloneIntent(npc._pendingIntent),
            pendingAction: cloneAction(npc._pendingAction),
            currentAction: cloneAction(npc._currentAction),
            actionOverride: !!npc._actionOverride,
            actionTarget: npc._actionTarget ? { ...npc._actionTarget } : null,
            actionStuckTimer: npc._actionStuckTimer || 0,
            actionTravelTimer: npc._actionTravelTimer || 0,
            stateDesc: npc.stateDesc || '',
            scheduleReached: !!npc.scheduleReached,
            activeOverride: npc._activeOverride || 'none',
        };
    }

    proto._restoreCommanderReplaceableContext = function(npc, snapshot) {
        if (!npc || !snapshot) return;

        const cloneAction = action => (action ? { ...action } : null);
        const cloneIntent = intent => intent ? {
            ...intent,
            action: cloneAction(intent.action),
            metadata: intent.metadata ? { ...intent.metadata } : null,
        } : null;

        if (snapshot.taskOverride) {
            npc._taskOverride = { ...npc._taskOverride, ...snapshot.taskOverride };
        }
        npc._taskOverrideReached = snapshot.taskOverrideReached;
        npc._taskOverrideStuckTimer = snapshot.taskOverrideStuckTimer;
        npc._taskOverrideTravelTimer = snapshot.taskOverrideTravelTimer;
        npc._resourceGatherOverride = snapshot.resourceGatherOverride;
        npc._resourceGatherTarget = snapshot.resourceGatherTarget;
        npc._resourceGatherType = snapshot.resourceGatherType;
        npc._resourceGatherTravelTimer = snapshot.resourceGatherTravelTimer;
        npc._resourceGatherCooldown = snapshot.resourceGatherCooldown;
        npc._councilTask = snapshot.councilTask;
        npc._councilTaskTime = snapshot.councilTaskTime;
        npc._councilStateDesc = snapshot.councilStateDesc;
        npc._currentIntent = cloneIntent(snapshot.currentIntent);
        npc._pendingIntent = cloneIntent(snapshot.pendingIntent);
        npc._pendingAction = cloneAction(snapshot.pendingAction);
        npc._currentAction = cloneAction(snapshot.currentAction);
        npc._actionOverride = snapshot.actionOverride;
        npc._actionTarget = snapshot.actionTarget ? { ...snapshot.actionTarget } : null;
        npc._actionStuckTimer = snapshot.actionStuckTimer;
        npc._actionTravelTimer = snapshot.actionTravelTimer;
        npc.stateDesc = snapshot.stateDesc;
        npc.scheduleReached = snapshot.scheduleReached;
        npc._activeOverride = snapshot.activeOverride;
        if (typeof npc._refreshBehaviorControl === 'function') npc._refreshBehaviorControl();
    }

    proto._clearCommanderRuntimeContext = function(npc) {
        if (!npc) return;
        npc._resourceGatherOverride = false;
        npc._resourceGatherTarget = null;
        npc._resourceGatherType = null;
        npc._resourceGatherTravelTimer = 0;
        npc._resourceGatherCooldown = 0;
        npc._councilTask = null;
        npc._councilTaskTime = null;
        npc._councilStateDesc = null;
        if (typeof npc._refreshBehaviorControl === 'function') npc._refreshBehaviorControl();
    }

    proto._clearCommanderConflictingOverrides = function(npc) {
        if (!npc) return;
        if (typeof npc._clearActionOverride === 'function') npc._clearActionOverride();
        this._clearCommanderRuntimeContext(npc);
    }

    proto._clearNpcDirectiveContext = function(npc) {
        if (!npc) return;
        if (typeof npc.deactivateTaskOverride === 'function') npc.deactivateTaskOverride();
        if (typeof npc._clearActionOverride === 'function') npc._clearActionOverride();
        npc._councilTask = null;
        npc._councilTaskTime = null;
        npc._councilStateDesc = null;
    }

    proto._removeCommanderTaskForNpc = function(npc) {
        const taskSystem = this.taskSystem;
        if (!taskSystem || !npc) return;

        const assignedTaskId = taskSystem.npcAssignments ? taskSystem.npcAssignments[npc.id] : null;
        if (assignedTaskId) {
            const taskIndex = taskSystem.dailyTasks
                ? taskSystem.dailyTasks.findIndex(task => task.id === assignedTaskId)
                : -1;
            if (taskIndex >= 0) {
                const assignedTask = taskSystem.dailyTasks[taskIndex];
                if (assignedTask && assignedTask.id && assignedTask.id.startsWith('commander_') && assignedTask.status !== 'completed') {
                    taskSystem.dailyTasks.splice(taskIndex, 1);
                }
            }
            delete taskSystem.npcAssignments[npc.id];
        }

        if (taskSystem.npcTaskState && taskSystem.npcTaskState[npc.id]) {
            delete taskSystem.npcTaskState[npc.id];
        }
    }

    proto._createCommanderTaskForNpc = function(npc, action, rawText) {
        const taskSystem = this.taskSystem;
        if (!taskSystem || !npc || !action || !action.taskType) return null;

        this._removeCommanderTaskForNpc(npc);

        const taskId = `commander_${action.taskType}_${npc.id}_${++taskSystem.taskIdCounter}`;
        const task = {
            id: taskId,
            type: action.taskType,
            name: action.reason,
            desc: rawText,
            target: action.targetValue || 1,
            progress: 0,
            assignedNpcId: npc.id,
            status: 'pending',
            priority: action.priority || 'urgent',
            isOutdoor: !!(action.targetLocation && !String(action.targetLocation).endsWith('_door') && action.targetLocation !== 'furnace_plaza'),
            startTime: null,
            completedTime: null,
            isCommanderTask: true,
            commanderRawText: rawText,
        };

        taskSystem.dailyTasks.push(task);
        taskSystem.npcAssignments[npc.id] = taskId;
        if (taskSystem.npcTaskState && taskSystem.npcTaskState[npc.id]) {
            delete taskSystem.npcTaskState[npc.id];
        }

        return task;
    }

    proto._applyCommanderTaskDirective = function(npc, directive) {
        const action = directive.action;
        if (!npc || !action || !action.targetLocation) {
            return false;
        }

        const control = typeof npc._refreshBehaviorControl === 'function'
            ? npc._refreshBehaviorControl()
            : null;
        if (control && (control.owner === 'priority' || control.owner === 'state' || control.owner === 'hunger')) {
            return false;
        }

        const snapshot = this._snapshotCommanderReplaceableContext(npc);
        if (snapshot?.taskOverride?.isActive && typeof npc.deactivateTaskOverride === 'function') {
            npc.deactivateTaskOverride();
        }
        this._clearCommanderConflictingOverrides(npc);

        const taskLabel = action.taskType || action.stateDesc || action.targetLocation || 'task';
        const taskId = `commander_${taskLabel}_${npc.id}_${Date.now()}`;

        let applied = false;
        if (typeof npc._submitExternalIntent === 'function') {
            applied = npc._submitExternalIntent({
                source: 'commander',
                taskId,
                targetLocation: action.targetLocation,
                priority: action.priority || 'high',
                resourceType: action.resourceType || null,
                stateDesc: action.stateDesc || action.reason,
                displayDesc: action.reason || action.stateDesc || '执行任务',
                effectKey: action.effectKey || null,
            });
        } else if (typeof npc.activateTaskOverride === 'function') {
            applied = npc.activateTaskOverride(
                taskId,
                action.targetLocation,
                action.priority || 'high',
                action.resourceType || null,
                action.stateDesc || action.reason,
                {
                    source: 'commander',
                    displayDesc: action.reason || action.stateDesc || '执行任务',
                    effectKey: action.effectKey || null,
                    intentId: null,
                }
            );
        }

        if (!applied) {
            this._restoreCommanderReplaceableContext(npc, snapshot);
            return false;
        }

        this._removeCommanderTaskForNpc(npc);
        npc._actionDecisionCooldown = 0;
        return true;
    }

    proto._applyCommanderDirectiveToNpc = function(npc, directive) {
        if (!npc || npc.isDead || !directive || !directive.action) return false;

        let action = {
            ...directive.action,
            priority: directive.action.priority || 'urgent',
            reason: directive.action.reason || directive.action.stateDesc || '执行命令',
            issuedByPlayer: true,
        };

        if (!directive.action.mode && action.type === 'go_to' && action.target === 'ore_pile') {
            action = { ...COMMANDER_LLM_INTENT_LIBRARY.MINE_POWER };
        } else if (!directive.action.mode && action.type === 'go_to' && action.target === 'warehouse_door') {
            action = { ...COMMANDER_LLM_INTENT_LIBRARY.WAREHOUSE };
        }

        let applied = false;
        if (action.mode === 'task_system') {
            applied = this._applyCommanderTaskDirective(npc, { ...directive, action });
        } else {
            const control = typeof npc._refreshBehaviorControl === 'function'
                ? npc._refreshBehaviorControl()
                : null;
            if (control && (control.owner === 'priority' || control.owner === 'state' || control.owner === 'hunger')) {
                return false;
            }

            const snapshot = this._snapshotCommanderReplaceableContext(npc);
            if (snapshot?.taskOverride?.isActive && typeof npc.deactivateTaskOverride === 'function') {
                npc.deactivateTaskOverride();
            }
            this._clearCommanderRuntimeContext(npc);

            if (typeof npc._createIntentFromAction === 'function' && typeof npc._submitIntent === 'function') {
                const intent = npc._createIntentFromAction(action, {
                    source: 'commander',
                    category: 'action',
                    reasoning: directive.raw,
                });
                const result = npc._submitIntent(intent, this);
                applied = result === 'execute';
                if (!applied) {
                    npc._pendingIntent = null;
                    npc._pendingAction = null;
                }
            } else if (typeof npc._executeAction === 'function') {
                npc._executeAction(action, this);
                applied = true;
            }

            if (!applied) {
                this._restoreCommanderReplaceableContext(npc, snapshot);
                return false;
            }

            this._removeCommanderTaskForNpc(npc);
            npc._actionDecisionCooldown = 0;
        }

        if (!applied) return false;

        if (typeof npc.addMemory === 'function') {
            npc.addMemory(`[指挥官命令] ${directive.raw}`);
        }
        return true;
    }

    proto._executeCommanderText = async function(rawText) {
        const statements = this._splitCommanderStatements(rawText);
        if (!statements.length) {
            return { ok: false, summary: '请输入指令。' };
        }

        const details = [];
        let appliedCount = 0;
        let answeredCount = 0;

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            const allowFallbackSingle = statements.length === 1 && i === 0;
            const llmPlan = await this._planCommanderStatementWithLLM(statement, allowFallbackSingle);

            if (llmPlan && String(llmPlan.kind || '').trim() === 'question') {
                const question = this._parseCommanderQuestion(statement, allowFallbackSingle);
                const targets = this._resolveCommanderPlanTargets(llmPlan.targets, statement, allowFallbackSingle, true);
                if (!targets.length) {
                    details.push(`未找到回答者：${statement}`);
                    continue;
                }

                const replyMode = String(llmPlan.replyMode || '').trim().toLowerCase();
                const replyTargets = replyMode === 'all' ? targets : [targets[0]];
                const replies = [];

                for (const npc of replyTargets) {
                    const replyText = this._normalizeCommanderReplyText(llmPlan.reply)
                        || (question ? this._buildCommanderQuestionReply(npc, question) : '');
                    if (!replyText) continue;
                    replies.push({
                        npc,
                        name: this._getCommanderDisplayName(npc),
                        text: replyText,
                    });
                    answeredCount++;
                }

                if (replies.length) {
                    this._appendCommanderConversationToChatLog(statement, replies.map(item => ({ name: item.name, text: item.text })));
                    for (const item of replies) {
                        this._showCommanderReplyBubble(item.npc, item.text);
                    }
                    details.push(replies.map(item => `${item.name}答：${item.text}`).join(' / '));

                    if (this.addEvent) {
                        const first = replies[0];
                        if (replies.length === 1) {
                            const brief = first.text.length > 48 ? `${first.text.slice(0, 48)}…` : first.text;
                            this.addEvent(`💬 ${first.name}回答了指挥官：${brief}`);
                        } else {
                            this.addEvent(`💬 ${replies.length}名幸存者回应了指挥官的提问`);
                        }
                    }
                    continue;
                }
            }

            if (llmPlan && String(llmPlan.kind || '').trim() === 'directive') {
                const action = this._normalizeCommanderPlanAction(llmPlan);
                const targets = this._resolveCommanderPlanTargets(llmPlan.targets, statement, allowFallbackSingle, false);
                if (action && targets.length) {
                    const directive = { raw: statement, action, targets };
                    const appliedNames = [];
                    const appliedReplies = [];

                    for (const npc of targets) {
                        if (this._applyCommanderDirectiveToNpc(npc, directive)) {
                            appliedNames.push(npc.name);
                            const replyText = this._normalizeCommanderReplyText(llmPlan.reply)
                                || this._buildCommanderDirectiveReply(npc, directive);
                            if (replyText) {
                                appliedReplies.push({
                                    npc,
                                    name: this._getCommanderDisplayName(npc),
                                    text: replyText,
                                });
                            }
                            appliedCount++;
                        }
                    }

                    if (appliedNames.length) {
                        if (appliedReplies.length) {
                            this._appendCommanderConversationToChatLog(
                                statement,
                                appliedReplies.map(item => ({ name: item.name, text: item.text })),
                                '🧭 指挥命令'
                            );
                            for (const item of appliedReplies) {
                                this._showCommanderReplyBubble(item.npc, item.text);
                            }
                        }
                        details.push(`${appliedNames.join('、')} → ${directive.action.reason}`);
                        continue;
                    }
                }
            }

            if (llmPlan) {
                const planKind = String(llmPlan.kind || '').trim() || 'unknown';
                details.push(`未能按LLM计划执行（${planKind}）：${statement}`);
                continue;
            }

            details.push(`指挥解析失败：${statement}`);
        }

        const summary = details.join('；');
        const timeStr = typeof this.getTimeStr === 'function' ? this.getTimeStr() : '';
        this.commandHistory.unshift({
            text: rawText,
            summary,
            time: `第${this.dayCount}天 ${timeStr}`.trim(),
        });
        this.commandHistory = this.commandHistory.slice(0, 12);

        if (appliedCount > 0) {
            this._refreshCommanderDecisionCard();
            if (this.addEvent) {
                this.addEvent(`🧭 指挥官下令：${summary}`);
            }
        }

        const ok = appliedCount > 0 || answeredCount > 0;
        return {
            ok,
            summary: ok ? summary : `未成功执行任何命令或问答：${summary}`,
            appliedCount,
            answeredCount,
        };
    }

    proto._renderCommanderHistory = function() {
        if (!this._commanderUI) return;
        const el = this._commanderUI.history;
        const items = this.commandHistory.slice(0, 8);
        if (!items.length) {
            el.innerHTML = '<div style="font-size:12px;color:rgba(214,234,255,0.58);">还没有下达过指挥命令。</div>';
            return;
        }
        el.innerHTML = items.map(item => `
            <div style="padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,190,255,0.08);">
                <div style="font-size:11px;color:rgba(214,234,255,0.55);margin-bottom:5px;">${this._escapeCommanderHtml(item.time)}</div>
                <div style="font-size:13px;color:#f3f9ff;line-height:1.6;white-space:pre-wrap;">${this._escapeCommanderHtml(item.text)}</div>
                <div style="margin-top:6px;font-size:12px;color:#8fd0ff;line-height:1.5;">${this._escapeCommanderHtml(item.summary)}</div>
            </div>
        `).join('');
    }

    proto._renderCommanderStatus = function() {
        if (!this._commanderUI) return;
        const el = this._commanderUI.status;
        const sceneLabel = npc => (typeof npc.getSceneLabel === 'function' ? npc.getSceneLabel() : (npc.currentScene || '未知场景'));
        const living = this.npcs.filter(npc => !npc.isDead);
        if (!living.length) {
            el.innerHTML = '<div style="font-size:12px;color:rgba(214,234,255,0.58);">当前没有可指挥的幸存者。</div>';
            return;
        }

        el.innerHTML = living.map(npc => {
            const stateDesc = npc.stateDesc || npc._currentAction?.reason || npc.state || '待命';
            const hunger = Math.round(npc.hunger || 0);
            const stamina = Math.round(npc.stamina || 0);
            const social = Math.round(npc.social || 0);
            return `
                <div style="padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,190,255,0.08);">
                    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                        <div style="font-size:14px;font-weight:700;color:#f4fbff;">${this._escapeCommanderHtml(npc.name)}</div>
                        <div style="font-size:11px;color:rgba(214,234,255,0.55);">${this._escapeCommanderHtml(sceneLabel(npc))}</div>
                    </div>
                    <div style="margin-top:6px;font-size:12px;color:#9ed0ff;line-height:1.5;">${this._escapeCommanderHtml(stateDesc)}</div>
                    <div style="margin-top:8px;font-size:11px;color:rgba(214,234,255,0.66);">🍽 ${hunger} / ⚡ ${stamina} / 🙂 ${social}</div>
                </div>
            `;
        }).join('');
    }

    proto._getCommanderDisplayTaskForNpc = function(npc) {
        if (!npc) return '待命';

        const activeDirectiveDesc = this._getCommanderActiveDirectiveDesc(npc);
        if (activeDirectiveDesc) {
            return activeDirectiveDesc;
        }

        const taskSystem = this.taskSystem;
        const assignedTaskId = taskSystem?.npcAssignments ? taskSystem.npcAssignments[npc.id] : null;
        if (assignedTaskId && Array.isArray(taskSystem?.dailyTasks)) {
            const task = taskSystem.dailyTasks.find(item => item.id === assignedTaskId);
            if (task) {
                return COMMANDER_TASK_LABELS[task.type] || task.name || task.type || '执行任务';
            }
        }

        const stateDesc = npc.stateDesc || npc._currentAction?.reason || npc.state || '待命';
        return stateDesc;
    }

    proto._showCommanderReplyBubble = function(npc, text) {
        if (!npc || !text) return;
        const bubbleText = String(text).replace(/^指挥官，/, '').trim();
        npc.expression = bubbleText.length > 72 ? `${bubbleText.slice(0, 72)}…` : bubbleText;
        npc.expressionTimer = 12;
    }

    proto._appendCommanderConversationToChatLog = function(playerText, replies, label = '🧭 指挥问答') {
        if (!playerText || !Array.isArray(replies) || !replies.length) return;

        const dm = this.dialogueManager;
        if (dm && typeof dm._addChatLogDivider === 'function' && typeof dm._addChatLogEntry === 'function') {
            dm._addChatLogDivider(label);
            dm._addChatLogEntry('指挥官', playerText, 'self');
            for (const item of replies) {
                dm._addChatLogEntry(item.name, item.text, 'other');
            }
            return;
        }

        const container = document.getElementById('chat-log-content');
        if (!container) return;

        const appendEntry = (speakerName, text, type) => {
            const entry = document.createElement('div');
            entry.className = `chat-log-msg ${type === 'self' ? 'right' : 'left'} new`;

            const speaker = document.createElement('span');
            speaker.className = 'chat-log-speaker';
            speaker.textContent = speakerName;

            const time = document.createElement('span');
            time.className = 'chat-log-time';
            time.textContent = this.getTimeStr ? ` ${this.getTimeStr()}` : '';
            speaker.appendChild(time);

            const body = document.createElement('div');
            body.className = 'chat-log-text';
            body.textContent = text;

            entry.appendChild(speaker);
            entry.appendChild(body);
            container.appendChild(entry);
            container.scrollTop = container.scrollHeight;
        };

        const divider = document.createElement('div');
        divider.className = 'chat-log-divider';
        divider.textContent = label;
        container.appendChild(divider);

        appendEntry('指挥官', playerText, 'self');
        for (const item of replies) {
            appendEntry(item.name, item.text, 'other');
        }
    }

    proto._refreshCommanderDecisionCard = function() {
        // 【v4.16】指挥分工已由右上角常驻面板(#work-plan-panel)实时显示
        // 此处触发一次面板更新即可
        if (typeof this._updateWorkPlanPanel === 'function') {
            this._updateWorkPlanPanel();
        }
    }

    proto._openCommandMode = function() {
        this._ensureCommanderState();
        this._commanderPauseWasPaused = !!this.paused;
        this.commandModeActive = true;
        this.paused = true;
        this._syncPauseButtonState();
        this._renderCommanderHistory();
        this._renderCommanderStatus();
        this._commanderUI.feedback.textContent = '输入命令或问题，然后下达。';
        this._commanderUI.overlay.style.display = 'block';
        requestAnimationFrame(() => this._commanderUI.input.focus());
    }

    proto._closeCommandMode = function(options) {
        this._ensureCommanderState();
        const opts = options || {};
        this.commandModeActive = false;
        this._commanderUI.overlay.style.display = 'none';
        this._commanderUI.feedback.textContent = '';
        if (opts.keepPaused === true) {
            this.paused = true;
        } else if (opts.restorePreviousPause) {
            this.paused = this._commanderPauseWasPaused;
        } else {
            this.paused = false;
        }
        this._syncPauseButtonState();
    }

    proto._toggleCommandMode = function() {
        this._ensureCommanderState();
        if (this.commandModeActive) {
            this._closeCommandMode({ restorePreviousPause: true });
        } else {
            this._openCommandMode();
        }
    }

    proto._submitCommanderCommand = async function(options) {
        this._ensureCommanderState();
        const opts = options || {};
        const rawText = this._commanderUI.input.value.trim();
        if (!rawText) {
            this._commanderUI.feedback.textContent = '请输入至少一条命令。';
            return;
        }

        this._setCommanderBusy(true, '指挥解析中……');
        try {
            const result = await this._executeCommanderText(rawText);
            this._commanderUI.feedback.textContent = result.summary;
            this._renderCommanderHistory();
            this._renderCommanderStatus();

            if (!result.ok) return;

            this._commanderUI.input.value = '';
            if (opts.keepPaused) {
                this.paused = true;
                this._syncPauseButtonState();
                return;
            }
            this._closeCommandMode({ restorePreviousPause: false });
        } catch (err) {
            console.error('[Commander] 提交命令失败:', err);
            this._commanderUI.feedback.textContent = '指挥解析失败，请稍后再试。';
        } finally {
            this._setCommanderBusy(false);
        }
    }

    // ---- 渲染 ----;

    proto._setupControls = function() {
        this._ensureCommanderState();

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
        this._ensureCommanderState();

        window.addEventListener('keydown', e => {
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 's' || e.key === 'S') {
                    e.preventDefault();
                    this.save();
                }
                return;
            }

            const active = document.activeElement;
            const isEditable = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');

            if (!isEditable && (e.key === 'q' || e.key === 'Q')) {
                e.preventDefault();
                this._toggleCommandMode();
                return;
            }

            if (isEditable) return;

            if (this.commandModeActive) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this._closeCommandMode({ restorePreviousPause: true });
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
