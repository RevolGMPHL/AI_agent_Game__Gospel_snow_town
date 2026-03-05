/**
 * 福音镇 - 任务定义数据
 * 任务阶段定义（阶段列表、条件、奖励、描述）
 * 挂载到 GST.TASK_DEFINITIONS
 *
 * 注意：任务定义与任务逻辑在 task-system.js 中深度耦合，
 * 在迁移任务系统（任务7）时会将定义数据提取到此文件
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.TASK_DEFINITIONS = {
        // 任务定义将在 task-system.js 迁移时填充
    };

})();
