/**
 * 天气系统 - 世界末日极寒生存
 * 管理4天温度周期、天气状态、户外寒冷伤害
 * 依赖: game.js
 */

// ============ 四天温度与天气配置 ============
const DAY_CONFIG = [
    // Day 1: 准备日
    {
        day: 1,
        baseTemp: 0,
        weather: '阴天',
        weatherEmoji: '☁️',
        desc: '准备日 — 收集物资、修整设备',
        outdoorTimeLimit: Infinity, // 无限制
        canGoOutside: true,
        nightTempDrop: -5,
        announcement: '⚠️ 末日降临！气温0°C，趁现在赶紧准备物资！',
    },
    // Day 2: 寒冷天
    {
        day: 2,
        baseTemp: -30,
        weather: '大雪',
        weatherEmoji: '🌨️',
        desc: '寒冷天 — 户外活动严格限制2小时',
        outdoorTimeLimit: 2 * 3600, // 2小时（游戏秒）
        canGoOutside: true,
        nightTempDrop: -5,
        announcement: '⚠️ 极寒来袭！气温-30°C，大雪！户外活动严格限制2小时！',
    },
    // Day 3: 喘息日
    {
        day: 3,
        baseTemp: 0,
        weather: '多云',
        weatherEmoji: '⛅',
        desc: '喘息日 — 补充物资、修建第二座暖炉',
        outdoorTimeLimit: Infinity,
        canGoOutside: true,
        nightTempDrop: -5,
        announcement: '🌤️ 气温回升至0°C！抓紧补充物资，修建第二座暖炉！',
    },
    // Day 4: 大极寒
    {
        day: 4,
        baseTemp: -60,
        weather: '极寒暴风雪',
        weatherEmoji: '🥶',
        desc: '大极寒 — 严禁外出！靠室内物资取暖保障',
        outdoorTimeLimit: 0, // 完全禁止
        canGoOutside: false,
        nightTempDrop: -10,
        announcement: '🚨🚨 大极寒！-60°C！严禁外出！一切靠室内物资！',
    },
];

class WeatherSystem {
    constructor(game) {
        this.game = game;
        this.currentDay = 1;
        this.currentTemp = 0;
        this.currentWeather = '阴天';
        this.weatherEmoji = '☁️';
        this.dayConfig = DAY_CONFIG[0];

        // 冬季白天时间: 6:00 ~ 16:00
        this.dawnHour = 6;
        this.duskHour = 16;

        // 户外NPC的累计户外时间追踪 { npcId: seconds }
        this.outdoorTime = {};

        // 雪花粒子系统
        this.snowParticles = [];
        this.maxSnowParticles = 0;
        this.windOffset = 0;

        // 暴风雪视觉效果
        this.blizzardAlpha = 0; // 白色遮罩透明度
        this.visibilityFactor = 1.0; // 能见度因子 0~1

        // 寒冷伤害tick间隔（每游戏秒执行一次）
        this._coldDamageTick = 0;
    }

    /** 获取当天配置 */
    getDayConfig(day) {
        const idx = Math.max(0, Math.min(day - 1, DAY_CONFIG.length - 1));
        return DAY_CONFIG[idx];
    }

    /** 当天数切换时调用 */
    onDayChange(newDay) {
        this.currentDay = newDay;
        this.dayConfig = this.getDayConfig(newDay);
        this.currentTemp = this.dayConfig.baseTemp;
        this.currentWeather = this.dayConfig.weather;
        this.weatherEmoji = this.dayConfig.weatherEmoji;

        // 【难度系统】应用温度偏移
        if (this.game && this.game.difficulty && this.game.difficulty.tempOffset) {
            this.currentTemp -= this.game.difficulty.tempOffset;
            console.log(`[WeatherSystem-难度] 温度偏移-${this.game.difficulty.tempOffset}°C, 实际基础温度: ${this.currentTemp}°C`);
        }

        // 【难度系统】户外时间限制缩减
        if (this.game && this.game.difficulty && this.game.difficulty.outdoorTimePenalty > 0) {
            const penalty = this.game.difficulty.outdoorTimePenalty;
            if (this.dayConfig.outdoorTimeLimit !== Infinity && this.dayConfig.outdoorTimeLimit > 0) {
                this.dayConfig = { ...this.dayConfig, outdoorTimeLimit: Math.max(600, this.dayConfig.outdoorTimeLimit - penalty) };
                console.log(`[WeatherSystem-难度] 户外时间限制缩减${penalty}秒, 实际限制: ${this.dayConfig.outdoorTimeLimit}秒`);
            }
        }

        // 【修复】同步到game.weather，确保全局一致
        if (this.game) {
            this.game.weather = this.currentWeather;
        }

        // 重置户外时间追踪
        this.outdoorTime = {};

        // 更新雪花粒子数量
        this._updateSnowConfig();

        // 弹出公告
        if (this.game.addEvent) {
            this.game.addEvent(this.dayConfig.announcement);

            // 【物资消耗预警】在天气播报后追加物资预估
            if (this.game.resourceSystem && this.game.resourceSystem.getResourceForecastForPrompt) {
                const forecast = this.game.resourceSystem.getResourceForecastForPrompt();
                if (forecast) {
                    this.game.addEvent(`📊 ${forecast.trim()}`);
                }
            }

            // 补给窗口/极寒提示
            if (newDay === 1 || newDay === 3) {
                this.game.addEvent('📦 补给窗口！建议全员全力采集物资为后续极寒做准备！');
            } else if (newDay === 2 || newDay === 4) {
                this.game.addEvent('❄️ 极寒天气！木柴消耗将大幅增加，请确保储备充足！');
            }
        }

        console.log(`[WeatherSystem] 第${newDay}天开始: ${this.currentTemp}°C, ${this.currentWeather}`);

        // 【v2.0】通知资源系统天气变化，刷新消耗乘数
        if (this.game.resourceSystem && this.game.resourceSystem.onWeatherChange) {
            this.game.resourceSystem.onWeatherChange(newDay);
        }

        // 【第3天喘息日恢复加成】
        if (newDay === 3) {
            this.game._day3RecoveryBoost = true;
            // 所有存活NPC的San值+15（士气回升）
            for (const npc of this.game.npcs) {
                if (npc.isDead) continue;
                npc.sanity = Math.min(100, npc.sanity + 15);
            }
            if (this.game.addEvent) {
                this.game.addEvent(`🌤️ 第3天喘息日开始！天气转好，全员士气回升（San+15），暖炉旁恢复速率×1.5`);
            }
            // 健康<30的NPC自动安排休息任务
            if (this.game.taskSystem) {
                for (const npc of this.game.npcs) {
                    if (npc.isDead) continue;
                    if (npc.health < 30) {
                        if (this.game.addEvent) {
                            this.game.addEvent(`🛏️ ${npc.name}身体虚弱（健康:${Math.round(npc.health)}），第3天优先休息恢复`);
                        }
                    }
                }
            }
            console.log(`[WeatherSystem] 第3天喘息日恢复加成已激活`);
        } else {
            this.game._day3RecoveryBoost = false;
        }
    }

    /** 根据当前小时计算实际温度（夜间额外降温 + 难度温度偏移） */
    getEffectiveTemp() {
        const hour = this.game.getHour();
        const isNight = hour < this.dawnHour || hour >= this.duskHour;
        let temp = this.currentTemp + (isNight ? this.dayConfig.nightTempDrop : 0);
        // 【难度系统】温度偏移：高难度下温度额外降低
        if (this.game && this.game.difficulty && this.game.difficulty.tempOffset) {
            temp -= this.game.difficulty.tempOffset;
        }
        return temp;
    }

    /** 是否为白天 */
    isDaytime() {
        const hour = this.game.getHour();
        return hour >= this.dawnHour && hour < this.duskHour;
    }

    /** 是否允许外出 */
    canGoOutside() {
        return this.dayConfig.canGoOutside;
    }

    /** NPC是否超时在户外 */
    isOutdoorTimeExceeded(npcId) {
        if (this.dayConfig.outdoorTimeLimit === Infinity) return false;
        if (this.dayConfig.outdoorTimeLimit === 0) return true;
        const time = this.outdoorTime[npcId] || 0;
        return time >= this.dayConfig.outdoorTimeLimit;
    }

    /** 获取NPC户外剩余时间（秒） */
    getOutdoorTimeRemaining(npcId) {
        if (this.dayConfig.outdoorTimeLimit === Infinity) return Infinity;
        const time = this.outdoorTime[npcId] || 0;
        return Math.max(0, this.dayConfig.outdoorTimeLimit - time);
    }

    /** 主更新循环 - 在game.update()中调用 */
    update(gameDt) {
        const temp = this.getEffectiveTemp();
        this.currentTemp = this.dayConfig.baseTemp; // 保持基础温度记录

        // 更新户外NPC的累计时间和施加寒冷伤害
        this._coldDamageTick += gameDt;
        if (this._coldDamageTick >= 1.0) { // 每游戏秒检查一次
            this._coldDamageTick -= 1.0;
            this._applyOutdoorEffects(temp, 1.0);
        }

        // 更新雪花粒子
        this._updateSnowParticles(gameDt);
    }

    /** 户外寒冷效果 */
    _applyOutdoorEffects(temp, dt) {
        // 【v2.1】风寒效应加成：大雪/暴风雪时属性衰减×1.3
        const windChillMult = (this.currentWeather === '大雪' || this.currentWeather === '极寒暴风雪') ? 1.3 : 1.0;

        for (const npc of this.game.npcs) {
            if (npc.isDead) continue;

            const isOutdoor = npc.currentScene === 'village';

            if (isOutdoor) {
                // 累计户外时间
                this.outdoorTime[npc.id] = (this.outdoorTime[npc.id] || 0) + dt;

                // 体温下降（不受风寒属性加成影响，体温有独立的风寒逻辑）
                if (temp < 0 && npc.bodyTemp !== undefined) {
                    // 【v2.1】体温下降速率提升: -30°C时约-0.45°C/分钟, -60°C时约-0.9°C/分钟
                    const dropRate = Math.abs(temp) * 0.00025 * dt;
                    npc.bodyTemp = Math.max(25, npc.bodyTemp - dropRate);
                }

                // 【v2.1】梯度衰减层：温度<0°C时，越冷衰减越大
                if (temp < 0) {
                    const baseFactor = Math.abs(temp) / 30; // -30°C=1.0, -60°C=2.0
                    let gradStamina = 0.15 * baseFactor * dt;
                    let gradHealth = 0.10 * baseFactor * dt;
                    let gradSan = 0.08 * baseFactor * dt;
                    // 应用风寒加成
                    gradStamina *= windChillMult;
                    gradHealth *= windChillMult;
                    gradSan *= windChillMult;
                    npc.stamina = Math.max(0, npc.stamina - gradStamina);
                    npc.health = Math.max(0, npc.health - gradHealth);
                    npc.sanity = Math.max(0, npc.sanity - gradSan);
                }

                // 【v2.1】-20°C~0°C 轻度衰减（之前此区间无惩罚）
                if (temp < 0 && temp >= -20) {
                    let lightStamina = 0.05 * (Math.abs(temp) / 20) * dt;
                    lightStamina *= windChillMult;
                    npc.stamina = Math.max(0, npc.stamina - lightStamina);
                }

                // 寒冷伤害 Tier 1: 温度 < -20°C（【v2.1】数值强化）
                if (temp < -20) {
                    let staminaDrain = 0.5 * dt;
                    let healthDrain = 0.35 * dt;
                    let sanDrain = 0.25 * dt;
                    // 应用风寒加成
                    staminaDrain *= windChillMult;
                    healthDrain *= windChillMult;
                    sanDrain *= windChillMult;
                    npc.stamina = Math.max(0, npc.stamina - staminaDrain);
                    npc.health = Math.max(0, npc.health - healthDrain);
                    npc.sanity = Math.max(0, npc.sanity - sanDrain);
                }

                // 寒冷伤害 Tier 2: 温度 < -50°C (致命)（【v2.1】数值强化+新增San衰减）
                if (temp < -50) {
                    let staminaDrain = 1.5 * dt;
                    let healthDrain = 1.2 * dt;
                    let sanDrain = 0.4 * dt;
                    // 应用风寒加成
                    staminaDrain *= windChillMult;
                    healthDrain *= windChillMult;
                    sanDrain *= windChillMult;
                    npc.stamina = Math.max(0, npc.stamina - staminaDrain);
                    npc.health = Math.max(0, npc.health - healthDrain);
                    npc.sanity = Math.max(0, npc.sanity - sanDrain);
                }

                // 第2天: 户外超过2小时严重冻伤
                if (this.currentDay === 2 && this.isOutdoorTimeExceeded(npc.id)) {
                    npc.stamina = Math.max(0, npc.stamina - 0.5 * dt);
                    npc.health = Math.max(0, npc.health - 0.3 * dt);
                }
            } else {
                // 室内时重置户外累计时间（休息恢复）
                if (this.outdoorTime[npc.id] > 0) {
                    this.outdoorTime[npc.id] = Math.max(0, (this.outdoorTime[npc.id] || 0) - dt * 2);
                }

                // 【v2.1】暖炉熄灭时室内低强度寒冷惩罚
                if (temp < -20) {
                    const fs = this.game.furnaceSystem;
                    if (fs) {
                        const nearFurnace = fs.isNearActiveFurnace(npc);
                        if (!nearFurnace) {
                            // 暖炉未运行，检查冷却进度
                            // 找到NPC所在场景的暖炉（可能正在冷却）
                            const coolingFurnace = fs.furnaces.find(f => !f.active && f._coolingTimer > 0);
                            let coolingProgress = 1.0; // 默认完全冷却，施加满额惩罚
                            if (coolingFurnace) {
                                // 刚熄灭时惩罚=0%，完全冷却后惩罚=100%
                                const cooldownTotal = 30 * 60; // cooldownMinutes=30，转为秒
                                coolingProgress = 1 - Math.max(0, coolingFurnace._coolingTimer) / cooldownTotal;
                            }
                            // 低强度惩罚（约户外的1/10）
                            npc.stamina = Math.max(0, npc.stamina - 0.03 * coolingProgress * dt);
                            npc.health = Math.max(0, npc.health - 0.02 * coolingProgress * dt);
                            npc.sanity = Math.max(0, npc.sanity - 0.01 * coolingProgress * dt);
                        }
                    }
                }
            }
        }
    }

    /** 更新雪花配置 */
    _updateSnowConfig() {
        const temp = this.dayConfig.baseTemp;
        if (this.currentWeather === '极寒暴风雪') {
            this.maxSnowParticles = 500;
            this.windOffset = 3;
            this.blizzardAlpha = 0.6;
            this.visibilityFactor = 0.15;
        } else if (this.currentWeather === '大雪') {
            this.maxSnowParticles = 300;
            this.windOffset = 1.5;
            this.blizzardAlpha = 0.2;
            this.visibilityFactor = 0.5;
        } else if (temp < -20) {
            this.maxSnowParticles = 200;
            this.windOffset = 1;
            this.blizzardAlpha = 0.15;
            this.visibilityFactor = 0.6;
        } else if (temp <= 0) {
            this.maxSnowParticles = 80;
            this.windOffset = 0.3;
            this.blizzardAlpha = 0;
            this.visibilityFactor = 1.0;
        } else {
            this.maxSnowParticles = 0;
            this.windOffset = 0;
            this.blizzardAlpha = 0;
            this.visibilityFactor = 1.0;
        }
    }

    /** 更新雪花粒子 */
    _updateSnowParticles(dt) {
        // 动态调整粒子数量
        while (this.snowParticles.length < this.maxSnowParticles) {
            this.snowParticles.push(this._createSnowParticle());
        }
        while (this.snowParticles.length > this.maxSnowParticles) {
            this.snowParticles.pop();
        }

        // 更新每个粒子
        const viewW = this.game.viewW;
        const viewH = this.game.viewH;
        for (const p of this.snowParticles) {
            p.y += p.speed * dt;
            p.x += (this.windOffset * 30 + p.wobble * Math.sin(p.phase)) * dt;
            p.phase += dt * 2;

            if (p.y > viewH + 10) {
                p.y = -10;
                p.x = Math.random() * viewW;
            }
            if (p.x > viewW + 10) p.x = -10;
            if (p.x < -10) p.x = viewW + 10;
        }
    }

    /** 创建单个雪花粒子 */
    _createSnowParticle() {
        const viewW = this.game.viewW || 640;
        const viewH = this.game.viewH || 480;
        return {
            x: Math.random() * viewW,
            y: Math.random() * viewH,
            size: 1 + Math.random() * 3,
            speed: 20 + Math.random() * 40,
            wobble: Math.random() * 10,
            phase: Math.random() * Math.PI * 2,
            opacity: 0.4 + Math.random() * 0.6,
        };
    }

    /** 渲染雪花和暴风雪效果（在draw()中调用） */
    drawSnow(ctx) {
        if (this.snowParticles.length === 0) return;

        // 绘制雪花粒子
        for (const p of this.snowParticles) {
            ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // 暴风雪白色遮罩
        if (this.blizzardAlpha > 0) {
            ctx.fillStyle = `rgba(220,225,235,${this.blizzardAlpha})`;
            ctx.fillRect(0, 0, this.game.viewW, this.game.viewH);
        }
    }

    /** 昼夜遮罩覆盖 - 替代原有的昼夜系统 */
    drawDayNightOverlay(ctx) {
        const hour = this.game.getHour();
        let alpha = 0;
        let r = 10, g = 15, b = 40;

        // 冬季缩短白天 6:00 ~ 16:00
        if (hour >= 0 && hour < 5) {
            alpha = 0.6; r = 5; g = 10; b = 35;
        } else if (hour >= 5 && hour < 6) {
            const t = hour - 5;
            alpha = 0.6 * (1 - t) + 0.1 * t;
            r = 5; g = 10; b = 35;
        } else if (hour >= 6 && hour < 16) {
            // 冬季白天 - 比正常白天略暗
            alpha = 0.05;
            r = 180; g = 200; b = 220;
        } else if (hour >= 16 && hour < 18) {
            const t = (hour - 16) / 2;
            alpha = 0.05 + 0.4 * t;
            r = Math.floor(180 * (1 - t) + 5 * t);
            g = Math.floor(200 * (1 - t) + 10 * t);
            b = Math.floor(220 * (1 - t) + 35 * t);
        } else {
            alpha = 0.55; r = 5; g = 10; b = 35;
        }

        if (alpha > 0.01) {
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(0, 0, this.game.viewW, this.game.viewH);
        }

        // 寒冷天气额外变暗/变蓝
        const temp = this.getEffectiveTemp();
        if (temp < -20) {
            const coldAlpha = Math.min(0.3, Math.abs(temp + 20) / 100);
            ctx.fillStyle = `rgba(100,120,180,${coldAlpha})`;
            ctx.fillRect(0, 0, this.game.viewW, this.game.viewH);
        }
    }

    /** 获取天气描述字符串 */
    getWeatherStr() {
        const temp = this.getEffectiveTemp();
        return `${this.weatherEmoji} ${this.currentWeather} ${temp}°C`;
    }

    /** 获取生存状态摘要（给AI prompt用） */
    getSurvivalSummary() {
        const temp = this.getEffectiveTemp();
        const alive = this.game.npcs.filter(n => !n.isDead).length;
        const rs = this.game.resourceSystem;
        const fs = this.game.furnaceSystem;
        return `【生存状态】第${this.currentDay}天 | 温度${temp}°C | ${this.currentWeather} | ` +
            `存活${alive}/8人 | ` +
            (rs ? `木柴${Math.round(rs.woodFuel)} 食物${Math.round(rs.food)} 电力${Math.round(rs.power)} 建材${Math.round(rs.material)} | ` : '') +
            (fs ? `暖炉${fs.furnaces.length}座(${fs.getActiveFurnaceCount()}运转中)` : '');
    }

    /** 获取暴风雪紧迫感描述（给对话prompt注入，让NPC知道暴风雪即将到来） */
    getBlizzardUrgencyForPrompt() {
        const day = this.currentDay;
        const hour = this.game.getHour();
        const rs = this.game.resourceSystem;
        const fs = this.game.furnaceSystem;

        let urgency = '';
        let survivalChecklist = '';

        if (day === 1) {
            // 第1天：准备日，距暴风雪还有约2天
            const hoursUntilStorm = Math.max(0, (4 - 1) * 24 - hour);
            urgency = `🚨 【暴风雪预警】今天是准备日（第1天），大极寒暴风雪将在第4天降临（-60°C！），距离暴风雪大约还有${Math.round(hoursUntilStorm)}小时。今天必须疯狂收集木柴、食物、建材！明天（第2天）就会降温到-30°C大雪，户外活动将严格限制在2小时内。每一分钟都不能浪费！`;
            survivalChecklist = this._buildSurvivalChecklist(rs, fs);
        } else if (day === 2) {
            // 第2天：寒冷天，-30°C
            const hoursUntilStorm = Math.max(0, (4 - 2) * 24 - hour);
            urgency = `🚨🚨 【暴风雪迫近】今天是第2天，-30°C大雪天！户外工作严格限制2小时！距离第4天大极寒暴风雪（-60°C）还有约${Math.round(hoursUntilStorm)}小时。在户外会快速失温，必须抓紧时间但也要注意安全。明天（第3天）气温会短暂回升，是最后的补充机会！`;
            survivalChecklist = this._buildSurvivalChecklist(rs, fs);
        } else if (day === 3) {
            // 第3天：喘息日，最后准备机会
            const hoursUntilStorm = Math.max(0, 24 - hour);
            urgency = `🚨🚨🚨 【最后准备！今晚24点暴风雪来袭！】今天是第3天喘息日，气温短暂回升到0°C。这是暴风雪前最后的准备时间！今晚24点（也就是大约${Math.round(hoursUntilStorm)}小时后）进入第4天，届时将是-60°C极寒暴风雪，严禁外出，所有人只能待在室内靠暖炉和储备物资活命！如果准备不够充分，大家都会冻死在明天！必须在今天内：修好第二座暖炉、囤够木柴和食物、修好无线电！`;
            survivalChecklist = this._buildSurvivalChecklist(rs, fs);
        } else if (day === 4) {
            // 第4天：大极寒
            urgency = `🚨🚨🚨 【大极寒已降临！-60°C！】现在是第4天，极寒暴风雪正在肆虐！严禁外出！出去就是死！所有人必须待在暖炉旁，靠之前储备的木柴和食物撑过今天。如果暖炉熄灭或食物耗尽，就全完了。坚持到今天日落（18:00），就能迎来救援！`;
            survivalChecklist = this._buildSurvivalChecklist(rs, fs);
        }

        return urgency + (survivalChecklist ? '\n' + survivalChecklist : '');
    }

    /** 构建生存物资清单检查（给AI看当前准备够不够） */
    _buildSurvivalChecklist(rs, fs) {
        if (!rs) return '';
        const furnaceCount = fs ? fs.furnaces.length : 1;
        const secondFurnaceBuilt = fs ? fs.secondFurnaceBuilt : false;
        const activeFurnaces = fs ? fs.getActiveFurnaceCount() : 0;

        // 计算第4天需要的最低物资
        const woodNeededDay4 = 3 * furnaceCount * 24; // 每暖炉每小时3单位 × 24小时
        const foodNeededDay4 = 8 * 2 * 2; // 8人 × 2餐 × 2单位/餐
        const powerNeededDay4 = 5 * 24; // 每小时5单位 × 24小时

        let checklist = `📋 【物资检查】\n`;
        checklist += `  🪵 木柴: ${Math.round(rs.woodFuel)}单位（第4天至少需要${woodNeededDay4}单位）${rs.woodFuel >= woodNeededDay4 ? '✅够了' : `❌还差${Math.round(woodNeededDay4 - rs.woodFuel)}单位！`}\n`;
        checklist += `  🍞 食物: ${Math.round(rs.food)}单位（第4天至少需要${foodNeededDay4}单位）${rs.food >= foodNeededDay4 ? '✅够了' : `❌还差${Math.round(foodNeededDay4 - rs.food)}单位！`}\n`;
        checklist += `  ⚡ 电力: ${Math.round(rs.power)}单位（第4天至少需要${powerNeededDay4}单位）${rs.power >= powerNeededDay4 ? '✅够了' : `❌还差${Math.round(powerNeededDay4 - rs.power)}单位！`}\n`;
        checklist += `  🔥 暖炉: ${furnaceCount}座（${activeFurnaces}运转中）${secondFurnaceBuilt ? '✅第二暖炉已建好' : '❌第二暖炉未建！8人挤1座暖炉很危险！'}\n`;
        checklist += `  🧱 建材: ${Math.round(rs.material)}单位${!secondFurnaceBuilt ? `（修建第二暖炉需要50单位，${rs.material >= 50 ? '✅够了' : `❌还差${Math.round(50 - rs.material)}！`}）` : ''}`;

        return checklist;
    }
}
