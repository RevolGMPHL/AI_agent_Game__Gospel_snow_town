/**
 * 福音镇 - 通用工具函数
 * 挂载到 GST.Utils
 */
(function() {
    'use strict';
    const GST = window.GST;

    GST.Utils = {
        /** 格式化时间 HH:MM */
        formatTime: function(hour, minute) {
            const h = Math.floor(hour);
            const m = minute || 0;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        },

        /** 随机整数 [min, max] */
        randomInt: function(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        /** 曼哈顿距离 */
        manhattan: function(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        },

        /** 欧几里得距离 */
        distance: function(x1, y1, x2, y2) {
            return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
        },

        /** 限制值在范围内 */
        clamp: function(val, min, max) {
            return Math.max(min, Math.min(max, val));
        },
    };

})();
