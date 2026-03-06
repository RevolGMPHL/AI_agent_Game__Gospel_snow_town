/**
 * 福音镇 - NPC 渲染模块
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：Sprite绘制、气泡绘制、状态标签
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._drawBubble = function(ctx, text) {
        const bx = this.x + GST.TILE / 2;
        const bubbleOff = this._bubbleOffset || 0;
        const maxLineW = 140;       // 单行最大像素宽度
        const fontSize = 10;
        const lineHeight = 14;
        const padX = 8;
        const padY = 5;

        ctx.font = fontSize + 'px sans-serif';

        // —— 自动换行 ——
        const lines = [];
        let currentLine = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const testLine = currentLine + ch;
            if (ctx.measureText(testLine).width > maxLineW) {
                lines.push(currentLine);
                currentLine = ch;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        // 最多显示3行，超出用省略号
        if (lines.length > 3) {
            lines.length = 3;
            lines[2] = lines[2].substring(0, lines[2].length - 1) + '…';
        }

        // —— 计算气泡尺寸 ——
        let bubbleTextW = 0;
        for (const ln of lines) {
            const w = ctx.measureText(ln).width;
            if (w > bubbleTextW) bubbleTextW = w;
        }
        const bubbleW = bubbleTextW + padX * 2;
        const bubbleH = lines.length * lineHeight + padY * 2;
        const by = this.y - 22 - bubbleOff;
        const bTop = by - bubbleH + 4;

        // 气泡背景
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.roundRect(bx - bubbleW / 2, bTop, bubbleW, bubbleH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // 小三角
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.moveTo(bx - 4, bTop + bubbleH);
        ctx.lineTo(bx, bTop + bubbleH + 6);
        ctx.lineTo(bx + 4, bTop + bubbleH);
        ctx.fill();

        // 文字逐行绘制
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], bx, bTop + padY + (i + 1) * lineHeight - 3);
        }
    }

    // ---- AI 思考 ----
    proto.think = async function(game) {
        if (this.isDead) return; // 💀 死亡NPC不思考
        if (this.aiCooldown > 0) return;
        if (this.state === 'CHATTING') return;
        if (this.isSleeping) return; // 睡觉时不思考
        this.aiCooldown = this.aiInterval;

        // 发疯时不正常思考，随机乱走
        if (this.isCrazy) {
            const map = game.maps[this.currentScene];
            if (map) {
                const pos = this.getGridPos();
                const dx = Math.floor(Math.random() * 7) - 3;
                const dy = Math.floor(Math.random() * 7) - 3;
                const tx = Math.max(0, Math.min(map.cols - 1, pos.x + dx));
                const ty = Math.max(0, Math.min(map.rows - 1, pos.y + dy));
                if (!map.isSolid(tx * GST.TILE + GST.TILE / 2, ty * GST.TILE + GST.TILE / 2)) {
this.currentPath = GST.findPath(pos.x, pos.y, tx, ty, map) || [];
                    this.pathIndex = 0;
                    this.state = 'WALKING';
                }
            }
            return;
        }

        // 如果正在避雨，不需要AI思考，保持当前行为
        if (this.isSeekingShelter) return;

        const map = game.maps[this.currentScene];
        const pos = this.getGridPos();

        // 构建环境感知
        const envDesc = map.describe(pos.x, pos.y);
        const nearby = this._getNearbyNPCs(game, 16); // 附近16格内的人
        
        // 🔍 调试日志：排查NPC互相看不到的问题
        const allSameScene = game.npcs.filter(n => n.id !== this.id && n.currentScene === this.currentScene);
        console.log(`[感知调试] ${this.name}(${this.currentScene}) pos=(${pos.x},${pos.y}) nearby=${nearby.length}人 同场景总共=${allSameScene.length}人`, 
            allSameScene.map(n => `${n.name}(scene=${n.currentScene},sleeping=${n.isSleeping},pos=${JSON.stringify(n.getGridPos())})`));
        
        const nearbyStr = nearby.length > 0
            ? nearby.map(n => {
                let desc = `${n.name}(${n.dist}格，${n.state === 'CHATTING' ? '正在对话' : n.stateDesc}`;
                // 附加旁人的身心状态描述
                const statusTags = [];
                if (n.isCrazy) statusTags.push('🤯发疯中');
                if (n.isSick) statusTags.push('🤒生病中');
                if (n._isBeingTreated) statusTags.push('🏥治疗中');
                if (n._stateOverride === 'exhausted') statusTags.push('😴疲惫不堪');
                else if (n.stamina < 15) statusTags.push('😩体力极低');
                else if (n.stamina < 30) statusTags.push('疲惫');
                if (n.health < 25 && !n.isSick) statusTags.push('面色苍白');
                if (n.sanity < 25 && !n.isCrazy) statusTags.push('精神恍惚');
                else if (n.sanity < 40) statusTags.push('精神不太好');
                if (n.hunger < 20) statusTags.push('饿得不行');
                else if (n.hunger < 35) statusTags.push('肚子饿');
                if (statusTags.length > 0) desc += '，' + statusTags.join('、');
                desc += ')';
                return desc;
            }).join('、')
            : '附近没有人';
        
        // 构建旁人状态告警（明确提示NPC去关心）
        const needHelpNPCs = nearby.filter(n => 
            n.isSick || n.health < 25 || n.stamina < 15 || n.sanity < 25 || n.isCrazy || n.hunger < 20
        );
        let helpHint = '';
        if (needHelpNPCs.length > 0) {
            const helpDetails = needHelpNPCs.map(n => {
                const issues = [];
                if (n.isSick || n.health < 25) issues.push('身体不舒服');
                if (n.stamina < 15) issues.push('快累垮了');
                if (n.sanity < 25 || n.isCrazy) issues.push('精神状态很差');
                if (n.hunger < 20) issues.push('快饿坏了');
                const npcObj = game.npcs.find(np => np.id === n.id);
                const aff = npcObj ? this.getAffinity(npcObj.id) : 50;
                let relLabel = '';
                if (aff >= 90) relLabel = '（ta是你的挚友！）';
                else if (aff >= 70) relLabel = '（ta是你的好朋友！）';
                else if (aff >= 50) relLabel = '（你们关系还不错）';
                return `${n.name}${relLabel}${issues.join('、')}`;
            }).join('；');
            
            // 检查是否有挚友/好友需要帮助
            const friendsInTrouble = needHelpNPCs.filter(n => {
                const npcObj = game.npcs.find(np => np.id === n.id);
                return npcObj && this.getAffinity(npcObj.id) >= 70;
            });
            if (friendsInTrouble.length > 0) {
                helpHint = `\n🆘🆘 紧急！你的好朋友需要你！${helpDetails}。你必须主动关心他们！走过去安慰他们、陪他们去看医生、带他们去吃饭。朋友有难你不能袖手旁观！在wantChat中填写最需要帮助的朋友的名字。`;
            } else {
                helpHint = `\n🆘 注意：${helpDetails}。作为有情感的人，你可以主动关心他们、提议陪他们去看医生/吃饭/休息。`;
            }
        }
        
        // 构建附近人员的强调提示
        const nearbyEmphasis = nearby.length > 0
            ? `\n⚠️ 注意：你附近有${nearby.length}个人（${nearby.map(n => n.name).join('、')}），你不是一个人！不要说"没人"或"空无一人"之类的话。`
            : '';

        // 同场景所有人（包括远处的，让NPC知道这个地方还有谁）
        // 【P0修复】过滤已死亡NPC，避免LLM对已死角色产生幻觉行为
        const sameSceneNPCs = game.npcs.filter(n => 
            n.id !== this.id && !n.isDead && n.currentScene === this.currentScene && !n.isSleeping
        );
        const farNPCs = sameSceneNPCs.filter(n => !nearby.some(nb => nb.id === n.id));
        const sceneOverview = farNPCs.length > 0
            ? `\n同一区域较远处还有：${farNPCs.map(n => `${n.name}(${n.stateDesc}${n.isCrazy ? '，发疯中' : ''})`).join('、')}`
            : '';

        const recentMemories = this.memories.slice(-5).map(m => `[${m.time}] ${m.text}`).join('\n');

        // 构建场所经营上下文（店主角色专用）
        const businessCtx = this._getBusinessContext(game, nearby);

        // 构建属性相关的提示
        const attrHints = [];
        if (this.stamina < 20) attrHints.push('⚠️ 你现在体力极低，非常疲惫，应该去休息，再硬撑下去身体会出问题！');
        else if (this.stamina < 50) attrHints.push('你有点累了');
        if (this.health < 20) attrHints.push('🚨 你的健康状况非常糟糕！你能感觉到身体在告急，必须立刻去医院看病！再拖下去会更严重！');
        else if (this.health < 35) attrHints.push('⚠️ 你身体状况很差，感觉浑身乏力、头晕目眩，需要尽快去医院看病。你的体力恢复变慢了，干什么都提不起劲。');
        else if (this.health < 50) attrHints.push('你感觉身体不太舒服，有点亚健康，最好注意休息和饮食');
        if (this.isSick) attrHints.push('⚠️ 你正在生病，非常不舒服，必须去医院看病！拖着不去只会越来越严重！');
        // San值提示——【增强】更强烈的焦虑感和紧迫感
        if (this.isCrazy) attrHints.push('🤯 你正在发疯！精神完全崩溃，无法正常思考，急需去找苏医生做心理咨询或者好好睡一觉');
        else if (this.sanity < 15) attrHints.push('🚨🚨 你快疯了！！脑子里全是噪音，你控制不住自己的情绪，随时可能崩溃！你现在什么都做不了，必须立刻、马上去找苏医生（医院）做心理咨询！！这是最紧急的事！');
        else if (this.sanity < 25) attrHints.push('🚨 你精神状态非常差！你感到极度焦虑、恐惧、绝望，脑子像被什么东西紧紧箍住。你的工作效率大幅下降，和人说话也容易失态。必须尽快去医院找苏医生做心理咨询，或者去看歆玥的演出缓解一下！再这样下去你就要崩溃了！');
        else if (this.sanity < 35) attrHints.push('⚠️ 你精神状态很差，经常感到莫名的焦虑和烦躁，做事难以集中注意力。你觉得自己快要撑不住了。应该去找苏医生聊聊（医院），或者看看歆玥的演出放松一下，或者好好睡一觉。');
        else if (this.sanity < 50) attrHints.push('你精神状态一般，有些疲惫和低落。可以找人聊聊天、看看歆玥的演出、或者休息一下');
        else if (this.sanity >= 80) attrHints.push('你精神状态很好，头脑清晰，充满干劲');
        // 【增强】多重负面状态叠加时的紧急警告
        const criticalCount = [this.sanity < 30, this.health < 35, this.stamina < 20, this.hunger < 25].filter(Boolean).length;
        if (criticalCount >= 2) {
            attrHints.push(`🆘 警告：你现在有${criticalCount}项指标处于危险状态！你的身心正在全面崩溃，必须立刻采取行动——去医院、去吃饭、去休息，做任何能改善现状的事！不要再犹豫了！`);
        }
        const attrHintStr = attrHints.length > 0 ? '\n你当前的身心状态：\n' + attrHints.map(h => '- ' + h).join('\n') : '';

        const systemPrompt = `你是「${this.name}」，福音镇的居民。世界末日来临，极端寒冷天气侵袭小镇，你们必须团结协作、收集物资、维持暖炉运转才能存活。
姓名：${this.name}，${this.age}岁，${this.occupation}
性格：${this.personality}
当前心情：${this.mood}
${attrHintStr}
${game.weatherSystem ? `\n【生存状况】\n${game.weatherSystem.getSurvivalSummary()}` : ''}
${game.weatherSystem && game.weatherSystem.getBlizzardUrgencyForPrompt ? `\n${game.weatherSystem.getBlizzardUrgencyForPrompt()}` : ''}
${game.resourceSystem ? `资源状况: ${game.resourceSystem.getResourceStatusForPrompt()}` : ''}
${game.resourceSystem && game.resourceSystem.getUrgencyPrompt ? game.resourceSystem.getUrgencyPrompt() : ''}
${game.resourceSystem && game.resourceSystem.getResourceForecastForPrompt ? game.resourceSystem.getResourceForecastForPrompt() : ''}
${game.resourceSystem && game.resourceSystem.getSupplyRecommendationPrompt ? game.resourceSystem.getSupplyRecommendationPrompt() : ''}
${game.weatherSystem && (game.weatherSystem.currentDay === 1 || game.weatherSystem.currentDay === 3) ? '\n⏰ 现在是补给窗口期，建议全力采集物资！' : ''}
${game.resourceSystem ? `资源紧张度: ${game.resourceSystem.getResourceTension().toFixed(2)}/1.0${game.resourceSystem.getResourceTension() >= 0.3 ? '（紧张！减少社交，优先工作）' : game.resourceSystem.getResourceTension() >= 0.1 ? '（偏紧，注意资源）' : '（正常）'}` : ''}
${game.furnaceSystem ? `暖炉状况: ${game.furnaceSystem.getFurnaceSummary()}` : ''}
${game.taskSystem ? `任务进度: ${game.taskSystem.getTaskSummaryForPrompt()}` : ''}
${game.taskSystem ? `你的任务: ${game.taskSystem.getNpcTaskDescForPrompt(this.id)}` : ''}
${game.deathSystem && game.deathSystem.getDeathSummaryForPrompt() ? `死亡情况: ${game.deathSystem.getDeathSummaryForPrompt()}` : ''}
${game.deathSystem && game.deathSystem.isNpcGrieving(this.id) ? '⚠️ 你正处于悲痛状态，因为有同伴刚刚死去。' : ''}
${this.bodyTemp < 35 ? `🚨 你正在失温！体温: ${this.bodyTemp.toFixed(1)}°C，必须立即回暖炉旁！` : ''}
${this.isHypothermic ? '🥶 你浑身发抖，行动迟缓，思维模糊...' : ''}
${game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() > 1 ? game.reincarnationSystem.getPastLifeHintForThinking(game.mode === 'reincarnation') : ''}
${game.reincarnationSystem ? game.reincarnationSystem.getWorkPlanSummaryForNpc(this.id) : ''}
${game.reincarnationSystem ? (() => { const lessons = game.reincarnationSystem.getLessonsForNpc(this.id); return lessons ? '【前世教训·与你相关】' + lessons : ''; })() : ''}

重要规则：
1. 这是一个末日生存环境。你的首要目标是活下去，其次是帮助同伴活下去。
2. 你的情绪和言行必须和当前生存环境一致。如果资源紧缺，你应该焦虑；如果有人死了，你应该悲痛或恐惧。
3. expression是你真正说出口的话，应该围绕生存话题（"还有多少食物？""暖炉够不够？""今天的任务完成了吗？"）。
4. 🎯【最高优先】你必须严格执行工作安排表中的分工（见上方安排表中★标记的任务）。安排表是全镇指挥中心基于前世教训制定的最优方案，这是你的核心职责！你的思考应该围绕如何高效完成分配给你的任务。
5. 你的思考和行为应该受到你当前身心状态和生存压力的影响。
6. 如果温度极低（<-20°C），你在户外会非常痛苦和恐惧。
7. 如果你看到有人倒下或状态很差，你应该去帮助他们。
${game.weatherSystem && !game.weatherSystem.canGoOutside() ? '🚨 今天严禁外出！-60°C！在户外会迅速冻死！' : ''}
${game.weatherSystem && game.weatherSystem.getEffectiveTemp() < -20 ? '🚨🚨 户外极度危险！温度' + game.weatherSystem.getEffectiveTemp() + '°C！尽量待在暖炉旁！' : ''}
${this.id === 'old_qian' ? `你是退休镇长/精神领袖，在末日中承担起安抚情绪、调解冲突的重任。你的领导力和人生阅历是团队的精神支柱。清璇是你的孙女，你格外牵挂她。` : ''}
${this.id === 'qing_xuan' ? `你是16岁的药剂师学徒/陷阱工，老钱的孙女。负责制作草药制剂、布置警报陷阱、修理无线电。你聪明好学、心灵手巧，在危机中逐渐展现超越年龄的能力。你暗恋陆辰。` : ''}
${this.id === 'wang_teacher' ? `你是技师/规划师，末日前是哲学教师，现在负责维修发电机、设计暖炉扩建方案、统筹全队效率。你暗恋歆玥，理性冷静但有时过于冷酷。` : ''}
${this.id === 'zhao_chef' ? `你是伐木工/锅炉工，全镇体力担当。负责砍柴、搬运、暖炉维护。你沉默寡言但行动力极强，暗恋李婶。压力大时San值下降更快。` : ''}
${this.id === 'li_shen' ? `你是物资总管/炊事长，全镇后勤管家。负责管理仓库、烹饪分配食物。你热心精明，照顾所有人。陆辰是你儿子，你会不惜一切保护他。` : ''}
${this.id === 'su_doctor' ? `你是医官，据点唯一的医疗力量。负责治疗冻伤失温、心理疏导。你暗恋歆玥，冷静专业但过度操劳时自己也会崩溃。` : ''}
${this.id === 'lu_chen' ? `你是采集工/建筑工，最年轻的劳动力。负责砍柴和采集食物、协助修复暖炉。你冲动勇敢但情商低，暗恋清璇。体温下降速度比常人慢。` : ''}
${this.id === 'ling_yue' ? `你是侦察员/急救兵，负责废墟侦察搜索稀有物资、急救护理、鼓舞全队士气。被苏岩和王策同时追求。你乐观坚韧但初始San值较低。` : ''}
${this.config.weaknesses ? `⚠️ 你的弱点：${this.config.weaknesses}` : ''}
${this.config.protectTarget ? `❤️ 你的保护对象：${game.npcs.find(n => n.id === this.config.protectTarget)?.name || this.config.protectTarget}，如果ta受伤或死亡，你会受到双倍San打击。` : ''}`;
        const userPrompt = `时间：第${game.dayCount}天 ${game.getTimeStr()} ${game.getTimePeriod()}
天气：${game.weather}
位置：${envDesc}
附近的人：${nearbyStr}${sceneOverview}${nearbyEmphasis}${helpHint}
最近发生的事：
${recentMemories || '（暂无）'}
当前状态：${this.stateDesc}
当前状态摘要：${this.getStatusLine()}
饱食度：${Math.round(this.hunger)}/100（${this.getHungerStatus()}）${this.hunger < 35 ? ' ⚠️ 你现在很饿，应该去吃东西！' : ''}
【你的属性】${this.getAttributeSummary()}${this.isSick ? ' 🤒生病中' : ''}
${this.getGoalsSummary() ? `【你的目标】\n${this.getGoalsSummary()}` : ''}
${businessCtx}
${this._currentAction ? `【当前行动】${this._currentAction.reason || this._currentAction.type}（${this._currentAction.priority}优先级）` : ''}
${this._pendingAction ? `【待执行行动】${this._pendingAction.reason || this._pendingAction.type}` : ''}
${this._isCompanion && this._companionLeader ? `【同伴模式】正在跟随${game.npcs.find(n => n.id === this._companionLeader)?.name || '某人'}一起行动` : ''}
${this._lastActionThought ? `【最近行动决策】${this._lastActionThought}` : ''}
${this._hungerOverride ? '🍽️ 【重要】我正在去吃饭的路上或正在吃饭！不要改变目标！' : ''}
${this._taskOverride && this._taskOverride.isActive ? `📋 【重要】我正在执行任务：${this._taskOverride.taskId}，前往${this._taskOverride.targetLocation}` : ''}
${this._stateOverride ? `🚨 我正在紧急处理：${this._stateOverride}，不要干预` : ''}
${this._priorityOverride ? `⚠️ 当前P0紧急状态：${this._priorityOverride}` : ''}
请根据上面的实际情境，决定你现在的状态。
注意：
- mood（心情）必须与当前真实环境匹配（周围没人时不该因社交而高兴）
- expression只有在合适的时候才说话（周围没人时可以自言自语或留空）
- wantChat可以填写附近或同一区域的人名（你可以走过去找他们），没人时必须留空字符串
用纯 JSON 回复：
{
  "thought": "内心独白（基于真实环境的想法，必须提到当前最担忧的属性或最想推进的目标）",
  "mood": "两字心情（必须符合当前处境）",
  "expression": "说出的话（简短，或空字符串）",
  "wantChat": "同场景的人名（可以走过去找他，或空字符串）",
  "concern": "当前最担忧的事（如'San值快到危险线了'、'今天的聊天目标还没完成'、'没什么好担心的'）",
  "goalFocus": "当前最想推进的目标名称（如'今天和3个不同的人聊天'，没有就写'无'）"
}}`;

        const raw = await GST.callLLM(systemPrompt, userPrompt, 500);  // 14B模型需要更多token空间

        // 【关键修复】await期间NPC可能已被设为CHATTING（其他NPC发起了对话）
        // 此时不应再执行think的决策，否则会覆盖CHATTING状态导致对话中断
        if (this.state === 'CHATTING') {
            this._logDebug('think', `think返回时已在CHATTING，放弃决策结果`);
            return;
        }

        const parsed = GST.parseLLMJSON(raw);
        if (parsed) {
            if (parsed.mood) this.mood = parsed.mood;
            if (parsed.expression) {
                this.expression = parsed.expression;
                this.expressionTimer = 8;
            }
            if (parsed.thought) {
                this.addMemory(`[想法] ${parsed.thought}`);
                // 将think的想法同步给行动决策系统参考
                this._lastActionThought = parsed.thought;
            }
            // 【奖惩意识】记录NPC当前的关注和目标焦点
            if (parsed.concern) this._lastConcern = parsed.concern;
            if (parsed.goalFocus) this._lastGoalFocus = parsed.goalFocus;
            // 【Debug日志】记录think结果（含奖惩意识）
            this._logDebug('think', `想法:"${parsed.thought || ''}" 心情:${parsed.mood || ''} 说:"${parsed.expression || ''}" 想聊:${parsed.wantChat || '无'}`);
            this._logDebug('reward', `🧠 思考关注 → 担忧:「${parsed.concern || '无'}」 聚焦目标:「${parsed.goalFocus || '无'}」`);
            // 事件日志通知
            if (parsed.expression && game.addEvent) {
                game.addEvent(`💭 ${this.name}: "${parsed.expression}"`);
            }

            // ============ 【任务6】think→action强制联动 ============
            // 当NPC思考结果包含资源紧急行动关键词时，自动触发taskOverride
            if (parsed.thought || parsed.expression) {
                const thinkText = (parsed.thought || '') + ' ' + (parsed.expression || '');
                const urgentGatherKeywords = {
                    woodFuel: ['砍柴', '伐木', '砍树', '木柴', '去伐木场', '木材', '薪火'],
                    food: ['捕鱼', '采集食物', '食物', '冰湖', '打鱼', '钓鱼', '觅食'],
                    explore: ['探索废墟', '搜索废墟', '废墟探索', '废墟'],
                    power: ['发电', '维护电力', '发电机', '电力']
                };
                // 仅在资源紧急时才触发think→action联动
                if (game.resourceSystem) {
                    const _thinkUrgency = game.resourceSystem.getResourceUrgency();
                    for (const [resType, keywords] of Object.entries(urgentGatherKeywords)) {
                        const urgLevel = _thinkUrgency[resType === 'woodFuel' ? 'wood' : resType];
                        if ((urgLevel === 'critical' || urgLevel === 'warning') && keywords.some(kw => thinkText.includes(kw))) {
                            // NPC的思考匹配了紧急资源关键词，且该资源确实紧急
                            const targetMap = {
                                woodFuel: 'lumber_camp',
                                food: 'frozen_lake',
                                explore: 'ruins_site',
                                power: 'workshop_door'
                            };
                            const targetLoc = targetMap[resType];
                            const priority = urgLevel === 'critical' ? 'urgent' : 'high';
                            const taskId = `think_gather_${resType}_${Date.now()}`;
                            
                            // 如果NPC当前没有活跃的taskOverride，才触发
                            if (!this._taskOverride || !this._taskOverride.isActive) {
                                console.log(`[think→action] ${this.name} 思考"${thinkText.substring(0, 30)}..." 触发${resType}采集任务(${priority})`);
                                this.activateTaskOverride(taskId, targetLoc, priority, resType);
                                
                                if (game.addEvent) {
                                    game.addEvent(`🎯 ${this.name} 思考后决定: 前往${targetLoc}${priority === 'urgent' ? '(紧急)' : ''}`);
                                }
                                this._logDebug('think', `think→action联动: "${thinkText.substring(0, 30)}..." → ${resType}/${targetLoc}(${priority})`);
                            }
                            break; // 只触发第一个匹配
                        }
                    }
                }
            }
            // 社交意愿——代码层二次校验：必须附近真的有这个人
            // 【增强】深夜/状态极差/下雨户外时强制清除社交意愿
            const _origWantChat = parsed.wantChat; // debug日志用

            // 【硬保护B5】覆盖状态激活时，强制忽略wantChat，防止聊天走路干扰饥饿/休息/紧急导航
            if (parsed.wantChat) {
                let overrideType = null;
                if (this._hungerOverride) overrideType = '饥饿覆盖';
                else if (this._stateOverride) overrideType = `状态覆盖(${this._stateOverride})`;
                else if (this._priorityOverride) overrideType = 'P0紧急';
                else if (this._taskOverride && this._taskOverride.isActive) overrideType = '任务覆盖';
                else if (this._walkingToDoor) overrideType = '出门过程';
                else if (this._currentBehaviorLock) overrideType = `行为锁(${this._currentBehaviorLock.type})`;
                if (overrideType) {
                    console.log(`[wantChat保护] ${this.name} 处于${overrideType}中，忽略聊天意愿(${parsed.wantChat})`);
                    this._logDebug('chat', `[wantChat保护] 处于${overrideType}中，忽略聊天意愿(${parsed.wantChat})`);
                    parsed.wantChat = '';
                }
            }

            if (!GST.CHAT_ENABLED) {
                parsed.wantChat = '';
            }

            const thinkHour = game.getHour();
            const isLateNight = this._isBedtime(thinkHour);
            if (isLateNight) parsed.wantChat = ''; // 过了就寝时间不社交
            if (this.stamina < 15) parsed.wantChat = ''; // 体力极低，需要休息
            if (this.health < 20 && this.isSick) parsed.wantChat = ''; // 生病且健康极低
            // 【修复】下雨+户外时不找人聊天，应该先避雨
            if (game.isRaining() && this.currentScene === 'village') {
                parsed.wantChat = '';
            }
            // 【新增】资源紧急时抑制聊天意愿
            if (game.resourceSystem) {
                const _urgency = game.resourceSystem.getResourceUrgency();
                const _hasCritical = _urgency.wood === 'critical' || _urgency.food === 'critical' || _urgency.power === 'critical';
                if (_hasCritical) {
                    parsed.wantChat = ''; // critical时完全禁止聊天
                } else {
                    const _hasWarning = _urgency.wood === 'warning' || _urgency.food === 'warning' || _urgency.power === 'warning';
                    if (_hasWarning && parsed.wantChat && Math.random() > 0.3) {
                        parsed.wantChat = ''; // warning时70%概率抑制聊天
                    }
                }
            }
            // 【Debug日志】如果wantChat被强制清除，记录原因
            if (_origWantChat && !parsed.wantChat) {
                const reasons = [];
                if (isLateNight) reasons.push('深夜');
                if (this.stamina < 15) reasons.push('体力极低');
                if (this.health < 20 && this.isSick) reasons.push('生病');
                if (game.isRaining() && this.currentScene === 'village') reasons.push('户外下雨');
                if (game.resourceSystem) {
                    const _urgCheck = game.resourceSystem.getResourceUrgency();
                    if (_urgCheck.wood === 'critical' || _urgCheck.food === 'critical' || _urgCheck.power === 'critical') reasons.push('资源critical');
                    else if (_urgCheck.wood === 'warning' || _urgCheck.food === 'warning' || _urgCheck.power === 'warning') reasons.push('资源warning');
                }
                this._logDebug('chat', `想找${_origWantChat}聊天被阻止: ${reasons.join('、')}`);
            }

            // 【挚友关心机制】自己精神还行时，主动找同场景San值低的好友/挚友关心
            if (GST.CHAT_ENABLED && !parsed.wantChat && this.sanity >= 40 && !isLateNight && this.state !== 'CHATTING') {
                const sameSceneAll = game.npcs.filter(n =>
                    n.id !== this.id && n.currentScene === this.currentScene && !n.isSleeping
                    && n.state !== 'CHATTING' && (n.sanity < 30 || n.isCrazy)
                );
                // 筛选出好友及以上（好感度≥70）的低San值NPC
                const friendsInNeed = sameSceneAll.filter(n => this.getAffinity(n.id) >= 70);
                if (friendsInNeed.length > 0) {
                    // 选San值最低的那个去关心
                    friendsInNeed.sort((a, b) => a.sanity - b.sanity);
                    const friendToHelp = friendsInNeed[0];
                    // 覆盖wantChat，优先去关心朋友
                    parsed.wantChat = friendToHelp.name;
                    this.mood = '担心';
                    this.expression = `${friendToHelp.name}看起来不太好…我得去看看`;
                    this.expressionTimer = 6;
                    if (game.addEvent) {
                        game.addEvent(`💕 ${this.name} 注意到 ${friendToHelp.name} 状态很差，决定去关心ta`);
                    }
                }
            }
            if (parsed.wantChat && game.dialogueManager) {
                const target = game.npcs.find(n => n.name === parsed.wantChat && n.id !== this.id);
                if (target && this._canChatWith(target)) {
                    // 检查是否在同一场景（远处也可以走过去）
                    const isSameScene = target.currentScene === this.currentScene;
                    const nearbyCheck = this._getNearbyNPCs(game, 6);
                    const isReallyNearby = nearbyCheck.some(n => n.name === parsed.wantChat);
                    if (isReallyNearby) {
                        // 附近的人，直接聊天
                        game.dialogueManager.startNPCChat(this, target);
                        if (game.addEvent) {
                            game.addEvent(`🤝 ${this.name} 找 ${target.name} 聊天`);
                        }
                    } else if (isSameScene) {
                        // 同场景但较远，先走过去
                        const tp = target.getGridPos();
                        const myPos = this.getGridPos();
                        // 走到目标附近2格的位置
                        const dx = tp.x > myPos.x ? -2 : 2;
                        const dy = tp.y > myPos.y ? -2 : 2;
                        const goalX = Math.max(0, Math.min(map.cols - 1, tp.x + dx));
                        const goalY = Math.max(0, Math.min(map.rows - 1, tp.y + dy));
                        if (!map.isSolid(goalX * GST.TILE + GST.TILE / 2, goalY * GST.TILE + GST.TILE / 2)) {
                            this.currentPath = GST.findPath(myPos.x, myPos.y, goalX, goalY, map) || [];
                            this.pathIndex = 0;
                            this.state = 'WALKING';
                            this.stateDesc = `正在走向${target.name}`;
                            this.expression = `去找${target.name}聊聊`;
                            this.expressionTimer = 5;
                            // 【修复】记录社交走路目标，路径走完后自动发起对话
                            this._chatWalkTarget = target.id;
                            this._logDebug('chat', `想找${target.name}聊天，开始走过去(距离较远)`);
                        }
                    } else {
                        // LLM幻觉了，同场景其实没这个人
                        this.expression = `${parsed.wantChat}不在这儿啊…`;
                        this.expressionTimer = 5;
                        this.mood = '失望';
                        this._logDebug('chat', `想找${parsed.wantChat}但ta不在同场景(幻觉)`);
                    }
                }
            }
        }
    }

    // ============ 六大属性系统 ============

    /** 获取属性等级描述 */;

    proto.draw = function(ctx) {
        // 阴影
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.ellipse(this.x + GST.TILE / 2, this.y + GST.TILE - 2, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.spriteLoaded) {
            // Sprite: 96×128, 每帧 32×32
            // 行: 0=down, 1=left, 2=right, 3=up
            // 列: walk 帧 0,1,2 (idle 用帧 1)
            const frameW = 32;
            const frameH = 32;
            const col = this.isMoving ? this.animFrame : 1; // idle 用中间帧
            const row = this.facing;
            const sx = col * frameW;
            const sy = row * frameH;

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                this.sprite,
                sx, sy, frameW, frameH,
                this.x, this.y, GST.TILE, GST.TILE
            );
            ctx.imageSmoothingEnabled = true;
        } else {
            // 回退色块
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x + GST.TILE / 2, this.y + GST.TILE / 2 - 2, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(this.x + GST.TILE / 2 - 6, this.y + GST.TILE / 2 + 4, 12, 12);
        }

        // 名字
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x + GST.TILE / 2, this.y - 6);

        // 睡觉时显示 Zzz 动画
        if (this.isSleeping) {
            const zPhase = Math.floor(this.sleepZTimer * 2) % 3;
            const zText = ['💤', '💤💤', '💤'];
            ctx.fillStyle = 'rgba(100,150,255,0.8)';
            ctx.font = '12px sans-serif';
            ctx.fillText(zText[zPhase], this.x + GST.TILE / 2, this.y - 16 - Math.sin(this.sleepZTimer * 2) * 4);
        }
        // 注意：expression气泡不在这里绘制，由 drawBubbleLayer() 在最上层单独绘制

        // 【新增】始终显示状态标签（位置+意图），在expression气泡上方或名字上方
        if (!this.isSleeping) {
            const statusText = this.getStatusLine();
            if (statusText) {
                const bubbleOff = this._bubbleOffset || 0;
                // 如果有expression气泡，状态标签要更往上
                const extraOff = this.expression ? 40 : 0;
                const stY = this.y - 16 - bubbleOff - extraOff;
                ctx.font = '7px sans-serif';
                const stW = ctx.measureText(statusText).width;
                // 半透明背景板
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                const padX = 3, padY = 2;
                ctx.beginPath();
                ctx.roundRect(this.x + GST.TILE / 2 - stW / 2 - padX, stY - 7 - padY, stW + padX * 2, 10 + padY * 2, 3);
                ctx.fill();
                // 文字
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.fillText(statusText, this.x + GST.TILE / 2, stY);
            }
        }

        ctx.textAlign = 'left';
    }

    /** 绘制对话气泡层 —— 在所有NPC/建筑绘制完后单独调用，确保气泡在最上层 */;

    proto.drawBubbleLayer = function(ctx) {
        if (this.expression && !this.isSleeping) {
            this._drawBubble(ctx, this.expression);
        }
    };

})();
