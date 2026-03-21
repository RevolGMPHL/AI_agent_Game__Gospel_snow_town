/**
 * 福音镇 - DifficultyConfig
 * 挂载到 GST.DifficultyConfig
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 难度配置模块 - 6个难度等级的完整参数表
 * 所有系统通过 getDifficulty() / game.difficulty 读取当前难度参数
 * 
 * 核心设计理念：所有难度都可通关，区别在于Agent需要更多轮回次数
 * 简单模式所有倍率为1.0，与当前版本行为完全一致
 */

// ============ 难度等级定义 ============
const DIFFICULTY_LEVELS = {
    easy: {
        key: 'easy',
        name: '简单',
        stars: '⭐',
        desc: '基线难度，物资充裕',
        expectedLives: '1~2世',

        // 初始资源系数（乘以 RESOURCE_DEFAULTS）
        initialResources: {
            woodFuel: 1.0,   // 30
            food: 1.0,       // 100
            power: 1.0,      // 40
        },

        // 资源消耗倍率
        consumptionMult: {
            wood: 1.0,
            power: 1.0,
            food: 1.0
        },

        // NPC属性衰减倍率
        hungerDecayMult: 1.0,
        staminaDrainMult: 1.0,
        sanDecayMult: 1.0,
        tempDropMult: 1.0,

        // 采集效率倍率（1.0 = 不变）
        gatherEfficiencyMult: 1.0,

        // 天气温度偏移（在基础温度上额外降低的度数）
        tempOffset: 0,
        // 户外时间限制缩减（秒）
        outdoorTimePenalty: 0,

        // 机器故障率（每游戏小时概率）& 维修时间（游戏秒）
        machineBreakdownChance: 0.10,
        machineRepairSeconds: 900,   // 15分钟（坏得少修得快）

        // 轮回Buff强度
        reincarnationBuffMult: 1.0,   // San加成倍率
        gatherExpBonus: 0,             // 每世采集经验加成（0表示无）
        aiIntervalReduction: 0.10      // AI思考间隔缩短比例
    },

    normal: {
        key: 'normal',
        name: '中等',
        stars: '⭐⭐',
        desc: '消耗+20%，初始资源-10%，采集-10%',
        expectedLives: '2~4世',

        initialResources: {
            woodFuel: 0.9,   // 27
            food: 0.9,       // 90
            power: 0.9,      // 36
        },

        consumptionMult: {
            wood: 1.2,
            power: 1.15,
            food: 1.2
        },

        hungerDecayMult: 1.15,
        staminaDrainMult: 1.1,
        sanDecayMult: 1.1,
        tempDropMult: 1.0,

        gatherEfficiencyMult: 0.9,

        tempOffset: 5,
        outdoorTimePenalty: 0,

        machineBreakdownChance: 0.15,
        machineRepairSeconds: 1200,  // 20分钟

        reincarnationBuffMult: 1.2,
        gatherExpBonus: 0.02,
        aiIntervalReduction: 0.10
    },

    hard: {
        key: 'hard',
        name: '略难',
        stars: '⭐⭐⭐',
        desc: '消耗+40%，初始资源-20%，采集-15%，天气更冷',
        expectedLives: '4~6世',

        initialResources: {
            woodFuel: 0.8,   // 24
            food: 0.8,       // 80
            power: 0.8,      // 32
        },

        consumptionMult: {
            wood: 1.4,
            power: 1.3,
            food: 1.35
        },

        hungerDecayMult: 1.3,
        staminaDrainMult: 1.2,
        sanDecayMult: 1.2,
        tempDropMult: 1.15,

        gatherEfficiencyMult: 0.85,

        tempOffset: 10,
        outdoorTimePenalty: 15 * 60,  // -15分钟（秒）

        machineBreakdownChance: 0.20,
        machineRepairSeconds: 1500,  // 25分钟

        reincarnationBuffMult: 1.4,
        gatherExpBonus: 0.03,
        aiIntervalReduction: 0.12
    },

    harder: {
        key: 'harder',
        name: '困难',
        stars: '⭐⭐⭐⭐',
        desc: '消耗+70%，初始资源-30%，采集-25%，天气严寒',
        expectedLives: '6~10世',

        initialResources: {
            woodFuel: 0.7,   // 21
            food: 0.7,       // 70
            power: 0.7,      // 28
        },

        consumptionMult: {
            wood: 1.7,
            power: 1.5,
            food: 1.6
        },

        hungerDecayMult: 1.5,
        staminaDrainMult: 1.35,
        sanDecayMult: 1.3,
        tempDropMult: 1.3,

        gatherEfficiencyMult: 0.75,

        tempOffset: 15,
        outdoorTimePenalty: 30 * 60,  // -30分钟（秒）

        machineBreakdownChance: 0.25,
        machineRepairSeconds: 1800,  // 30分钟（半小时）

        reincarnationBuffMult: 1.6,
        gatherExpBonus: 0.04,
        aiIntervalReduction: 0.14
    },

    arctic: {
        key: 'arctic',
        name: '极地',
        stars: '⭐⭐⭐⭐⭐',
        desc: '消耗×2.0，初始资源-40%，采集-35%，极端天气',
        expectedLives: '10~15世',

        initialResources: {
            woodFuel: 0.6,   // 18
            food: 0.6,       // 60
            power: 0.6,      // 24
        },

        consumptionMult: {
            wood: 2.0,
            power: 1.8,
            food: 1.9
        },

        hungerDecayMult: 1.8,
        staminaDrainMult: 1.5,
        sanDecayMult: 1.5,
        tempDropMult: 1.5,

        gatherEfficiencyMult: 0.65,

        tempOffset: 20,
        outdoorTimePenalty: 45 * 60,  // -45分钟（秒）

        machineBreakdownChance: 0.30,
        machineRepairSeconds: 1800,  // 30分钟

        reincarnationBuffMult: 2.0,
        gatherExpBonus: 0.05,
        aiIntervalReduction: 0.16
    },

    hell: {
        key: 'hell',
        name: '地狱',
        stars: '💀',
        desc: '消耗×2.5，初始资源-50%，采集-45%，极端天气+属性惩罚',
        expectedLives: '15~25世',

        initialResources: {
            woodFuel: 0.5,   // 15
            food: 0.5,       // 50
            power: 0.5,      // 20
        },

        consumptionMult: {
            wood: 2.5,
            power: 2.2,
            food: 2.3
        },

        hungerDecayMult: 2.2,
        staminaDrainMult: 1.8,
        sanDecayMult: 1.8,
        tempDropMult: 1.8,

        gatherEfficiencyMult: 0.55,

        tempOffset: 25,             // Day2: -55°C, Day4: -85~-90°C
        outdoorTimePenalty: 60 * 60, // -60分钟（秒），Day4基本禁入

        machineBreakdownChance: 0.35,
        machineRepairSeconds: 1800,  // 30分钟

        reincarnationBuffMult: 2.5,
        gatherExpBonus: 0.06,
        aiIntervalReduction: 0.18
    }
};

// ============ 全局工具函数 ============

/**
 * 从 localStorage 读取当前难度key并返回配置对象
 * @returns {Object} 当前难度配置对象，默认返回 easy
 */
function getDifficulty() {
    const key = localStorage.getItem('gospel_difficulty') || 'easy';
    return DIFFICULTY_LEVELS[key] || DIFFICULTY_LEVELS.easy;
}

/**
 * 保存难度key到 localStorage
 * @param {string} key - 难度等级key（easy/normal/hard/harder/arctic/hell）
 */
function setDifficulty(key) {
    if (DIFFICULTY_LEVELS[key]) {
        localStorage.setItem('gospel_difficulty', key);
        console.log(`[难度系统] 难度已设置为: ${DIFFICULTY_LEVELS[key].stars} ${DIFFICULTY_LEVELS[key].name}`);
    } else {
        console.warn(`[难度系统] 无效的难度key: ${key}，使用默认easy`);
        localStorage.setItem('gospel_difficulty', 'easy');
    }
}

/**
 * 清除已保存的难度设置（用于"从第1世重新开始"时）
 */
function clearDifficulty() {
    localStorage.removeItem('gospel_difficulty');
    console.log('[难度系统] 已清除难度设置');
}

/**
 * 获取所有难度等级列表（用于UI渲染）
 * @returns {Array} 难度配置数组
 */
function getDifficultyList() {
    return Object.values(DIFFICULTY_LEVELS);
}

console.log('[难度系统] difficulty-config.js 已加载');

// 挂载到 GST 命名空间，供外部模块调用
GST.getDifficulty = getDifficulty;
GST.setDifficulty = setDifficulty;
GST.clearDifficulty = clearDifficulty;
GST.getDifficultyList = getDifficultyList;

})();
