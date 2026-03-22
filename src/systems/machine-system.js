/**
 * 福音镇 - MachineSystem
 * 自动化机器系统 — 发电机 & 伐木机
 * 挂载到 GST.MachineSystem
 * 
 * 核心权衡：投入时间+建材 → 换取自动产出，释放NPC人力
 *   - 自动发电机：消耗木柴2/h → 产出电力24/h（≈3人份），故障率由难度决定
 *   - 自动伐木机：消耗电力3/h → 产出木柴30/h（≈3人份），故障率由难度决定
 *   - 两台机器互相依赖，形成 木柴↔电力 正向循环
 *   - 故障率：简单10%/h → 地狱35%/h；维修时间：简单15min → 地狱30min
 *   - 故障后需NPC到工坊维修，增加运营风险
 */
(function() {
    'use strict';
    const GST = window.GST;

    // ============ 机器配置 ============
    const MACHINE_CONFIG = {
        generator: {
            id: 'auto_generator',
            name: '⚡ 自动发电机',
            desc: '烧木柴自动产出电力，效率高于人工维修',
            // 建造参数
            buildMaterialCost: 8,       // 消耗电力作为零件（降低门槛，让建造更可行）
            buildWoodCost: 8,           // 消耗木柴
            buildTimeSeconds: 10800,    // 3游戏小时（降低建造时间，提升可行性）
            buildMinWorkers: 1,         // 最少1人可建造
            buildUnlockDay: 1,          // Day1即可解锁
            buildUnlockPower: 8,        // 需要电力>8才能解锁（降低门槛）
            // 运行参数
            // 设计思路：消耗2木/h产出24电/h（≈3人份人工发电），故障率由难度决定
            // 期望产出随难度变化：简单(10%)≈21.6/h，地狱(35%)≈15.6/h
            woodConsumptionPerHour: 2.0,  // 每小时消耗木柴（烧木头发电）
            powerOutputPerHour: 24,       // 每小时产出电力（≈3人份）
            // 最低运行资源
            minWoodToRun: 3,              // 木柴低于此值时自动停机（提高阈值保暖炉优先）
        },
        lumberMill: {
            id: 'auto_lumber_mill',
            name: '🪵 自动伐木机',
            desc: '消耗电力自动伐木，效率高于人工砍柴',
            // 建造参数
            buildMaterialCost: 10,      // 消耗电力作为零件
            buildWoodCost: 12,          // 消耗木柴
            buildTimeSeconds: 14400,    // 4游戏小时
            buildMinWorkers: 1,
            buildUnlockDay: 1,          // Day1即可解锁
            buildUnlockWood: 15,        // 需要木柴>15才能解锁（降低门槛）
            // 运行参数
            // 设计思路：消耗3电/h产出30木/h（≈3人份砍柴），故障率由难度决定
            // 期望产出随难度变化：简单(10%)≈27/h，地狱(35%)≈19.5/h
            powerConsumptionPerHour: 3,    // 每小时消耗电力
            woodOutputPerHour: 30,         // 每小时产出木柴（≈3人份）
            // 最低运行资源
            minPowerToRun: 3,              // 电力低于此值时自动停机（提高阈值保基础设施优先）
        },
    };

    class MachineSystem {
        constructor(game) {
            this.game = game;

            // ============ 发电机状态 ============
            this.generator = {
                built: false,           // 是否已建成
                building: false,        // 是否正在建造
                running: false,         // 是否正在运行
                buildProgress: 0,       // 建造进度 0~1
                buildWorkers: [],       // 参与建造的NPC列表
                buildPaused: false,     // 建造是否暂停
                lastReportedProgress: 0, // 上次报告进度
                totalProduced: 0,       // 累计产出电力
                totalConsumed: 0,       // 累计消耗木柴
            };

            // ============ 伐木机状态 ============
            this.lumberMill = {
                built: false,
                building: false,
                running: false,
                buildProgress: 0,
                buildWorkers: [],
                buildPaused: false,
                lastReportedProgress: 0,
                totalProduced: 0,       // 累计产出木柴
                totalConsumed: 0,       // 累计消耗电力
            };

            // 解锁通知标记
            this._generatorUnlockNotified = false;
            this._lumberMillUnlockNotified = false;

            // 系统tick计时
            this._tick = 0;
            this._unlockCheckTick = 0;

            console.log('[MachineSystem] 初始化完成');
        }

        // ============ 主更新循环 ============

        update(gameDt) {
            this._tick += gameDt;
            if (this._tick < 1.0) return;
            const dt = this._tick;
            this._tick = 0;

            // 更新建造进度
            if (this.generator.building) this._updateBuildProgress('generator', dt);
            if (this.lumberMill.building) this._updateBuildProgress('lumberMill', dt);

            // 更新运行中的机器
            if (this.generator.built) this._updateMachineRunning('generator', dt);
            if (this.lumberMill.built) this._updateMachineRunning('lumberMill', dt);

            // 定期检查解锁条件（每5秒）
            this._unlockCheckTick += dt;
            if (this._unlockCheckTick >= 5) {
                this._unlockCheckTick = 0;
                this._checkUnlockConditions();
            }
        }

        // ============ 解锁条件检查 ============

        /** 检查发电机是否可解锁（满足所有建造前置条件） */
        canUnlockGenerator() {
            if (this.generator.built || this.generator.building) return false;
            const day = this.game.dayCount || this.game.weatherSystem?.currentDay || 1;
            const rs = this.game.resourceSystem;
            // 【修复】第3天及以后放宽解锁门槛：即使电力不足也允许解锁显示，避免死锁
            if (day >= 3) {
                return day >= MACHINE_CONFIG.generator.buildUnlockDay;
            }
            return day >= MACHINE_CONFIG.generator.buildUnlockDay
                && rs && rs.power > MACHINE_CONFIG.generator.buildUnlockPower;
        }

        /** 检查发电机是否应在HUD上显示（始终显示，未解锁时灰色） */
        shouldShowGenerator() {
            return true; // 始终显示
        }

        /** 检查伐木机是否应在HUD上显示（始终显示，未解锁时灰色） */
        shouldShowLumberMill() {
            return true; // 始终显示
        }

        /** 检查伐木机是否可解锁 */
        canUnlockLumberMill() {
            if (this.lumberMill.built || this.lumberMill.building) return false;
            const day = this.game.dayCount || this.game.weatherSystem?.currentDay || 1;
            const rs = this.game.resourceSystem;
            // 【修复】第3天及以后放宽解锁门槛：即使木柴不足也允许解锁显示
            if (day >= 3) {
                return day >= MACHINE_CONFIG.lumberMill.buildUnlockDay;
            }
            return day >= MACHINE_CONFIG.lumberMill.buildUnlockDay
                && rs && rs.woodFuel > MACHINE_CONFIG.lumberMill.buildUnlockWood;
        }

        /** 定期检查并通知解锁 */
        _checkUnlockConditions() {
            if (!this._generatorUnlockNotified && this.canUnlockGenerator()) {
                this._generatorUnlockNotified = true;
                if (this.game.addEvent) {
                    this.game.addEvent(`📢 ⚡ 可以建造自动发电机了！消耗电力8+木柴8，3游戏小时，建成后自动产电24/h（消耗木柴2/h，有概率故障）`);
                }
            }
            if (!this._lumberMillUnlockNotified && this.canUnlockLumberMill()) {
                this._lumberMillUnlockNotified = true;
                if (this.game.addEvent) {
                    this.game.addEvent(`📢 🪵 可以建造自动伐木机了！消耗电力10+木柴12，4游戏小时，建成后自动产柴30/h（消耗电力3/h，有概率故障）`);
                }
            }
        }

        // ============ 开始建造 ============

        /**
         * 开始建造机器
         * @param {string} type - 'generator' 或 'lumberMill'
         * @param {string[]} workerIds - 参与建造的NPC ID列表
         * @returns {boolean} 是否成功开始
         */
        startBuild(type, workerIds) {
            const config = MACHINE_CONFIG[type];
            const machine = this[type];
            if (!config || !machine) return false;

            if (machine.built) {
                console.log(`[MachineSystem] ${config.name}已建成，无需重复建造`);
                return false;
            }
            if (machine.building) {
                console.log(`[MachineSystem] ${config.name}正在建造中`);
                return false;
            }

            // 检查解锁条件
            if (type === 'generator' && !this.canUnlockGenerator()) {
                if (this.game.addEvent) {
                    this.game.addEvent(`⚠️ 自动发电机尚未解锁！需要电力>8`);
                }
                return false;
            }
            if (type === 'lumberMill' && !this.canUnlockLumberMill()) {
                if (this.game.addEvent) {
                    this.game.addEvent(`⚠️ 自动伐木机尚未解锁！需要木柴>15`);
                }
                return false;
            }

            // 检查并消耗资源
            const rs = this.game.resourceSystem;
            if (!rs) return false;

            // 建材用废墟探索获得的零件（power资源当作零件/电力共用）
            if (rs.woodFuel < config.buildWoodCost) {
                if (this.game.addEvent) {
                    this.game.addEvent(`⚠️ 木柴不足！建造${config.name}需要${config.buildWoodCost}木柴，当前仅${Math.round(rs.woodFuel)}`);
                }
                return false;
            }
            if (rs.power < config.buildMaterialCost) {
                if (this.game.addEvent) {
                    this.game.addEvent(`⚠️ 电力不足！建造${config.name}需要${config.buildMaterialCost}电力，当前仅${Math.round(rs.power)}`);
                }
                return false;
            }

            // 消耗资源
            rs.consumeResource('woodFuel', config.buildWoodCost, `建造${config.name}`);
            rs.consumeResource('power', config.buildMaterialCost, `建造${config.name}(电力)`);

            // 开始建造
            machine.building = true;
            machine.buildProgress = 0;
            machine.buildWorkers = workerIds || [];
            machine.buildPaused = false;
            machine.lastReportedProgress = 0;

            if (this.game.addEvent) {
                this.game.addEvent(`🏗️ 开始建造${config.name}！消耗木柴${config.buildWoodCost}+电力${config.buildMaterialCost}，${machine.buildWorkers.length}人参与施工`);
            }

            console.log(`[MachineSystem] 开始建造${config.name}，工人:`, machine.buildWorkers);
            return true;
        }

        // ============ 建造进度更新 ============

        _updateBuildProgress(type, dt) {
            const config = MACHINE_CONFIG[type];
            const machine = this[type];
            if (!machine.building || machine.built) return;

            // 资源过低时自动暂停
            const rs = this.game.resourceSystem;
            if (rs && rs.woodFuel <= 3) {
                if (!machine.buildPaused) {
                    machine.buildPaused = true;
                    if (this.game.addEvent) {
                        this.game.addEvent(`⏸️ ${config.name}建造暂停——木柴储备过低，优先保暖！`);
                    }
                }
                return;
            }
            if (machine.buildPaused) {
                machine.buildPaused = false;
                if (this.game.addEvent) {
                    this.game.addEvent(`▶️ ${config.name}建造继续！当前进度${Math.round(machine.buildProgress * 100)}%`);
                }
            }

            // 根据工人数量计算速率
            const workerCount = Math.max(1, machine.buildWorkers.length);
            const efficiencyMultiplier = workerCount >= 2
                ? 1 + (workerCount - 2) * 0.2   // 2人=1.0x, 3人=1.2x, 4人=1.4x
                : workerCount * 0.6;              // 1人=0.6x（独自建造更慢）

            // 【修复】dt是speed-adjusted真实秒，buildTimeSeconds是游戏秒，需乘timeSpeed转换
            const gameSeconds = dt * (this.game.timeSpeed || 60);
            const progressIncrement = (gameSeconds / config.buildTimeSeconds) * efficiencyMultiplier;
            machine.buildProgress = Math.min(1, machine.buildProgress + progressIncrement);

            // 每20%进度报告一次
            const currentPct = Math.floor(machine.buildProgress * 5);
            const lastPct = Math.floor(machine.lastReportedProgress * 5);
            if (currentPct > lastPct && machine.buildProgress < 1) {
                machine.lastReportedProgress = machine.buildProgress;
                if (this.game.addEvent) {
                    this.game.addEvent(`🏗️ ${config.name}建造进度：${Math.round(machine.buildProgress * 100)}%（${workerCount}人施工中）`);
                }
            }

            // 完成
            if (machine.buildProgress >= 1) {
                this._completeBuild(type);
            }
        }

        /** 完成建造 */
        _completeBuild(type) {
            const config = MACHINE_CONFIG[type];
            const machine = this[type];

            machine.building = false;
            machine.built = true;
            machine.buildProgress = 1;
            machine.running = true; // 建成后自动启动
            machine.buildPaused = false;
            machine.broken = false;
            machine._repairProgress = 0;
            machine._breakdownTimer = 0; // 新机从0开始累计运行时长，满1游戏小时后再判故障

            if (this.game.addEvent) {
                if (type === 'generator') {
                    this.game.addEvent(`⚡🎉 自动发电机建造完成！已自动启动，产电${config.powerOutputPerHour}/h，消耗木柴${config.woodConsumptionPerHour}/h`);
                } else {
                    this.game.addEvent(`🪵🎉 自动伐木机建造完成！已自动启动，产柴${config.woodOutputPerHour}/h，消耗电力${config.powerConsumptionPerHour}/h`);
                }
            }

            // AI模式日志
            if (this.game.aiModeLogger) {
                this.game.aiModeLogger.log('BUILD', `${config.name}建造完成并启动`);
            }

            console.log(`[MachineSystem] ${config.name}建造完成！`);
        }

        // ============ 机器运行逻辑 ============

        _updateMachineRunning(type, dt) {
            const config = MACHINE_CONFIG[type];
            const machine = this[type];
            if (!machine.built) return;

            const rs = this.game.resourceSystem;
            if (!rs) return;

            // 【修复】dt是speed-adjusted真实秒，需乘timeSpeed转为游戏秒
            const gameSeconds = dt * (this.game.timeSpeed || 60);
            const hourFraction = gameSeconds / 3600; // 转为游戏小时比例

            // ====== 故障检测（概率和维修时间由难度决定） ======
            const breakdownChance = this.game.getDifficultyMult ? this.game.getDifficultyMult('machineBreakdownChance') : 0.10;
            const repairSeconds = this.game.getDifficultyMult ? this.game.getDifficultyMult('machineRepairSeconds') : 1800;
            if (machine.running && breakdownChance > 0) {
                if (!Number.isFinite(machine._breakdownTimer)) machine._breakdownTimer = 0;
                machine._breakdownTimer += gameSeconds;

                // 严格按“每累计运行满1游戏小时”判定一次是否故障
                while (machine._breakdownTimer >= 3600 && machine.running && !machine.broken) {
                    machine._breakdownTimer -= 3600;
                    if (Math.random() < breakdownChance) {
                        // 故障！停机
                        machine.running = false;
                        machine.broken = true;
                        machine._repairProgress = 0;
                        machine._breakdownTimer = 0; // 故障后重置，下次修好重新累计1小时再判
                        if (this.game.addEvent) {
                            this.game.addEvent(`⚠️🔧 ${config.name}发生故障停机！需要NPC前往工坊维修`);
                        }
                        return;
                    }
                }
            }

            // ====== 故障维修逻辑 ======
            if (machine.broken) {
                // 检查是否有NPC在工坊维修（避免把“建造发电机”误判成维修/人工发电）
                const repairWorkers = (this.game.npcs || []).filter(npc => {
                    if (npc.isDead || npc.currentScene !== 'workshop' || !npc.stateDesc) return false;
                    const stateDesc = String(npc.stateDesc);
                    if (/建造发电机|建造自动发电机|组装发电机|制造发电机/.test(stateDesc)) {
                        return false;
                    }
                    return /维修|修理|人工发电|手摇发电|手动发电|维护电力|检查发电机/.test(stateDesc);
                });
                if (repairWorkers.length > 0) {
                    if (!machine._repairProgress) machine._repairProgress = 0;
                    // 维修速度由难度决定，多人加速
                    const repairSpeed = repairWorkers.length >= 2 ? 1.0 + (repairWorkers.length - 1) * 0.5 : 1.0;
                    machine._repairProgress += (gameSeconds / repairSeconds) * repairSpeed;
                    if (machine._repairProgress >= 1) {
                        machine.broken = false;
                        machine.running = true;
                        machine._repairProgress = 0;
                        machine._breakdownTimer = 0; // 修好后重新累计运行时长，避免“刚修好立刻再坏”
                        if (this.game.addEvent) {
                            this.game.addEvent(`✅ ${config.name}维修完成，恢复运行！（${repairWorkers.map(n => n.name).join('、')}修好了它）`);
                        }
                    }
                }
                return; // 故障中不产出
            }

            if (type === 'generator') {
                // ===== 自动发电机 =====
                // 消耗木柴 → 产出电力
                if (machine.running) {
                    // 检查木柴是否足够
                    if (rs.woodFuel < config.minWoodToRun) {
                        machine.running = false;
                        if (this.game.addEvent) {
                            this.game.addEvent(`⚠️ 自动发电机因木柴不足停机！（木柴<${config.minWoodToRun}）`);
                        }
                        return;
                    }

                    // 消耗木柴
                    const woodNeeded = config.woodConsumptionPerHour * hourFraction;
                    const consumed = rs.consumeResource('woodFuel', woodNeeded, '自动发电机');
                    machine.totalConsumed += consumed;

                    // 按实际消耗比例产出，避免“资源不够却满额产出”
                    const productionRatio = woodNeeded > 0 ? Math.max(0, Math.min(1, consumed / woodNeeded)) : 0;
                    if (productionRatio <= 0) {
                        machine.running = false;
                        return;
                    }

                    // 产出电力
                    const powerProduced = config.powerOutputPerHour * hourFraction * productionRatio;
                    rs.addResource('power', powerProduced, '自动发电机');
                    machine.totalProduced += powerProduced;
                } else {
                    // 检查是否可以恢复运行
                    if (rs.woodFuel > config.minWoodToRun * 2) {
                        machine.running = true;
                        if (this.game.addEvent) {
                            this.game.addEvent(`⚡ 自动发电机恢复运行！`);
                        }
                    }
                }
            } else if (type === 'lumberMill') {
                // ===== 自动伐木机 =====
                // 消耗电力 → 产出木柴
                if (machine.running) {
                    // 检查电力是否足够
                    if (rs.power < config.minPowerToRun) {
                        machine.running = false;
                        if (this.game.addEvent) {
                            this.game.addEvent(`⚠️ 自动伐木机因电力不足停机！（电力<${config.minPowerToRun}）`);
                        }
                        return;
                    }

                    // 消耗电力
                    const powerNeeded = config.powerConsumptionPerHour * hourFraction;
                    const consumed = rs.consumeResource('power', powerNeeded, '自动伐木机');
                    machine.totalConsumed += consumed;

                    // 按实际消耗比例产出，避免“电力只够一小段时间却整段都产木头”
                    const productionRatio = powerNeeded > 0 ? Math.max(0, Math.min(1, consumed / powerNeeded)) : 0;
                    if (productionRatio <= 0) {
                        machine.running = false;
                        return;
                    }

                    // 产出木柴
                    const woodProduced = config.woodOutputPerHour * hourFraction * productionRatio;
                    rs.addResource('woodFuel', woodProduced, '自动伐木机');
                    machine.totalProduced += woodProduced;
                } else {
                    // 检查是否可以恢复运行
                    if (rs.power > config.minPowerToRun * 2) {
                        machine.running = true;
                        if (this.game.addEvent) {
                            this.game.addEvent(`🪵 自动伐木机恢复运行！`);
                        }
                    }
                }
            }
        }

        // ============ 查询接口 ============

        /** 获取机器详情（给指挥问答/AI使用） */
        getMachineDetail(type) {
            const config = MACHINE_CONFIG[type];
            const machine = this[type];
            if (!config || !machine) return null;

            const rs = this.game.resourceSystem || null;
            const currentDay = this.game.dayCount || this.game.weatherSystem?.currentDay || 1;
            const buildWorkers = (machine.buildWorkers || []).map(id => {
                const npc = this.game.npcs?.find(item => item.id === id);
                return npc ? npc.name : id;
            });

            const unlockMissing = [];
            if (!machine.built && !machine.building) {
                if (currentDay < config.buildUnlockDay) {
                    unlockMissing.push(`需到第${config.buildUnlockDay}天`);
                }
                if (type === 'generator' && (!rs || rs.power <= config.buildUnlockPower)) {
                    unlockMissing.push(`电力需高于${config.buildUnlockPower}（当前${Math.round(rs?.power || 0)}）`);
                }
                if (type === 'lumberMill' && (!rs || rs.woodFuel <= config.buildUnlockWood)) {
                    unlockMissing.push(`木柴需高于${config.buildUnlockWood}（当前${Math.round(rs?.woodFuel || 0)}）`);
                }
            }

            const runtimeRequirement = type === 'generator'
                ? { label: '木柴', minToRun: config.minWoodToRun, current: Math.round(rs?.woodFuel || 0) }
                : { label: '电力', minToRun: config.minPowerToRun, current: Math.round(rs?.power || 0) };

            return {
                type,
                id: config.id,
                name: config.name,
                desc: config.desc,
                built: !!machine.built,
                building: !!machine.building,
                running: !!machine.running,
                buildProgress: machine.buildProgress || 0,
                buildProgressPercent: Math.round((machine.buildProgress || 0) * 100),
                buildPaused: !!machine.buildPaused,
                buildWorkers,
                workersCount: buildWorkers.length,
                buildWoodCost: config.buildWoodCost || 0,
                buildMaterialCost: config.buildMaterialCost || 0,
                buildTimeSeconds: config.buildTimeSeconds || 0,
                buildTimeHours: Math.round(((config.buildTimeSeconds || 0) / 3600) * 10) / 10,
                buildMinWorkers: config.buildMinWorkers || 1,
                unlockDay: config.buildUnlockDay || 1,
                unlockPower: config.buildUnlockPower ?? null,
                unlockWood: config.buildUnlockWood ?? null,
                unlockReady: type === 'generator' ? this.canUnlockGenerator() : this.canUnlockLumberMill(),
                unlockMissing,
                outputPerHour: type === 'generator' ? config.powerOutputPerHour : config.woodOutputPerHour,
                outputLabel: type === 'generator' ? '电力' : '木柴',
                consumePerHour: type === 'generator' ? config.woodConsumptionPerHour : config.powerConsumptionPerHour,
                consumeLabel: type === 'generator' ? '木柴' : '电力',
                runtimeRequirement,
                currentPower: Math.round(rs?.power || 0),
                currentWoodFuel: Math.round(rs?.woodFuel || 0),
                totalProduced: Math.round((machine.totalProduced || 0) * 10) / 10,
                totalConsumed: Math.round((machine.totalConsumed || 0) * 10) / 10,
                broken: !!machine.broken,
                repairProgress: Math.round((machine._repairProgress || 0) * 100),
                breakdownChance: config.breakdownChance || 0,
            };
        }

        /** 获取机器状态摘要 */
        getMachineSummary() {
            const parts = [];
            // 发电机
            if (this.generator.built) {
                parts.push(`⚡发电机(${this.generator.broken ? '⚠️故障' : this.generator.running ? '运行中' : '停机'})`);
            } else if (this.generator.building) {
                parts.push(`⚡发电机(建造${Math.round(this.generator.buildProgress * 100)}%)`);
            }
            // 伐木机
            if (this.lumberMill.built) {
                parts.push(`🪵伐木机(${this.lumberMill.broken ? '⚠️故障' : this.lumberMill.running ? '运行中' : '停机'})`);
            } else if (this.lumberMill.building) {
                parts.push(`🪵伐木机(建造${Math.round(this.lumberMill.buildProgress * 100)}%)`);
            }
            return parts.length > 0 ? parts.join(' | ') : '无自动化设施';
        }

        /** 获取机器状态（给AI prompt用） */
        getMachineStatusForPrompt() {
            let status = '';
            if (this.generator.built) {
                const genStatus = this.generator.broken ? '⚠️故障中' : this.generator.running ? '运行中' : '停机';
                const _bkPct = Math.round((this.game.getDifficultyMult ? this.game.getDifficultyMult('machineBreakdownChance') : 0.10) * 100);
                status += `自动发电机: ${genStatus} (产电${MACHINE_CONFIG.generator.powerOutputPerHour}/h, 耗柴${MACHINE_CONFIG.generator.woodConsumptionPerHour}/h, ${_bkPct}%/h故障率, 累计产电${Math.round(this.generator.totalProduced)})`;
            } else if (this.generator.building) {
                status += `自动发电机: 建造中${Math.round(this.generator.buildProgress * 100)}%`;
            }
            if (this.lumberMill.built) {
                const lumStatus = this.lumberMill.broken ? '⚠️故障中' : this.lumberMill.running ? '运行中' : '停机';
                const _bkPct2 = Math.round((this.game.getDifficultyMult ? this.game.getDifficultyMult('machineBreakdownChance') : 0.10) * 100);
                status += ` | 自动伐木机: ${lumStatus} (产柴${MACHINE_CONFIG.lumberMill.woodOutputPerHour}/h, 耗电${MACHINE_CONFIG.lumberMill.powerConsumptionPerHour}/h, ${_bkPct2}%/h故障率, 累计产柴${Math.round(this.lumberMill.totalProduced)})`;
            } else if (this.lumberMill.building) {
                status += ` | 自动伐木机: 建造中${Math.round(this.lumberMill.buildProgress * 100)}%`;
            }
            // 解锁提示
            if (!this.generator.built && !this.generator.building && this.canUnlockGenerator()) {
                status += ' | ⚡发电机可建造';
            }
            if (!this.lumberMill.built && !this.lumberMill.building && this.canUnlockLumberMill()) {
                status += ' | 🪵伐木机可建造';
            }
            return status || '无自动化设施';
        }

        /** 获取自动产出的净值（每小时） */
        getNetOutputPerHour() {
            let netWood = 0, netPower = 0;
            if (this.generator.built && this.generator.running && !this.generator.broken) {
                netPower += MACHINE_CONFIG.generator.powerOutputPerHour;
                netWood -= MACHINE_CONFIG.generator.woodConsumptionPerHour;
            }
            if (this.lumberMill.built && this.lumberMill.running && !this.lumberMill.broken) {
                netWood += MACHINE_CONFIG.lumberMill.woodOutputPerHour;
                netPower -= MACHINE_CONFIG.lumberMill.powerConsumptionPerHour;
            }
            return { wood: netWood, power: netPower };
        }

        // ============ 序列化 ============

        serialize() {
            return {
                generator: { ...this.generator, buildWorkers: [...this.generator.buildWorkers] },
                lumberMill: { ...this.lumberMill, buildWorkers: [...this.lumberMill.buildWorkers] },
            };
        }

        deserialize(data) {
            if (!data) return;
            if (data.generator) {
                Object.assign(this.generator, data.generator);
                this.generator.buildWorkers = data.generator.buildWorkers || [];
            }
            if (data.lumberMill) {
                Object.assign(this.lumberMill, data.lumberMill);
                this.lumberMill.buildWorkers = data.lumberMill.buildWorkers || [];
            }
            // 恢复解锁通知标记
            if (this.generator.built || this.generator.building) this._generatorUnlockNotified = true;
            if (this.lumberMill.built || this.lumberMill.building) this._lumberMillUnlockNotified = true;
        }
    }

    // 导出配置（供其他模块引用）
    GST.MACHINE_CONFIG = MACHINE_CONFIG;
    GST.MachineSystem = MachineSystem;
})();
