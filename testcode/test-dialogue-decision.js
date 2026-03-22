#!/usr/bin/env node
/**
 * 🧪 福音雪镇 — 对话决策系统 TestCode
 * 
 * 测试三个核心LLM调用：
 *   1. think()       — NPC思考/心情/社交意愿
 *   2. actionDecision — NPC行动决策（去哪/做什么）
 *   3. NPC-NPC对话    — 两个NPC之间的多轮对话
 * 
 * 用法：
 *   node testcode/test-dialogue-decision.js [选项]
 * 
 * 可选参数：
 *   --test=think|action|dialogue|all  测试哪个模块（默认all）
 *   --npc=zhao_chef                   指定NPC角色id（默认赵铁柱）
 *   --npc2=li_shen                    对话测试的第二个NPC（默认李婶）
 *   --day=2                           当前天数（1-4）
 *   --temp=-30                        当前温度
 *   --weather=暴风雪                   天气
 *   --model=qwen3.5:4b                Ollama模型
 *   --rounds=3                        对话轮数（默认3）
 *   --fast                            快速模式
 * 
 * 示例：
 *   node testcode/test-dialogue-decision.js
 *   node testcode/test-dialogue-decision.js --test=think --npc=su_doctor
 *   node testcode/test-dialogue-decision.js --test=dialogue --npc=wang_teacher --npc2=ling_yue
 *   node testcode/test-dialogue-decision.js --test=action --day=4 --temp=-60
 */

'use strict';

// ============ 配置解析 ============
const args = {};
process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
        const [key, val] = arg.substring(2).split('=');
        args[key] = val === undefined ? true : val;
    }
});

const CONFIG = {
    test:    args.test || 'all',
    npc:     args.npc || 'zhao_chef',
    npc2:    args.npc2 || 'li_shen',
    day:     parseInt(args.day) || 2,
    temp:    parseInt(args.temp) || -30,
    weather: args.weather || '大雪',
    model:   args.model || 'qwen3.5:4b',
    rounds:  parseInt(args.rounds) || 3,
    fast:    !!args.fast,
};

const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';

// ============ 终端颜色 ============
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
const CYAN = '\x1b[36m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m', RED = '\x1b[31m', MAGENTA = '\x1b[35m';
const BG_BLUE = '\x1b[44m', WHITE = '\x1b[37m';

function log(msg) { console.log(msg); }
function divider(char = '─', len = 60) { log(DIM + char.repeat(len) + RESET); }
function header(title) { log(''); divider('═'); log(`${BOLD}${BG_BLUE}${WHITE}  ${title}  ${RESET}`); divider('═'); }
function sleep(ms) { return CONFIG.fast ? Promise.resolve() : new Promise(r => setTimeout(r, ms)); }

// ============ NPC 角色数据 ============
const NPC_DATA = {
    old_qian: {
        id: 'old_qian', name: '老钱', age: 60, gender: '男', occupation: '镇长/精神领袖',
        personality: '退休镇长，60岁，清璇的爷爷。全镇精神领袖。慢条斯理，字字有分量。爱用"咱们""大伙儿""孩子们"。常引用过去经历做判断。',
        specialty: '调解冲突×2，安抚士气×2，经验预警',
        roleHint: '你是退休镇长/精神领袖，在末日中承担起安抚情绪、调解冲突的重任。清璇是你的孙女，你格外牵挂她。',
        attrs: { stamina: 30, sanity: 80, health: 40, hunger: 55, bodyTemp: 35.5, savings: 200 },
    },
    wang_teacher: {
        id: 'wang_teacher', name: '王策', age: 32, gender: '男', occupation: '技师/规划师',
        personality: '前哲学教师，冷酷理性的逻辑怪物。说话必有论据和结论。能面不改色提出残酷方案。推眼镜是标志动作。',
        specialty: '发电机维修×2，暖炉扩建×1.5，全队规划+10%',
        roleHint: '你是技师/规划师，负责维修发电机、设计暖炉扩建方案、统筹全队效率。你暗恋歆玥，理性冷静但有时过于冷酷。',
        attrs: { stamina: 50, sanity: 70, health: 60, hunger: 65, bodyTemp: 36.2, savings: 150 },
    },
    li_shen: {
        id: 'li_shen', name: '李婶', age: 42, gender: '女', occupation: '物资总管/炊事长',
        personality: '嗓门大心肠软的北方大姐。直来直去，数落人不过脑。对物资数字张口就来。急了连珠炮训人，但转头最操心你。',
        specialty: '食物加工×2，物资盘点减浪费-20%，分配公平',
        roleHint: '你是物资总管/炊事长，全镇后勤管家。陆辰是你儿子，你会不惜一切保护他。',
        attrs: { stamina: 60, sanity: 65, health: 55, hunger: 70, bodyTemp: 36.0, savings: 180 },
    },
    zhao_chef: {
        id: 'zhao_chef', name: '赵铁柱', age: 38, gender: '男', occupation: '伐木工/锅炉工',
        personality: '话极少。别人说十句他"嗯"一声。开口必是干货。全镇最壮。',
        specialty: '砍柴×1.5，搬运×1.5，暖炉维护×2',
        roleHint: '你是伐木工/锅炉工，全镇体力担当。沉默寡言但行动力极强，暗恋李婶。',
        attrs: { stamina: 90, sanity: 70, health: 75, hunger: 60, bodyTemp: 36.5, savings: 80 },
    },
    su_doctor: {
        id: 'su_doctor', name: '苏岩', age: 35, gender: '男', occupation: '医官',
        personality: '冷静专业。条理分明，语气平稳。习惯用数据和医学角度分析。对药品存量焦虑。',
        specialty: '治疗冻伤×2，失温救治+50%，心理疏导×1.5',
        roleHint: '你是医官，据点唯一的医疗力量。暗恋歆玥，冷静专业但过度操劳时自己也会崩溃。',
        attrs: { stamina: 55, sanity: 75, health: 80, hunger: 50, bodyTemp: 36.3, savings: 120 },
    },
    lu_chen: {
        id: 'lu_chen', name: '陆辰', age: 18, gender: '男', occupation: '采集工/建筑工',
        personality: '热血莽撞的愣头青。嘴比脑子快。"别废话了直接干！"最年轻最能扛冻。',
        specialty: '建材×1.5，食物采集×1.3，建造×1.3，耐寒×0.7',
        roleHint: '你是采集工/建筑工，最年轻的劳动力。冲动勇敢但情商低，暗恋清璇。',
        attrs: { stamina: 95, sanity: 60, health: 95, hunger: 45, bodyTemp: 36.8, savings: 50 },
    },
    ling_yue: {
        id: 'ling_yue', name: '歆玥', age: 22, gender: '女', occupation: '侦察员/急救兵',
        personality: '全队情绪稳定器。看似大大咧咧，实则最通透。绝望中也能找亮点。敏锐察觉别人情绪低落。',
        specialty: '废墟侦察×2，野外急救×1.5，鼓舞士气×1.3',
        roleHint: '你是侦察员/急救兵，负责废墟侦察搜索稀有物资。被苏岩和王策同时追求。乐观坚韧但初始San值较低。',
        attrs: { stamina: 60, sanity: 55, health: 70, hunger: 60, bodyTemp: 36.1, savings: 90 },
    },
    qing_xuan: {
        id: 'qing_xuan', name: '清璇', age: 16, gender: '女', occupation: '药剂师学徒/陷阱工',
        personality: '声音小但脑子最好使。16岁学霸少女。从化学角度提方案。常最后发言但一针见血。',
        specialty: '草药制剂×1.5，陷阱/警报，急救包制作×1.3',
        roleHint: '你是16岁的药剂师学徒，老钱的孙女。聪明好学、心灵手巧。你暗恋陆辰。',
        attrs: { stamina: 40, sanity: 50, health: 65, hunger: 55, bodyTemp: 35.8, savings: 30 },
    },
};

// ============ 环境数据构建 ============
function getTimeStr() { return '10:30'; }
function getTimePeriod() { return '上午'; }
function getWeatherStr() { return `${CONFIG.weather}，${CONFIG.temp}°C`; }
function getSurvivalSummary() {
    const dayNames = { 1: '准备日(0°C)', 2: '寒冷天(-30°C)', 3: '喘息日(0°C)', 4: '大极寒(-60°C)' };
    return `第${CONFIG.day}天 ${dayNames[CONFIG.day]}，当前气温${CONFIG.temp}°C，天气${CONFIG.weather}。存活8/8人。\n暖炉1号运转中（木柴消耗0.8/小时），第二暖炉建造进度60%。`;
}
function getResourceStatus() { return '🪵木柴:35(够烧约44小时) 🍞食物:50(够吃约4餐) ⚡电力:20(剩约10小时)'; }
function getResourceTension() { return 0.25; }
function getBlizzardUrgency() {
    if (CONFIG.day === 1) return '⏰ 距离第一场暴风雪还有约24小时。抓紧时间收集物资！';
    if (CONFIG.day === 2) return '🌨️ 暴风雪正在进行！户外活动极度危险，连续工作不超过2小时！';
    if (CONFIG.day === 3) return '⚠️ 今晚24点暴风雪将再次来袭！这是最后的准备窗口！';
    return '🚨🚨 超级暴风雪！-60°C！严禁外出！所有人留在室内！';
}

function getAttrHints(npc) {
    const hints = [];
    if (npc.attrs.stamina < 20) hints.push('⚠️ 体力极低，急需休息');
    else if (npc.attrs.stamina < 50) hints.push('你有些疲惫');
    if (npc.attrs.sanity < 25) hints.push('🚨 精神状态非常差！极度焦虑、恐惧、绝望，必须尽快去医院找苏医生做心理咨询！');
    else if (npc.attrs.sanity < 50) hints.push('你精神状态一般，有些疲惫和低落');
    else if (npc.attrs.sanity >= 80) hints.push('你精神状态很好，头脑清晰，充满干劲');
    if (npc.attrs.health < 35) hints.push('🚨 健康危险！');
    if (npc.attrs.hunger < 25) hints.push('⚠️ 你快饿晕了！');
    if (npc.attrs.bodyTemp < 35) hints.push(`🚨 你正在失温！体温: ${npc.attrs.bodyTemp}°C`);
    return hints.length > 0 ? '\n你当前的身心状态：\n' + hints.map(h => '- ' + h).join('\n') : '';
}

function getNearbyStr(npcId) {
    const allIds = Object.keys(NPC_DATA);
    const nearby = allIds.filter(id => id !== npcId).slice(0, 3);
    return nearby.map((id, i) => `${NPC_DATA[id].name}(${(i+1)*3}格，${NPC_DATA[id].occupation})`).join('、') || '（附近没人）';
}

function getAllNPCStatus() {
    return Object.values(NPC_DATA).map(n =>
        `${n.name}(${n.occupation}): 体力${n.attrs.stamina} San${n.attrs.sanity} 健康${n.attrs.health} 体温${n.attrs.bodyTemp}°C`
    ).join('\n');
}

// ============ LLM 调用 ============
async function callOllama(systemPrompt, userPrompt, maxTokens = 500) {
    const http = require('http');
    const body = JSON.stringify({
        model: CONFIG.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        think: false, stream: false,
        options: { num_predict: maxTokens, temperature: 0.85 }
    });
    return new Promise((resolve, reject) => {
        const req = http.request(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            timeout: 120000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    let content = json.message?.content || '';
                    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    resolve(content || null);
                } catch (e) { reject(new Error(`JSON解析失败: ${e.message}`)); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('LLM请求超时(120s)')); });
        req.write(body);
        req.end();
    });
}

function parseJSON(text) {
    if (!text) return null;
    try {
        let s = text.replace(/```json|```/g, '').trim();
        const m = s.match(/\{[\s\S]*\}/);
        if (m) s = m[0];
        return JSON.parse(s);
    } catch (e) {
        try {
            let s = text.replace(/```json|```/g, '').trim();
            const idx = s.indexOf('{');
            if (idx >= 0) {
                s = s.substring(idx);
                let depth = 0;
                for (let i = 0; i < s.length; i++) { if (s[i] === '{') depth++; if (s[i] === '}') depth--; }
                while (depth > 0) { s += '}'; depth--; }
                const brackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
                for (let i = 0; i < brackets; i++) s += ']';
                return JSON.parse(s);
            }
        } catch (e2) { /* ignore */ }
        return null;
    }
}

// ============ 测试1: think() ============
async function testThink(npc) {
    header(`🧠 测试1: think() — ${npc.name}的思考`);
    log(`${DIM}模拟NPC在游戏中的think()调用，测试LLM生成心情/内心独白/社交意愿${RESET}\n`);

    const attrHintStr = getAttrHints(npc);
    const nearbyStr = getNearbyStr(npc.id);

    const systemPrompt = `你是「${npc.name}」，福音镇的居民。世界末日来临，极端寒冷天气侵袭小镇，你们必须团结协作、收集物资、维持暖炉运转才能存活。
姓名：${npc.name}，${npc.age}岁，${npc.occupation}
性格：${npc.personality}
当前心情：焦虑
${attrHintStr}

【生存状况】
${getSurvivalSummary()}

${getBlizzardUrgency()}
资源状况: ${getResourceStatus()}
资源紧张度: ${getResourceTension().toFixed(2)}/1.0（偏紧，注意资源）

⏰ 现在是补给窗口期，建议全力采集物资！

${npc.roleHint}

重要规则：
1. 这是一个末日生存环境。你的首要目标是活下去，其次是帮助同伴活下去。
2. 你的情绪和言行必须和当前生存环境一致。如果资源紧缺，你应该焦虑；如果有人死了，你应该悲痛或恐惧。
3. expression是你真正说出口的话，应该围绕生存话题。
4. 你的思考和行为应该受到你当前身心状态和生存压力的影响。`;

    const userPrompt = `时间：第${CONFIG.day}天 ${getTimeStr()} ${getTimePeriod()}
天气：${getWeatherStr()}
位置：村庄广场，可以看到暖炉冒出的烟，远处是伐木场
附近的人：${nearbyStr}
⚠️ 注意：你附近有3个人，你不是一个人！
最近发生的事：
[5分钟前] 赵铁柱从伐木场搬回一批木柴
[20分钟前] 苏岩给老钱做了健康检查
[1小时前] 全体开会讨论了暴风雪准备方案
当前状态：在广场巡视
饱食度：${npc.attrs.hunger}/100
【你的属性】💪体力:${npc.attrs.stamina} 🧠San:${npc.attrs.sanity} ❤️健康:${npc.attrs.health} 🌡️体温:${npc.attrs.bodyTemp}°C 💰存款:${npc.attrs.savings}元

请根据上面的实际情境，决定你现在的状态。
用纯 JSON 回复：
{
  "thought": "内心独白（基于真实环境的想法，必须提到当前最担忧的属性或最想推进的目标）",
  "mood": "两字心情（必须符合当前处境）",
  "expression": "说出的话（简短，或空字符串）",
  "wantChat": "同场景的人名（可以走过去找他，或空字符串）",
  "concern": "当前最担忧的事",
  "goalFocus": "当前最想推进的目标名称（没有就写'无'）"
}`;

    // ═══════════════════════ 📥 输入 ═══════════════════════
    log(`${BOLD}${CYAN}┌─────────────────────────────────────────────────┐${RESET}`);
    log(`${BOLD}${CYAN}│  📥 输入（喂给LLM的关键信息摘要）              │${RESET}`);
    log(`${BOLD}${CYAN}└─────────────────────────────────────────────────┘${RESET}`);
    log(`  ${BOLD}角色：${RESET}${npc.name}（${npc.age}岁 ${npc.occupation}）`);
    log(`  ${BOLD}性格：${RESET}${npc.personality.substring(0, 40)}...`);
    log(`  ${BOLD}时间：${RESET}第${CONFIG.day}天 ${getTimeStr()} ${getTimePeriod()}`);
    log(`  ${BOLD}天气：${RESET}${getWeatherStr()}`);
    log(`  ${BOLD}位置：${RESET}村庄广场`);
    log(`  ${BOLD}附近：${RESET}${nearbyStr}`);
    log(`  ${BOLD}属性：${RESET}💪体力:${npc.attrs.stamina} 🧠San:${npc.attrs.sanity} ❤️健康:${npc.attrs.health} 🍞饱食:${npc.attrs.hunger} 🌡️体温:${npc.attrs.bodyTemp}°C`);
    log(`  ${BOLD}心情：${RESET}焦虑`);
    log(`  ${BOLD}近事：${RESET}[5min前]赵铁柱搬回木柴 [20min前]苏岩给老钱检查 [1h前]全体开会`);
    log(`  ${BOLD}资源：${RESET}${getResourceStatus()}`);
    const attrHintDisplay = getAttrHints(npc).trim();
    if (attrHintDisplay) log(`  ${BOLD}状态提示：${RESET}${attrHintDisplay.replace(/\n/g, ' ')}`);
    log(`  ${DIM}[Prompt总长: system ${systemPrompt.length}字 + user ${userPrompt.length}字]${RESET}`);
    log('');

    try {
        const startTime = Date.now();
        const reply = await callOllama(systemPrompt, userPrompt, 500);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // ═══════════════════════ 📤 输出 ═══════════════════════
        log(`${BOLD}${YELLOW}┌─────────────────────────────────────────────────┐${RESET}`);
        log(`${BOLD}${YELLOW}│  📤 输出（LLM原始回复）              ${elapsed}s │${RESET}`);
        log(`${BOLD}${YELLOW}└─────────────────────────────────────────────────┘${RESET}`);
        log(`${DIM}${reply || '（空回复）'}${RESET}`);
        log('');

        const parsed = parseJSON(reply);
        if (parsed) {
            // ═══════════════════════ 🔍 识别到 ═══════════════════════
            log(`${BOLD}${GREEN}┌─────────────────────────────────────────────────┐${RESET}`);
            log(`${BOLD}${GREEN}│  🔍 识别到（从JSON中提取的结构化数据）         │${RESET}`);
            log(`${BOLD}${GREEN}└─────────────────────────────────────────────────┘${RESET}`);
            log(`  mood        = "${parsed.mood || '?'}"`);
            log(`  thought     = "${parsed.thought || '?'}"`);
            log(`  expression  = "${parsed.expression || '（沉默）'}"`);
            log(`  wantChat    = "${parsed.wantChat || '（无）'}"`);
            log(`  concern     = "${parsed.concern || '?'}"`);
            log(`  goalFocus   = "${parsed.goalFocus || '无'}"`);
            log('');

            // ═══════════════════════ ⚡ 行动 ═══════════════════════
            log(`${BOLD}${MAGENTA}┌─────────────────────────────────────────────────┐${RESET}`);
            log(`${BOLD}${MAGENTA}│  ⚡ 行动（系统根据识别结果执行的操作）         │${RESET}`);
            log(`${BOLD}${MAGENTA}└─────────────────────────────────────────────────┘${RESET}`);
            log(`  ${BOLD}💬 头顶气泡：${RESET}${parsed.expression ? `"${parsed.expression}"` : '（无，不显示气泡）'}`);
            log(`  ${BOLD}😊 心情图标：${RESET}切换为 [${parsed.mood || '?'}]`);
            if (parsed.wantChat) {
                log(`  ${BOLD}🚶 发起社交：${RESET}走向 ${parsed.wantChat}，触发对话系统`);
            } else {
                log(`  ${BOLD}🚶 社交行为：${RESET}（无，不主动找人聊天）`);
            }
            log(`  ${BOLD}🎯 目标驱动：${RESET}${parsed.goalFocus && parsed.goalFocus !== '无' ? `后续actionDecision会倾向于「${parsed.goalFocus}」` : '无特定目标偏向'}`);
            log(`  ${BOLD}📝 写入记忆：${RESET}concern="${parsed.concern || '无'}" → 影响后续决策权重`);

            // 质量检查
            log(''); divider();
            const checks = [
                ['thought不为空', !!parsed.thought],
                ['mood为两个字', parsed.mood && parsed.mood.length === 2],
                ['wantChat合法', !parsed.wantChat || Object.values(NPC_DATA).some(n => n.name === parsed.wantChat)],
                ['concern不为空', !!parsed.concern],
            ];
            const passCount = checks.filter(c => c[1]).length;
            log(`${BOLD}  ✅ 质量: ${passCount}/${checks.length} 通过${RESET}  ${checks.map(([l,p]) => (p ? GREEN + '●' : RED + '●') + RESET).join('')}`);
            for (const [label, pass] of checks.filter(c => !c[1])) {
                log(`  ${RED}  ❌ ${label}${RESET}`);
            }
        } else {
            log(`${RED}❌ JSON解析失败！LLM没有返回有效JSON${RESET}`);
        }
    } catch (err) {
        log(`${RED}❌ LLM调用出错: ${err.message}${RESET}`);
    }
}

// ============ 测试2: _actionDecision() ============
async function testActionDecision(npc) {
    header(`🎯 测试2: _actionDecision() — ${npc.name}的行动决策`);
    log(`${DIM}模拟NPC在游戏中的行动决策调用，测试LLM能否做出合理的行动选择${RESET}\n`);

    const targetList = `  lumber_yard — 伐木场（户外，砍柴采集木柴）
  frozen_lake — 冰湖（户外，捕鱼采集食物）
  ruins — 废墟（户外，探索搜索稀有物资）
  workshop — 工坊（室内，建造/维修设备）
  furnace_hall — 暖炉大厅（室内，暖炉维护/取暖）
  kitchen_door — 炊事房（室内，做饭/吃饭）
  hospital — 医疗站（室内，治疗/心理咨询）
  apartment — 公寓（室内，休息睡觉）
  generator_room — 发电房（室内，发电/维修发电机）
  village_center — 村庄中心广场（户外）`;

    const systemPrompt = `你是「${npc.name}」的行动决策AI。世界末日来临，极端寒冷天气侵袭小镇。你需要根据角色的当前状态、生存环境和人际关系，决定角色下一步应该做什么。

角色信息：
- 姓名：${npc.name}，${npc.age}岁，${npc.occupation}
- 性格：${npc.personality}
- 当前心情：焦虑

【生存状况】${getSurvivalSummary()}

${getBlizzardUrgency()}
资源: ${getResourceStatus()}
资源紧张度: ${getResourceTension().toFixed(2)}/1.0（偏紧，注意资源）

决策规则：
1. 你的首要目标是在末日中存活。其次是帮助同伴存活。
2. 你有被分配的生存任务，应该优先完成任务。
3. 🚨如果体力<30/健康<30/体温<35°C，必须立即回暖炉旁休息！priority=urgent！
4. 🚨如果精神<20，必须立刻恢复精神！否则你会发疯！priority=urgent！
5. 如果很饿，应该去吃饭，priority=urgent。
6. 如果有同伴倒下，你应该去救援他们。
7. 优先级：生存紧急需求 > 任务完成 > 健康恢复 > 日常日程。
8. type="work"表示按日程行动。身心状态差时绝不要选work！
9. 资源紧张度>0.3时，体力型角色应优先选go_to到采集区产出资源。
10. 你的角色专长：${npc.specialty}，擅长的工作效率更高，优先选择擅长的任务。

可选目标位置：
${targetList}

行动类型说明：
- go_to: 前往某地（必须指定target）
- rest: 回家休息/睡觉
- eat: 去炊事房吃饭（target选kitchen_door）
- work: 按日程行动
- accompany: 陪伴某人去某地（必须指定target和companion）
- stay: 留在原地
- wander: 随便走走`;

    const userPrompt = `当前时间：第${CONFIG.day}天 ${getTimeStr()} ${getTimePeriod()}
天气：${getWeatherStr()}
温度：${CONFIG.temp}°C
位置：暖炉大厅，温暖的室内
附近的人：${getNearbyStr(npc.id)}

【你的状态】
体力：${npc.attrs.stamina}/100${npc.attrs.stamina < 20 ? ' 🚨极低！' : ''}
健康：${npc.attrs.health}/100${npc.attrs.health < 35 ? ' 🚨危险！' : ''}
精神：${npc.attrs.sanity}/100${npc.attrs.sanity < 25 ? ' 🚨极度危险！' : ''}
饱食：${npc.attrs.hunger}/100${npc.attrs.hunger < 25 ? ' 🚨很饿！' : ''}
体温：${npc.attrs.bodyTemp}°C${npc.attrs.bodyTemp < 35 ? ' 🚨失温！' : ''}
存款：${npc.attrs.savings}元

【当前日程】上午：去伐木场砍柴（推荐）
【最近想法】应该去伐木场多砍点柴，暴风雪快来了
【最近记忆】
[5分钟前] 赵铁柱从伐木场搬回一批木柴
[30分钟前] 全体开会讨论了暴风雪准备方案，决定优先补充木柴

【全镇NPC状态】
${getAllNPCStatus()}

请决定你的下一步行动。以「${npc.name}」的第一人称视角思考，用你的性格和口吻来表达。用纯JSON回复：
{
  "threat_analysis": "（用第一人称、角色口吻说出最担心的事）",
  "opportunity_analysis": "（用角色口吻说出看到的希望）",
  "reasoning": "（一句话内心独白，要有角色性格特色）",
  "action": {
    "type": "go_to|rest|eat|work|accompany|stay|wander",
    "target": "目标位置key（从可选列表选）",
    "reason": "行动原因（简短口语化）",
    "priority": "urgent|normal|low",
    "companion": "想邀请同行的人名（可选）"
  }
}`;

    // 位置名称映射
    const TARGET_NAMES = {
        lumber_yard: '🪓 伐木场（户外）', frozen_lake: '🐟 冰湖（户外）', ruins: '🏚️ 废墟（户外）',
        workshop: '🔧 工坊（室内）', furnace_hall: '🔥 暖炉大厅（室内）', kitchen_door: '🍳 炊事房（室内）',
        hospital: '🏥 医疗站（室内）', apartment: '🏠 公寓（室内）', generator_room: '⚡ 发电房（室内）',
        village_center: '🏘️ 村庄中心广场（户外）',
    };
    const TYPE_NAMES = {
        go_to: '前往目的地', rest: '回家休息', eat: '去吃饭', work: '按日程工作',
        accompany: '陪伴同行', stay: '留在原地', wander: '随便走走',
    };

    // ═══════════════════════ 📥 输入 ═══════════════════════
    log(`${BOLD}${CYAN}┌─────────────────────────────────────────────────┐${RESET}`);
    log(`${BOLD}${CYAN}│  📥 输入（喂给LLM的关键信息摘要）              │${RESET}`);
    log(`${BOLD}${CYAN}└─────────────────────────────────────────────────┘${RESET}`);
    log(`  ${BOLD}角色：${RESET}${npc.name}（${npc.age}岁 ${npc.occupation}）`);
    log(`  ${BOLD}专长：${RESET}${npc.specialty}`);
    log(`  ${BOLD}时间：${RESET}第${CONFIG.day}天 ${getTimeStr()} ${getTimePeriod()}`);
    log(`  ${BOLD}天气：${RESET}${getWeatherStr()}`);
    log(`  ${BOLD}位置：${RESET}暖炉大厅（室内）`);
    log(`  ${BOLD}附近：${RESET}${getNearbyStr(npc.id)}`);
    log(`  ${BOLD}属性：${RESET}💪体力:${npc.attrs.stamina} 🧠San:${npc.attrs.sanity} ❤️健康:${npc.attrs.health} 🍞饱食:${npc.attrs.hunger} 🌡️体温:${npc.attrs.bodyTemp}°C`);
    log(`  ${BOLD}日程：${RESET}上午 → 去伐木场砍柴（推荐）`);
    log(`  ${BOLD}想法：${RESET}应该去伐木场多砍点柴，暴风雪快来了`);
    log(`  ${BOLD}资源：${RESET}${getResourceStatus()}`);
    log(`  ${BOLD}紧张度：${RESET}${getResourceTension().toFixed(2)}/1.0`);
    log(`  ${BOLD}暴风雪：${RESET}${getBlizzardUrgency()}`);
    log(`  ${DIM}[Prompt总长: system ${systemPrompt.length}字 + user ${userPrompt.length}字]${RESET}`);
    log('');

    try {
        const startTime = Date.now();
        const reply = await callOllama(systemPrompt, userPrompt, 500);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // ═══════════════════════ 📤 输出 ═══════════════════════
        log(`${BOLD}${YELLOW}┌─────────────────────────────────────────────────┐${RESET}`);
        log(`${BOLD}${YELLOW}│  📤 输出（LLM原始回复）              ${elapsed}s │${RESET}`);
        log(`${BOLD}${YELLOW}└─────────────────────────────────────────────────┘${RESET}`);
        log(`${DIM}${reply || '（空回复）'}${RESET}`);
        log('');

        const parsed = parseJSON(reply);
        if (parsed && parsed.action) {
            const action = parsed.action;

            // ═══════════════════════ 🔍 识别到 ═══════════════════════
            log(`${BOLD}${GREEN}┌─────────────────────────────────────────────────┐${RESET}`);
            log(`${BOLD}${GREEN}│  🔍 识别到（从JSON中提取的结构化数据）         │${RESET}`);
            log(`${BOLD}${GREEN}└─────────────────────────────────────────────────┘${RESET}`);
            log(`  threat_analysis       = "${parsed.threat_analysis || '?'}"`);
            log(`  opportunity_analysis  = "${parsed.opportunity_analysis || '?'}"`);
            log(`  reasoning             = "${parsed.reasoning || '?'}"`);
            log(`  action.type           = "${action.type}"`);
            log(`  action.target         = "${action.target || '（无）'}"`);
            log(`  action.reason         = "${action.reason || '（无）'}"`);
            log(`  action.priority       = "${action.priority || 'normal'}"`);
            if (action.companion) log(`  action.companion      = "${action.companion}"`);
            log('');

            // ═══════════════════════ ⚡ 行动 ═══════════════════════
            const priorityColor = action.priority === 'urgent' ? RED : action.priority === 'normal' ? YELLOW : DIM;
            const priorityLabel = action.priority === 'urgent' ? '🚨 紧急' : action.priority === 'normal' ? '📌 普通' : '💤 低';
            log(`${BOLD}${MAGENTA}┌─────────────────────────────────────────────────┐${RESET}`);
            log(`${BOLD}${MAGENTA}│  ⚡ 行动（系统根据识别结果执行的操作）         │${RESET}`);
            log(`${BOLD}${MAGENTA}└─────────────────────────────────────────────────┘${RESET}`);
            log(`  ${BOLD}🏷️ 优先级：${RESET}${priorityColor}${priorityLabel}${RESET}`);
            log(`  ${BOLD}📋 行动类型：${RESET}${TYPE_NAMES[action.type] || action.type}`);
            log(`  ${BOLD}🗺️ 目标位置：${RESET}${TARGET_NAMES[action.target] || action.target || '（原地）'}`);
            if (action.companion) {
                log(`  ${BOLD}🤝 同行邀请：${RESET}邀请 ${action.companion} 一起`);
            }
            log(`  ${BOLD}💬 行动原因：${RESET}"${action.reason || '无'}"`);
            log('');
            // 最终执行动作描述
            log(`  ${BOLD}${WHITE}>>> 执行：${RESET}${BOLD}${npc.name}${RESET}`);
            if (action.type === 'go_to') {
                log(`      寻路导航 → ${TARGET_NAMES[action.target] || action.target}`);
                log(`      到达后触发 ACTION_EFFECT_MAP 对应效果`);
                // 模拟效果映射
                const effectMap = {
                    lumber_yard: '砍柴产出木柴 +3~5（专长加成×1.5）',
                    frozen_lake: '捕鱼产出食物 +2~4',
                    ruins: '搜索稀有物资（概率获得药品/零件）',
                    workshop: '建造/维修（推进建造进度）',
                    furnace_hall: '暖炉维护（减少故障概率）+ 体温回升',
                    kitchen_door: '做饭/吃饭 → 饱食度+30',
                    hospital: '治疗/心理咨询 → 健康或San值+15',
                    apartment: '休息 → 体力+20 San+10',
                    generator_room: '发电 → 电力+5/小时',
                };
                if (effectMap[action.target]) {
                    log(`      预期效果: ${effectMap[action.target]}`);
                }
            } else if (action.type === 'rest') {
                log(`      导航回公寓 → 睡觉 → 体力+20 San+10`);
            } else if (action.type === 'eat') {
                log(`      导航到炊事房 → 吃饭 → 饱食度+30`);
            } else if (action.type === 'work') {
                log(`      按当前日程执行：去伐木场砍柴`);
            } else if (action.type === 'stay') {
                log(`      留在原地，等待下一次决策周期`);
            } else if (action.type === 'wander') {
                log(`      随机漫步，可能触发偶遇事件`);
            } else if (action.type === 'accompany') {
                log(`      邀请${action.companion || '?'} → 一起前往 ${TARGET_NAMES[action.target] || action.target}`);
            }

            // 质量检查
            const validTypes = ['go_to', 'rest', 'eat', 'work', 'accompany', 'stay', 'wander'];
            const validTargets = Object.keys(TARGET_NAMES);
            log(''); divider();
            const checks = [
                ['action.type有效', validTypes.includes(action.type)],
                ['target有效(或无需)', !['go_to', 'eat', 'accompany'].includes(action.type) || validTargets.includes(action.target)],
                ['priority有效', ['urgent', 'normal', 'low'].includes(action.priority)],
                ['threat有内容', !!parsed.threat_analysis],
                ['reasoning有内容', !!parsed.reasoning],
                ['reason有内容', !!action.reason],
            ];
            const passCount = checks.filter(c => c[1]).length;
            log(`${BOLD}  ✅ 质量: ${passCount}/${checks.length} 通过${RESET}  ${checks.map(([l,p]) => (p ? GREEN + '●' : RED + '●') + RESET).join('')}`);
            for (const [label, pass] of checks.filter(c => !c[1])) {
                log(`  ${RED}  ❌ ${label}${RESET}`);
            }
        } else {
            log(`${RED}❌ JSON解析失败！LLM没有返回有效的action JSON${RESET}`);
            if (parsed) log(`${DIM}解析到: ${JSON.stringify(parsed).substring(0, 200)}${RESET}`);
        }
    } catch (err) {
        log(`${RED}❌ LLM调用出错: ${err.message}${RESET}`);
    }
}

// ============ 测试3: NPC-NPC 对话 ============
async function testDialogue(npc1, npc2) {
    header(`💬 测试3: NPC-NPC对话 — ${npc1.name} ↔ ${npc2.name}`);
    log(`${DIM}模拟两个NPC之间的多轮对话，测试LLM的对话连贯性和角色扮演质量${RESET}\n`);

    const topicPool = [
        `讨论今天的物资收集进展，木柴和食物够不够`,
        `商量一下暴风雪来之前该怎么分工准备`,
        `聊聊暖炉的情况，第二座暖炉什么时候能建好`,
        `讨论谁去砍柴谁去找食物，怎么分配最合理`,
    ];
    const topic = topicPool[Math.floor(Math.random() * topicPool.length)];

    // 模拟好感度
    const affinity = 65;
    const relationDesc = `你和${npc2.name}关系一般（好感度${affinity}），是普通邻居/熟人，聊天比较客气。`;

    const allMessages = [];

    function buildSystemPrompt(speaker, listener) {
        return `你是「${speaker.name}」，${speaker.age}岁，${speaker.gender}性，${speaker.occupation}。
性格：${speaker.personality}。心情：焦虑。
你正在和「${listener.name}」（${listener.gender}性，${listener.occupation}）面对面聊天。
${relationDesc}

${getSurvivalSummary()}
${getBlizzardUrgency()}
你现在在「暖炉大厅」，${listener.name}也在「暖炉大厅」。

重要规则：
1. 你必须直接回应对方刚说的话，不能各说各的。
2. 说话要口语化、自然（1-3句话）。每次说话要有新的信息量，不要重复之前说过的内容和用词。
3. 你的说话态度、语气必须严格符合上面描述的关系状态和好感度。
4. 不要JSON格式，直接说话。
5. 🚨 你们正处于末日生存环境！对话内容必须围绕生存——讨论物资准备、暖炉修建、任务进展、身体状况等。
6. 积极回应，可以追问、分享看法，让对话有深度。如果当前话题快说完了，可以自然地转到另一个与生存相关的话题。
6. 请继续积极聊天，不要急着结束对话。`;
    }

    // ═══════════════════════ 📥 输入 ═══════════════════════
    log(`${BOLD}${CYAN}┌─────────────────────────────────────────────────┐${RESET}`);
    log(`${BOLD}${CYAN}│  📥 输入（对话场景设定）                        │${RESET}`);
    log(`${BOLD}${CYAN}└─────────────────────────────────────────────────┘${RESET}`);
    log(`  ${BOLD}说话方：${RESET}${npc1.name}（${npc1.age}岁 ${npc1.occupation}）— ${npc1.personality.substring(0, 30)}...`);
    log(`  ${BOLD}听话方：${RESET}${npc2.name}（${npc2.age}岁 ${npc2.occupation}）— ${npc2.personality.substring(0, 30)}...`);
    log(`  ${BOLD}关系：${RESET}好感度${affinity}，普通邻居/熟人`);
    log(`  ${BOLD}地点：${RESET}暖炉大厅（室内）`);
    log(`  ${BOLD}话题：${RESET}${topic}`);
    log(`  ${BOLD}轮数：${RESET}${CONFIG.rounds}轮`);
    log(`  ${BOLD}环境：${RESET}${getSurvivalSummary().split('\n')[0]}`);
    log('');

    const greetSystemPrompt = buildSystemPrompt(npc1, npc2);
    const greetUserPrompt = `你刚遇到${npc2.name}，请自然地打个招呼，然后试着${topic}。\n你说：`;

    try {
        // ═══════════════════════ 📤 输出（多轮对话） ═══════════════════════
        log(`${BOLD}${YELLOW}┌─────────────────────────────────────────────────┐${RESET}`);
        log(`${BOLD}${YELLOW}│  📤 输出（LLM生成的多轮对话）                  │${RESET}`);
        log(`${BOLD}${YELLOW}└─────────────────────────────────────────────────┘${RESET}`);
        log('');

        // 第一句：打招呼
        let greeting = await callOllama(greetSystemPrompt, greetUserPrompt, 200);
        if (!greeting) greeting = `${npc2.name}，你也在这儿啊。`;
        greeting = greeting.replace(/\[END\]/g, '').trim().substring(0, 200);
        log(`  ${MAGENTA}${BOLD}${npc1.name}${RESET} ${DIM}(开场)${RESET}: ${greeting}`);
        allMessages.push({ speaker: npc1.name, text: greeting });

        // 多轮对话
        for (let i = 0; i < CONFIG.rounds; i++) {
            await sleep(500);

            // npc2回复
            const chatHistory2 = allMessages.map(m => `${m.speaker}说：${m.text}`).join('\n');
            const lastLine = allMessages[allMessages.length - 1];
            const sys2 = buildSystemPrompt(npc2, npc1);
            const user2 = `对话记录（已${Math.floor(allMessages.length/2)}轮）：\n${chatHistory2}\n\n${lastLine.speaker}刚对你说了"${lastLine.text}"，你必须针对这句话回应。\n你说：`;

            let reply2 = await callOllama(sys2, user2, 200);
            if (!reply2) reply2 = '嗯…你说得对。';
            reply2 = reply2.replace(/\[END\]/g, '').replace(new RegExp(`^[「]?${npc2.name}[」]?[：:]\\s*`), '').trim().substring(0, 200);
            log(`  ${YELLOW}${BOLD}${npc2.name}${RESET}: ${reply2}`);
            allMessages.push({ speaker: npc2.name, text: reply2 });

            await sleep(500);

            // npc1接着说
            const chatHistory1 = allMessages.map(m => `${m.speaker}说：${m.text}`).join('\n');
            const lastLine1 = allMessages[allMessages.length - 1];
            const sys1 = buildSystemPrompt(npc1, npc2);
            const user1 = `对话记录（已${Math.floor(allMessages.length/2)}轮）：\n${chatHistory1}\n\n${lastLine1.speaker}刚对你说了"${lastLine1.text}"，你必须针对这句话回应。\n你说：`;

            let reply1 = await callOllama(sys1, user1, 200);
            if (!reply1) reply1 = '嗯，我知道了。';
            reply1 = reply1.replace(/\[END\]/g, '').replace(new RegExp(`^[「]?${npc1.name}[」]?[：:]\\s*`), '').trim().substring(0, 200);
            log(`  ${MAGENTA}${BOLD}${npc1.name}${RESET}: ${reply1}`);
            allMessages.push({ speaker: npc1.name, text: reply1 });
        }
        log('');

        // ═══════════════════════ 🔍 识别到 ═══════════════════════
        log(`${BOLD}${GREEN}┌─────────────────────────────────────────────────┐${RESET}`);
        log(`${BOLD}${GREEN}│  🔍 识别到（从对话中提取的结构化信息）         │${RESET}`);
        log(`${BOLD}${GREEN}└─────────────────────────────────────────────────┘${RESET}`);
        log(`  对话轮数    = ${CONFIG.rounds}轮 (${allMessages.length}句)`);
        const avgLen = Math.round(allMessages.reduce((s, m) => s + m.text.length, 0) / allMessages.length);
        log(`  平均句长    = ${avgLen}字/句`);

        // 话题关键词分析
        const survivalKeywords = ['柴', '暖炉', '食物', '暴风', '物资', '温度', '冻', '准备', '修', '砍', '电力', '医', '体力', '采集', '撑', '木', '烧', '吃', '冷', '熬'];
        const hitKeywords = new Set();
        allMessages.forEach(m => survivalKeywords.forEach(k => { if (m.text.includes(k)) hitKeywords.add(k); }));
        const relevantMsgs = allMessages.filter(m => survivalKeywords.some(k => m.text.includes(k)));
        const relevance = Math.round(relevantMsgs.length / allMessages.length * 100);
        log(`  生存相关度  = ${relevance}% (${relevantMsgs.length}/${allMessages.length}句命中)`);
        log(`  命中关键词  = [${[...hitKeywords].join(', ')}]`);

        // 检查重复
        const texts = allMessages.map(m => m.text);
        const duplicates = texts.filter((t, i) => texts.indexOf(t) !== i);
        log(`  重复检测    = ${duplicates.length === 0 ? '无重复 ✅' : '有重复: "' + duplicates[0].substring(0, 30) + '..." ❌'}`);

        // 角色区分度
        const npc1Msgs = allMessages.filter(m => m.speaker === npc1.name).map(m => m.text).join('');
        const npc2Msgs = allMessages.filter(m => m.speaker === npc2.name).map(m => m.text).join('');
        log(`  ${npc1.name}总字数 = ${npc1Msgs.length}字`);
        log(`  ${npc2.name}总字数 = ${npc2Msgs.length}字`);
        log('');

        // ═══════════════════════ ⚡ 行动 ═══════════════════════
        log(`${BOLD}${MAGENTA}┌─────────────────────────────────────────────────┐${RESET}`);
        log(`${BOLD}${MAGENTA}│  ⚡ 行动（对话系统触发的游戏效果）             │${RESET}`);
        log(`${BOLD}${MAGENTA}└─────────────────────────────────────────────────┘${RESET}`);

        // 模拟好感度变化
        const positiveWords = ['谢', '好', '对', '行', '没问题', '帮', '一起', '加油', '辛苦'];
        const negativeWords = ['不', '别', '烦', '滚', '废', '懒', '笨'];
        let posCount = 0, negCount = 0;
        allMessages.forEach(m => {
            positiveWords.forEach(w => { if (m.text.includes(w)) posCount++; });
            negativeWords.forEach(w => { if (m.text.includes(w)) negCount++; });
        });
        const affinityDelta = Math.min(5, Math.max(-3, posCount - negCount));

        log(`  ${BOLD}❤️ 好感度变化：${RESET}${npc1.name} ↔ ${npc2.name}: ${affinity} → ${affinity + affinityDelta} (${affinityDelta >= 0 ? '+' : ''}${affinityDelta})`);
        log(`    正面词命中${posCount}次，负面词命中${negCount}次`);
        log(`  ${BOLD}🧠 San值影响：${RESET}正常对话 → 双方San值各+2（社交回复）`);
        log(`  ${BOLD}💭 写入记忆：${RESET}"${npc1.name}和${npc2.name}在暖炉大厅聊了${topic.substring(0, 15)}..."`);
        log(`  ${BOLD}💬 头顶气泡：${RESET}显示最后一句话 → "${allMessages[allMessages.length - 1].text.substring(0, 30)}..."`);
        log(`  ${BOLD}⏱️ 对话冷却：${RESET}双方进入60秒对话冷却，期间不会再次触发对话`);

        // 质量检查
        log(''); divider();
        const checks = [
            ['无重复内容', duplicates.length === 0],
            ['生存相关≥50%', relevance >= 50],
            ['平均句长≥8字', avgLen >= 8],
            ['平均句长≤150字', avgLen <= 150],
        ];
        const passCount = checks.filter(c => c[1]).length;
        log(`${BOLD}  ✅ 质量: ${passCount}/${checks.length} 通过${RESET}  ${checks.map(([l,p]) => (p ? GREEN + '●' : RED + '●') + RESET).join('')}`);
        for (const [label, pass] of checks.filter(c => !c[1])) {
            log(`  ${RED}  ❌ ${label}${RESET}`);
        }
    } catch (err) {
        log(`${RED}❌ 对话测试出错: ${err.message}${RESET}`);
    }
}

// ============ 主流程 ============
async function main() {
    console.clear();
    header('🧪 福音雪镇 — 对话决策系统测试');
    log(`\n${DIM}  模型: ${CONFIG.model} | 测试模块: ${CONFIG.test}${RESET}`);
    log(`${DIM}  第${CONFIG.day}天 | ${CONFIG.temp}°C ${CONFIG.weather}${RESET}\n`);

    // 检查Ollama连通性
    log(`${DIM}  正在连接 Ollama (${CONFIG.model})...${RESET}`);
    try {
        const test = await callOllama('你好', '回复"OK"', 10);
        if (test) {
            log(`${GREEN}  ✅ Ollama 连接成功${RESET}\n`);
        } else {
            log(`${YELLOW}  ⚠️ Ollama 返回空值，但连接成功${RESET}\n`);
        }
    } catch (err) {
        log(`${RED}  ❌ Ollama 连接失败: ${err.message}${RESET}`);
        log(`${RED}  请确保 ollama serve 正在运行，且模型 ${CONFIG.model} 已下载${RESET}`);
        process.exit(1);
    }

    const npc1 = NPC_DATA[CONFIG.npc];
    const npc2 = NPC_DATA[CONFIG.npc2];
    if (!npc1) { log(`${RED}❌ 找不到NPC: ${CONFIG.npc}${RESET}`); process.exit(1); }
    if (!npc2) { log(`${RED}❌ 找不到NPC: ${CONFIG.npc2}${RESET}`); process.exit(1); }

    const startTime = Date.now();

    if (CONFIG.test === 'all' || CONFIG.test === 'think') {
        await testThink(npc1);
    }
    if (CONFIG.test === 'all' || CONFIG.test === 'action') {
        await testActionDecision(npc1);
    }
    if (CONFIG.test === 'all' || CONFIG.test === 'dialogue') {
        await testDialogue(npc1, npc2);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('');
    divider('═');
    log(`${BOLD}  🧪 测试完成 — 总耗时: ${elapsed}秒${RESET}`);
    divider('═');
    log('');
}

main().catch(err => {
    console.error(`\n${RED}❌ 运行出错: ${err.message}${RESET}`);
    console.error(err.stack);
    process.exit(1);
});
