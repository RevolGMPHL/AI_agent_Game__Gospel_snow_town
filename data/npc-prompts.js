/**
 * 福音镇 - AI Prompt 模板
 * NPC AI 思考、行动决策、对话的 Prompt 模板
 * 挂载到 GST.NPC_PROMPTS
 *
 * 注意：Prompt 模板嵌入在 NPC 类的 think/actionDecision 方法中，
 * 需要在任务5拆分NPC系统时一并提取
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.NPC_PROMPTS = {
        // Prompt 模板将在 npc-ai.js 中直接使用
        // 由于 Prompt 与运行时状态深度耦合（需要读取NPC当前属性、日程、环境），
        // 将模板函数放在 npc-ai.js 中更合理，此处仅保留常量级模板
    };

})();
