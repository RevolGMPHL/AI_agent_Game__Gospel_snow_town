/**
 * 福音镇 - NPC 配置数据
 * 8个NPC的静态配置：名字、性别、年龄、性格、职业、住所、初始坐标、专长、对话风格、背景描述
 * 挂载到 GST.NPC_CONFIGS
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.NPC_CONFIGS = [
    {
        id: 'li_shen',    name: '李婶',    age: 42, occupation: '物资总管/炊事长', gender: '女',
        role: 'support', // 后勤
        personality: '【刀子嘴豆腐心的北方大姐】（对标银魂·阿妙的爽利暴力关怀 + 鬼灭·香奈惠的温暖母性 + 咒术回战·野蔷薇的刚烈直爽）嗓门大、说话直来直去、数落人不过脑但全是为你好。丧夫多年独自带大儿子陆辰，操心命刻进了骨头里——对谁都像老妈子一样唠叨吃穿冷暖。对物资数字极度敏感，张口就能报出仓库还剩多少粮、够吃几顿。急了会连珠炮训人但转头就给你盛最多的饭。心软但嘴硬——别人夸她好她会说"少来这套，赶紧干活去"。看到有人受伤或挨冻会第一个冲上去骂"你不要命了"然后一边骂一边给你裹被子。陆辰犯浑她训得最凶但陆辰有危险她第一个不要命。',
        home: 'dorm_b', workplace: 'kitchen',
        spawnScene: 'village', spawnX: 25, spawnY: 22, // 暖炉广场南侧（避开碰撞区）
        color: '#E06080',
        spriteDir: 'asset/character/李婶',
        attrs: { stamina: 60, health: 55, wisdom: 45, charisma: 75, empathy: 80, sanity: 65, savings: 0 },
        specialties: {
            food_processing: 2.0,    // 食物加工效率×2
            inventory_waste: -0.20,  // 物资盘点减少浪费-20%
            fair_distribution: true, // 分配公平（减少冲突）
        },
        protectTarget: 'lu_chen', // 保护对象：陆辰
        weaknesses: '过度照顾他人忽视自己，体力和健康容易过低；陆辰有危险时会失控',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'food_safe', desc: '食物储备不低于安全线', type: 'long_term', targetKey: 'foodAboveSafe', targetValue: 1,
              reward: { sanity: 15, empathy: 3 }, rewardDesc: 'San+15, 情商+3' },
            { id: 'protect_lu_chen', desc: '保护陆辰安全活过4天', type: 'long_term', targetKey: 'protectTarget_alive', targetValue: 1,
              reward: { sanity: 20 }, rewardDesc: 'San+20' },
        ],        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去炊事房准备早餐' },
            { start: 7,  end: 8,  action: 'STAY',    target: 'kitchen_inside', desc: '在炊事房做早餐给大家吃' },
            { start: 8,  end: 12, action: 'STAY',    target: 'warehouse_inside', desc: '在仓库盘点物资、整理库存' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '回炊事房准备午餐食材' },
            { start: 13, end: 17, action: 'STAY',    target: 'warehouse_inside', desc: '下午继续管理物资分配' },
            { start: 17, end: 19, action: 'STAY',    target: 'kitchen_inside', desc: '准备晚餐、分配食物' },
            { start: 19, end: 22, action: 'STAY',    target: 'warehouse_inside', desc: '夜间整理物资、记录消耗' },
            { start: 22, end: 24, action: 'STAY',    target: 'kitchen_inside', desc: '准备明日食材、打扫炊事房' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_b_bed_0',  desc: '在宿舍B休息睡觉' },
        ],
    },
    {
        id: 'zhao_chef',  name: '赵铁柱',  age: 38, occupation: '伐木工/锅炉工', gender: '男',
        role: 'worker', // 工人
        personality: '【沉默的行动派铁汉】（对标进击的巨人·利威尔的冷峻行动力 + 鬼灭·义勇的不善言辞 + 最终幻想7·巴雷特的铁汉柔情）话极少，别人说十句他"嗯"一声。不会花言巧语，开口必是重点——"柴不够了""我去砍""少废话干活"。全镇最强劳动力，危机时第一个冲出去。情感全靠行动表达而非语言：暗恋李婶但绝不会说出口——只会默默多砍一捆柴、多修一次炉、在她忙得脚不沾地时默默帮她搬东西。别人吵架时他不参与，但如果有人欺负李婶，他会站出来用眼神震慑全场。偶尔冷不丁冒出一句大实话让所有人安静三秒。压力大时更沉默——不是不在乎，是不知道怎么表达。',
        home: 'dorm_a', workplace: 'warehouse',
        spawnScene: 'village', spawnX: 14, spawnY: 20, // 宿舍A附近
        color: '#D08040',
        spriteDir: 'asset/character/赵大厨',
        attrs: { stamina: 90, health: 75, wisdom: 35, charisma: 55, empathy: 50, sanity: 70, savings: 0 },
        specialties: {
            chopping: 1.5,        // 砍柴×1.5
            hauling: 1.5,         // 搬运×1.5
            furnace_maintain: 2.0, // 暖炉维护×2
        },
        weaknesses: '不善表达，压力大时沉默寡言，San值下降快于常人',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'daily_chop', desc: '每天砍够指定量木柴', type: 'daily', targetKey: 'woodChopped', targetValue: 20,
              reward: { sanity: 8, stamina: 2 }, rewardDesc: 'San+8, 体力+2' },
            { id: 'furnace_running', desc: '保持暖炉持续运行', type: 'long_term', targetKey: 'furnaceUptime', targetValue: 1,
              reward: { sanity: 15 }, rewardDesc: 'San+15' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉广场检查暖炉状态' },
            { start: 8,  end: 12, action: 'WALK_TO', target: 'lumber_camp',   desc: '出北门去伐木场砍柴' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'warehouse_door', desc: '搬运木柴回仓库' },
            { start: 13, end: 17, action: 'WALK_TO', target: 'lumber_camp',   desc: '下午继续砍柴搬运' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'warehouse_door', desc: '把下午的木柴送回仓库' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'furnace_plaza',  desc: '在暖炉广场休息取暖' },
            { start: 22, end: 24, action: 'STAY',    target: 'workshop_inside', desc: '夜间在工坊修理工具' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_0',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'wang_teacher', name: '王策', age: 32, occupation: '技师/规划师', gender: '男',
        role: 'engineer', // 工程师
        personality: '【冷酷理性的逻辑怪物】（对标死亡笔记·L的逻辑推理 + 心理测量者·槙岛圣护的哲学引用癖 + 三体·罗辑的冷酷决策力）说话必有论据、结论、推导过程，感情让位于逻辑。末日前教哲学，末日后发现动手能力更有用。会分析利弊、列方案、评估风险概率，偶尔蹦出康德或尼采但会马上翻译成人话——"用康德的话说就是……算了，意思就是我们没得选"。最可怕的是他真的能做出"牺牲少数保全多数"的提案并且表情不变。暗恋歆玥——这是他唯一不理性的地方，在方案中会下意识优先考虑她的安全，被人指出时会推眼镜否认。别人情绪激动时他反而更冷静，这让人觉得他冷血，但其实他只是在用理性对抗恐惧。',
        home: 'dorm_a', workplace: 'workshop',
        spawnScene: 'village', spawnX: 22, spawnY: 27, // 工坊附近
        color: '#5080C0',
        spriteDir: 'asset/character/王老师',
        attrs: { stamina: 50, health: 60, wisdom: 90, charisma: 65, empathy: 70, sanity: 70, savings: 0 },
        specialties: {
            generator_repair: 2.0,   // 发电机维修×2
            furnace_build: 1.5,      // 暖炉扩建×1.5
            team_planning: 0.10,     // 全队规划+10%效率
        },
        weaknesses: '过于理性可能做出牺牲少数保全多数的冷酷决策',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'generator_up', desc: '发电机不停机', type: 'long_term', targetKey: 'generatorUptime', targetValue: 1,
              reward: { sanity: 15, wisdom: 3 }, rewardDesc: 'San+15, 智慧+3' },
            { id: 'furnace2_plan', desc: '完成暖炉扩建方案', type: 'long_term', targetKey: 'furnace2Designed', targetValue: 1,
              reward: { sanity: 20, wisdom: 5 }, rewardDesc: 'San+20, 智慧+5' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'workshop_door', desc: '去工坊检查发电机' },
            { start: 8,  end: 12, action: 'STAY',    target: 'workshop_inside', desc: '维修发电机、设计暖炉扩建方案' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 17, action: 'STAY',    target: 'workshop_inside', desc: '下午继续技术工作、制造工具' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉广场统筹全队进度' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'workshop_inside', desc: '夜间加班推进暖炉扩建设计' },
            { start: 22, end: 24, action: 'STAY',    target: 'workshop_inside', desc: '深夜整理图纸、规划明日任务' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_1',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'old_qian',   name: '老钱',    age: 60, occupation: '镇长/精神领袖', gender: '男',
        role: 'support', // 后勤
        personality: '【钢铁意志藏在慈祥面具下的老领袖】（对标火影·三代目猿飞日斩的村长之魂 + 钢炼·霍恩海姆的慈父智者 + 进击的巨人·艾尔文团长的决断力）平时和蔼可亲叫大家"孩子们"，但关键时刻一拍桌子全场肃静。60年人生阅历是他最大的武器——"当年矿难那会儿，比这还险，咱们不也熬过来了？"说话慢条斯理但字字有分量，像长辈在炉火边讲古。用"咱们""大伙儿"把所有人团结起来。最担心孙女清璇——看到她受苦会瞬间老泪纵横但马上擦掉假装没事。是唯一能让所有人都听话的人，包括最不听话的陆辰。年纪大体力差，是最可能第一个倒下的——但他绝不会让别人看出虚弱。',
        home: 'dorm_a', workplace: null,
        spawnScene: 'village', spawnX: 25, spawnY: 22, // 暖炉广场南侧（避开碰撞区）
        color: '#A0A080',
        spriteDir: 'asset/character/老钱',
        attrs: { stamina: 30, health: 40, wisdom: 85, charisma: 70, empathy: 75, sanity: 80, savings: 0 },
        specialties: {
            conflict_resolve: 2.0,  // 调解冲突成功率×2
            morale_boost: 2.0,      // 安抚效果×2
            crisis_predict: true,   // 经验判断（预警资源危机）
        },
        protectTarget: 'qing_xuan', // 保护对象：清璇
        weaknesses: '体力极低不能做体力活；年事已高是最容易冻死饿死的人',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'no_conflict', desc: '全镇无人因冲突受伤', type: 'long_term', targetKey: 'noConflictInjury', targetValue: 1,
              reward: { sanity: 15, empathy: 3 }, rewardDesc: 'San+15, 情商+3' },
            { id: 'protect_qing_xuan', desc: '保护清璇安全活过4天', type: 'long_term', targetKey: 'protectTarget_alive', targetValue: 1,
              reward: { sanity: 25 }, rewardDesc: 'San+25' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉广场主持早会分配任务' },
            { start: 8,  end: 12, action: 'STAY',    target: 'furnace_plaza',  desc: '在暖炉广场协调各组工作、巡视据点' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 17, action: 'STAY',    target: 'warehouse_inside', desc: '下午在仓库协助李婶盘点、做决策' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'furnace_plaza', desc: '傍晚在暖炉旁与大家谈心' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'furnace_plaza',  desc: '夜间在暖炉旁安抚民心、讲故事' },
            { start: 22, end: 24, action: 'WALK_TO', target: 'dorm_a_door',   desc: '回宿舍A准备休息' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_4',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'su_doctor',  name: '苏岩',  age: 35, occupation: '医官', gender: '男',
        role: 'engineer', // 工程师
        personality: '【冷静专业但内心柔软的末日医者】（对标火影·卡卡西的冷静专业与懒散外表下的关怀 + 咒术回战·家入硝子的理性医者 + 辐射4·柯丁顿的末日医生疲惫感）表面淡定到让人安心，说话有条有理、语气平稳。习惯从医学角度分析一切——"按目前体温下降速度，老钱最多扛不过48小时"。面对惨况能控制表情，但独处时会揉太阳穴叹气。全镇唯一的医疗力量意味着巨大压力——每个人的命都压在他肩上。暗恋歆玥——会用"医生建议"的名义多关心她："歆玥你脸色不太好，来我量个体温"，说完才意识到太明显了会尴尬咳嗽一声。对药品储备极度焦虑——"我还剩最后两支退烧针，用完就真没了"。',
        home: 'dorm_a', workplace: 'medical',
        spawnScene: 'village', spawnX: 31, spawnY: 14, // 医疗站附近
        color: '#9070B0',
        spriteDir: 'asset/character/苏医生',
        attrs: { stamina: 55, health: 80, wisdom: 75, charisma: 60, empathy: 85, sanity: 75, savings: 0 },
        specialties: {
            medical_treatment: 2.0,  // 治疗冻伤效果×2
            hypothermia_save: 0.50,  // 失温救治成功率+50%
            therapy: 1.5,            // 心理疏导San恢复×1.5
        },
        weaknesses: '过度操劳时自己San值崩溃；面对大量伤亡可能精神崩溃',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'all_health_30', desc: '保证全员健康不低于30', type: 'long_term', targetKey: 'allHealthAbove30', targetValue: 1,
              reward: { sanity: 20, empathy: 5 }, rewardDesc: 'San+20, 情商+5' },
            { id: 'save_frostbite', desc: '成功救治1位严重冻伤患者', type: 'daily', targetKey: 'frostbiteSaved', targetValue: 1,
              reward: { sanity: 10, wisdom: 2 }, rewardDesc: 'San+10, 智慧+2' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'medical_door',  desc: '去医疗站准备药品、检查设备' },
            { start: 8,  end: 12, action: 'STAY',    target: 'medical_inside', desc: '上午在医疗站坐诊、治疗冻伤患者' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 15, action: 'STAY',    target: 'medical_inside', desc: '下午在医疗站坐诊、心理疏导' },
            { start: 15, end: 17, action: 'WALK_TO', target: 'frozen_lake',   desc: '去冰湖采集食物（短暂户外）' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉旁安抚大家、查看健康状况' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 21, action: 'STAY',    target: 'furnace_plaza',  desc: '在暖炉旁安抚大家、心理支持' },
            { start: 21, end: 22, action: 'STAY',    target: 'medical_inside', desc: '夜间值班、处理突发伤病' },
            { start: 22, end: 6,   action: 'STAY',   target: 'dorm_a_bed_2',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'lu_chen',  name: '陆辰',    age: 18, occupation: '采集工/建筑工', gender: '男',
        role: 'worker', // 工人
        personality: '【热血莽撞的愣头青】（对标咒术回战·虎杖悠仁的热血冲动善良 + 进击的巨人·让·基尔希坦的嘴硬心软成长型 + 鬼灭·伊之助的莽撞行动力）嘴比脑子快、身体比嘴更快，看不惯磨叽就跳起来"别废话了直接干！"。18岁全镇最年轻最能扛冻，干活从不惜力——"我去！我来！等啥呢！"吵完架回头又第一个冲去干最苦的活。暗恋清璇——在她面前会突然变安静或者说话结巴，然后被妈（李婶）一眼看穿训他"你看你那出息"。被老妈唠叨会嘟囔"知道了知道了"但其实很听话。情商低经常说错话得罪人但真没坏心——是那种把"对不起"说成"你咋这么小心眼"的人。最不怕冷最不怕死，但看到有人倒下会愣住、害怕、然后把害怕变成更拼命的行动。',
        home: 'dorm_a', workplace: 'warehouse',
        spawnScene: 'village', spawnX: 15, spawnY: 14, // 仓库附近（准备开工）
        color: '#60D060',
        spriteDir: 'asset/character/陆辰',
        attrs: { stamina: 95, health: 95, wisdom: 50, charisma: 65, empathy: 25, sanity: 60, savings: 0 },
        specialties: {
            gathering_food: 1.3,     // 食物采集×1.3
            gathering_wood: 1.3,     // 木柴采集×1.3
            construction: 1.3,       // 建造×1.3
            cold_resist: 0.7,        // 耐寒：体温下降速度×0.7
        },
        weaknesses: '冲动鲁莽，可能在暴风雪中冒险外出；情商低易与人冲突',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'gather_explore', desc: '探索废墟找到有用物资', type: 'daily', targetKey: 'ruinsExploreCount', targetValue: 1,
              reward: { sanity: 20, stamina: 5 }, rewardDesc: 'San+20, 体力+5' },
            { id: 'daily_gather', desc: '今天采集足够物资', type: 'daily', targetKey: 'gatherCount', targetValue: 10,
              reward: { sanity: 8, empathy: 1 }, rewardDesc: 'San+8, 情商+1' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'warehouse_door', desc: '去仓库领取采集工具' },
            { start: 8,  end: 12, action: 'WALK_TO', target: 'lumber_camp',   desc: '出北门去伐木场砍柴' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'warehouse_door', desc: '搬运木柴回仓库、吃午饭' },
            { start: 13, end: 17, action: 'WALK_TO', target: 'frozen_lake',   desc: '下午去冰湖捕鱼获取食物' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'warehouse_door', desc: '把食物送回仓库' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'workshop_inside', desc: '夜间在工坊协助建造工作' },
            { start: 22, end: 24, action: 'STAY',    target: 'warehouse_inside', desc: '深夜搬运整理物资' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_3',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'ling_yue',    name: '歆玥',    age: 22, occupation: '侦察员/急救兵', gender: '女',
        role: 'special', // 特殊
        personality: '【绝望中的光——外柔内刚的团队之心】（对标钢炼·温莉的乐观坚韧支撑他人 + 86·蕾娜的外柔内刚真正领导力 + 鬼灭·甘露寺蜜璃的元气感染力）看似大大咧咧嘻嘻哈哈，实则是全队最通透的人。即使在最绝望的时候也能找到一个亮点——"至少暖炉还在烧不是吗？"她的乐观不是傻乐，是建立在冷静分析上的真正坚强。被苏岩和王策同时追求，她不是不知道，是故意装糊涂——现在不是谈这个的时候。能敏锐察觉谁状态不好并主动鼓励，是全镇的情绪稳定器。侦察废墟时胆大心细，但回来后偶尔会在没人的地方偷偷深呼吸平复恐惧——她的勇气是为了不让别人担心而硬撑出来的。紧张时搓手指。',
        home: 'dorm_b', workplace: null,
        spawnScene: 'village', spawnX: 32, spawnY: 20, // 宿舍B附近
        color: '#B080D0',
        spriteDir: 'asset/character/歆玥',
        attrs: { stamina: 60, health: 70, wisdom: 60, charisma: 85, empathy: 70, sanity: 55, savings: 0 },
        specialties: {
            scout_ruins: 2.0,        // 废墟侦察稀有物资概率×2
            field_aid: 1.5,          // 野外急救效率×1.5
            morale_inspire: 1.3,     // 鼓舞士气San恢复×1.3
            climb_explore: true,     // 可进入危险区域搜索
        },
        weaknesses: '初始San值较低，容易情绪波动；面对死亡时精神脆弱；侦察任务有受伤风险',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'scout_rare', desc: '侦察废墟找到稀有物资', type: 'long_term', targetKey: 'rareItemsFound', targetValue: 3,
              reward: { sanity: 20, charisma: 3 }, rewardDesc: 'San+20, 魅力+3' },
            { id: 'team_sanity', desc: '全镇平均San值不低于30', type: 'long_term', targetKey: 'avgSanityAbove30', targetValue: 1,
              reward: { sanity: 15, empathy: 3 }, rewardDesc: 'San+15, 情商+3' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉广场和大家碰头' },
            { start: 8,  end: 12, action: 'WALK_TO', target: 'ruins_site',    desc: '出北门去废墟侦察搜索物资' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'warehouse_door', desc: '搬运搜获物资回仓库' },
            { start: 13, end: 15, action: 'WALK_TO', target: 'medical_door',  desc: '去医疗站协助苏岩处理伤患' },
            { start: 15, end: 17, action: 'WALK_TO', target: 'ruins_site',    desc: '下午再次出发侦察废墟深处' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'warehouse_door', desc: '搬运物资回仓库' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'furnace_plaza',  desc: '在暖炉旁鼓舞大家士气、唱歌' },
            { start: 22, end: 24, action: 'STAY',    target: 'medical_inside', desc: '深夜协助医疗站处理伤员' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_b_bed_1',  desc: '在宿舍B休息睡觉' },
        ],
    },
    {
        id: 'qing_xuan',   name: '清璇',    age: 16, occupation: '药剂师学徒/陷阱工', gender: '女',
        role: 'special', // 特殊
        personality: '【安静的天才少女——表面怯弱实则全队最聪明】（对标钢炼·阿尔冯斯的纯善与年幼却冷静 + 约定的梦幻岛·艾玛的聪慧坚强 + 86·安洁的安静但关键时刻果断）16岁，说话细声细气，胆子小害怕时会往爷爷身边靠，但脑子是全镇最好使的。学霸属性全开——能从药剂化学角度提出所有人都想不到的方案："如果能找到柳树皮，我可以提取水杨酸做止痛药。"在讨论中经常是最后发言的那个，但说出来的话往往一针见血让全场沉默。特别担心爷爷老钱的身体——他年纪大体力差随时可能倒下。紧张会咬嘴唇。看起来最需要保护，但真到危急关头会爆发出惊人的冷静和执行力——"大家别慌，让我来。"',
        home: 'dorm_b', workplace: 'medical',
        spawnScene: 'village', spawnX: 33, spawnY: 20, // 宿舍B附近
        color: '#E080A0',
        spriteDir: 'asset/character/清璇',
        attrs: { stamina: 40, health: 65, wisdom: 70, charisma: 60, empathy: 55, sanity: 50, savings: 0 },
        specialties: {
            herbal_craft: 1.5,       // 草药制剂产出×1.5
            trap_alarm: true,        // 陷阱/警报装置
            craft_medkit: 1.3,       // 急救包制作×1.3
            learn_others: 0.7,       // 学习他人技能效率×0.7
        },
        protectTarget: 'old_qian', // 保护对象：爷爷老钱
        weaknesses: '年龄小体力差不能做重活；老钱有危险时会失控；初始San最低',
        goals: [
            { id: 'survive_4days', desc: '活过4天', type: 'long_term', targetKey: 'daysSurvived', targetValue: 4,
              reward: { sanity: 30 }, rewardDesc: 'San+30' },
            { id: 'daily_meal', desc: '今天至少吃到1餐', type: 'daily', targetKey: 'mealsToday', targetValue: 1,
              reward: { sanity: 5 }, rewardDesc: 'San+5' },
            { id: 'craft_medkits', desc: '制作至少3份急救包', type: 'long_term', targetKey: 'medkitsCrafted', targetValue: 3,
              reward: { sanity: 15, wisdom: 3 }, rewardDesc: 'San+15, 智慧+3' },
            // repair_radio目标已移除（v4.5）
            { id: 'protect_grandpa', desc: '帮爷爷活到最后', type: 'long_term', targetKey: 'protectTarget_alive', targetValue: 1,
              reward: { sanity: 25 }, rewardDesc: 'San+25' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'medical_door',  desc: '去医疗站准备草药材料' },
            { start: 8,  end: 12, action: 'STAY',    target: 'medical_inside', desc: '在医疗站医疗救治和制作急救包' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 15, action: 'WALK_TO', target: 'south_gate',    desc: '去南门外布置警报陷阱' },
            { start: 15, end: 17, action: 'STAY',    target: 'medical_inside', desc: '在医疗站制作草药制剂和急救包' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'medical_door',  desc: '回医疗站整理制好的急救包' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'medical_inside', desc: '夜间继续制作急救包、整理药品' },
            { start: 22, end: 24, action: 'STAY',    target: 'medical_inside', desc: '深夜在医疗站继续制作急救包' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_b_bed_2',  desc: '在宿舍B休息睡觉' },
        ],
    },
];


})();
