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
        personality: '热心精明、照顾所有人，丧夫多年独自带大陆辰。末日来临后成为据点后勤管家，精打细算每一份物资，把每个人都当自己孩子照顾。',
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
        personality: '沉默寡言但行动力极强，危机时第一个冲出去干活。暗恋李婶已久，末日后更想保护她。',
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
            { start: 19, end: 22, action: 'STAY',    target: 'furnace_plaza',  desc: '维护暖炉、添加柴火' },
            { start: 22, end: 24, action: 'STAY',    target: 'workshop_inside', desc: '夜间在工坊修理工具' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_0',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'wang_teacher', name: '王策', age: 32, occupation: '技师/规划师', gender: '男',
        role: 'engineer', // 工程师
        personality: '理性冷静、逻辑至上，末日前是哲学教师，末日后发挥动手能力成为全镇技术骨干。暗恋歆玥。可能做出"牺牲少数保全多数"的冷酷决策。',
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
        personality: '慈祥睿智、德高望重，清璇的爷爷。末日后成为据点决策者和精神支柱，用经验和智慧安抚民心、调解冲突。',
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
        personality: '冷静专业、内心柔软，末日前是镇医，末日后成为据点唯一医疗力量。暗恋歆玥，用医者身份默默关心她。',
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
            { start: 8,  end: 10, action: 'STAY',    target: 'medical_inside', desc: '在医疗站坐诊、治疗冻伤患者' },
            { start: 10, end: 12, action: 'WALK_TO', target: 'frozen_lake',   desc: '去冰湖采集食物' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 15, action: 'WALK_TO', target: 'frozen_lake',   desc: '下午去冰湖采集食物' },
            { start: 15, end: 17, action: 'STAY',    target: 'medical_inside', desc: '下午在医疗站坐诊、心理疏导' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'furnace_plaza', desc: '去暖炉旁巡查大家的健康状况' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 21, action: 'STAY',    target: 'furnace_plaza',  desc: '在暖炉旁巡查大家的健康、安抚民心' },
            { start: 21, end: 22, action: 'STAY',    target: 'medical_inside', desc: '夜间值班、处理突发伤病' },
            { start: 22, end: 24, action: 'STAY',    target: 'medical_inside', desc: '深夜整理药品、写医疗记录' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_a_bed_2',  desc: '在宿舍A休息睡觉' },
        ],
    },
    {
        id: 'lu_chen',  name: '陆辰',    age: 18, occupation: '采集工/建筑工', gender: '男',
        role: 'worker', // 工人
        personality: '冲动但勇敢，年轻不怕死。暗恋清璇。末日后成为据点最年轻的劳动力，干活卖力但容易和人起冲突。',
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
        personality: '乐观坚韧、胆大心细，被苏岩和王策同时追求。末日前是户外运动爱好者，末日后负责废墟侦察和急救。',
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
        personality: '聪明好学、心灵手巧，老钱的孙女。末日前就喜欢捣鼓化学实验和手工制作，末日后负责制药、陷阱和无线电修理。',
        home: 'dorm_b', workplace: 'medical',
        spawnScene: 'village', spawnX: 33, spawnY: 20, // 宿舍B附近
        color: '#E080A0',
        spriteDir: 'asset/character/清璇',
        attrs: { stamina: 40, health: 65, wisdom: 70, charisma: 60, empathy: 55, sanity: 50, savings: 0 },
        specialties: {
            herbal_craft: 1.5,       // 草药制剂产出×1.5
            trap_alarm: true,        // 陷阱/警报装置
            radio_repair: true,      // 无线电修理
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
            { id: 'repair_radio', desc: '修好无线电', type: 'long_term', targetKey: 'radioRepaired', targetValue: 1,
              reward: { sanity: 25, wisdom: 5 }, rewardDesc: 'San+25, 智慧+5' },
            { id: 'protect_grandpa', desc: '帮爷爷活到最后', type: 'long_term', targetKey: 'protectTarget_alive', targetValue: 1,
              reward: { sanity: 25 }, rewardDesc: 'San+25' },
        ],
        schedule: [
            { start: 6,  end: 7,  action: 'WALK_TO', target: 'kitchen_door',  desc: '起床去吃早餐' },
            { start: 7,  end: 8,  action: 'WALK_TO', target: 'medical_door',  desc: '去医疗站准备草药材料' },
            { start: 8,  end: 12, action: 'STAY',    target: 'medical_inside', desc: '在医疗站医疗救治和制作急救包' },
            { start: 12, end: 13, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃午饭' },
            { start: 13, end: 15, action: 'WALK_TO', target: 'south_gate',    desc: '去南门外布置警报陷阱' },
            { start: 15, end: 17, action: 'STAY',    target: 'workshop_inside', desc: '在工坊修理无线电台' },
            { start: 17, end: 18, action: 'WALK_TO', target: 'medical_door',  desc: '回医疗站整理制好的急救包' },
            { start: 18, end: 19, action: 'WALK_TO', target: 'kitchen_door',  desc: '去炊事房吃晚饭' },
            { start: 19, end: 22, action: 'STAY',    target: 'workshop_inside', desc: '夜间继续修理无线电、制作陷阱' },
            { start: 22, end: 24, action: 'STAY',    target: 'medical_inside', desc: '深夜在医疗站继续制作急救包' },
            { start: 0,  end: 6,  action: 'STAY',    target: 'dorm_b_bed_2',  desc: '在宿舍B休息睡觉' },
        ],
    },
];


})();
