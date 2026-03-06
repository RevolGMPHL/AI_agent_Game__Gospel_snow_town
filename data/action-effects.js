/**
 * 福音镇 - 行动效果数据
 * 行为锁优先级定义 + 行动实效性映射表
 * 挂载到 GST.BEHAVIOR_PRIORITY, GST.ACTION_EFFECT_MAP
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.BEHAVIOR_PRIORITY = {
    FREE: 0,        // 自由行动：闲逛、社交、LLM低优先级决策
    WORK: 1,        // 任务/工作：taskOverride、资源采集、日程工作
    RECOVERY: 2,    // 恢复行为：休息、看病途中
    BASIC_NEED: 3,  // 基本需求：吃饭、睡觉、治疗中
    SURVIVAL: 4,    // 生存紧急：第4天室内锁定、严重失温(体温<35°C)
    FATAL: 5,       // 致命紧急：体温<33°C、健康<10
};


    GST.ACTION_EFFECT_MAP = [
    // 砍柴/伐木 → 产出木柴
    { keywords: ['砍柴', '伐木', '搬运木柴'], requiredScene: 'village', effectType: 'produce_resource', resourceType: 'woodFuel', ratePerHour: 10, bubbleText: '🪓 砍柴中' },
    // 采集食物/捕鱼 → 产出食物
    { keywords: ['采集食物', '捕鱼', '搜索罐头'], requiredScene: 'village', effectType: 'produce_resource', resourceType: 'food', ratePerHour: 8, bubbleText: '🎣 采集食物中' },
    // 户外采矿 → 产出电力（矿渣堆）
    { keywords: ['采矿', '挖矿', '矿渣'], requiredScene: 'village', effectType: 'produce_resource', resourceType: 'power', ratePerHour: 12, bubbleText: '⛏️ 采矿中（⚡+12/h）' },
    // 探索废墟 → 随机物资（每天限3次）
    { keywords: ['探索废墟', '废墟探索', '废墟', '搜索废墟', '探索遗迹'], requiredScene: 'village', effectType: 'explore_ruins', ratePerHour: 1, bubbleText: '🔍 探索废墟中…' },
    // 维修发电机/技术工作 → 产出电力（室内工坊）
    { keywords: ['维修发电机', '检查发电机', '技术工作', '制造工具'], requiredScene: 'workshop', effectType: 'produce_resource', resourceType: 'power', ratePerHour: 8, bubbleText: '🔧 维修发电机中（⚡+8/h）' },
    // 设计暖炉修复方案/协助修复 → 推进修复进度
    { keywords: ['暖炉修复', '修复暖炉', '暖炉扩建', '设计暖炉', '协助建造', '扩建', '整理图纸', '规划'], requiredScene: 'workshop', effectType: 'build_progress', ratePerHour: 1, bubbleText: '🔨 暖炉修复中' },
    // 制作急救包/草药制剂 → 制作急救包
    { keywords: ['制作草药', '急救包', '草药制剂', '制药', '整理药品'], requiredScene: 'medical', effectType: 'craft_medkit', ratePerHour: 0.5, bubbleText: '💊 制作急救包中' },
    // 修理无线电 → 推进修理进度
    { keywords: ['修理无线电', '无线电台'], requiredScene: 'workshop', effectType: 'repair_radio', ratePerHour: 1, bubbleText: '📻 修理无线电中' },
    // 管理仓库/盘点物资/整理库存 → 减少食物浪费
    { keywords: ['盘点物资', '整理库存', '管理物资', '物资分配', '搬运', '整理物资'], requiredScene: 'warehouse', effectType: 'reduce_waste', bubbleText: '📦 管理仓库中（浪费-20%）' },
    // 做饭/准备早餐/晚餐 → 减少食物浪费
    { keywords: ['做早餐', '准备早餐', '准备晚餐', '分配食物', '准备午餐', '准备明日食材'], requiredScene: 'kitchen', effectType: 'reduce_waste', bubbleText: '🍳 烹饪中（浪费-20%）' },
    // 坐诊/治疗冻伤/心理疏导 → 医疗效果
    { keywords: ['坐诊', '治疗冻伤', '心理疏导', '巡查伤员', '医疗救治', '处理伤员'], requiredScene: 'medical', effectType: 'medical_heal', ratePerHour: 1, bubbleText: '🏥 医疗救治中' },
    // 巡查健康状况（不限场景，匹配苏岩暖炉广场巡查）→ 医疗效果
    { keywords: ['巡查'], requiredScene: null, effectType: 'medical_heal', ratePerHour: 1, bubbleText: '🏥 巡查健康中' },
    // 维护暖炉/添加柴火 → 暖炉维护（不额外产出，但确保暖炉运转）
    { keywords: ['维护暖炉', '添加柴火'], requiredScene: null, effectType: 'furnace_maintain', bubbleText: '🔥 维护暖炉中' },
    // 巡逻/警戒 → 全队San恢复加成
    { keywords: ['巡逻', '警戒', '安全巡查', '巡视', '陷阱', '警报'], requiredScene: 'village', effectType: 'patrol_bonus', bubbleText: '🛡️ 巡逻警戒中' },
    // 安抚/调解/统筹/鼓舞 → San恢复
    { keywords: ['安抚', '调解冲突', '统筹', '鼓舞', '讲故事', '安慰', '心理支持', '协调', '谈心'], requiredScene: null, effectType: 'morale_boost', ratePerHour: 2, bubbleText: '💬 安抚鼓舞中' },
    // 修理工具 → 产出少量电力
    { keywords: ['修理工具'], requiredScene: 'workshop', effectType: 'produce_resource', resourceType: 'power', ratePerHour: 4, bubbleText: '🔧 修理工具中' },
];


})();
