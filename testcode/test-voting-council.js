#!/usr/bin/env node
/**
 * 🗳️ 福音雪镇 — 行动决策投票系统 TestCode
 * 
 * 用法：
 *   node testcode/test-voting-council.js [选项]
 * 
 * 可选参数（都有默认值，可直接运行）：
 *   --day=2           当前天数（1-4）
 *   --temp=-30        当前温度（°C）
 *   --weather=暴风雪   天气
 *   --wood=20         木柴储备
 *   --food=60         食物储备
 *   --power=15        电力储备
 *   --alive=8         存活人数（默认全员存活）
 *   --model=qwen3.5:4b  Ollama模型名
 *   --rounds=2        讨论轮数（每轮所有人发言）
 *   --fast            快速模式（跳过延迟）
 * 
 * 示例：
 *   node testcode/test-voting-council.js
 *   node testcode/test-voting-council.js --day=4 --temp=-60 --wood=5 --food=10 --power=3
 *   node testcode/test-voting-council.js --model=qwen3.5:9b --rounds=3
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
    day:     parseInt(args.day) || 2,
    temp:    parseInt(args.temp) || -30,
    weather: args.weather || '暴风雪',
    wood:    parseInt(args.wood) || 20,
    food:    parseInt(args.food) || 60,
    power:   parseInt(args.power) || 15,
    alive:   parseInt(args.alive) || 8,
    model:   args.model || 'qwen3.5:4b',
    rounds:  parseInt(args.rounds) || 2,
    fast:    !!args.fast,
};

// Ollama API
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';

// ============ NPC 角色数据 ============
const NPC_DATA = [
    {
        id: 'old_qian', name: '老钱', age: 60, role: '镇长/精神领袖',
        emoji: '👴', color: '\x1b[33m',
        personality: '退休镇长，60岁，清璇的爷爷。全镇精神领袖。慢条斯理，字字有分量。爱用"咱们""大伙儿""孩子们"。常引用过去经历做判断。关键时刻一拍桌子全场肃静。',
        specialty: '调解冲突×2，安抚士气×2，经验预警',
        decisionStyle: '稳重保守，优先保全所有人生命，会从历史经验出发',
        attrs: { stamina: 30, sanity: 80, health: 40, bodyTemp: 35.5 },
    },
    {
        id: 'wang_teacher', name: '王策', age: 32, role: '技师/规划师',
        emoji: '📚', color: '\x1b[34m',
        personality: '前哲学教师，冷酷理性的逻辑怪物。说话必有论据和结论。能面不改色提出残酷方案。推眼镜是标志动作。',
        specialty: '发电机维修×2，暖炉扩建×1.5，全队规划+10%',
        decisionStyle: '极端理性，会做概率分析和效益计算，可能提出牺牲少数保全多数的方案',
        attrs: { stamina: 50, sanity: 70, health: 60, bodyTemp: 36.2 },
    },
    {
        id: 'li_shen', name: '李婶', age: 42, role: '物资总管/炊事长',
        emoji: '🧓', color: '\x1b[31m',
        personality: '嗓门大心肠软的北方大姐。直来直去，数落人不过脑。对物资数字张口就来。急了连珠炮训人，但转头最操心你。',
        specialty: '食物加工×2，物资盘点减浪费-20%，分配公平',
        decisionStyle: '务实关注物资和吃饭问题，保护所有人尤其是儿子陆辰',
        attrs: { stamina: 60, sanity: 65, health: 55, bodyTemp: 36.0 },
    },
    {
        id: 'zhao_chef', name: '赵铁柱', age: 38, role: '伐木工/锅炉工',
        emoji: '🍳', color: '\x1b[35m',
        personality: '话极少。别人说十句他"嗯"一声。开口必是干货。全镇最壮。',
        specialty: '砍柴×1.5，搬运×1.5，暖炉维护×2',
        decisionStyle: '行动派，不喜欢长篇大论，倾向于直接干活解决问题',
        attrs: { stamina: 90, sanity: 70, health: 75, bodyTemp: 36.5 },
    },
    {
        id: 'su_doctor', name: '苏岩', age: 35, role: '医官',
        emoji: '🩺', color: '\x1b[32m',
        personality: '冷静专业。条理分明，语气平稳。习惯用数据和医学角度分析。对药品存量焦虑。',
        specialty: '治疗冻伤×2，失温救治+50%，心理疏导×1.5',
        decisionStyle: '从健康/医疗角度分析，关注谁最脆弱、药品够不够',
        attrs: { stamina: 55, sanity: 75, health: 80, bodyTemp: 36.3 },
    },
    {
        id: 'lu_chen', name: '陆辰', age: 18, role: '采集工/建筑工',
        emoji: '🪖', color: '\x1b[36m',
        personality: '热血莽撞的愣头青。嘴比脑子快。"别废话了直接干！"最年轻最能扛冻。',
        specialty: '建材×1.5，食物采集×1.3，建造×1.3，耐寒×0.7',
        decisionStyle: '冲动行动派，总是第一个喊"我去"，不太考虑风险',
        attrs: { stamina: 95, sanity: 60, health: 95, bodyTemp: 36.8 },
    },
    {
        id: 'ling_yue', name: '歆玥', age: 22, role: '侦察员/急救兵',
        emoji: '🎵', color: '\x1b[33m',
        personality: '全队情绪稳定器。看似大大咧咧，实则最通透。绝望中也能找亮点。敏锐察觉别人情绪低落。',
        specialty: '废墟侦察×2，野外急救×1.5，鼓舞士气×1.3',
        decisionStyle: '关注团队情绪和士气，擅长找到折中方案',
        attrs: { stamina: 60, sanity: 55, health: 70, bodyTemp: 36.1 },
    },
    {
        id: 'qing_xuan', name: '清璇', age: 16, role: '药剂师学徒/陷阱工',
        emoji: '🧪', color: '\x1b[35m',
        personality: '声音小但脑子最好使。16岁学霸少女。从化学角度提方案。常最后发言但一针见血。',
        specialty: '草药制剂×1.5，陷阱/警报，急救包制作×1.3',
        decisionStyle: '技术流，从科学角度提方案，关注爷爷老钱安危',
        attrs: { stamina: 40, sanity: 50, health: 65, bodyTemp: 35.8 },
    },
];

// ============ 可选行动方案池 ============
const ACTION_OPTIONS = [
    { id: 'chop_wood',       name: '全力砍柴',       desc: '派最多人去伐木场砍柴，优先补充木柴储备', icon: '🪓' },
    { id: 'gather_food',     name: '全力采集食物',    desc: '派人去冰湖捕鱼和采集，优先补充食物', icon: '🎣' },
    { id: 'fix_generator',   name: '修复发电机',      desc: '安排技师修复发电机，恢复电力供应', icon: '🔧' },
    { id: 'build_furnace2',  name: '建造第二暖炉',    desc: '投入人力建造第二座暖炉，为极寒做准备', icon: '🔥' },
    { id: 'build_generator', name: '建造自动发电机',   desc: '在工坊建造自动发电机，实现自动发电', icon: '⚡' },
    { id: 'build_lumber',    name: '建造自动伐木机',   desc: '在工坊建造自动伐木机，实现自动砍柴', icon: '🏗️' },
    { id: 'explore_ruins',   name: '探索废墟',        desc: '派侦察员探索废墟搜索稀有物资', icon: '🔍' },
    { id: 'rest_recover',    name: '休整恢复',        desc: '让体力低的人休息，恢复体力和健康', icon: '💤' },
    { id: 'medical_check',   name: '全员体检',        desc: '苏岩为所有人做健康检查和心理疏导', icon: '🏥' },
    { id: 'balanced',        name: '均衡分配',        desc: '砍柴、采食、发电、探索各安排人手，均衡发展', icon: '⚖️' },
    { id: 'hunker_down',     name: '全员据守',        desc: '所有人留在室内保暖，减少体力消耗，等待天气好转', icon: '🏠' },
];

// ============ LLM 调用 ============
async function callOllama(systemPrompt, userPrompt, maxTokens = 500) {
    const http = require('http');

    const body = JSON.stringify({
        model: CONFIG.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        think: false,
        stream: false,
        options: {
            num_predict: maxTokens,
            temperature: 0.85,
        }
    });

    return new Promise((resolve, reject) => {
        const req = http.request(OLLAMA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            timeout: 120000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    let content = json.message?.content || '';
                    // 清理think标签
                    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    resolve(content || null);
                } catch (e) {
                    reject(new Error(`JSON解析失败: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('LLM请求超时(120s)')); });
        req.write(body);
        req.end();
    });
}

// ============ 辅助函数 ============
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BG_BLUE = '\x1b[44m';
const WHITE = '\x1b[37m';

function log(msg) { console.log(msg); }
function divider(char = '─', len = 60) { log(DIM + char.repeat(len) + RESET); }
function header(title) {
    log('');
    divider('═');
    log(`${BOLD}${BG_BLUE}${WHITE}  ${title}  ${RESET}`);
    divider('═');
}

function sleep(ms) {
    if (CONFIG.fast) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
}

// ============ 构建环境上下文 ============
function buildSituationContext() {
    const dayNames = { 1: '准备日(0°C)', 2: '寒冷天(-30°C)', 3: '喘息日(0°C)', 4: '大极寒(-60°C)' };
    const nextDayNames = { 1: '明天: 寒冷天(-30°C,暴风雪)', 2: '明天: 喘息日(0°C)', 3: '明天: 大极寒(-60°C,暴风雪!)', 4: '最后一天，撑过去就胜利' };

    // 资源剩余时间估算
    const woodPerHour = 0.8; // 每暖炉每小时
    const powerPerHour = 2.0;
    const foodPerMeal = 1.5 * CONFIG.alive;
    const woodHours = Math.round(CONFIG.wood / woodPerHour);
    const powerHours = Math.round(CONFIG.power / powerPerHour);
    const foodMeals = Math.round(CONFIG.food / foodPerMeal);

    let ctx = `【当前状况】第${CONFIG.day}天 ${dayNames[CONFIG.day] || ''}\n`;
    ctx += `气温: ${CONFIG.temp}°C，天气: ${CONFIG.weather}\n`;
    ctx += `${nextDayNames[CONFIG.day] || ''}\n`;
    ctx += `\n【资源状况】\n`;
    ctx += `  🪵 木柴: ${CONFIG.wood}单位（够烧约${woodHours}小时）${woodHours < 12 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `  🍞 食物: ${CONFIG.food}单位（够吃约${foodMeals}餐）${foodMeals < 3 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `  ⚡ 电力: ${CONFIG.power}单位（剩约${powerHours}小时）${powerHours < 6 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `\n【人员状况】存活${CONFIG.alive}/8人\n`;

    const aliveNpcs = NPC_DATA.slice(0, CONFIG.alive);
    for (const npc of aliveNpcs) {
        const tempStr = npc.attrs.bodyTemp < 35.5 ? `${RED}${npc.attrs.bodyTemp}°C${RESET}` : `${npc.attrs.bodyTemp}°C`;
        ctx += `  ${npc.emoji} ${npc.name}(${npc.role}): 体力${npc.attrs.stamina} San${npc.attrs.sanity} 体温${npc.attrs.bodyTemp}°C\n`;
    }

    ctx += `\n【可选行动方案】\n`;
    for (const opt of ACTION_OPTIONS) {
        ctx += `  ${opt.icon} [${opt.id}] ${opt.name}: ${opt.desc}\n`;
    }

    return ctx;
}

// 构建纯文本版环境上下文（给LLM用，不带ANSI颜色）
function buildSituationContextPlain() {
    const dayNames = { 1: '准备日(0°C)', 2: '寒冷天(-30°C)', 3: '喘息日(0°C)', 4: '大极寒(-60°C)' };
    const nextDayNames = { 1: '明天: 寒冷天(-30°C,暴风雪)', 2: '明天: 喘息日(0°C)', 3: '明天: 大极寒(-60°C,暴风雪!)', 4: '最后一天，撑过去就胜利' };

    const woodPerHour = 0.8;
    const powerPerHour = 2.0;
    const foodPerMeal = 1.5 * CONFIG.alive;
    const woodHours = Math.round(CONFIG.wood / woodPerHour);
    const powerHours = Math.round(CONFIG.power / powerPerHour);
    const foodMeals = Math.round(CONFIG.food / foodPerMeal);

    let ctx = `当前是第${CONFIG.day}天 ${dayNames[CONFIG.day] || ''}\n`;
    ctx += `气温: ${CONFIG.temp}°C，天气: ${CONFIG.weather}\n`;
    ctx += `${nextDayNames[CONFIG.day] || ''}\n`;
    ctx += `\n资源状况:\n`;
    ctx += `  木柴: ${CONFIG.wood}单位（够烧约${woodHours}小时）${woodHours < 12 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `  食物: ${CONFIG.food}单位（够吃约${foodMeals}餐）${foodMeals < 3 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `  电力: ${CONFIG.power}单位（剩约${powerHours}小时）${powerHours < 6 ? ' ⚠️紧张!' : ''}\n`;
    ctx += `\n人员状况: 存活${CONFIG.alive}/8人\n`;

    const aliveNpcs = NPC_DATA.slice(0, CONFIG.alive);
    for (const npc of aliveNpcs) {
        ctx += `  ${npc.name}(${npc.role}): 体力${npc.attrs.stamina} San值${npc.attrs.sanity} 体温${npc.attrs.bodyTemp}°C\n`;
    }

    return ctx;
}

// ============ 阶段1：自由讨论 ============
async function discussionPhase(aliveNpcs, situationPlain) {
    header('📢 阶段1：营地讨论');
    log(`${DIM}大家围坐在暖炉旁，开始讨论当前处境和下一步行动...${RESET}\n`);

    const chatHistory = [];

    for (let round = 1; round <= CONFIG.rounds; round++) {
        log(`${BOLD}${CYAN}── 第${round}轮讨论 ──${RESET}`);

        // 每轮随机打乱发言顺序（但老钱倾向第一个）
        const speakers = [...aliveNpcs];
        // 第一轮老钱先说
        if (round === 1) {
            const qianIdx = speakers.findIndex(n => n.id === 'old_qian');
            if (qianIdx > 0) {
                const [qian] = speakers.splice(qianIdx, 1);
                speakers.unshift(qian);
            }
        } else {
            // 后续轮次随机
            for (let i = speakers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [speakers[i], speakers[j]] = [speakers[j], speakers[i]];
            }
        }

        for (const npc of speakers) {
            // 构建其他人的名单（用于负面约束）
            const otherNames = aliveNpcs.filter(n => n.id !== npc.id).map(n => n.name);
            const systemPrompt = `【身份锁定】你就是「${npc.name}」本人。你${npc.age}岁，职务是${npc.role}。

【核心规则 - 必须严格遵守】
1. 你是${npc.name}，用「我」称呼自己。绝对不要用第三人称称呼自己。
2. ${otherNames.join('、')}是你的队友，是「别人」，不是你。你提到他们时用他们的名字或「他/她」。
3. 绝对禁止说出「给${npc.name}」「${npc.name}这种人」「像${npc.name}」这样的话——因为你就是${npc.name}本人！
4. 你要说的是你自己的想法、你自己的判断、你自己要做什么。

【你的人设】
性格: ${npc.personality}
专长: ${npc.specialty}
决策风格: ${npc.decisionStyle}
当前状态: 体力${npc.attrs.stamina} San值${npc.attrs.sanity} 体温${npc.attrs.bodyTemp}°C

【发言规则】
- 直接用口语说话，不要写名字前缀
- 说2-4句话，口语化，有语气词有情绪
- 必须结合你的专长和性格来发言
- 如果San值低于30，你会变得暴躁消极`;

            let userPrompt = `---当前局势---\n${situationPlain}\n---局势结束---\n\n`;

            if (chatHistory.length > 0) {
                userPrompt += `---之前的讨论---\n`;
                userPrompt += chatHistory.slice(-8).join('\n');
                userPrompt += `\n---讨论记录结束---\n\n`;
            }

            if (round === 1 && chatHistory.length === 0) {
                userPrompt += `你是第一个开口的人。先评估当前局势，然后说说你觉得接下来最该做什么。`;
            } else {
                userPrompt += `回应之前别人说的话，可以赞同、反对、补充。重点说说你从自己的专业角度觉得该怎么做。`;
            }
            userPrompt += `\n\n【再次提醒】你是${npc.name}，用「我」来称呼自己。不要用第三人称提到自己。说2-4句口语化的话。`;

            // Token限制
            const tokenLimits = {
                'zhao_chef': 80, 'lu_chen': 120, 'qing_xuan': 120,
                'old_qian': 200, 'li_shen': 200, 'su_doctor': 180,
                'wang_teacher': 180, 'ling_yue': 160,
            };

            process.stdout.write(`  ${npc.color}${BOLD}${npc.emoji} ${npc.name}${RESET}: `);

            try {
                let reply = await callOllama(systemPrompt, userPrompt, tokenLimits[npc.id] || 200);
                if (!reply) reply = '……（沉默思考中）';
                // 清理角色名前缀
                reply = reply.replace(new RegExp(`^[「【]?${npc.name}[」】]?[：:]\\s*`), '').trim();
                // 清理引号包裹
                if ((reply.startsWith('"') && reply.endsWith('"')) || (reply.startsWith('"') && reply.endsWith('"'))) {
                    reply = reply.slice(1, -1);
                }
                reply = reply.substring(0, 500);

                log(reply);
                chatHistory.push(`${npc.name}说：${reply}`);
            } catch (err) {
                log(`${RED}[LLM调用失败: ${err.message}]${RESET}`);
                chatHistory.push(`${npc.name}说：……（沉默）`);
            }

            await sleep(300);
        }
        log('');
    }

    return chatHistory;
}

// ============ 阶段2：提案阶段 ============
async function proposalPhase(aliveNpcs, situationPlain, chatHistory) {
    header('📋 阶段2：提案');
    log(`${DIM}老钱主持，请大家提出具体的行动方案...${RESET}\n`);

    const actionList = ACTION_OPTIONS.map(a => `[${a.id}] ${a.name}: ${a.desc}`).join('\n');

    const systemPrompt = `你是一个游戏AI系统，需要根据角色们的讨论内容，从中提炼出2-3个具体的行动方案。

每个方案必须包含：
1. 方案名称（简短有力）
2. 具体分工（谁做什么）
3. 预期收益

请从以下可选行动中组合方案：
${actionList}

输出格式必须是JSON：
{
  "proposals": [
    {
      "id": "proposal_1",
      "name": "方案名",
      "description": "简要描述",
      "actions": ["action_id1", "action_id2"],
      "assignments": {"角色名": "具体任务"},
      "reasoning": "为什么推荐这个方案"
    }
  ]
}`;

    let userPrompt = `---当前局势---\n${situationPlain}\n---局势结束---\n\n`;
    userPrompt += `---讨论记录---\n${chatHistory.join('\n')}\n---讨论结束---\n\n`;
    userPrompt += `参与者: ${aliveNpcs.map(n => `${n.name}(${n.role}，专长:${n.specialty})`).join('、')}\n\n`;
    userPrompt += `根据以上讨论，提炼出2-3个最可行的行动方案。每个方案要有明确的人员分工。输出JSON格式。`;

    try {
        process.stdout.write(`${DIM}  正在整理方案...${RESET}`);
        const reply = await callOllama(systemPrompt, userPrompt, 1000);
        process.stdout.write('\r' + ' '.repeat(30) + '\r');

        if (!reply) {
            log(`${RED}  方案生成失败，使用默认方案${RESET}`);
            return getDefaultProposals(aliveNpcs);
        }

        // 解析JSON
        const proposals = parseJSON(reply);
        if (proposals && proposals.proposals && proposals.proposals.length > 0) {
            log(`${GREEN}  ✅ 生成了 ${proposals.proposals.length} 个方案${RESET}\n`);
            for (let i = 0; i < proposals.proposals.length; i++) {
                const p = proposals.proposals[i];
                log(`  ${BOLD}${YELLOW}方案${i + 1}: ${p.name}${RESET}`);
                log(`  ${DIM}${p.description}${RESET}`);
                if (p.assignments) {
                    log(`  ${CYAN}分工:${RESET}`);
                    for (const [name, task] of Object.entries(p.assignments)) {
                        log(`    • ${name}: ${task}`);
                    }
                }
                log(`  ${DIM}理由: ${p.reasoning}${RESET}`);
                log('');
            }
            return proposals.proposals;
        } else {
            log(`${RED}  JSON解析失败，使用默认方案${RESET}`);
            return getDefaultProposals(aliveNpcs);
        }
    } catch (err) {
        log(`${RED}  方案生成出错: ${err.message}，使用默认方案${RESET}`);
        return getDefaultProposals(aliveNpcs);
    }
}

// JSON解析（带容错）
function parseJSON(text) {
    if (!text) return null;
    try {
        let s = text.replace(/```json|```/g, '').trim();
        const m = s.match(/\{[\s\S]*\}/);
        if (m) s = m[0];
        return JSON.parse(s);
    } catch (e) {
        // 尝试修复截断JSON
        try {
            let s = text.replace(/```json|```/g, '').trim();
            const idx = s.indexOf('{');
            if (idx >= 0) {
                s = s.substring(idx);
                const lastComma = s.lastIndexOf('",');
                if (lastComma > 0) {
                    // 找到最后一个完整的顶层闭合
                    let depth = 0;
                    for (let i = 0; i < s.length; i++) {
                        if (s[i] === '{') depth++;
                        if (s[i] === '}') depth--;
                    }
                    while (depth > 0) { s += '}'; depth--; }
                    while (depth < 0) { s += '{'; depth++; }
                    // 补全括号
                    const brackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
                    for (let i = 0; i < brackets; i++) s += ']';
                    return JSON.parse(s);
                }
            }
        } catch (e2) { /* ignore */ }
        console.error(`[JSON解析失败] ${e.message}: ${text.substring(0, 200)}`);
        return null;
    }
}

// 默认方案（LLM失败时的兜底）
function getDefaultProposals(aliveNpcs) {
    return [
        {
            id: 'proposal_1',
            name: '资源优先型',
            description: '集中力量补充最紧缺的资源',
            actions: ['chop_wood', 'gather_food'],
            assignments: { '赵铁柱': '砍柴', '陆辰': '砍柴+搬运', '歆玥': '采集食物', '李婶': '管理仓库+做饭' },
            reasoning: '先解决资源燃眉之急',
        },
        {
            id: 'proposal_2',
            name: '均衡发展型',
            description: '各项工作均衡推进，不落下任何一环',
            actions: ['balanced'],
            assignments: { '赵铁柱': '砍柴', '陆辰': '采集食物', '王策': '修发电机', '歆玥': '探索废墟' },
            reasoning: '虽然慢但稳',
        },
        {
            id: 'proposal_3',
            name: '科技冲刺型',
            description: '先建自动化设备，长期解决资源问题',
            actions: ['build_generator', 'build_lumber'],
            assignments: { '王策': '建发电机', '陆辰': '协助建造', '赵铁柱': '先砍柴维持', '歆玥': '探索废墟找零件' },
            reasoning: '牺牲短期换长期收益',
        },
    ];
}

// ============ 阶段3：投票 ============
async function votingPhase(aliveNpcs, proposals, situationPlain, chatHistory) {
    header('🗳️ 阶段3：投票表决');
    log(`${DIM}每位成员根据自己的判断，为心仪的方案投票...${RESET}\n`);

    const voteResults = {}; // { proposalIndex: { votes: count, voters: [names] } }
    for (let i = 0; i < proposals.length; i++) {
        voteResults[i] = { votes: 0, voters: [], reasons: [] };
    }

    const proposalSummary = proposals.map((p, i) => 
        `方案${i + 1}「${p.name}」: ${p.description}${p.assignments ? '\n  分工: ' + Object.entries(p.assignments).map(([n, t]) => `${n}→${t}`).join('、') : ''}`
    ).join('\n');

    for (const npc of aliveNpcs) {
        const otherNamesVote = aliveNpcs.filter(n => n.id !== npc.id).map(n => n.name);
        const systemPrompt = `【身份锁定】你就是「${npc.name}」本人，${npc.age}岁，${npc.role}。
用「我」称呼自己，绝不用第三人称说自己。${otherNamesVote.join('、')}是别人不是你。
性格: ${npc.personality}
决策风格: ${npc.decisionStyle}

你正在投票选择行动方案。你需要：
1. 从你的角色和专长角度，选择你最支持的方案
2. 用一句话说明理由（用「我」称呼自己）
3. 你的投票不一定要跟别人一样——根据你的性格和判断独立决定

输出格式必须是JSON：
{
  "vote": 1,
  "reason": "一句话理由，用我称呼自己"
}

vote字段填方案编号（1、2或3），reason字段填你投这票的理由。`;

        let userPrompt = `---局势摘要---\n${situationPlain}\n---局势结束---\n\n`;
        userPrompt += `---待投票方案---\n${proposalSummary}\n---方案结束---\n\n`;
        userPrompt += `【你是${npc.name}，用「我」称呼自己。请选择你支持的方案（输出JSON格式，vote=方案编号1-${proposals.length}）。】`;

        process.stdout.write(`  ${npc.color}${npc.emoji} ${npc.name}${RESET} 正在思考...`);

        try {
            const reply = await callOllama(systemPrompt, userPrompt, 150);
            const result = parseJSON(reply);

            if (result && result.vote) {
                const voteIdx = parseInt(result.vote) - 1;
                if (voteIdx >= 0 && voteIdx < proposals.length) {
                    voteResults[voteIdx].votes++;
                    voteResults[voteIdx].voters.push(npc.name);
                    voteResults[voteIdx].reasons.push({ name: npc.name, reason: result.reason || '无理由' });

                    process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → 投票 ${BOLD}方案${voteIdx + 1}「${proposals[voteIdx].name}」${RESET}`);
                    log(`  ${DIM}(${result.reason || ''})${RESET}`);
                } else {
                    process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → ${RED}弃权（无效投票）${RESET}\n`);
                }
            } else {
                // 尝试从纯文本中提取数字
                const numMatch = (reply || '').match(/[方案]?\s*(\d)/);
                if (numMatch) {
                    const voteIdx = parseInt(numMatch[1]) - 1;
                    if (voteIdx >= 0 && voteIdx < proposals.length) {
                        voteResults[voteIdx].votes++;
                        voteResults[voteIdx].voters.push(npc.name);
                        process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → 投票 ${BOLD}方案${voteIdx + 1}「${proposals[voteIdx].name}」${RESET}\n`);
                    } else {
                        process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → ${RED}弃权${RESET}\n`);
                    }
                } else {
                    process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → ${RED}弃权（解析失败）${RESET}\n`);
                }
            }
        } catch (err) {
            process.stdout.write(`\r  ${npc.color}${npc.emoji} ${npc.name}${RESET} → ${RED}弃权（LLM出错: ${err.message}）${RESET}\n`);
        }

        await sleep(200);
    }

    return voteResults;
}

// ============ 阶段4：结果公布 ============
function announceResults(proposals, voteResults, aliveNpcs) {
    header('📊 投票结果');

    // 排序
    const sorted = Object.entries(voteResults)
        .map(([idx, data]) => ({ idx: parseInt(idx), ...data, proposal: proposals[parseInt(idx)] }))
        .sort((a, b) => b.votes - a.votes);

    const maxVotes = sorted[0].votes;
    const totalVoters = aliveNpcs.length;

    for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        const isWinner = i === 0 && r.votes > 0;
        const bar = '█'.repeat(r.votes) + '░'.repeat(totalVoters - r.votes);
        const pct = totalVoters > 0 ? Math.round(r.votes / totalVoters * 100) : 0;

        if (isWinner) {
            log(`  ${GREEN}${BOLD}🏆 方案${r.idx + 1}「${r.proposal.name}」${RESET}`);
        } else {
            log(`  ${DIM}   方案${r.idx + 1}「${r.proposal.name}」${RESET}`);
        }
        log(`     ${isWinner ? GREEN : DIM}${bar} ${r.votes}票 (${pct}%)${RESET}`);
        if (r.voters.length > 0) {
            log(`     ${DIM}投票者: ${r.voters.join('、')}${RESET}`);
        }
        // 显示投票理由
        for (const vr of r.reasons) {
            log(`       ${DIM}└ ${vr.name}: ${vr.reason}${RESET}`);
        }
        log('');
    }

    // 判断是否有平票
    const winners = sorted.filter(r => r.votes === maxVotes);
    if (winners.length > 1 && maxVotes > 0) {
        log(`  ${YELLOW}⚠️ 出现平票！方案${winners.map(w => `「${w.proposal.name}」`).join(' 与 ')} 票数相同！${RESET}`);
        log(`  ${YELLOW}   → 由镇长老钱决定最终方案（取第一个）${RESET}`);
    }

    return sorted[0];
}

// ============ 阶段5：最终行动方针 ============
async function finalPlanPhase(winner, aliveNpcs, situationPlain) {
    header('📜 最终行动方针');

    const proposal = winner.proposal;
    log(`  ${GREEN}${BOLD}✅ 通过方案: 「${proposal.name}」${RESET}`);
    log(`  ${DIM}${proposal.description}${RESET}\n`);

    if (proposal.assignments) {
        log(`  ${BOLD}${CYAN}📋 具体分工:${RESET}`);
        for (const [name, task] of Object.entries(proposal.assignments)) {
            const npc = aliveNpcs.find(n => n.name === name);
            if (npc) {
                log(`    ${npc.color}${npc.emoji} ${name}${RESET}: ${task}`);
            } else {
                log(`    • ${name}: ${task}`);
            }
        }
    }

    log('');

    // 让老钱做总结发言
    log(`  ${DIM}老钱站起来拍了拍桌子...${RESET}\n`);

    const systemPrompt = `你是「老钱」，60岁退休镇长，全镇精神领袖。
说话慢条斯理但字字有分量，爱用"咱们""大伙儿""孩子们"。
你刚主持完一场投票会议，现在要做总结发言，鼓舞士气，宣布最终决定。`;

    const userPrompt = `投票结果出来了，大家选择了「${proposal.name}」方案: ${proposal.description}
${proposal.assignments ? '分工: ' + Object.entries(proposal.assignments).map(([n, t]) => `${n}做${t}`).join('、') : ''}

请做一个简短有力的总结发言（3-5句话），宣布决定、鼓舞士气、强调大家齐心协力。口语化，有感染力。`;

    try {
        let reply = await callOllama(systemPrompt, userPrompt, 250);
        if (reply) {
            reply = reply.replace(/^[「【]?老钱[」】]?[：:]\s*/, '').trim();
            log(`  ${NPC_DATA[0].color}${BOLD}👴 老钱${RESET}: ${reply}`);
        }
    } catch (err) {
        log(`  ${NPC_DATA[0].color}${BOLD}👴 老钱${RESET}: 好！就这么定了！大伙儿打起精神来，咱们一起扛过去！`);
    }

    log('');
    divider('═');
    log(`${BOLD}  🗳️ 行动决策会议结束 — 执行方案「${proposal.name}」${RESET}`);
    divider('═');
    log('');
}

// ============ 主流程 ============
async function main() {
    console.clear();
    header('🗳️ 福音雪镇 — 行动决策投票系统');

    // 显示参数
    log(`\n${DIM}  模型: ${CONFIG.model} | 讨论轮数: ${CONFIG.rounds} | 快速模式: ${CONFIG.fast ? '是' : '否'}${RESET}`);
    log(`${DIM}  第${CONFIG.day}天 | ${CONFIG.temp}°C ${CONFIG.weather} | 存活${CONFIG.alive}/8${RESET}`);
    log(`${DIM}  木柴${CONFIG.wood} 食物${CONFIG.food} 电力${CONFIG.power}${RESET}\n`);

    // 显示环境状况
    log(buildSituationContext());

    // 获取存活NPC列表
    const aliveNpcs = NPC_DATA.slice(0, CONFIG.alive);
    const situationPlain = buildSituationContextPlain();

    // 检查Ollama连通性
    log(`\n${DIM}  正在连接 Ollama (${CONFIG.model})...${RESET}`);
    try {
        const test = await callOllama('你好', '回复"OK"', 10);
        if (test) {
            log(`${GREEN}  ✅ Ollama 连接成功${RESET}\n`);
        } else {
            log(`${YELLOW}  ⚠️ Ollama 返回空值，但连接成功，继续执行${RESET}\n`);
        }
    } catch (err) {
        log(`${RED}  ❌ Ollama 连接失败: ${err.message}${RESET}`);
        log(`${RED}  请确保 ollama serve 正在运行，且模型 ${CONFIG.model} 已下载${RESET}`);
        process.exit(1);
    }

    const startTime = Date.now();

    // 阶段1：自由讨论
    const chatHistory = await discussionPhase(aliveNpcs, situationPlain);

    // 阶段2：AI整理提案
    const proposals = await proposalPhase(aliveNpcs, situationPlain, chatHistory);

    // 阶段3：角色投票
    const voteResults = await votingPhase(aliveNpcs, proposals, situationPlain, chatHistory);

    // 阶段4：公布结果
    const winner = announceResults(proposals, voteResults, aliveNpcs);

    // 阶段5：最终方针
    await finalPlanPhase(winner, aliveNpcs, situationPlain);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`${DIM}  总耗时: ${elapsed}秒${RESET}\n`);
}

// 运行
main().catch(err => {
    console.error(`\n${RED}❌ 运行出错: ${err.message}${RESET}`);
    console.error(err.stack);
    process.exit(1);
});
