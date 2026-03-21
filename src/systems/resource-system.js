/**
 * 福音镇 - ResourceSystem
 * 挂载到 GST.ResourceSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

/**
 * 资源系统 - 全镇共享物资管理
 * 管理木柴、食物、电力三种核心资源
 * 依赖: game.js, weather-system.js
 */

// ============ 资源初始值配置（3资源制：木柴/食物/电力） ============
const RESOURCE_DEFAULTS = {
    woodFuel: 30,    // 木柴 — 初始30单位，Day1够烧但需采集为Day2囤
    food: 100,       // 食物 — 初始100单位，够吃数天
    power: 25,       // 电力 — 初始25单位（下调：配合消耗提升到2.0/h，够用约12h）
};

// ============ 废墟探索奖池（每天限3次，每次1游戏小时） ============
const RUINS_EXPLORE_POOL = [
    { name: '🥫 发现罐头', type: 'food', amount: 15, weight: 30 },
    { name: '💊 发现药品', type: 'medkit', amount: 1, weight: 20 },
    { name: '🔧 发现零件', type: 'power', amount: 10, weight: 15 },
    { name: '🪵 发现木材', type: 'woodFuel', amount: 10, weight: 15 },
    { name: '📔 发现日记', type: 'sanBoost', amount: 5, weight: 10 },
    { name: '❌ 一无所获', type: 'nothing', amount: 0, weight: 10 },
];
const RUINS_MAX_EXPLORES_PER_DAY = 3;

// ============ 资源消耗速率配置（每游戏小时） ============
const RESOURCE_CONSUMPTION = {
    woodPerFurnacePerHour: 0.8,   // 每座暖炉每小时消耗木柴（基础值，会被实时温度乘数调整）
    powerPerHour: 2.0,            // 发电机每小时消耗电力【v2.1上调：从0.5→2.0，让电力有真正的消耗压力】
    foodPerMealPerPerson: 1.5,    // 每人每餐消耗食物（集体用餐+个人进食都使用此值）
    mealsPerDay: 2,               // 每天2餐（8:00早餐, 18:00晚餐）
};

// 用餐时间（小时）
const MEAL_HOURS = [8, 18];

class ResourceSystem {
    constructor(game) {
        this.game = game;

        // 三种核心资源池（难度系数 + 总量守恒随机分配）
        const diff = (game && game.difficulty) ? game.difficulty : GST.getDifficulty();
        const initMult = diff.initialResources || { woodFuel: 1, food: 1, power: 1 };

        // 【总量守恒随机分配】
        // 设计思路：总预算由难度决定，但三种资源的分配比例每局随机
        // "此消彼长" —— 这世木柴多食物少，下世可能食物多电力少
        //
        // 算法：
        // 1. 算出难度下每种资源的标准值
        // 2. 转化为统一"预算点"（按标准值归一化）
        // 3. 生成3个随机偏移（和为0），让资源在标准值±30%间浮动
        // 4. 保证每种资源不低于标准值的50%（极端保底）

        const stdWood = RESOURCE_DEFAULTS.woodFuel * (initMult.woodFuel || 1);
        const stdFood = RESOURCE_DEFAULTS.food * (initMult.food || 1);
        const stdPower = RESOURCE_DEFAULTS.power * (initMult.power || 1);
        const totalBudget = stdWood + stdFood + stdPower; // 难度决定的总预算

        // 生成3个随机权重，归一化后乘以总预算
        // 权重以标准值为中心，加入随机扰动
        const jitter = () => 0.7 + Math.random() * 0.6; // [0.7, 1.3]
        let wW = stdWood * jitter();
        let wF = stdFood * jitter();
        let wP = stdPower * jitter();
        const wSum = wW + wF + wP;

        // 按权重比例分配总预算
        let allocWood = totalBudget * (wW / wSum);
        let allocFood = totalBudget * (wF / wSum);
        let allocPower = totalBudget * (wP / wSum);

        // 保底：每种资源不低于标准值的50%
        const floorWood = stdWood * 0.5;
        const floorFood = stdFood * 0.5;
        const floorPower = stdPower * 0.5;
        allocWood = Math.max(allocWood, floorWood);
        allocFood = Math.max(allocFood, floorFood);
        allocPower = Math.max(allocPower, floorPower);

        // 保底后重新按比例缩放回总预算（确保总量不变）
        const allocSum = allocWood + allocFood + allocPower;
        const scale = totalBudget / allocSum;
        allocWood *= scale;
        allocFood *= scale;
        allocPower *= scale;

        this.woodFuel = Math.round(allocWood);
        this.food = Math.round(allocFood);
        this.power = Math.round(allocPower);

        // 保存分配信息用于UI和日志
        this._initStandard = { woodFuel: stdWood, food: stdFood, power: stdPower };
        this._initRandomFactors = {
            woodFuel: this.woodFuel / stdWood,
            food: this.food / stdFood,
            power: this.power / stdPower
        };
        console.log(`[ResourceSystem] 难度=${diff.name}, 总预算=${Math.round(totalBudget)}`);
        console.log(`[ResourceSystem] 标准值: 木柴${Math.round(stdWood)} 食物${Math.round(stdFood)} 电力${Math.round(stdPower)}`);
        console.log(`[ResourceSystem] 随机分配: 木柴${this.woodFuel}(×${(this.woodFuel/stdWood).toFixed(2)}) 食物${this.food}(×${(this.food/stdFood).toFixed(2)}) 电力${this.power}(×${(this.power/stdPower).toFixed(2)})`);

        // 【v2.0】天气消耗乘数缓存
        this._weatherConsumptionMult = { wood: 1.0, power: 1.0, food: 1.0 };
        this._lastWeatherMultDay = 0;

        // 消耗统计（每日重置）
        this.dailyConsumed = { woodFuel: 0, food: 0, power: 0 };
        this.dailyCollected = { woodFuel: 0, food: 0, power: 0 };

        // 历史统计（全局）
        this.totalConsumed = { woodFuel: 0, food: 0, power: 0 };
        this.totalCollected = { woodFuel: 0, food: 0, power: 0 };

        // 废墟探索状态
        this.ruinsExploresToday = 0;  // 今天已探索次数
        this._ruinsExploreDay = 0;    // 上次重置的天数

        // 断电惩罚系数（默认1.0，断电时1.5）
        this._noPowerFuelPenalty = 1.0;

        // 资源消耗tick计时
        this._consumptionTick = 0;
        this._mealServed = {}; // { dayX_hourY: true } 防止重复发放餐食

        // 危机状态标记
        this.crisisFlags = {
            noFood: false,       // 食物耗尽
            noPower: false,      // 电力耗尽
            noWoodFuel: false,   // 木柴耗尽
            hungerCrisis: false, // 饥饿危机进行中
        };

        // 饥饿危机持续时间追踪（秒）
        this._hungerCrisisDuration = 0;

        // 日结算报告数据
        this.lastDayReport = null;

        console.log('[ResourceSystem] 初始化完成:', this.getResourceSummary());
    }

    // ============ 资源增减接口 ============

    /** 增加资源（NPC采集完成时调用） */
    addResource(type, amount, source = '') {
        if (amount <= 0) return;
        switch (type) {
            case 'woodFuel':
                this.woodFuel += amount;
                break;
            case 'food':
                this.food += amount;
                break;
            case 'power':
                {
                    const oldPower = this.power;
                    this.power += amount;
                    this._checkPowerRecovery(oldPower, this.power);
                }
                break;

            default:
                console.warn(`[ResourceSystem] 未知资源类型: ${type}`);
                return;
        }
        this.dailyCollected[type] = (this.dailyCollected[type] || 0) + amount;
        this.totalCollected[type] = (this.totalCollected[type] || 0) + amount;

        if (this.game.addEvent && amount >= 1) {
            const icons = { woodFuel: '🪵', food: '🍞', power: '⚡' };
            const names = { woodFuel: '木柴', food: '食物', power: '电力' };
            this.game.addEvent(`${icons[type]} ${source ? source + '收集了' : '获得'}${names[type]} +${Math.round(amount)}（剩余${Math.round(this[type])}）`);
        }

        console.log(`[ResourceSystem] +${type}: ${amount} (${source}), 当前: ${Math.round(this[type])}`);
    }

    /** 消耗资源（返回实际消耗量，可能不足） */
    consumeResource(type, amount, reason = '') {
        if (amount <= 0) return 0;
        const current = this[type] || 0;
        const actual = Math.min(current, amount);
        this[type] = Math.max(0, current - amount);
        this.dailyConsumed[type] = (this.dailyConsumed[type] || 0) + actual;
        this.totalConsumed[type] = (this.totalConsumed[type] || 0) + actual;
        return actual;
    }

    /** 直接设置资源值（存档恢复用） */
    setResource(type, value) {
        if (this[type] !== undefined) {
            this[type] = Math.max(0, value);
        }
    }

    /**
     * 【v2.1】NPC进入食堂时触发的个人进食逻辑
     * 消耗食物并恢复饱腹值（食物消耗不受天气影响）
     * @param {object} npc - NPC对象
     * @returns {boolean} 是否成功进食
     */
    npcEatAtKitchen(npc) {
        if (!npc || npc.isDead) return false;
        // 饱腹度>70时不需要额外进食
        if ((npc.hunger || 50) >= 70) return false;
        // 5分钟内同一NPC不能重复进食（防刷）
        const now = Date.now();
        if (!this._lastEatTime) this._lastEatTime = {};
        if (this._lastEatTime[npc.id] && (now - this._lastEatTime[npc.id]) < 300000) return false;

        const needed = RESOURCE_CONSUMPTION.foodPerMealPerPerson; // 1.5
        const hungerBefore = npc.hunger || 50;
        if (this.food >= needed) {
            const consumed = this.consumeResource('food', needed, `${npc.name}在食堂进食`);
            npc.hunger = Math.min(100, (npc.hunger || 50) + 25);
            this._lastEatTime[npc.id] = now;
            if (this.game.addEvent) {
                this.game.addEvent(`🍽️ ${npc.name}在食堂吃了东西（-${Math.round(consumed)}食物，饱腹+25→${Math.round(npc.hunger)}，剩余${Math.round(this.food)}）`);
            }
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('EAT', `${npc.name} 进食: hunger ${Math.round(hungerBefore)}→${Math.round(npc.hunger)}, -${Math.round(consumed)}食物, 剩余${Math.round(this.food)}`);
            }
            return true;
        } else if (this.food > 0) {
            const available = this.food;
            const ratio = available / needed;
            const consumed = this.consumeResource('food', available, `${npc.name}在食堂进食(不足)`);
            npc.hunger = Math.min(100, (npc.hunger || 50) + Math.round(25 * ratio));
            this._lastEatTime[npc.id] = now;
            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ ${npc.name}在食堂但食物不够（-${Math.round(consumed)}食物，饱腹+${Math.round(25 * ratio)}）`);
            }
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('EAT', `${npc.name} 进食(不足): hunger ${Math.round(hungerBefore)}→${Math.round(npc.hunger)}, -${Math.round(consumed)}食物, 食物耗尽`);
            }
            return true;
        }
        // 没有食物
        if (this.game.addEvent) {
            this.game.addEvent(`⚠️ ${npc.name}到食堂却发现没有食物了！`);
        }
        if (this.game.aiModeLogger) {
            this.game.aiModeLogger.log('EAT', `${npc.name} 到食堂但无食物, hunger:${Math.round(npc.hunger)}`);
        }
        return false;
    }

    // ============ 主更新循环 ============

    /** 在game.update()中调用 */
    update(gameDt) {
        // 【修复】累积游戏秒而非实际秒，确保资源消耗与游戏时间同步
        const gameSeconds = gameDt * (this.game.timeSpeed || 60);
        this._consumptionTick += gameSeconds;

        // 每游戏秒执行一次消耗
        if (this._consumptionTick >= 1.0) {
            const elapsed = this._consumptionTick;
            this._consumptionTick = 0;
            this._tickConsumption(elapsed);
        }

        // 用餐时间检测
        this._checkMealTime();

        // 危机状态更新
        this._updateCrisisFlags(gameDt);
    }

    /** 每秒消耗tick */
    _tickConsumption(dt) {
        const hourFraction = dt / 3600; // 转为小时比例

        // 【v2.0】获取天气消耗乘数
        const weatherMult = this._getWeatherConsumptionMult();

        // 【v4.1】存活人数缩减系数：人少了，需要供暖/用电的区域缩小
        // 公式：max(0.3, aliveCount / totalCount)，最低保底30%（空房间仍有基础维护消耗）
        const totalNpcCount = this.game.npcs ? this.game.npcs.length : 8;
        const aliveNpcCount = this.game.npcs ? this.game.npcs.filter(n => !n.isDead).length : 8;
        const populationRatio = Math.max(0.3, aliveNpcCount / totalNpcCount);

        // 1) 暖炉消耗木柴（通过FurnaceSystem管理），应用天气乘数
        const furnaceSystem = this.game.furnaceSystem;
        if (furnaceSystem) {
            const activeFurnaces = furnaceSystem.getActiveFurnaceCount();
            if (activeFurnaces > 0) {
                const baseWood = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * activeFurnaces * hourFraction;
                // 【难度系统】木柴消耗乘以难度倍率
                const diffConsWood = this.game.getDifficultyMult ? this.game.getDifficultyMult('consumptionMult') : null;
                const diffWoodMult = (diffConsWood && diffConsWood.wood) ? diffConsWood.wood : 1.0;
                let woodNeeded = baseWood * weatherMult.wood * diffWoodMult * populationRatio; // 【v4.1】人少消耗降低

                // 维护暖炉已移除（v4.13: 暖炉是被动系统，自动燃烧消耗木柴，不需要人维护）

                // 【仓库管理】有NPC在执行reduce_waste效果时，木柴浪费减少10%
                if (this.game._woodWasteReduction) {
                    woodNeeded *= 0.9;
                    this.game._woodWasteReduction = false;
                }

                // 【v2.1电力与木柴联动】有电时省柴20%，无电时耗柴+30%
                if (this.power > 0) {
                    woodNeeded *= 0.8; // 有电：电加热辅助，省柴20%
                } else {
                    woodNeeded *= 1.3; // 无电：纯靠烧柴，耗柴+30%
                }

                const consumed = this.consumeResource('woodFuel', woodNeeded, '暖炉消耗');

                // 如果木柴不够，通知暖炉系统
                if (consumed < woodNeeded && this.woodFuel <= 0) {
                    furnaceSystem.onFuelDepleted();
                }
            }
        }

        // 2) 发电机消耗电力，应用天气乘数 + 人口缩减系数
        const basePower = RESOURCE_CONSUMPTION.powerPerHour * hourFraction;
        // 【难度系统】电力消耗乘以难度倍率
        const diffConsPower = this.game.getDifficultyMult ? this.game.getDifficultyMult('consumptionMult') : null;
        const diffPowerMult = (diffConsPower && diffConsPower.power) ? diffConsPower.power : 1.0;
        const powerNeeded = basePower * weatherMult.power * diffPowerMult * populationRatio; // 【v4.1】人少消耗降低
        this.consumeResource('power', powerNeeded, '发电机');
    }

    // ============ 【v2.0】天气消耗乘数系统 ============

    /**
     * 【v2.1重构】基于实时温度的连续消耗乘数
     * 不再按天硬编码，改为根据getEffectiveTemp()动态计算
     * 温度越低，木柴和电力消耗越高；食物消耗不受温度影响（寒冷天不需要多吃）
     * 计算公式：
     *   木柴乘数 = 1.0 + max(0, -temp) * 0.04 （0°C=1.0, -30°C=2.2, -60°C=3.4）
     *   电力乘数 = 1.0 + max(0, -temp) * 0.02 （0°C=1.0, -30°C=1.6, -60°C=2.2）
     *   食物乘数 = 1.0 （不受温度影响）
     */
    _getWeatherConsumptionMult() {
        // 【v2.1】每次都基于实时温度重新计算，不再按天缓存
        const ws = this.game.weatherSystem;
        let temp = 0;
        if (ws && ws.getEffectiveTemp) {
            temp = ws.getEffectiveTemp();
        }

        // 温度越低，消耗越高（连续函数，不再阶梯式）
        const coldFactor = Math.max(0, -temp); // 0°C以上为0
        const woodMult = Math.max(0.5, 1.0 + coldFactor * 0.04); // -30°C→2.2, -60°C→3.4, 0°C以上最低0.5
        const powerMult = Math.max(0.7, 1.0 + coldFactor * 0.02); // -30°C→1.6, -60°C→2.2
        const foodMult = 1.0; // 食物消耗不受温度影响

        this._weatherConsumptionMult = { wood: woodMult, power: powerMult, food: foodMult };

        // 每天只输出一次日志（避免刷屏）
        const day = this.game.dayCount || 1;
        if (this._lastWeatherMultDay !== day) {
            this._lastWeatherMultDay = day;
            console.log(`[ResourceSystem-天气乘数] 第${day}天 实时温度${temp}°C: 木柴消耗×${woodMult.toFixed(2)}, 电力消耗×${powerMult.toFixed(2)}, 食物消耗×${foodMult}`);
        }
        return this._weatherConsumptionMult;
    }

    /**
     * 【v2.0】天气变化时刷新消耗乘数并通知玩家
     * 在weather-system.js的onDayChange()中调用
     */
    onWeatherChange(newDay) {
        // 强制刷新缓存
        this._lastWeatherMultDay = 0;
        const mult = this._getWeatherConsumptionMult();

        // 向事件日志发送天气消耗变化提示
        if (this.game.addEvent) {
            const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.getActiveFurnaceCount() : 1;
            const baseWoodPerHour = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount;
            const actualWoodPerHour = baseWoodPerHour * mult.wood;
            const basePowerPerHour = RESOURCE_CONSUMPTION.powerPerHour;
            const actualPowerPerHour = basePowerPerHour * mult.power;

            const foodMultInfo = mult.food > 1.0 ? `，食物消耗×${mult.food}` : '';
            if (mult.wood > 1.0) {
                this.game.addEvent(`🌡️❄️ 气温骤降，暖炉消耗增加！木柴消耗: ${actualWoodPerHour.toFixed(1)}/时（×${mult.wood}），电力消耗: ${actualPowerPerHour.toFixed(1)}/时（×${mult.power}）${foodMultInfo}`);
            } else if (mult.wood < 1.0) {
                this.game.addEvent(`🌡️☀️ 气温回升，暖炉消耗降低！木柴消耗: ${actualWoodPerHour.toFixed(1)}/时（×${mult.wood}），电力消耗: ${actualPowerPerHour.toFixed(1)}/时（×${mult.power}）${foodMultInfo}`);
            } else {
                this.game.addEvent(`🌡️ 天气变化，当前木柴消耗: ${actualWoodPerHour.toFixed(1)}/时，电力消耗: ${actualPowerPerHour.toFixed(1)}/时${foodMultInfo}`);
            }
        }
    }

    /** 检测用餐时间，分配食物 */
    _checkMealTime() {
        const hour = this.game.getHour();
        const day = this.game.dayCount;
        const key = `d${day}_h${hour}`;

        // 是否到了用餐时间
        if (!MEAL_HOURS.includes(hour)) return;
        if (this._mealServed[key]) return;
        this._mealServed[key] = true;

        // 计算需要的食物
        const aliveNPCs = this.game.npcs.filter(n => !n.isDead);
        let totalNeeded = aliveNPCs.length * RESOURCE_CONSUMPTION.foodPerMealPerPerson;

        // 【难度系统】食物消耗乘以难度倍率
        const diffConsFood = this.game.getDifficultyMult ? this.game.getDifficultyMult('consumptionMult') : null;
        const diffFoodMult = (diffConsFood && diffConsFood.food) ? diffConsFood.food : 1.0;
        totalNeeded *= diffFoodMult;

        // 【任务7】食物浪费减少：有人管理仓库/做饭时消耗量×0.8
        if (this.game._foodWasteReduction) {
            totalNeeded *= 0.8;
        }

        const mealName = hour <= 12 ? '早餐' : '晚餐';

        if (this.food >= totalNeeded) {
            // 食物充足，全员用餐
            const consumed = this.consumeResource('food', totalNeeded, mealName);
            for (const npc of aliveNPCs) {
                npc.hunger = Math.min(100, (npc.hunger || 50) + 30);
                // 更新目标追踪
                if (npc._goalTrackers) {
                    npc._goalTrackers.mealsToday = (npc._goalTrackers.mealsToday || 0) + 1;
                }
            }
            if (this.game.addEvent) {
                this.game.addEvent(`🍞 ${mealName}：消耗食物${Math.round(consumed)}单位，人均恢复30饱腹（剩余${Math.round(this.food)}）`);
            }
            // AI模式日志：全员用餐充足
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('EAT', `${mealName} 全员${aliveNPCs.length}人用餐: 消耗${Math.round(consumed)}, 人均饱腹+30, 剩余食物${Math.round(this.food)}`);
            }
        } else if (this.food > 0) {
            // 【任务7】食物不足时按比例分配
            const ratio = this.food / totalNeeded;
            const consumed = this.consumeResource('food', this.food, `${mealName}(不足)`);
            const hungerRecovery = Math.round(30 * ratio);
            for (const npc of aliveNPCs) {
                npc.hunger = Math.min(100, (npc.hunger || 50) + hungerRecovery);
                if (npc._goalTrackers) {
                    npc._goalTrackers.mealsToday = (npc._goalTrackers.mealsToday || 0) + 1;
                }
            }
            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ ${mealName}食物不足！按比例分配，人均恢复${hungerRecovery}饱腹（食物已耗尽）`);
            }
            // AI模式日志：食物不足用餐
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('EAT', `${mealName} 食物不足! ${aliveNPCs.length}人按比例分配: 消耗${Math.round(consumed)}, 人均饱腹+${hungerRecovery}, 食物耗尽`);
            }
        } else {
            // 完全没有食物
            for (const npc of aliveNPCs) {
                npc.hunger = Math.max(0, (npc.hunger || 50) - 15);
            }
            if (this.game.addEvent) {
                this.game.addEvent(`⚠️ 食物耗尽，全镇断粮！所有人饱腹-15`);
            }
            // AI模式日志：断粮
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('EAT', `${mealName} 断粮! ${aliveNPCs.length}人无食物可吃, 全员饱腹-15`);
            }
        }
    }

    /** 更新危机状态 */
    _updateCrisisFlags(gameDt) {
        const oldFlags = { ...this.crisisFlags };
        // 【修复】将实际秒转换为游戏秒，用于危机持续时间和惩罚计算
        const gameSeconds = gameDt * (this.game.timeSpeed || 60);

        this.crisisFlags.noFood = this.food <= 0;
        // 【修复】电力状态使用滞后阈值，避免在0附近反复震荡触发耗尽/恢复事件
        // 耗尽条件：power <= 0；恢复条件：power > 2（需要积累一定余量才算恢复）
        if (this.power <= 0) {
            this.crisisFlags.noPower = true;
        } else if (this.power > 2) {
            this.crisisFlags.noPower = false;
        }
        // noPower 在 0~2 之间保持原状态不变（hysteresis）
        this.crisisFlags.noWoodFuel = this.woodFuel <= 0;

        // 食物危机：食物为0且有NPC在饥饿
        if (this.crisisFlags.noFood) {
            // AI模式日志：食物耗尽危机
            if (!oldFlags.noFood && this.game.aiModeLogger) {
                const aliveCount = this.game.npcs.filter(n => !n.isDead).length;
                this.game.aiModeLogger.log('RESOURCE_CRISIS', `食物耗尽! 存活${aliveCount}人面临饥饿危机`);
            }
            this._hungerCrisisDuration += gameSeconds;
            this.crisisFlags.hungerCrisis = true;

            // 饥饿伤害：无食物时NPC属性持续下降（按游戏秒计算）
            if (this._hungerCrisisDuration > 0) {
                for (const npc of this.game.npcs) {
                    if (npc.isDead) continue;
                    // 饥饿衰减：体力-0.2/游戏秒、健康-0.1/游戏秒、San-0.1/游戏秒
                    npc.stamina = Math.max(0, npc.stamina - 0.2 * gameSeconds);
                    npc.health = Math.max(0, npc.health - 0.1 * gameSeconds);
                    npc.sanity = Math.max(0, npc.sanity - 0.1 * gameSeconds);
                    // 饥饿值加速下降（2倍）
                    npc.hunger = Math.max(0, (npc.hunger || 0) - 0.2 * gameSeconds);
                }
            }

            // 持续无食物超过6游戏小时（6*3600=21600游戏秒）→ NPC饿死
            if (this._hungerCrisisDuration >= 21600) {
                for (const npc of this.game.npcs) {
                    if (npc.isDead) continue;
                    if (npc.hunger <= 0 && npc.health <= 10) {
                        npc.health = 0;
                        // 标记死因（由死亡系统处理具体逻辑）
                        npc._deathCause = '饿死';
                        console.log(`[ResourceSystem] ${npc.name} 因长期饥饿而死亡`);
                    }
                }
            }
        } else {
            this._hungerCrisisDuration = 0;
            this.crisisFlags.hungerCrisis = false;
        }

        // 【v2.1】电力耗尽 → 暖炉耗柴+30%、医疗效率减半、夜间San下降×2
        // 【修复】加冷却时间（60秒真实时间），避免短时间内重复刷屏
        const now = Date.now();
        if (this.crisisFlags.noPower && !oldFlags.noPower) {
            if (!this._lastPowerOutTime || now - this._lastPowerOutTime > 60000) {
                this._lastPowerOutTime = now;
                if (this.game.addEvent) {
                    this.game.addEvent(`🚨 电力耗尽！暖炉耗柴增加30%！医疗效率减半！夜间更加恐惧！`);
                }
                if (this.game.aiModeLogger) {
                    this.game.aiModeLogger.log('RESOURCE_CRISIS', `电力耗尽! 暖炉耗柴+30%,医疗效率×0.5,夜间San×2`);
                }
            }
        }
        // 电力恢复通知
        if (!this.crisisFlags.noPower && oldFlags.noPower) {
            if (!this._lastPowerRestoreTime || now - this._lastPowerRestoreTime > 60000) {
                this._lastPowerRestoreTime = now;
                if (this.game.addEvent) {
                    this.game.addEvent(`⚡ 电力恢复！暖炉省柴20%，医疗效率恢复，照明恢复`);
                }
            }
        }
        // 【v2.1】断电时夜间San加速下降×2（黑暗恐惧）
        if (this.crisisFlags.noPower) {
            const hour = this.game.getHour ? this.game.getHour() : 12;
            const isNight = hour < 6 || hour >= 16;
            if (isNight) {
                for (const npc of this.game.npcs) {
                    if (npc.isDead) continue;
                    // 断电夜间San下降×2（0.1/游戏秒，比之前0.05加倍）
                    npc.sanity = Math.max(0, npc.sanity - 0.1 * gameSeconds);
                }
            }
        }

        // 木柴耗尽 → 暖炉熄灭
        if (this.crisisFlags.noWoodFuel && !oldFlags.noWoodFuel) {
            if (this.game.addEvent) {
                this.game.addEvent(`🚨 木柴耗尽！暖炉即将熄灭！`);
            }
            // AI模式日志：木柴耗尽危机
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('RESOURCE_CRISIS', `木柴耗尽,暖炉熄灭! 当前食物:${this.food.toFixed(1)} 电力:${this.power.toFixed(1)}`);
            }
        }
    }

    // ============ 日结算 ============

    /** 生成日结算报告（在天数切换时调用） */
    generateDayReport(dayNum) {
        const ws = this.game.weatherSystem;
        const nextDay = dayNum + 1;
        const nextConfig = ws ? ws.getDayConfig(nextDay) : null;

        // 预估明日消耗（【v2.0】应用天气消耗乘数）
        const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.furnaces.length : 1;
        const aliveCount = this.game.npcs.filter(n => !n.isDead).length;

        // 获取明日天气乘数（含食物乘数）
        // 【v2.1】基于新的连续温度公式计算预估明日消耗
        let nextWoodMult = 1.0, nextPowerMult = 1.0, nextFoodMult = 1.0;
        if (nextConfig) {
            const nextTemp = nextConfig.baseTemp || 0;
            const coldFactor = Math.max(0, -nextTemp);
            nextWoodMult = Math.max(0.5, 1.0 + coldFactor * 0.04);
            nextPowerMult = Math.max(0.7, 1.0 + coldFactor * 0.02);
            nextFoodMult = 1.0; // 食物消耗不受温度影响
        }

        const popRatio = this.getPopulationRatio();
        const estimatedWood = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount * 24 * nextWoodMult * popRatio;
        const estimatedFood = aliveCount * RESOURCE_CONSUMPTION.foodPerMealPerPerson * RESOURCE_CONSUMPTION.mealsPerDay * nextFoodMult;
        const estimatedPower = RESOURCE_CONSUMPTION.powerPerHour * 24 * nextPowerMult * popRatio;

        const report = {
            day: dayNum,
            consumed: { ...this.dailyConsumed },
            collected: { ...this.dailyCollected },
            remaining: {
                woodFuel: Math.round(this.woodFuel),
                food: Math.round(this.food),
                power: Math.round(this.power),
            },
            aliveCount: aliveCount,
            nextDay: nextConfig ? {
                temp: nextConfig.baseTemp,
                weather: nextConfig.weather,
                desc: nextConfig.desc,
            } : null,
            estimated: {
                woodNeeded: Math.round(estimatedWood),
                foodNeeded: Math.round(estimatedFood),
                powerNeeded: Math.round(estimatedPower),
            },
            warnings: [],
        };

        // 【v2.0】今日收支平衡检查
        const resourceTypes = ['woodFuel', 'food', 'power'];
        const resourceNames = { woodFuel: '木柴', food: '食物', power: '电力' };
        const resourceIcons = { woodFuel: '🪵', food: '🍞', power: '⚡' };
        for (const rt of resourceTypes) {
            const collected = this.dailyCollected[rt] || 0;
            const consumed = this.dailyConsumed[rt] || 0;
            if (consumed > collected && consumed > 0) {
                const deficit = Math.round(consumed - collected);
                report.warnings.push(`📉 今日${resourceNames[rt]}收支不平衡：收集${Math.round(collected)} < 消耗${Math.round(consumed)}，缺口${deficit}单位`);
            }
        }

        // 生成预警
        if (nextConfig) {
            if (this.woodFuel < estimatedWood) {
                report.warnings.push(`⚠️ 木柴不足！明天需要${Math.round(estimatedWood)}单位，当前仅${Math.round(this.woodFuel)}单位`);
            }
            if (this.food < estimatedFood) {
                report.warnings.push(`⚠️ 食物不足！明天需要${Math.round(estimatedFood)}单位，当前仅${Math.round(this.food)}单位`);
            }
            if (this.power < estimatedPower) {
                report.warnings.push(`⚠️ 电力不足！明天需要${Math.round(estimatedPower)}单位，当前仅${Math.round(this.power)}单位`);
            }
            if (nextConfig.day === 4 && furnaceCount < 2) {
                report.warnings.push(`🚨 警告：第二座暖炉尚未修复！明天-60°C仅1座暖炉，8人拥挤将导致巨大压力！`);
            }

            // 【v2.0-需求10】第3天结束时显示第4天准备评估清单
            if (dayNum === 3) {
                const woodOk = this.woodFuel >= estimatedWood;
                const foodOk = this.food >= estimatedFood;
                const powerOk = this.power >= estimatedPower;
                const furnaceOk = furnaceCount >= 2;
                report.day4ReadinessCheck = {
                    wood: { ok: woodOk, current: Math.round(this.woodFuel), needed: Math.round(estimatedWood) },
                    food: { ok: foodOk, current: Math.round(this.food), needed: Math.round(estimatedFood) },
                    power: { ok: powerOk, current: Math.round(this.power), needed: Math.round(estimatedPower) },
                    furnace: { ok: furnaceOk, count: furnaceCount },
                };
                const checkIcon = (ok) => ok ? '✅' : '❌';
                report.warnings.push(`\n📋 第4天准备评估：`);
                report.warnings.push(`  🪵 木柴 ${checkIcon(woodOk)} （${Math.round(this.woodFuel)}/${Math.round(estimatedWood)}）`);
                report.warnings.push(`  🍞 食物 ${checkIcon(foodOk)} （${Math.round(this.food)}/${Math.round(estimatedFood)}）`);
                report.warnings.push(`  ⚡ 电力 ${checkIcon(powerOk)} （${Math.round(this.power)}/${Math.round(estimatedPower)}）`);
                report.warnings.push(`  🔥 暖炉 ${checkIcon(furnaceOk)} （${furnaceCount}座）`);
                if (!woodOk || !foodOk || !powerOk) {
                    report.warnings.push(`⚠️⚠️ 物资不足以度过明天的极寒暴风雪！必须紧急补充！`);
                }
            }
        }

        this.lastDayReport = report;

        // 重置每日统计 + 废墟探索次数重置
        this.dailyConsumed = { woodFuel: 0, food: 0, power: 0 };
        this.dailyCollected = { woodFuel: 0, food: 0, power: 0 };
        this.ruinsExploresToday = 0;

        return report;
    }

    /** 格式化日结算报告为可展示的文本 */
    formatDayReport(report) {
        if (!report) return '无报告数据';

        let text = `\n📋 ===== 第${report.day}天结算报告 =====\n`;
        text += `\n📦 资源剩余:\n`;
        text += `  🪵 木柴: ${report.remaining.woodFuel} 单位\n`;
        text += `  🍞 食物: ${report.remaining.food} 单位\n`;
        text += `  ⚡ 电力: ${report.remaining.power} 单位\n`;
        text += `\n📊 今日消耗/收集:\n`;
        text += `  🪵 木柴: -${Math.round(report.consumed.woodFuel)} / +${Math.round(report.collected.woodFuel)}\n`;
        text += `  🍞 食物: -${Math.round(report.consumed.food)} / +${Math.round(report.collected.food)}\n`;
        text += `  ⚡ 电力: -${Math.round(report.consumed.power)} / +${Math.round(report.collected.power)}\n`;
        text += `\n👥 存活人数: ${report.aliveCount}/8\n`;

        if (report.nextDay) {
            text += `\n🌡️ 明日预报: ${report.nextDay.temp}°C ${report.nextDay.weather}\n`;
            text += `  ${report.nextDay.desc}\n`;
            text += `\n📐 明日预估消耗:\n`;
            text += `  🪵 木柴: ~${report.estimated.woodNeeded} 单位\n`;
            text += `  🍞 食物: ~${report.estimated.foodNeeded} 单位\n`;
            text += `  ⚡ 电力: ~${report.estimated.powerNeeded} 单位\n`;
        }

        if (report.warnings.length > 0) {
            text += `\n🚨 预警:\n`;
            for (const w of report.warnings) {
                text += `  ${w}\n`;
            }
        }

        text += `\n===========================\n`;
        return text;
    }

    // ============ 查询接口 ============

    /** 获取资源摘要字符串 */
    getResourceSummary() {
        return `🪵${Math.round(this.woodFuel)} 🍞${Math.round(this.food)} ⚡${Math.round(this.power)}`;
    }

    /** 获取某种资源当前值 */
    getResource(type) {
        return this[type] || 0;
    }

    /** 食物是否够全员吃一顿 */
    hasFoodForOneMeal() {
        const aliveCount = this.game.npcs.filter(n => !n.isDead).length;
        return this.food >= aliveCount * RESOURCE_CONSUMPTION.foodPerMealPerPerson;
    }

    /** 获取食物够吃几餐 */
    getFoodMealsRemaining() {
        const aliveCount = this.game.npcs.filter(n => !n.isDead).length;
        if (aliveCount === 0) return Infinity;
        return Math.floor(this.food / (aliveCount * RESOURCE_CONSUMPTION.foodPerMealPerPerson));
    }

    /** 获取木柴够暖炉烧几小时 */
    getWoodFuelHoursRemaining() {
        const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.getActiveFurnaceCount() : 1;
        if (furnaceCount === 0) return Infinity;
        const hourly = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount * this.getPopulationRatio();
        return hourly > 0 ? this.woodFuel / hourly : 999;
    }

    /** 获取电力剩余小时 */
    getPowerHoursRemaining() {
        const hourly = RESOURCE_CONSUMPTION.powerPerHour * this.getPopulationRatio();
        return hourly > 0 ? this.power / hourly : 999;
    }

    /** 是否有任何资源危机 */
    hasAnyCrisis() {
        return this.crisisFlags.noFood || this.crisisFlags.noPower || this.crisisFlags.noWoodFuel;
    }

    /** 资源紧张程度（0~1，用于AI prompt紧迫感） */
    getResourceTension() {
        let tension = 0;
        // 食物紧张度
        if (this.food <= 0) tension += 0.4;
        else if (this.getFoodMealsRemaining() <= 1) tension += 0.3;
        else if (this.getFoodMealsRemaining() <= 3) tension += 0.1;
        // 木柴紧张度
        if (this.woodFuel <= 0) tension += 0.3;
        else if (this.getWoodFuelHoursRemaining() <= 4) tension += 0.2;
        else if (this.getWoodFuelHoursRemaining() <= 12) tension += 0.1;
        // 电力紧张度
        if (this.power <= 0) tension += 0.2;
        else if (this.getPowerHoursRemaining() <= 4) tension += 0.15;
        else if (this.getPowerHoursRemaining() <= 12) tension += 0.05;
        return Math.min(1, tension);
    }

    /** 获取资源状态详情（给AI prompt用） */
    getResourceStatusForPrompt() {
        const woodH = this.getWoodFuelHoursRemaining();
        const foodM = this.getFoodMealsRemaining();
        const powerH = this.getPowerHoursRemaining();

        let status = `木柴${Math.round(this.woodFuel)}(够烧${woodH === Infinity ? '∞' : Math.round(woodH)}h) `;
        status += `食物${Math.round(this.food)}(够吃${foodM === Infinity ? '∞' : foodM}餐) `;
        status += `电力${Math.round(this.power)}(剩${powerH === Infinity ? '∞' : Math.round(powerH)}h) `;
        status += `废墟探索(今日剩${RUINS_MAX_EXPLORES_PER_DAY - this.ruinsExploresToday}次)`;

        // 自动化机器状态
        if (this.game.machineSystem) {
            const ms = this.game.machineSystem;
            status += ` | ${ms.getMachineStatusForPrompt()}`;
        }

        if (this.hasAnyCrisis()) {
            status += ' ⚠️危机:';
            if (this.crisisFlags.noFood) status += '无食物!';
            if (this.crisisFlags.noPower) status += '无电力!';
            if (this.crisisFlags.noWoodFuel) status += '无木柴!';
        }

        return status;
    }

    /** 【v4.1】获取存活人口缩减系数（人少了消耗降低，最低30%） */
    getPopulationRatio() {
        const total = this.game.npcs ? this.game.npcs.length : 8;
        const alive = this.game.npcs ? this.game.npcs.filter(n => !n.isDead).length : 8;
        return Math.max(0.3, alive / total);
    }

    /** 【新增】获取木柴可烧小时数 */
    getWoodFuelHoursRemaining() {
        const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.getActiveFurnaceCount() : 1;
        const hourlyConsumption = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount * this.getPopulationRatio();
        return hourlyConsumption > 0 ? this.woodFuel / hourlyConsumption : 999;
    }

    /** 【新增】获取食物可供餐次 */
    getFoodMealsRemaining() {
        const aliveCount = this.game.npcs.filter(n => !n.isDead).length;
        const perMeal = RESOURCE_CONSUMPTION.foodPerMealPerPerson * aliveCount;
        return perMeal > 0 ? this.food / perMeal : 999;
    }

    /** 【新增】获取电力可用小时数 */
    getPowerHoursRemaining() {
        const hourly = RESOURCE_CONSUMPTION.powerPerHour * this.getPopulationRatio();
        return hourly > 0 ? this.power / hourly : 999;
    }

    /** 【新增】获取各资源的紧张等级 */
    getResourceUrgency() {
        const aliveCount = this.game.npcs.filter(n => !n.isDead).length;
        const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.getActiveFurnaceCount() : 1;

        // 每天消耗量估算（【v4.1】应用人口缩减系数）
        const popRatio = this.getPopulationRatio();
        const dailyWood = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount * 24 * popRatio;
        const dailyFood = aliveCount * RESOURCE_CONSUMPTION.foodPerMealPerPerson * RESOURCE_CONSUMPTION.mealsPerDay;
        const dailyPower = RESOURCE_CONSUMPTION.powerPerHour * 24 * popRatio;

        const woodHours = this.getWoodFuelHoursRemaining();
        const foodMeals = this.getFoodMealsRemaining();

        return {
            wood: woodHours <= 6 ? 'critical' : (this.woodFuel < dailyWood * 0.5 ? 'warning' : 'normal'),
            food: foodMeals <= 1 ? 'critical' : (this.food < dailyFood * 0.5 ? 'warning' : 'normal'),
            power: this.getPowerHoursRemaining() <= 6 ? 'critical' : (this.power < dailyPower * 0.5 ? 'warning' : 'normal'),

        };
    }

    /** 【新增】获取资源紧张提示（注入到NPC prompt中） */
    getUrgencyPrompt() {
        const urgency = this.getResourceUrgency();
        const alerts = [];

        // 收集各资源剩余时间，用于排序
        const resourceStatus = [];

        const woodHours = Math.round(this.getWoodFuelHoursRemaining());
        const powerHours = Math.round(this.getPowerHoursRemaining());
        const foodMeals = Math.round(this.getFoodMealsRemaining());

        if (urgency.wood === 'critical') {
            alerts.push(`🔴 木柴严重不足！仅够烧${woodHours}小时，必须立即安排砍柴！`);
            resourceStatus.push({ name: '木柴', hours: woodHours, level: 'critical' });
        } else if (urgency.wood === 'warning') {
            alerts.push(`🟡 木柴储备偏低（${Math.round(this.woodFuel)}单位，够烧${woodHours}h），需要增加砍柴力量。`);
            resourceStatus.push({ name: '木柴', hours: woodHours, level: 'warning' });
        }

        if (urgency.food === 'critical') {
            alerts.push(`🔴 食物不够下一顿饭！必须立即安排采集食物！`);
            resourceStatus.push({ name: '食物', hours: foodMeals * 12, level: 'critical' });
        } else if (urgency.food === 'warning') {
            alerts.push(`🟡 食物储备偏低（${Math.round(this.food)}单位，够吃${foodMeals}餐），需要增加食物采集。`);
            resourceStatus.push({ name: '食物', hours: foodMeals * 12, level: 'warning' });
        }

        if (urgency.power === 'critical') {
            alerts.push(`🔴 电力即将耗尽！仅剩${powerHours}小时！无电会导致暖炉耗柴+30%、医疗停摆、夜间恐惧加倍！`);
            resourceStatus.push({ name: '电力', hours: powerHours, level: 'critical' });
        } else if (urgency.power === 'warning') {
            alerts.push(`🟡 电力储备偏低（${Math.round(this.power)}单位，剩余${powerHours}h），需安排维护发电机。`);
            resourceStatus.push({ name: '电力', hours: powerHours, level: 'warning' });
        }

        if (alerts.length === 0) return '';

        // 按剩余时间排序，标注最紧急的资源
        resourceStatus.sort((a, b) => a.hours - b.hours);
        const mostUrgent = resourceStatus[0];
        if (mostUrgent) {
            alerts.push(`⚡ 当前最紧急：${mostUrgent.name}（仅剩${mostUrgent.hours}小时）！应优先解决${mostUrgent.name}问题！`);
        }

        return `\n【资源紧急警报】\n${alerts.join('\n')}`;
    }

    // ============ 物资消耗温度倍率计算 ============

    /**
     * 获取指定天数的木柴消耗倍率（温度越低消耗越高）
     * Day1(0°C): 1.0, Day2(-30°C): 1.8, Day3(0°C): 0.5, Day4(-60°C): 3.0
     * @param {number} dayNumber - 天数(1-4)
     * @returns {number} 木柴消耗倍率
     */
    _getWoodConsumptionMultiplier(dayNumber) {
        const multipliers = { 1: 1.0, 2: 1.8, 3: 0.5, 4: 3.0 };
        return multipliers[dayNumber] || 1.0;
    }

    /**
     * 获取指定天数的电力消耗倍率
     * Day1(0°C): 1.0, Day2(-30°C): 1.5, Day3(0°C): 0.7, Day4(-60°C): 2.0
     * @param {number} dayNumber - 天数(1-4)
     * @returns {number} 电力消耗倍率
     */
    _getPowerConsumptionMultiplier(dayNumber) {
        const multipliers = { 1: 1.0, 2: 1.5, 3: 0.7, 4: 2.0 };
        return multipliers[dayNumber] || 1.0;
    }

    /**
     * 【物资需求总览】生成从当前天到Day4的物资预估prompt
     * 分天列出木柴/食物/电力的消耗预估，汇总缺口，用emoji标注紧急程度
     * @returns {string} 物资需求总览文本，供注入LLM prompt
     */
    getResourceForecastForPrompt() {
        try {
            const currentDay = this.game.weatherSystem ? this.game.weatherSystem.currentDay : 1;
            const currentHour = this.game.getHour ? this.game.getHour() : 12;
            const furnaceCount = this.game.furnaceSystem ? this.game.furnaceSystem.getActiveFurnaceCount() : 1;
            const aliveCount = this.game.npcs ? this.game.npcs.filter(n => !n.isDead).length : 8;
            const totalCount = this.game.npcs ? this.game.npcs.length : 8;
            const popRatio = Math.max(0.3, aliveCount / totalCount); // 【v4.1】人口缩减系数

            const woodPerHour = RESOURCE_CONSUMPTION.woodPerFurnacePerHour * furnaceCount * popRatio;
            const foodPerDay = aliveCount * RESOURCE_CONSUMPTION.foodPerMealPerPerson * RESOURCE_CONSUMPTION.mealsPerDay;
            const powerPerHour = RESOURCE_CONSUMPTION.powerPerHour * popRatio;

            // 温度标签映射
            const tempLabels = { 1: '0°C', 2: '-30°C', 3: '0°C', 4: '-60°C' };
            const dayNames = { 1: '准备日', 2: '寒冷天', 3: '喘息日', 4: '大极寒' };

            const lines = ['【物资需求总览】'];
            let totalWood = 0, totalFood = 0, totalPower = 0;

            for (let day = currentDay; day <= 4; day++) {
                // 【v2.1】使用连续温度公式计算乘数
                const ws = this.game.weatherSystem;
                const dayConfig = ws ? ws.getDayConfig(day) : null;
                const dayTemp = dayConfig ? dayConfig.baseTemp : 0;
                const coldFactor = Math.max(0, -dayTemp);
                const woodMult = Math.max(0.5, 1.0 + coldFactor * 0.04);
                const powerMult = Math.max(0.7, 1.0 + coldFactor * 0.02);
                const foodMult = 1.0; // 食物消耗不受温度影响

                let hours;
                if (day === currentDay) {
                    // 当天剩余小时数（从当前小时到24点）
                    hours = Math.max(1, 24 - currentHour);
                } else {
                    hours = 24;
                }

                const dayWood = Math.round(woodPerHour * hours * woodMult);
                const dayFood = day === currentDay ? Math.round(foodPerDay * (hours / 24)) : Math.round(foodPerDay);
                const dayPower = Math.round(powerPerHour * hours * powerMult);

                totalWood += dayWood;
                totalFood += dayFood;
                totalPower += dayPower;

                const label = day === currentDay ? `今天(Day${day})剩余` : `Day${day}(${dayNames[day]})`;
                const tempNote = tempLabels[day] || '';
                const multNote = woodMult > 1 ? `(${tempNote},暖炉消耗×${woodMult.toFixed(1)},电力×${powerMult.toFixed(1)})` : `(${tempNote})`;
                lines.push(`  ${label}: 木柴~${dayWood} 食物~${dayFood} 电力~${dayPower} ${multNote}`);
            }

            // 汇总
            lines.push(`总计还需: 木柴~${totalWood} 食物~${totalFood} 电力~${totalPower}`);
            lines.push(`当前库存: 木柴${Math.round(this.woodFuel)} 食物${Math.round(this.food)} 电力${Math.round(this.power)}`);

            // 缺口计算与紧急标注
            const woodGap = Math.round(this.woodFuel) - totalWood;
            const foodGap = Math.round(this.food) - totalFood;
            const powerGap = Math.round(this.power) - totalPower;

            const gapItems = [];
            const statusIcon = (gap, total) => {
                if (gap < 0) return '🔴';
                if (gap < total * 0.2) return '🟡';
                return '✅';
            };

            gapItems.push(`${statusIcon(woodGap, totalWood)}木柴${woodGap >= 0 ? '+' : ''}${woodGap}`);
            gapItems.push(`${statusIcon(foodGap, totalFood)}食物${foodGap >= 0 ? '+' : ''}${foodGap}`);
            gapItems.push(`${statusIcon(powerGap, totalPower)}电力${powerGap >= 0 ? '+' : ''}${powerGap}`);
            lines.push(`缺口: ${gapItems.join(' ')}`);

            // 缓存缺口数据供getSupplyRecommendationPrompt使用
            this._lastForecastGaps = {
                wood: woodGap < 0 ? Math.abs(woodGap) : 0,
                food: foodGap < 0 ? Math.abs(foodGap) : 0,
                power: powerGap < 0 ? Math.abs(powerGap) : 0,
            };

            return '\n' + lines.join('\n');
        } catch (e) {
            console.error('[ResourceSystem] getResourceForecastForPrompt error:', e);
            return '';
        }
    }

    /**
     * 【补给建议】根据物资缺口生成角色-资源匹配建议prompt
     * 基于缺口数据和NPC专长，推荐最适合的NPC去采集对应资源
     * @returns {string} 补给建议文本，供注入LLM prompt
     */
    getSupplyRecommendationPrompt() {
        try {
            // 确保先调用getResourceForecastForPrompt()生成缺口数据
            if (!this._lastForecastGaps) {
                this.getResourceForecastForPrompt();
            }
            const gaps = this._lastForecastGaps || { wood: 0, food: 0, power: 0 };

            // 所有资源充足
            if (gaps.wood === 0 && gaps.food === 0 && gaps.power === 0) {
                return '\n【补给建议】物资充足，可专注其他工作。';
            }

            // NPC专长映射（内联，避免跨文件依赖）
            const NPC_RESOURCE_SKILLS = {
                'zhao_chef': { name: '赵铁柱', skills: { wood: 1.5, food: 1.3 } },
                'lu_chen': { name: '陆辰', skills: { wood: 1.3, food: 1.3, power: 1.2 } },
                'li_shen': { name: '李婶', skills: { food: 1.5 } },
                'wang_teacher': { name: '王策', skills: { power: 2.0 } },
                'old_qian': { name: '老钱', skills: { morale: 2.0 }, preferMorale: true },
                'su_doctor': { name: '苏岩', skills: {} },
                'ling_yue': { name: '歆玥', skills: { food: 1.2, power: 1.2 } },
                'qing_xuan': { name: '清璇', skills: { food: 1.1 } },
            };

            // 获取存活NPC列表及其状态
            const npcs = this.game.npcs || [];
            const availableNpcs = [];
            for (const npc of npcs) {
                const skillInfo = NPC_RESOURCE_SKILLS[npc.id];
                if (!skillInfo) continue;
                if (npc.isDead) continue;

                const isExhausted = (npc.stamina < 30 || npc.health < 30);
                availableNpcs.push({
                    id: npc.id,
                    name: skillInfo.name,
                    skills: skillInfo.skills,
                    preferMorale: skillInfo.preferMorale || false,
                    stamina: npc.stamina || 0,
                    isExhausted,
                });
            }

            const lines = ['【补给建议】'];

            // 计算各资源剩余可用时间（小时），用于紧急度排序
            const woodHoursLeft = this.getWoodFuelHoursRemaining();
            const powerHoursLeft = this.getPowerHoursRemaining();
            const foodMealsLeft = this.getFoodMealsRemaining();
            // 食物转换为等效小时数（每天2餐，每12小时1餐）
            const foodHoursLeft = foodMealsLeft * 12;

            // 资源缺口排序推荐
            const resourceNeeds = [];
            if (gaps.wood > 0) resourceNeeds.push({ type: 'wood', label: '木柴', gap: gaps.wood, skillKey: 'wood', hoursLeft: woodHoursLeft, urgencyNote: `当前够烧${Math.round(woodHoursLeft)}小时` });
            if (gaps.food > 0) resourceNeeds.push({ type: 'food', label: '食物', gap: gaps.food, skillKey: 'food', hoursLeft: foodHoursLeft, urgencyNote: `当前够吃${Math.round(foodMealsLeft)}餐` });
            if (gaps.power > 0) resourceNeeds.push({ type: 'power', label: '电力', gap: gaps.power, skillKey: 'power', hoursLeft: powerHoursLeft, urgencyNote: `当前仅剩${Math.round(powerHoursLeft)}小时` });

            // 【修复】按剩余可用小时数排序（越少越紧急），而非按缺口绝对值
            resourceNeeds.sort((a, b) => a.hoursLeft - b.hoursLeft);

            for (const need of resourceNeeds) {
                const icon = need.gap > 30 ? '🔴' : '🟡';

                // 按专长倍率排序推荐NPC
                const ranked = availableNpcs
                    .filter(n => !n.preferMorale) // 老钱优先安抚，不推荐去采集
                    .map(n => ({
                        name: n.name,
                        mult: n.skills[need.skillKey] || 1.0,
                        isExhausted: n.isExhausted,
                        stamina: n.stamina,
                    }))
                    .sort((a, b) => {
                        if (a.mult !== b.mult) return b.mult - a.mult;
                        return b.stamina - a.stamina;
                    });

                const recommendations = ranked.map(r => {
                    let tag = r.name;
                    if (r.mult > 1.0) tag += `(×${r.mult})`;
                    if (r.isExhausted) tag += '(不可用-需休息)';
                    return tag;
                }).join(' > ');

                const urgencyTag = need.hoursLeft <= 6 ? '⚠️紧急!' : need.hoursLeft <= 12 ? '注意' : '';
                lines.push(`${icon} ${need.label}缺口${need.gap}单位（${need.urgencyNote}${urgencyTag ? ',' + urgencyTag : ''}） → 推荐：${recommendations}`);
            }

            return '\n' + lines.join('\n');
        } catch (e) {
            console.error('[ResourceSystem] getSupplyRecommendationPrompt error:', e);
            return '';
        }
    }

    // ============ 电力效率加成系统 ============

    /**
     * 【v2.1重构】获取电力对设施工作效率的加成系数
     * @param {string} scene - NPC所在场景（workshop / medical）
     * @returns {number} 效率系数
     *   电力正常：workshop=1.2(+20%), medical=1.2(+20%)
     *   电力耗尽：workshop=0.7(-30%), medical=0.5(-50%，医疗设备停电)
     *   其他场景：1.0
     */
    getPowerEfficiencyBonus(scene) {
        // 只有工坊和医疗站受电力影响
        if (scene !== 'workshop' && scene !== 'medical') return 1.0;
        if (this.power <= 0) {
            // 【v2.1】无电时医疗效率减半（医疗设备需要电力）
            return scene === 'medical' ? 0.5 : 0.7;
        }
        if (this.power > 0) return 1.2;   // 电力正常：+20%加成
        return 1.0;
    }

    /**
     * 检测电力从耗尽恢复，触发事件通知
     * 在 addResource 中调用
     */
    _checkPowerRecovery(oldPower, newPower) {
        // 【修复】不再在addResource中重复触发恢复事件
        // 电力恢复事件统一由 _updateCrisisFlags 中的滞后阈值逻辑处理
        // 避免与crisisFlags检测形成 耗尽→恢复→耗尽 的死循环
    }

    // ============ 序列化 ============

    // ============ 废墟探索系统 ============

    /** 获取废墟今日剩余探索次数 */
    getRuinsExploresRemaining() {
        // 每天重置
        const day = this.game.dayCount || 1;
        if (this._ruinsExploreDay !== day) {
            this.ruinsExploresToday = 0;
            this._ruinsExploreDay = day;
        }
        return RUINS_MAX_EXPLORES_PER_DAY - this.ruinsExploresToday;
    }

    /** NPC执行废墟探索（由action-effects的explore_ruins调用） */
    performRuinsExploration(npc) {
        if (!npc || npc.isDead) return null;
        // 每天重置
        const day = this.game.dayCount || 1;
        if (this._ruinsExploreDay !== day) {
            this.ruinsExploresToday = 0;
            this._ruinsExploreDay = day;
        }
        if (this.ruinsExploresToday >= RUINS_MAX_EXPLORES_PER_DAY) {
            return { type: 'exhausted', name: '废墟已搜刮干净', amount: 0 };
        }

        // 加权随机抽取
        const totalWeight = RUINS_EXPLORE_POOL.reduce((s, r) => s + r.weight, 0);
        let roll = Math.random() * totalWeight;
        let result = RUINS_EXPLORE_POOL[RUINS_EXPLORE_POOL.length - 1]; // 默认最后一项
        for (const item of RUINS_EXPLORE_POOL) {
            roll -= item.weight;
            if (roll <= 0) {
                result = item;
                break;
            }
        }

        this.ruinsExploresToday++;
        const remaining = RUINS_MAX_EXPLORES_PER_DAY - this.ruinsExploresToday;

        // 应用探索结果
        switch (result.type) {
            case 'food':
            case 'woodFuel':
            case 'power':
                this.addResource(result.type, result.amount, `${npc.name}在废墟发现`);
                break;
            case 'medkit':
                this.game._medkitCount = (this.game._medkitCount || 0) + result.amount;
                if (this.game.addEvent) {
                    this.game.addEvent(`💊 ${npc.name}在废墟发现了${result.amount}份急救包！（共${this.game._medkitCount}份）`);
                }
                break;
            case 'sanBoost':
                for (const n of this.game.npcs) {
                    if (!n.isDead) n.sanity = Math.min(100, n.sanity + result.amount);
                }
                if (this.game.addEvent) {
                    this.game.addEvent(`📔 ${npc.name}在废墟发现了日记，温暖了大家的心灵（全员San+${result.amount}）`);
                }
                break;
            case 'nothing':
                if (this.game.addEvent) {
                    this.game.addEvent(`❌ ${npc.name}在废墟搜索了一番，一无所获（今日剩余${remaining}次）`);
                }
                break;
        }

        // AI模式日志
        if (this.game.aiModeLogger) {
            this.game.aiModeLogger.log('EXPLORE', `${npc.name} 探索废墟: ${result.name} (今日${this.ruinsExploresToday}/${RUINS_MAX_EXPLORES_PER_DAY})`);
        }

        console.log(`[ResourceSystem-废墟] ${npc.name} 探索结果: ${result.name}, 今日${this.ruinsExploresToday}/${RUINS_MAX_EXPLORES_PER_DAY}`);
        return result;
    }

    // ============ 序列化 ============

    serialize() {
        return {
            woodFuel: this.woodFuel,
            food: this.food,
            power: this.power,
            dailyConsumed: { ...this.dailyConsumed },
            dailyCollected: { ...this.dailyCollected },
            totalConsumed: { ...this.totalConsumed },
            totalCollected: { ...this.totalCollected },
            hungerCrisisDuration: this._hungerCrisisDuration,
            ruinsExploresToday: this.ruinsExploresToday,
        };
    }

    deserialize(data) {
        if (!data) return;
        this.woodFuel = data.woodFuel ?? RESOURCE_DEFAULTS.woodFuel;
        this.food = data.food ?? RESOURCE_DEFAULTS.food;
        this.power = data.power ?? RESOURCE_DEFAULTS.power;
        if (data.dailyConsumed) this.dailyConsumed = data.dailyConsumed;
        if (data.dailyCollected) this.dailyCollected = data.dailyCollected;
        if (data.totalConsumed) this.totalConsumed = data.totalConsumed;
        if (data.totalCollected) this.totalCollected = data.totalCollected;
        this._hungerCrisisDuration = data.hungerCrisisDuration || 0;
        this.ruinsExploresToday = data.ruinsExploresToday || 0;
    }
}

    GST.ResourceSystem = ResourceSystem;
})();
