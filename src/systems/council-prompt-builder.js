/**
 * 福音镇 - CouncilPromptBuilder
 * 单一世界状态快照 + 统一 prompt 构建器
 * isDead 过滤只在 createSnapshot() 中出现 1 次
 * 挂载到 GST.CouncilPromptBuilder
 */
(function() {
    'use strict';
    const GST = window.GST;

    // ============ 角色卡 ============
    const ROLE_CARDS = {
        'old_qian': {
            bio: '退休镇长，60岁，清璇的爷爷。全镇精神领袖。',
            style: '慢条斯理，字字有分量。爱用"咱们""大伙儿""孩子们"。常引用过去经历做判断。关键时刻一拍桌子全场肃静。',
            maxWords: '2-4句话',
            examples: [
                '大伙儿别慌……当年矿难那会儿，比这还险，咱们不也熬过来了？听我说，先把眼前的事儿一件件理清楚。',
                '我看这样办——铁柱你带小陆去砍柴，李婶你盯着粮食，苏医生看看谁还冻着没缓过来。咱们分头干，天黑前必须弄完。',
                '璇儿……你别怕，爷爷在呢。（叹气）……行了，大伙儿打起精神来。'
            ]
        },
        'li_shen': {
            bio: '42岁物资总管，陆辰的妈。嗓门大心肠软。',
            style: '直来直去，数落人不过脑。对物资数字张口就来。急了连珠炮训人，但转头最操心你。心软嘴硬。',
            maxWords: '2-4句话',
            examples: [
                '我跟你们说啊，仓库就剩那点粮食，撑死够吃三天的，你们还搁这磨叽呢！',
                '铁柱，帮我把那袋米搬过来——辰儿你别往外跑了！冻成这样你不要命了？',
                '行了行了，别吵了！先吃饱再说别的，饿着肚子能干啥？'
            ]
        },
        'zhao_chef': {
            bio: '38岁伐木工/锅炉工。全镇最壮。沉默寡言。',
            style: '话极少。别人说十句他"嗯"一声。开口必是干货。一句话结束。偶尔冒一句大实话全场安静。',
            maxWords: '只说1句话，最多2句。绝不超过20个字。',
            examples: [
                '柴不够了。',
                '我去砍。',
                '……暖炉撑不到明天。',
                '少废话，干活。',
                '嗯。（站起身往外走）'
            ]
        },
        'su_doctor': {
            bio: '35岁医官。全镇唯一医疗力量。冷静专业。',
            style: '条理分明，语气平稳。习惯用数据和医学角度分析。偶尔推眼镜叹气。对药品存量焦虑。',
            maxWords: '2-3句话',
            examples: [
                '老钱体温35.2度，再降下去会有失温风险。我建议他今晚别离暖炉。',
                '从目前消耗速度看，退烧针只剩两支了……用完就真没了。',
                '听着，冻伤不是小事——歆玥你手指发白了，来我看看。'
            ]
        },
        'wang_teacher': {
            bio: '32岁技师/规划师，前哲学教师。理性到近乎冷酷。',
            style: '说话必有论据和结论。偶尔引用哲学但马上翻译。能面不改色提出残酷方案。推眼镜是标志动作。',
            maxWords: '2-3句话',
            examples: [
                '逻辑上讲，按目前木柴消耗速度，暖炉最多撑18小时。我建议砍半物资去加固第二座。',
                '（推眼镜）用康德的话说……算了，意思就是我们没得选——要么今晚拼，要么明天全冻死。',
                '最优方案是让体力最好的人去，也就是铁柱和小陆。这不是谁的选择，是概率问题。'
            ]
        },
        'lu_chen': {
            bio: '18岁采集工，李婶的儿子。全镇最年轻最能扛冻。莽。',
            style: '嘴比脑快，身体比嘴更快。"别废话了直接干！"情商低但没坏心。被妈唠叨就嘟囔"知道了"。',
            maxWords: '1-2句话，语速快，短句多',
            examples: [
                '我去！等啥呢！柴不够我现在就出去砍！',
                '妈你别操心了，有我呢！——知道了知道了，我穿厚点行了吧。',
                '别磨叽了，我扛得住冷，让我去！'
            ]
        },
        'ling_yue': {
            bio: '22岁侦察员。全队情绪稳定器。外柔内刚。',
            style: '看似大大咧咧，实则最通透。绝望中也能找亮点。敏锐察觉别人情绪低落并主动鼓励。紧张搓手指。',
            maxWords: '2-3句话',
            examples: [
                '嘿，别丧着脸——至少暖炉还在烧不是吗？咱们能扛过去的。',
                '大家听我说个好消息，今天在废墟找到一箱罐头！虽然不多，但够撑两顿的。',
                '（搓手指）……苏医生，老钱叔脸色不太对，你去看看？'
            ]
        },
        'qing_xuan': {
            bio: '16岁药剂师学徒，老钱的孙女。声音小但脑子最好使。',
            style: '细声细气但条理分明。能从化学角度提方案。胆小时往爷爷身边靠。常最后发言但一针见血。咬嘴唇。',
            maxWords: '1-2句话，声音小',
            examples: [
                '爷爷……你手好凉，往火边靠靠。',
                '那个……我查过资料，如果把柳树皮煮了，可以做止痛药。',
                '（咬嘴唇）……大家别慌，让我来想想办法。'
            ]
        },
    };

    // ============ 称呼映射 ============
    const ADDRESS_MAP = {
        'lu_chen': {
            'li_shen': '妈', 'old_qian': '钱叔', 'zhao_chef': '赵哥',
            'su_doctor': '苏医生', 'wang_teacher': '王老师', 'ling_yue': '歆玥', 'qing_xuan': '清璇',
        },
        'li_shen': {
            'lu_chen': '辰儿/儿子', 'old_qian': '老钱', 'zhao_chef': '铁柱',
            'su_doctor': '苏医生', 'wang_teacher': '王老师', 'ling_yue': '歆玥', 'qing_xuan': '清璇',
        },
        'zhao_chef': {
            'li_shen': '李婶/婶子', 'lu_chen': '小陆', 'old_qian': '钱镇长',
            'su_doctor': '苏医生', 'wang_teacher': '王老师', 'ling_yue': '歆玥', 'qing_xuan': '清璇',
        },
        'old_qian': {
            'qing_xuan': '璇儿/孙女', 'li_shen': '李婶', 'zhao_chef': '铁柱',
            'su_doctor': '苏医生', 'wang_teacher': '小王', 'lu_chen': '小陆', 'ling_yue': '歆玥',
        },
        'qing_xuan': {
            'old_qian': '爷爷', 'li_shen': '李婶', 'zhao_chef': '赵叔',
            'su_doctor': '苏医生', 'wang_teacher': '王老师', 'lu_chen': '陆辰', 'ling_yue': '歆玥姐',
        },
        'su_doctor': {
            'li_shen': '李婶', 'zhao_chef': '铁柱', 'old_qian': '钱镇长',
            'lu_chen': '小陆', 'wang_teacher': '王策', 'ling_yue': '歆玥', 'qing_xuan': '清璇',
        },
        'wang_teacher': {
            'li_shen': '李婶', 'zhao_chef': '铁柱', 'old_qian': '老钱',
            'lu_chen': '小陆', 'su_doctor': '苏医生', 'ling_yue': '歆玥', 'qing_xuan': '清璇',
        },
        'ling_yue': {
            'li_shen': '李婶', 'zhao_chef': '赵哥', 'old_qian': '钱叔',
            'lu_chen': '陆辰', 'su_doctor': '苏医生', 'wang_teacher': '王老师', 'qing_xuan': '清璇',
        },
    };

    // ============ 每角色 Token 上限 ============
    const TOKEN_LIMITS = {
        'zhao_chef': 80,
        'lu_chen': 120,
        'qing_xuan': 120,
        'old_qian': 200,
        'li_shen': 200,
        'su_doctor': 180,
        'wang_teacher': 180,
        'ling_yue': 160,
    };

    // ============ 离线默认台词 ============
    const FALLBACKS = {
        'old_qian':     ['大伙儿别慌，咱们再合计合计。', '我看这样……大家先说说各自的情况。', '沉住气，办法总比困难多。'],
        'li_shen':      ['粮食的事儿我心里有数，大伙放心。', '行了行了，别吵了，先把正事儿说了。', '我跟你们说，仓库那点存货可不够折腾的。'],
        'zhao_chef':    ['柴还够烧。', '……我去看看暖炉。', '少说两句，干活。'],
        'su_doctor':    ['从目前情况看……大家要注意保暖。', '老钱的体温我一直在盯着。', '药品不多了，希望别再有人冻伤。'],
        'wang_teacher': ['逻辑上讲，我们现在最该解决的是……', '我做了个估算，按目前消耗速度……', '我建议先列个优先级。'],
        'lu_chen':      ['我去砍柴！等啥呢！', '别磨叽了直接干不就完了。', '妈你别担心了，有我呢。'],
        'ling_yue':     ['嘿，别丧着脸了，今天在废墟还有收获呢。', '大家打起精神来，咱们能扛过去的！', '我觉得我们应该……'],
        'qing_xuan':    ['爷爷……你手好凉，来暖炉这边坐。', '我、我查过资料，这种情况应该……', '让我试试看，也许能帮上忙。'],
    };

    // ============ 静态类 ============
    class CouncilPromptBuilder {

        /**
         * 创建冻结的世界状态快照
         * ★ 唯一的 isDead 过滤点 ★
         */
        static createSnapshot(game) {
            const allNpcs = game.npcs || [];
            // ===== isDead 只在这里出现 1 次 =====
            const aliveNpcs = allNpcs.filter(n => !n.isDead);
            const deadNpcs  = allNpcs.filter(n => n.isDead);
            const deadNames = deadNpcs.map(n => n.name);
            const deadIds   = new Set(deadNpcs.map(n => n.id));

            const situation = CouncilPromptBuilder._buildSituation(game, aliveNpcs, deadNpcs);

            const characterCards = {};
            const addressRules   = {};
            const npcStates      = {};
            for (const npc of aliveNpcs) {
                characterCards[npc.id] = CouncilPromptBuilder._buildCharacterCard(npc, deadNames);
                addressRules[npc.id]   = CouncilPromptBuilder._buildAddressRules(npc, deadIds);
                npcStates[npc.id]      = CouncilPromptBuilder._captureNpcState(npc, game, aliveNpcs, deadNames);
            }

            return Object.freeze({
                aliveNpcs,
                deadNames,
                deadIds,
                situation,
                characterCards,
                addressRules,
                npcStates,
            });
        }

        // ---------- 内部：局势上下文 ----------

        static _buildSituation(game, alive, dead) {
            const rs = game.resourceSystem;
            const ws = game.weatherSystem;

            let ctx = `当前是第${game.dayCount}天 ${game.getTimeStr()}。`;

            if (ws) {
                ctx += `\n天气：${game.weather}，气温${ws.getEffectiveTemp ? ws.getEffectiveTemp().toFixed(0) : '?'}°C。`;
                const blizzard = ws.getBlizzardUrgencyForPrompt ? ws.getBlizzardUrgencyForPrompt() : '';
                if (blizzard) ctx += '\n' + blizzard;
            }

            if (rs) {
                ctx += '\n' + rs.getResourceStatusForPrompt();
                const forecast = rs.getResourceForecastForPrompt ? rs.getResourceForecastForPrompt() : '';
                if (forecast) ctx += forecast;
            }

            if (dead.length > 0) {
                ctx += `\n已死亡：${dead.map(n => `${n.name}(${n._deathCause || '未知原因'})`).join('、')}`;
                ctx += `\n⚠️ 以上角色已经死了，不在现场。不要对死人说话，不要让死人做任务。只对存活角色分配工作。`;
            }
            ctx += `\n存活${alive.length}人：${alive.map(n => `${n.name}(体力${Math.round(n.stamina)} San${Math.round(n.sanity)} 体温${n.bodyTemp.toFixed(1)}°C)`).join('、')}`;

            if (game.taskSystem) {
                const taskSummary = alive.map(n => {
                    const desc = game.taskSystem.getNpcTaskDescForPrompt(n.id);
                    return `${n.name}→${desc}`;
                }).join('、');
                ctx += `\n当前分工：${taskSummary}`;
            }

            if (game.deathSystem) {
                const deathSummary = game.deathSystem.getDeathSummaryForPrompt();
                if (deathSummary) ctx += '\n' + deathSummary;
            }

            if (game.machineSystem) {
                const ms = game.machineSystem;
                const _bkPct = Math.round((game.getDifficultyMult ? game.getDifficultyMult('machineBreakdownChance') : 0.10) * 100);
                let machineCtx = '';
                if (ms.generator.built) {
                    machineCtx += `\n自动发电机：${ms.generator.running ? '运行中' : ms.generator.broken ? '⚠️故障中' : '停机'}（产电24/h，耗柴2/h，${_bkPct}%/h概率故障）`;
                } else if (ms.generator.building) {
                    machineCtx += `\n自动发电机：建造中${Math.round(ms.generator.buildProgress * 100)}%`;
                } else if (ms.canUnlockGenerator()) {
                    machineCtx += `\n⚡ 可以建造自动发电机！（消耗电力8+木柴8，建造3小时，建成后自动产电24/h耗柴2/h，${_bkPct}%/h概率故障需维修）`;
                }
                if (ms.lumberMill.built) {
                    machineCtx += `\n自动伐木机：${ms.lumberMill.running ? '运行中' : ms.lumberMill.broken ? '⚠️故障中' : '停机'}（产柴30/h，耗电3/h，${_bkPct}%/h概率故障）`;
                } else if (ms.lumberMill.building) {
                    machineCtx += `\n自动伐木机：建造中${Math.round(ms.lumberMill.buildProgress * 100)}%`;
                } else if (ms.canUnlockLumberMill()) {
                    machineCtx += `\n🪵 可以建造自动伐木机！（消耗电力10+木柴12，建造4小时，建成后自动产柴30/h耗电3/h，${_bkPct}%/h概率故障需维修）`;
                }
                if (ms.generator.built || ms.lumberMill.built) {
                    const net = ms.getNetOutputPerHour();
                    machineCtx += `\n自动化净产出：木柴${net.wood >= 0 ? '+' : ''}${net.wood.toFixed(1)}/h，电力${net.power >= 0 ? '+' : ''}${net.power.toFixed(1)}/h`;
                }
                if (machineCtx) ctx += '\n【自动化设施】' + machineCtx;
            }

            if (game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() > 1) {
                const hint = game.reincarnationSystem.getPastLifeHintForDialogue(game.mode === 'reincarnation');
                if (hint) ctx += '\n' + hint;
            }

            ctx += '\n【常识】砍柴→产木柴🪵；人工发电→产电⚡；发电机(自动)：耗柴→产电；伐木机(自动)：耗电→产柴。';

            return ctx;
        }

        // ---------- 内部：角色卡（过滤死人示例/bio） ----------

        static _buildCharacterCard(npc, deadNames) {
            const role = ROLE_CARDS[npc.id];
            if (!role) {
                const cfg = (GST.NPC_CONFIGS || []).find(c => c.id === npc.id) || {};
                return `你是${npc.name}，${npc.age}岁，${cfg.occupation || npc.occupation}。`;
            }

            let bio = role.bio;
            let validExamples = role.examples;
            if (deadNames.length > 0) {
                validExamples = role.examples.filter(ex =>
                    !deadNames.some(dn => ex.includes(dn))
                );
                if (validExamples.length === 0) validExamples = role.examples.slice(0, 1);
                for (const dn of deadNames) {
                    if (bio.includes(dn)) {
                        bio = bio.replace(new RegExp(`${dn}的`, 'g'), `已故的${dn}的`);
                    }
                }
            }

            const shuffled = [...validExamples].sort(() => Math.random() - 0.5);
            const examplesText = shuffled.slice(0, 2).map((e, i) => `  示例${i+1}: ${e}`).join('\n');

            return `你是${bio}
说话风格: ${role.style}
字数要求: ${role.maxWords}

你说话的示例（模仿这个语气和长度）:
${examplesText}`;
        }

        // ---------- 内部：称呼规则（过滤死人） ----------

        static _buildAddressRules(npc, deadIds) {
            const myMap = ADDRESS_MAP[npc.id] || {};
            const entries = Object.entries(myMap).filter(([id]) => !deadIds.has(id));
            if (entries.length === 0) {
                return '【称呼规则】互相叫名字或尊称，不准叫任何人"妈""爸"。';
            }

            const addrList = entries.map(([id, addr]) => {
                const cfg = (GST.NPC_CONFIGS || []).find(c => c.id === id);
                return cfg ? `${cfg.name}→叫"${addr}"` : '';
            }).filter(Boolean).join('，');

            let rule = `【称呼规则】${addrList}。`;
            if (npc.id !== 'lu_chen') {
                rule += '禁止叫任何人"妈""爸"！';
            }
            return rule;
        }

        // ---------- 内部：捕获NPC状态 ----------

        static _captureNpcState(npc, game, aliveNpcs, deadNames) {
            let stateHints = '';

            // San值
            if (npc.sanity < 15) {
                stateHints += `\n【精神状态】你快崩溃了(San:${Math.round(npc.sanity)})——说话暴躁阴沉，可能无端指责别人、冷嘲热讽、说丧气话。你觉得大家都活不过明天。`;
            } else if (npc.sanity < 30) {
                stateHints += `\n【精神状态】很差(San:${Math.round(npc.sanity)})——焦虑不耐烦，说话带刺，容易被小事激怒。`;
            } else if (npc.sanity < 50) {
                stateHints += `\n【精神状态】疲惫焦虑(San:${Math.round(npc.sanity)})——有些烦躁，但还能理性讨论。`;
            } else if (npc.sanity < 70) {
                stateHints += `\n【精神状态】尚可(San:${Math.round(npc.sanity)})——能保持冷静分析。`;
            } else {
                stateHints += `\n【精神状态】稳定(San:${Math.round(npc.sanity)})——心态算积极的，可以鼓励别人。`;
            }

            if (npc.stamina < 20) {
                stateHints += `\n【体力】极度疲劳(${Math.round(npc.stamina)})——你累得声音都小了，讲话有气无力。`;
            } else if (npc.stamina < 40) {
                stateHints += `\n【体力】很累(${Math.round(npc.stamina)})。`;
            }
            if (npc.bodyTemp < 35) {
                stateHints += `\n【体温】${npc.bodyTemp.toFixed(1)}°C——你冷得发抖，缩着肩膀，声音打颤。`;
            }
            if (npc.mood) {
                stateHints += `\n【心情】${npc.mood}`;
            }

            // 悲痛——引用 deadNames 而非重新查 isDead
            if (game.deathSystem && game.deathSystem.isNpcGrieving(npc.id)) {
                const griefEffects = game.deathSystem._griefEffects.filter(g => g.npcId === npc.id);
                const griefNames = griefEffects.map(g => g.deadNpcName).join('、');
                stateHints += `\n【悲痛】${griefNames}已经死了，不在现场。你很难过，可以感叹缅怀，但绝对不要对死人说话、不要叫死人的名字让他们做事。`;
            }

            // 好感度关系网
            let relationContext = '';
            const others = aliveNpcs.filter(n => n.id !== npc.id);
            const notableRelations = [];
            for (const other of others) {
                const aff = npc.getAffinity ? npc.getAffinity(other.id) : 50;
                if (aff >= 80) notableRelations.push(`和${other.name}关系很好(${aff})，聊天时语气亲切`);
                else if (aff <= 25) notableRelations.push(`和${other.name}关系很差(${aff})，对ta态度冷淡甚至带刺`);
                if (npc._affinityCooldown && npc._affinityCooldown[other.id] > 0) {
                    notableRelations.push(`刚和${other.name}吵过架，现在还有气，不想搭理ta`);
                }
            }
            if (notableRelations.length > 0) {
                relationContext = `\n【人际关系】${notableRelations.join('；')}`;
            }

            // 近期记忆
            let memoryHint = '';
            if (npc.memories && npc.memories.length > 0) {
                const recentMems = npc.memories.slice(-3);
                const memTexts = recentMems.map(m => {
                    let desc = m.text || m.type;
                    if (m.lines && m.lines.length > 0) {
                        const lastLine = m.lines[m.lines.length - 1];
                        desc += `（${lastLine.speaker}说:${lastLine.text.substring(0, 30)}）`;
                    }
                    return desc;
                }).join('；');
                memoryHint = `\n【近期经历】${memTexts}`;
            }

            // 暴风雪紧迫
            let blizzardHint = '';
            if (game.weatherSystem && game.weatherSystem.getBlizzardUrgencyForPrompt) {
                const urgency = game.weatherSystem.getBlizzardUrgencyForPrompt();
                if (urgency) blizzardHint = `\n【紧迫警告】${urgency}`;
            }

            // 轮回前世
            let pastLifeHint = '';
            if (game.reincarnationSystem && game.reincarnationSystem.getLifeNumber() > 1) {
                const hint = game.reincarnationSystem.getPastLifeHintForDialogue(game.mode === 'reincarnation');
                if (hint) pastLifeHint = `\n【前世记忆】${hint}——以上前世信息作为背景参考。你可以根据讨论情境自然引用前世教训，也可以不提——以当前实际局势为准做决策。绝不能把前世问题说成眼下正在发生的事实。`;
            }

            return {
                stateHints,
                relationContext,
                memoryHint,
                blizzardHint,
                pastLifeHint,
            };
        }

        static _buildDiscussionRealityGuard(snapshot, npc) {
            const sit = snapshot.situation || '';

            // 【v4.15修复】判断是否为第一世——第一世完全不提任何轮回相关词汇，避免反面暗示
            const isFirstLife = !sit.includes('前世记忆') && !sit.includes('已轮回');

            const rules = isFirstLife ? [
                '【事实优先】当前情境里的现状永远优先于猜测和情绪。只讨论眼下正在发生的事实。',
                '【禁止编造历史】你们是第一次经历这场灾难，之前从未遇到过类似的事。不要编造任何"以前我们就……""上次就是……"之类的经历，因为根本没有"以前"和"上次"。',
            ] : [
                '【事实优先】当前情境里的现状永远优先于前世记忆、猜测和情绪。前世只能当经验，不能被说成现在已经发生的事实。',
                '【禁止串台】不要把"上一世/前世的问题"直接当成"现在的现状"复述。只有在明确说出"上一世/前世"的前提下，才能引用过去教训。',
            ];

            if (sit.includes('自动发电机：运行中')) {
                rules.push('【当前机器事实】自动发电机已经建成并在运行。不要再说"还没造好发电机""赶紧修发电机""现在完全没电了"这类与现状冲突的话。可以讨论它的耗柴、故障风险，或接下来该补什么资源。');
            } else if (sit.includes('自动发电机：⚠️故障中') || sit.includes('自动发电机：故障中')) {
                rules.push('【当前机器事实】自动发电机已经建成，但现在故障了。可以讨论维修和应急补电，但不要说成"还没造发电机"。');
            } else if (sit.includes('自动发电机：停机')) {
                rules.push('【当前机器事实】自动发电机已经建成但停机。可以讨论为什么停机、该补木柴还是人手，但不要说成"还没造发电机"。');
            } else if (sit.includes('自动发电机：建造中')) {
                rules.push('【当前机器事实】自动发电机正在建造中。可以催施工、补建造资源，但不要说它已经运行，也不要说它还完全没开建。');
            } else if (sit.includes('可以建造自动发电机')) {
                rules.push('【当前机器事实】自动发电机现在只是"可以建造"，还没有建好。');
            }

            if (sit.includes('自动伐木机：运行中')) {
                rules.push('【当前机器事实】自动伐木机已经建成并在运行。不要再把它说成还没造。');
            } else if (sit.includes('自动伐木机：建造中')) {
                rules.push('【当前机器事实】自动伐木机正在建造中。不要把它说成已经运行。');
            }

            if (npc.id === 'li_shen' && snapshot.aliveNpcs.some(n => n.id === 'lu_chen')) {
                rules.push('【角色关系】陆辰在场时，你可以直接叫他"辰儿/儿子"，语气要像操心孩子的妈。');
            }
            if (npc.id === 'lu_chen' && snapshot.aliveNpcs.some(n => n.id === 'li_shen')) {
                rules.push('【角色关系】李婶在场时，你可以直接叫她"妈"，嘴上嫌唠叨也得透出在意。');
            }

            return rules.join('\n');
        }

        static isReplyContradictingSnapshot(snapshot, reply) {
            if (!reply) return false;
            const sit = snapshot.situation || '';
            const text = String(reply);

            if (sit.includes('自动发电机：运行中')) {
                if (/修发电机|修电机|还没造好发电机|赶紧造发电机|全得黑屏冻死|电不够全得/.test(text)) {
                    return true;
                }
            }

            if ((sit.includes('自动发电机：停机') || sit.includes('自动发电机：⚠️故障中') || sit.includes('自动发电机：故障中'))
                && /还没造好发电机|赶紧造发电机/.test(text)) {
                return true;
            }

            if (sit.includes('自动发电机：建造中') && /已经转起来|已经开始供电/.test(text)) {
                return true;
            }

            return false;
        }

        static getGroundedFallback(npcId, snapshot) {
            const sit = snapshot.situation || '';
            if (sit.includes('自动发电机：运行中')) {
                const grounded = {
                    old_qian: ['发电机既然已经转起来了，咱们就别再乱了阵脚，接下来得盯住木柴和粮食。'],
                    li_shen: ['行了，电这边既然稳住了，就先把木柴和吃的盯紧。辰儿你少逞强，别一股脑往外冲。'],
                    zhao_chef: ['电稳了，先补柴。'],
                    su_doctor: ['电力暂时稳住是好事，但大家别因此松劲，保暖和体力恢复还得继续盯。'],
                    wang_teacher: ['既然自动发电机已经运行，眼下最优先的就不是重复修电，而是补足它后续要消耗的木柴。'],
                    lu_chen: ['妈你别操心，电这边先稳住了，我去把后面的活接上。'],
                    ling_yue: ['至少发电机已经转起来啦，咱们不是在原地打转，接下来把柴和食物补上就更稳了。'],
                    qing_xuan: ['既然发电机已经好了，接下来该算木柴还能撑多久。'],
                };
                const pool = grounded[npcId];
                if (pool && pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
            }
            return CouncilPromptBuilder.getFallback(npcId);
        }

        // ============ 公开方法：构建 4 阶段 prompt ============

        /**
         * Phase 1 讨论
         * @returns {{ systemPrompt, userPrompt, maxTokens }}
         */
        static buildDiscussionPrompt(snapshot, npc, chatHistory) {
            const card    = snapshot.characterCards[npc.id];
            const addr    = snapshot.addressRules[npc.id];
            const state   = snapshot.npcStates[npc.id];
            const realityGuard = CouncilPromptBuilder._buildDiscussionRealityGuard(snapshot, npc);

            // 【v4.15】第一世时在system prompt中加入世界观锁定，完全避免轮回暗示
            const isFirstLifeForPrompt = !snapshot.situation.includes('前世记忆') && !snapshot.situation.includes('已轮回');
            const worldLock = isFirstLifeForPrompt
                ? '\n【世界观】你们是突遭暴风雪灾害被困在雪镇的幸存者，这是你们第一次面对这种绝境，之前从未经历过类似的事。'
                : '';

            const systemPrompt = `【身份锁定】你就是「${npc.name}」本人，不是其他任何人。你只能以${npc.name}的口吻说话。
绝不能模仿其他角色的语气或说出不属于你性格的话。你不会用第三人称称呼自己。${worldLock}

${card}
${addr}`;

            // 反重复检测
            let antiRepeatHint = '';
            if (chatHistory.length >= 4) {
                const recentTexts = chatHistory.slice(-4).join('');
                const allWords = recentTexts.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
                const freq = {};
                for (const w of allWords) { freq[w] = (freq[w] || 0) + 1; }
                const repeatedWords = Object.keys(freq).filter(w => freq[w] >= 3);
                if (repeatedWords.length > 0) {
                    antiRepeatHint = `\n⚠️ 注意："${repeatedWords.slice(0, 3).join('""')}"等词前面已经说过很多次了。请换个角度或话题回应，不要重复。`;
                }
            }

            let userPrompt = `---当前情境---
${snapshot.situation}
${state.stateHints}${state.relationContext}${state.memoryHint}${state.blizzardHint}${state.pastLifeHint}
---情境结束---

---事实约束---
${realityGuard}
---约束结束---

`;

            if (chatHistory.length > 0) {
                userPrompt += `---之前别人的发言（这些都不是你说的！你是${npc.name}！）---\n`;
                userPrompt += chatHistory.map(line => line.replace(/^(.+?)说：/, '[$1]: ')).join('\n');
                userPrompt += `\n---发言记录结束---\n\n`;
            }

            if (chatHistory.length === 0) {
                userPrompt += `你是第一个开口的人。感叹一下当前局势，抛出一个话题。`;
            } else {
                userPrompt += `回应上面其他人说的话——可以赞同、反对、追问、补充。`;
            }
            userPrompt += `
规则：直接说话，不要写名字前缀，不要JSON，不要引号包裹。口语化，有语气词有情绪。严格遵守你的字数要求和说话风格。${antiRepeatHint}${isFirstLifeForPrompt ? '\n⚠️ 你们从未经历过类似的事，不要编造任何过去的经历。' : ''}
⚠️ 再次提醒：你是「${npc.name}」，用你自己的语气说话！

${npc.name}：`;

            return {
                systemPrompt,
                userPrompt,
                maxTokens: TOKEN_LIMITS[npc.id] || 200,
            };
        }

        /**
         * Phase 2 提案
         * @returns {{ systemPrompt, userPrompt, maxTokens }}
         */
        static buildProposalPrompt(snapshot, chatHistory) {
            const alive = snapshot.aliveNpcs;
            const participantInfo = alive.map(n => {
                const cfg = (GST.NPC_CONFIGS || []).find(c => c.id === n.id) || {};
                return `${n.name}(${cfg.occupation || ''}, 体力${Math.round(n.stamina)})`;
            }).join('、');

            const systemPrompt = `你是一个游戏AI系统，需要根据角色们的讨论内容，提炼出2-3个具体的行动方案。

每个方案要：
1. 有简短有力的名称（4字以内）
2. 明确每个存活角色的具体分工（⚠️ 必须给所有存活角色都分配任务，不能遗漏任何人！）
3. 有清晰的预期收益

⚠️【极重要】assignments中每个人的任务描述必须是2-4个字的简洁动词短语！
可用的任务标签（只能从以下选择，括号内为实际效果）：
- 砍柴、伐木 → 去伐木场，产出🪵木柴+10/h
- 采集食物、捕鱼 → 去冰湖，产出🍞食物+8/h
- 人工发电 → 去工坊手摇发电，产出⚡电力+8/h（紧急补电用）
- 采矿 → 去矿渣堆，产出⚡电力+12/h（产电最高但在户外挨冻）
- 探索废墟 → 去废墟，随机获得物资（每天限3次，运气好能开急救包/罐头）
- 建造发电机 -> 去工坊，消耗电力8+木柴8，3小时建成，建成后永久自动产电⚡+24/h耗柴2/h（有概率故障需维修）
- 建造伐木机 -> 去工坊，消耗电力10+木柴12，4小时建成，建成后永久自动产柴🪵+30/h耗电3/h（有概率故障需维修）
- 做饭、烹饪 → 去炊事房，食物浪费-20%（相当于🍞+3/h）
- 治疗伤员 → 去医疗站，恢复同场景NPC血量+18/h、San+18/h（有伤员时优先）
- 盘点物资 → 去仓库，食物浪费-20%+木柴浪费-10%（相当于🍞+3/h、🪵省10%）
- 安抚士气 → 任意地点，同场景NPC San恢复+10.8/h（San低时必须安排）
- 休息恢复 → 回家休息，恢复自身体力和体温（体力<30时应安排）

❌ 错误示例："利用其药剂师知识协助王策、陆辰处理低温冻伤风险，同时参与小型部件组装"
❌ 错误标签："维修发电机"、"维护电力"（已废弃！用"人工发电"代替）
✅ 正确示例："治疗伤员"、"人工发电"、"砍柴"、"采集食物"、"建造发电机"

方案类型参考（可自由组合）：
- 资源优先：集中力量补充最紧缺资源
- 均衡发展：各项工作齐头并进
- 防御加固：优先修建筑/保暖/建造自动化设备
- 探索冒险：派人探索废墟寻找物资
- 科技路线：建造自动发电机/伐木机（Day1即可建造！建成后自动产出资源，两台互相供给形成正循环，越早建越有利）

⚠️ "人工发电"和"建造发电机"是完全不同的任务！
- "人工发电" = 手动手摇产电（⚡+8/h），紧急时用
- "建造发电机" = 建造自动化发电机（一次性消耗资源，建成后永久自动产电24/h，有概率故障需维修），长线规划
- "建造伐木机" = 建造自动化伐木机（一次性消耗资源，建成后永久自动产柴30/h，有概率故障需维修），长线规划

输出格式必须是JSON：
{
  "proposals": [
    {
      "name": "方案名",
      "description": "一句话描述",
      "assignments": {"角色名": "2-4字任务标签"},
      "reasoning": "推荐理由"
    }
  ]
}`;

            let userPrompt = `---当前局势---\n${snapshot.situation}\n---局势结束---\n\n`;
            if (chatHistory.length > 0) {
                userPrompt += `---讨论记录---\n${chatHistory.join('\n')}\n---讨论结束---\n\n`;
            }
            userPrompt += `存活人员: ${participantInfo}\n\n`;

            // 机器系统状态
            const game = snapshot.aliveNpcs.length > 0 ? null : null; // 不直接引用 game
            // 通过 situation 已包含机器状态；此处补充提案专用的细节提示
            // 从 snapshot.situation 中判断是否已含机器信息
            const sit = snapshot.situation;
            let machineHint = '';
            if (sit.includes('自动发电机') && sit.includes('运行中')) {
                machineHint += `⚡自动发电机已建成运行中，自动产电24/h耗柴2/h（有概率故障需维修）\n`;
                machineHint += `  → ❌ 不要再分配"建造发电机"任务！已经建好了！可以分配"人工发电"紧急补电。\n`;
            } else if (sit.includes('自动发电机') && sit.includes('故障')) {
                machineHint += `⚡⚠️自动发电机故障中！需要派人去工坊维修！\n`;
                machineHint += `  → 分配"人工发电"让人去工坊维修发电机+紧急补电。\n`;
            } else if (sit.includes('自动发电机') && sit.includes('停机')) {
                machineHint += `⚡自动发电机已建成但停机\n`;
                machineHint += `  → ❌ 不要再分配"建造发电机"任务！已经建好了！\n`;
            } else if (sit.includes('自动发电机：建造中')) {
                machineHint += `⚡自动发电机建造中，需要NPC在工坊继续施工\n`;
                machineHint += `  → 分配"建造发电机"让人去工坊继续建。电力紧急时另外派人"人工发电"。\n`;
            } else if (sit.includes('可以建造自动发电机')) {
                machineHint += `⚡【可建造】自动发电机！(消耗电力8+木柴8，建造3小时，建成后自动产电24/h耗柴2/h，有概率故障)\n`;
                machineHint += `  → 分配任务时写"建造发电机"。紧急补电写"人工发电"。\n`;
            } else {
                machineHint += `⚡自动发电机尚未解锁，当前只能"人工发电"手动产电\n`;
            }
            if (sit.includes('自动伐木机') && sit.includes('运行中')) {
                machineHint += `🪵自动伐木机已建成运行中，自动产柴30/h耗电3/h（有概率故障需维修）\n`;
                machineHint += `  → ❌ 不要再分配"建造伐木机"任务！已经建好了！\n`;
            } else if (sit.includes('自动伐木机') && sit.includes('故障')) {
                machineHint += `🪵⚠️自动伐木机故障中！需要派人去工坊维修！\n`;
                machineHint += `  → 分配"人工发电"让人去工坊维修伐木机。\n`;
            } else if (sit.includes('自动伐木机') && sit.includes('停机')) {
                machineHint += `🪵自动伐木机已建成但停机\n`;
                machineHint += `  → ❌ 不要再分配"建造伐木机"任务！已经建好了！\n`;
            } else if (sit.includes('自动伐木机：建造中')) {
                machineHint += `🪵自动伐木机建造中，需要NPC在工坊继续施工\n`;
                machineHint += `  → 分配"建造伐木机"让人去工坊继续建。\n`;
            } else if (sit.includes('可以建造自动伐木机')) {
                machineHint += `🪵【可建造】自动伐木机！(消耗电力10+木柴12，建造4小时，建成后自动产柴30/h耗电3/h，有概率故障)\n`;
                machineHint += `  → 分配任务时写"建造伐木机"（不是"砍柴"！）\n`;
            }
            if (machineHint) {
                userPrompt += `---自动化设施状态---\n${machineHint}---设施状态结束---\n\n`;
            }

            userPrompt += `根据以上情况，提炼出2-3个最可行的行动方案。每个方案要有明确的人员分工。\n⚠️ 每人的任务必须是2-4字简洁标签（如"砍柴""人工发电""建造发电机""建造伐木机""采集食物"），不要写长句！\n⚠️ "人工发电"=手摇产电，"建造发电机"=建造自动化机器，两者不同！\n⚠️ 必须给所有存活角色分配任务！不能遗漏！\n输出JSON格式。`;

            return {
                systemPrompt,
                userPrompt,
                maxTokens: 1000,
            };
        }

        /**
         * Phase 3 投票
         * @returns {{ systemPrompt, userPrompt, maxTokens }}
         */
        static buildVotePrompt(snapshot, npc, proposalSummary) {
            const card = snapshot.characterCards[npc.id];
            const otherNames = snapshot.aliveNpcs.filter(n => n.id !== npc.id).map(n => n.name);
            const numProposals = (proposalSummary.match(/方案\d+/g) || []).length || 3;

            const systemPrompt = `【身份锁定】你就是「${npc.name}」本人。
用「我」称呼自己，绝不用第三人称说自己。${otherNames.join('、')}是别人不是你。
${card}

你正在投票选择行动方案。从你的角色和专长角度，选择你最支持的方案。
用一句话说明理由（用「我」称呼自己）。根据你的性格和判断独立决定。

⚠️ 常识提醒：
- "砍柴/伐木"产出木柴🪵，不产电
- "人工发电"在工坊手摇产电⚡
- "建造发电机"建好后自动产电⚡（消耗木柴🪵）
- "建造伐木机"建好后自动产木柴🪵（消耗电力⚡）
- 伐木机不能发电！发电机不能产柴！不要搞混

输出格式必须是JSON：
{
  "vote": 1,
  "reason": "一句话理由，用我称呼自己"
}

vote字段填方案编号（1~${numProposals}），reason字段填理由。`;

            let userPrompt = `---局势摘要---\n${snapshot.situation}\n---局势结束---\n\n`;
            userPrompt += `---待投票方案---\n${proposalSummary}\n---方案结束---\n\n`;
            userPrompt += `【你是${npc.name}，用「我」称呼自己。请选择你支持的方案。输出JSON。】`;

            return {
                systemPrompt,
                userPrompt,
                maxTokens: 150,
            };
        }

        /**
         * Phase 4 总结（老钱发言）
         * @returns {{ systemPrompt, userPrompt, maxTokens }}
         */
        static buildSummaryPrompt(snapshot, winnerProposal) {
            const systemPrompt = `你是「老钱」，60岁退休镇长。刚主持完投票会议，现在做总结发言。
慢条斯理但字字有分量。爱用"咱们""大伙儿""孩子们"。
用「我」称呼自己。绝不用第三人称。`;

            const userPrompt = `投票结果：大家选择了「${winnerProposal.name}」— ${winnerProposal.description}
${winnerProposal.assignments ? '分工: ' + Object.entries(winnerProposal.assignments).map(([n, t]) => `${n}做${t}`).join('、') : ''}

做一个简短有力的总结发言（2-3句话），宣布决定、鼓舞士气。口语化。`;

            return {
                systemPrompt,
                userPrompt,
                maxTokens: 200,
            };
        }

        // ============ 工具方法 ============

        /** 统一清理 LLM 回复 */
        static cleanReply(reply, allNpcNames) {
            if (!reply) return null;
            // 清理 <think> 标签和 [END] 标记
            reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\[END\]/g, '').trim();
            // 移除 LLM 可能重复的角色名前缀
            if (allNpcNames && allNpcNames.length > 0) {
                const namePattern = allNpcNames.join('|');
                const namePrefix = new RegExp(`^[「【]?(${namePattern})[」】]?[：:]\\s*`, '');
                reply = reply.replace(namePrefix, '').trim();
            }
            // 移除引号包裹
            if ((reply.startsWith('"') && reply.endsWith('"')) || (reply.startsWith('"') && reply.endsWith('"'))) {
                reply = reply.slice(1, -1);
            }
            return reply.substring(0, 500);
        }

        /** 获取角色化离线台词 */
        static getFallback(npcId) {
            const pool = FALLBACKS[npcId] || ['……（沉默）'];
            return pool[Math.floor(Math.random() * pool.length)];
        }
    }

    GST.CouncilPromptBuilder = CouncilPromptBuilder;
})();
