/**
 * 福音镇 - 启动逻辑
 * 模型选择、模式选择、游戏启动初始化
 * 挂载到 GST.startup
 */
(function() {
    'use strict';
    const GST = window.GST;
    // 引用 LLM 配置代理对象（变量定义在 llm-client.js IIFE 中，通过 GST.LLM getter/setter 访问）
    const LLM = GST.LLM;

// ============ 可用模型列表 ============
const AVAILABLE_MODELS = [
    'qwen3.5:4b',
    'qwen3.5:9b'
];

// ============ 模型切换：加载指定模型并卸载其他模型 ============
async function switchModel(targetModel) {
    const statusEl = document.getElementById('model-status');

    // --- 外部 API 模式：跳过 Ollama 模型管理，直接配置 ---
    if (LLM.source === 'external') {
        if (statusEl) {
            statusEl.textContent = `⏳ 验证外部 API ...`;
            statusEl.className = 'model-status loading';
        }
        try {
            // 配置全局变量为外部API模式
            LLM.apiKey = LLM.externalKey;
            LLM.apiUrl = '/api/external-llm';  // 通过服务器代理转发
            LLM.useOllamaNative = false;
            LLM.model = LLM.externalModel || targetModel;

            // 发送测试请求验证外部API可用
            const testResp = await fetch('/api/external-llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-External-API-URL': LLM.externalUrl,
                    'X-External-API-Key': LLM.externalKey
                },
                body: JSON.stringify({
                    model: LLM.model,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 5,
                    temperature: 0.1
                })
            });

            if (!testResp.ok) {
                const errText = await testResp.text().catch(() => '');
                throw new Error(`HTTP ${testResp.status}: ${errText.substring(0, 100)}`);
            }

            if (statusEl) {
                statusEl.textContent = `✅ 外部 API 已就绪 (${LLM.model})`;
                statusEl.className = 'model-status success';
            }
            console.log(`[模型切换] 外部API模式: ${LLM.externalUrl}, 模型: ${LLM.model}`);
            return true;
        } catch (err) {
            console.error('[模型切换] 外部API验证失败:', err);
            if (statusEl) {
                statusEl.textContent = `❌ 外部 API 连接失败: ${err.message}`;
                statusEl.className = 'model-status error';
            }
            return false;
        }
    }

    // --- 本地 Ollama 模式 ---
    if (statusEl) {
        statusEl.textContent = `⏳ 正在检查 ${targetModel} ...`;
        statusEl.className = 'model-status loading';
    }

    // 确保本地模式配置正确
    LLM.apiKey = '';
    LLM.apiUrl = '/ollama/v1/chat/completions';
    LLM.useOllamaNative = true;

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

        // 0.5) 查询本地已安装模型（用于给出更友好的缺失提示）
        let installedModels = [];
        try {
            const tagsResp = await fetch('/ollama/api/tags');
            if (tagsResp.ok) {
                const tagsData = await tagsResp.json();
                installedModels = (tagsData.models || []).map(m => m.name);
            }
        } catch (e) { /* 查询失败不阻断主流程 */ }

        const targetAlreadyLoaded = loadedModels.includes(targetModel);
        console.log(`[模型切换] 已加载模型: ${loadedModels.join(', ') || '无'}, 目标${targetAlreadyLoaded ? '已' : '未'}在内存中`);

        if (installedModels.length > 0 && !installedModels.includes(targetModel)) {
            throw new Error(`本地未安装模型 ${targetModel}。请先执行: ollama pull ${targetModel}`);
        }

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
                const errText = await resp.text().catch(() => '');
                if (resp.status === 404 && /not found|model/i.test(errText)) {
                    throw new Error(`本地未安装模型 ${targetModel}。请先执行: ollama pull ${targetModel}`);
                }
                throw new Error(`HTTP ${resp.status}${errText ? `: ${errText.substring(0, 120)}` : ''}`);
            }
        }

        // 3) 更新全局模型变量
        LLM.model = targetModel;

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
        const levels = GST.getDifficultyList();
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
            const savedDiff = GST.getDifficulty();
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

    // --- LLM 来源切换交互 ---
    const tabLocal = document.getElementById('tab-local');
    const tabExternal = document.getElementById('tab-external');
    const sourceLocal = document.getElementById('source-local');
    const sourceExternal = document.getElementById('source-external');
    const localModelSection = document.getElementById('local-model-section');

    function switchLLMSource(source) {
        LLM.source = source;
        if (source === 'local') {
            tabLocal.classList.add('active');
            tabExternal.classList.remove('active');
            sourceLocal.style.display = '';
            sourceExternal.style.display = 'none';
            localModelSection.style.display = '';
        } else {
            tabLocal.classList.remove('active');
            tabExternal.classList.add('active');
            sourceLocal.style.display = 'none';
            sourceExternal.style.display = '';
            localModelSection.style.display = 'none';
        }
        // 清除之前的状态提示
        const statusEl = document.getElementById('model-status');
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'model-status'; }
    }

    if (tabLocal) tabLocal.addEventListener('click', () => switchLLMSource('local'));
    if (tabExternal) tabExternal.addEventListener('click', () => switchLLMSource('external'));

    // --- 外部API Key 显示/隐藏 ---
    const btnToggleKey = document.getElementById('btn-toggle-key');
    const inputApiKey = document.getElementById('external-api-key');
    if (btnToggleKey && inputApiKey) {
        btnToggleKey.addEventListener('click', () => {
            if (inputApiKey.type === 'password') {
                inputApiKey.type = 'text';
                btnToggleKey.textContent = '🙈';
            } else {
                inputApiKey.type = 'password';
                btnToggleKey.textContent = '👁️';
            }
        });
    }

    // --- 外部API测试连接 ---
    const btnTestApi = document.getElementById('btn-test-api');
    const apiTestResult = document.getElementById('api-test-result');
    if (btnTestApi) {
        btnTestApi.addEventListener('click', async () => {
            const url = document.getElementById('external-api-url').value.trim();
            const key = document.getElementById('external-api-key').value.trim();
            const model = document.getElementById('external-model-name').value.trim();

            if (!url) {
                apiTestResult.textContent = '❌ 请输入 API 地址';
                apiTestResult.className = 'api-test-result error';
                return;
            }
            if (!model) {
                apiTestResult.textContent = '❌ 请输入模型名称';
                apiTestResult.className = 'api-test-result error';
                return;
            }

            apiTestResult.textContent = '⏳ 正在测试连接...';
            apiTestResult.className = 'api-test-result loading';
            btnTestApi.disabled = true;

            try {
                const resp = await fetch('/api/external-llm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-External-API-URL': url,
                        'X-External-API-Key': key
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: '你好' }],
                        max_tokens: 10,
                        temperature: 0.1
                    })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    const preview = data.choices?.[0]?.message?.content?.substring(0, 30) || '(收到响应)';
                    apiTestResult.textContent = `✅ 连接成功！预览: ${preview}`;
                    apiTestResult.className = 'api-test-result success';
                } else {
                    const errText = await resp.text().catch(() => '');
                    apiTestResult.textContent = `❌ HTTP ${resp.status}: ${errText.substring(0, 80)}`;
                    apiTestResult.className = 'api-test-result error';
                }
            } catch (err) {
                apiTestResult.textContent = `❌ 连接失败: ${err.message}`;
                apiTestResult.className = 'api-test-result error';
            } finally {
                btnTestApi.disabled = false;
            }
        });
    }

    // --- 从 localStorage 恢复外部API配置 ---
    try {
        const savedLLMSource = localStorage.getItem('gospel_llm_source');
        if (savedLLMSource === 'external') {
            const savedUrl = localStorage.getItem('gospel_external_api_url') || '';
            const savedKey = localStorage.getItem('gospel_external_api_key') || '';
            const savedModel = localStorage.getItem('gospel_external_model') || '';
            if (savedUrl) {
                document.getElementById('external-api-url').value = savedUrl;
                document.getElementById('external-api-key').value = savedKey;
                document.getElementById('external-model-name').value = savedModel;
                switchLLMSource('external');
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
        if (LLM.source === 'external') {
            return document.getElementById('external-model-name').value.trim() || 'gpt-4o-mini';
        }
        const checked = document.querySelector('input[name="ai-model"]:checked');
        return checked ? checked.value : 'qwen3.5:4b';
    }

    // --- 启动游戏（先切换模型再启动） ---
    let isStarting = false;
    async function startGame(mode, pendingDifficultyKey) {
        if (isStarting) return;
        isStarting = true;

        // 非轮回模式强制使用简单难度
        if (mode !== 'reincarnation') {
            GST.setDifficulty('easy');
        }

        // 禁用按钮防止重复点击
        btnAgent.disabled = true;
        btnDebug.disabled = true;
        btnReincarnation.disabled = true;
        btnAgent.style.opacity = '0.5';
        btnDebug.style.opacity = '0.5';
        btnReincarnation.style.opacity = '0.5';

        // --- 读取外部 API 配置并保存 ---
        if (LLM.source === 'external') {
            LLM.externalUrl = document.getElementById('external-api-url').value.trim();
            LLM.externalKey = document.getElementById('external-api-key').value.trim();
            LLM.externalModel = document.getElementById('external-model-name').value.trim();
            // 保存到 localStorage 方便下次恢复
            try {
                localStorage.setItem('gospel_llm_source', 'external');
                localStorage.setItem('gospel_external_api_url', LLM.externalUrl);
                localStorage.setItem('gospel_external_api_key', LLM.externalKey);
                localStorage.setItem('gospel_external_model', LLM.externalModel);
            } catch (e) { /* ignore */ }
        } else {
            try { localStorage.setItem('gospel_llm_source', 'local'); } catch (e) { /* ignore */ }
        }

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
                        GST.clearDifficulty();
                        console.log('[启动] 用户选择从第1世重新开始，轮回数据已清除');
                    } catch (e) { /* ignore */ }
                }
                // 【修复】在清除之后再保存用户选中的难度，避免先写后删导致难度丢失
                if (pendingDifficultyKey) {
                    GST.setDifficulty(pendingDifficultyKey);
                    console.log(`[启动] 难度已设置为: ${pendingDifficultyKey}`);
                }
            }

            overlay.style.display = 'none';
            document.getElementById('app-layout').style.display = 'flex';
            window.game = new GST.Game(mode);

            // 异步加载图片素材（不阻塞游戏启动，加载完毕后自动切换到图片绘制）
            if (typeof SpriteLoader !== 'undefined') {
                SpriteLoader.load().then(ok => {
                    if (ok) console.log('[Game] 图片素材加载完成，已切换到图片绘制模式');
                });
            }

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

    // --- 所有模式的难度保存 ---
    // agent/debug 模式也需要保存用户选中的难度（虽然实际效果可能不同）
    btnAgent.addEventListener('click', () => {
        if (selectedDifficultyKey) GST.setDifficulty(selectedDifficultyKey);
        startGame('agent');
    });
    btnDebug.addEventListener('click', () => {
        if (selectedDifficultyKey) GST.setDifficulty(selectedDifficultyKey);
        startGame('debug');
    });
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
            // 新轮回或重置：先保存选中的难度key到临时变量，startGame中清除后再写入
            startGame('reincarnation', selectedDifficultyKey);
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
                    const savedDiff = GST.getDifficulty();
                    lockDifficultyCards(savedDiff.key);
                }
            }
        });
    }
});


})();
