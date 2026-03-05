/**
 * 福音镇 - NPC 日程调度模块
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：日程更新、天气调整、睡眠、任务覆盖导航
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._getMyRoomKey = function() {
        // 新系统下直接返回宿舍内部位置
        return this.homeName + '_inside';
    }
    /** 场景名 → 中文标签 */;

    proto._getWeatherAdjustedEntry = function(entry, game) {
        if (!entry) return entry;
        if (!NPC.OUTDOOR_TARGETS.has(entry.target)) return entry;

        // 【v2.0修复】不仅检查下雨，还要检查极端天气禁止外出
        // 【v3.0修复】增加极端低温检查：大雪天虽然canGoOutside=true，但实际温度极低时也不应去户外
        const ws = game.weatherSystem;
        const isRaining = game.isRaining();
        const cannotGoOutside = ws && !ws.canGoOutside();
        // 室外有效温度低于-20°C时，也视为不宜外出（覆盖大雪天等场景）
        const effectiveTemp = ws ? ws.getEffectiveTemp() : 0;
        const isTooCold = effectiveTemp < -20;

        if (!isRaining && !cannotGoOutside && !isTooCold) return entry;

        // 下雨或极端天气 + 户外目标 → 替换为室内
        // 用 NPC id + 时段 start 做种子，保证同一时段内替代目标稳定不变
        const seed = (this.id.charCodeAt(0) + entry.start) % NPC.RAIN_INDOOR_ALTERNATIVES.length;
        const alt = NPC.RAIN_INDOOR_ALTERNATIVES[seed];
        return {
            ...entry,
            target: alt.target,
            desc: alt.desc,
            _rainAdjusted: true, // 标记为雨天替换
        };
    }

    // ---- 睡眠状态管理 ----;

    proto._isAtHome = function() {
        // NPC必须真正在公寓/家的室内场景才算"在家"，不能在村庄路上就睡
        // NPC在自己宿舍中即为在家
        if (this.currentScene === this.homeName) {
            return true;
        }
        return false;
    }

    /**
     * 判断当前时间是否已经过了这个NPC的就寝时间
     * 使用NPC配置中的bedtime字段（如老钱21点、陆辰0:30）
     * @param {number} hour - 当前游戏小时（整数，getHour()返回值）
     * @returns {boolean}
     */;

    proto._isBedtime = function(hour) {
        const bedtime = this.config.bedtime || 23; // 默认23点
        // bedtime可能跨午夜：如bedtime=0表示0:00, bedtime=1表示1:00
        if (bedtime >= 12) {
            // 睡觉时间在当天晚上（如21、22、23）
            return hour >= bedtime || hour < 6;
        } else {
            // 睡觉时间在凌晨（如0、1）
            return (hour >= bedtime && hour < 6) || hour >= 23; // 23点后肯定该往回走了
        }
    }

    /** 获取NPC自己的床位位置key（宿舍内部） */;

    proto._navigateToScheduleTarget = function(targetKey, game) {
        // 【进屋保护期】NPC刚进入室内时，短暂冻结跨场景导航，防止闪现
        // 【修复】P0紧急状态（健康危急/体力不支）无视保护期，必须立即回家
        const isP0Nav = this._behaviorPriority === 'P0';
        if (this._indoorEntryProtection > 0 && this.currentScene !== 'village' && !isP0Nav) {
            const loc = GST.SCHEDULE_LOCATIONS[targetKey];
            if (loc && loc.scene !== this.currentScene) {
                console.log(`[进屋保护] ${this.name} 进屋保护期剩余${this._indoorEntryProtection.toFixed(1)}s，阻止跨场景导航到 ${targetKey}`);
                return;
            }
        }
        // 【出门过程保护】NPC正在走向门口准备出门时，不接受新的导航指令
        // 【修复】P0紧急状态无视出门保护，避免卡在门口循环
        if (this._walkingToDoor && !isP0Nav) {
            console.log(`[出门保护] ${this.name} 正在出门中，阻止新导航到 ${targetKey}`);
            return;
        }
        // 【关键修复】对话中不执行任何导航，防止NPC被传送到其他场景导致对话中断
        // 但urgent任务覆盖可以打断聊天
        if (this.state === 'CHATTING') {
            if (this._taskOverride && this._taskOverride.isActive && this._taskOverride.priority === 'urgent') {
                console.log(`[NPC-${this.name}] urgent任务打断聊天，开始导航到 ${targetKey}`);
                this._forceEndChat();
            } else {
                return;
            }
        }

        // 记录导航开始时间和目标，用于超时兜底
        this._navStartTime = Date.now();
        this._scheduleNavTimer = 0;
        this._scheduleNavTarget = targetKey;

        const loc = GST.SCHEDULE_LOCATIONS[targetKey];
        if (!loc) {
            console.warn(`[NPC-${this.name}] SCHEDULE_LOCATIONS中未找到key: "${targetKey}"，跳过导航`);
            return;
        }

        // 判断目标是否是门口（xxx_door 类型）
        const isDoorTarget = targetKey.endsWith('_door');
        // 从门口key推断对应的室内场景名
        const doorToScene = {
            warehouse_door: 'warehouse', medical_door: 'medical',
            dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
            kitchen_door: 'kitchen', workshop_door: 'workshop',
        };

        // 如果需要切换场景（目标是室内）
        if (loc.scene !== this.currentScene) {
            // 【修复】如果目标是门口类且NPC已在对应室内，检查是否到达inside位置
            if (isDoorTarget) {
                const insideScene = doorToScene[targetKey];
                if (insideScene && this.currentScene === insideScene) {
                    // NPC已在目标室内场景中，直接标记到达，不再反复寻路
                    this.scheduleReached = true;
                    this._enterWalkTarget = null;
                    return;
                }
            }

            if (this.currentScene === 'village') {
                // 在村庄 → 如果是门口类目标，走过去再进入（而不是直接传送）
                if (isDoorTarget) {
                    this._pendingEnterScene = doorToScene[targetKey] || null;
                    this._pendingEnterKey = targetKey;
                    this._pathTo(loc.x, loc.y, game);
                } else {
                    // 非门口的室内目标 → 直接传送
                    this._teleportTo(loc.scene, loc.x, loc.y);
                }
            } else {
                // 在其他室内 → 先走到室内门口再出门到村庄
                // 【天气保护】跨场景导航需经过室外时，检查天气是否允许外出
                // 【修复】P0紧急状态（健康危急/体力不支）无视天气限制，人都要死了必须回家
                const wsNav = game && game.weatherSystem;
                const isP0Emergency = this._behaviorPriority === 'P0';
                if (wsNav && !wsNav.canGoOutside() && !isP0Emergency) {
                    console.warn(`[NPC-${this.name}] [天气保护] 跨场景导航需经过室外，但天气禁止外出，NPC留在室内待命`);
                    this.scheduleReached = true;
                    return;
                }
                this._walkToDoorAndExit(game, null);
                // 出门后下一帧日程系统会重新触发导航
            }
            return;
        }

        // 同场景
        if (this.currentScene === 'village' && isDoorTarget) {
            // 目标是门口 → 先寻路走到门口，到达后自动进入对应建筑
            this._pendingEnterScene = doorToScene[targetKey] || null;
            this._pendingEnterKey = targetKey;
            this._pathTo(loc.x, loc.y, game);
        } else {
            this._pendingEnterScene = null;
            this._pathTo(loc.x, loc.y, game);
        }
    };

    proto._postArrivalAwareness = function(game, schedItem) {
        // 只在初次到达时触发一次
        if (this._arrivalAwarenessApplied === this.currentScheduleIdx) return;
        this._arrivalAwarenessApplied = this.currentScheduleIdx;

        const desc = schedItem.desc;
        const nearby = this._getNearbyNPCs(game, 64);

        // 【饥饿系统】到达餐饮场所且日程包含吃饭相关关键词时，开始吃饭
        const eatKeywords = /吃|买.*餐|买.*吃|买.*零食|买.*点心|买早餐|买午餐|买晚餐|买面包/;
        const eatScenes = ['kitchen', 'dorm_a', 'dorm_b'];
        if (eatKeywords.test(desc) && eatScenes.includes(this.currentScene) && !this.isEating) {
            this.isEating = true;
            this.eatingTimer = 20; // 吃饭持续 20 真实秒 ≈ 20 游戏分钟
            this.stateDesc = desc;
            this.mood = '满足';
            // 吃饭结束后在 _updateHunger 中恢复饥饿值
        }

        // 如果日程描述涉及社交（聊天、找人、讨论、探讨、聊聊），但附近没人
        const socialKeywords = /聊天|找人|串门|讨论|探讨|聊聊/;
        const isSocialIntent = socialKeywords.test(desc);
        if (isSocialIntent && nearby.length === 0) {
            this.stateDesc = desc.replace(socialKeywords, '') + '（没找到人）';
            this.mood = '无聊';
            this.expression = '怎么没人啊…';
            this.expressionTimer = 6;
            // 【修复】冷却机制：30秒内只触发一次"找不到人→出门游荡"，避免刷屏
            if (this._noOneFoundCooldown <= 0) {
                this._noOneFoundCooldown = 30; // 30秒冷却
                if (game.addEvent) {
                    game.addEvent(`😕 ${this.name} 到了目的地，但发现没人`);
                }
                // 在室内场景找不到人时，先离开建筑再去别处
                if (this.currentScene !== 'village') {
                    this._leaveAndWander(game);
                } else {
                    // 在户外找不到人，随机走向附近另一个地标碰碰运气
                    this._wanderToNearbyLandmark(game);
                }
            }
        } else if (isSocialIntent && nearby.length > 0) {
            // 附近有人，更新描述
            const names = nearby.slice(0, 2).map(n => n.name).join('、');
            this.stateDesc = `正在和${names}附近闲逛`;

            // 【修复】所有NPC到达社交目的地后都主动发起对话，不仅限于哲学家
            this._tryProactiveChat(game, nearby);
        } else if (!isSocialIntent && nearby.length > 0) {
            // 【增强】非社交日程，但附近有人时也有概率主动聊天（60%概率）
            if (Math.random() < 0.6 && this.state !== 'CHATTING') {
                this._tryProactiveChat(game, nearby);
            }
        }
    }

    /** 哲学家/思考型角色主动发起对话 */;

    proto._updateRainResponse = function(game) {
        if (!game.isRaining()) {
            this.isSeekingShelter = false;
            return;
        }

        // 【增强】CHATTING状态下不打断对话，但标记需要避雨（对话结束后会重新触发）
        if (this.state === 'CHATTING') {
            return;
        }

        // 【增强】已标记避雨但NPC停住了（被聊天/其他系统打断后恢复），强制重新触发避雨
        if (this.currentScene === 'village' && !this.hasUmbrella && this.isSeekingShelter
            && !this.isMoving && this.currentPath.length === 0 && !this.isSleeping) {
            // NPC说是在避雨但已经停下来了（可能聊天结束了），重置标记重新导航
            this.isSeekingShelter = false;
        }

        // 如果正在户外 (村庄场景) 且没有伞
        if (this.currentScene === 'village' && !this.hasUmbrella && !this.isSeekingShelter) {
            this.isSeekingShelter = true;
            
            // 找最近的避雨点（优先公寓楼门口，其次最近的建筑门口）
            const pos = this.getGridPos();
            const shelterDoors = [
                { x: 40, y: 51, name: '公寓楼' },    // 公寓
                { x: 32, y: 37, name: '酒馆' },       // 酒馆
                { x: 41, y: 36, name: '杂货铺' },     // 杂货铺
                { x: 50, y: 36, name: '面包坊' },     // 面包坊
            ];
            
            // 选最近的避雨点
            let nearest = shelterDoors[0]; // 默认公寓
            let nearestDist = Infinity;
            for (const s of shelterDoors) {
                const d = Math.abs(pos.x - s.x) + Math.abs(pos.y - s.y);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = s;
                }
            }
            
            this.stateDesc = `下雨了，跑向${nearest.name}避雨！`;
            this.expression = '下雨了！';
            this.expressionTimer = 4;
            // 【修复】避雨目标如果是建筑门口，设置pendingEnterScene以便到达后能进入建筑
            const shelterDoorMap = {
                '仓库': { enter: 'warehouse', key: 'warehouse_door' },
                '医疗站': { enter: 'medical', key: 'medical_door' },
                '宿舍A': { enter: 'dorm_a', key: 'dorm_a_door' },
                '宿舍B': { enter: 'dorm_b', key: 'dorm_b_door' },
                '炊事房': { enter: 'kitchen', key: 'kitchen_door' },
                '工坊': { enter: 'workshop', key: 'workshop_door' },
            };
            const shelterInfo = shelterDoorMap[nearest.name];
            if (shelterInfo) {
                this._pendingEnterScene = shelterInfo.enter;
                this._pendingEnterKey = shelterInfo.key;
            }
            this._pathTo(nearest.x, nearest.y, game);

            if (game.addEvent) {
                game.addEvent(`🌧️ ${this.name} 跑向${nearest.name}避雨`);
            }
        }
    }

    // ---- 日程系统 ----;

    proto._updateSchedule = function(dt, game) {
        // ============ 三层行为优先级系统 ============
        // P0: 生存紧急（体温<35回暖炉、第4天室内锁定、健康<20去暖炉、体力<20暂停任务）
        // P1: 任务驱动（_taskOverride激活时覆盖日程、紧急资源任务、LLM urgent行动）
        // P2: 日程默认（scheduleTemplate日程表、LLM normal行动）
        const ws = game.weatherSystem;
        const currentDay = ws ? ws.currentDay : 1;
        const hour = game.getHour();

        // ========== P0: 生存紧急层 ==========

        // P0-1: 第4天行为锁定 — 所有NPC锁定在室内
        if (currentDay === 4 && this.currentScene === 'village') {
            this._behaviorPriority = 'P0';
            const homeDoor = this.homeName === 'dorm_a' ? 'dorm_a_door' : 'dorm_b_door';
            if (!this._priorityOverride) {
                this._priorityOverride = 'day4_lockdown';
                this.stateDesc = '大极寒！紧急返回室内';
                this._logDebug('schedule', `[P0] 第4天室外锁定，返回${homeDoor}`);
                // AI模式日志：P0紧急返回
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('EMERGENCY', `${this.name} [P0]第4天室外锁定,紧急返回室内 | ${snap}`);
                }
                this._navigateToScheduleTarget(homeDoor, game);
            }
            // P0同时暂停taskOverride中的户外任务
            if (this._taskOverride.isActive) {
                this._taskOverride.isActive = false;
                this._logDebug('schedule', `[P0] 第4天暂停任务覆盖`);
            }
            return;
        }

        // P0-2: 紧急避险 — 体温<35°C时立即回暖炉
        // 【修复】如果NPC正赶往室内目标（medical_urgent/health_critical），且体温≥33°C，
        //         不覆盖为hypothermia，让NPC继续赶路（医疗站/宿舍也是室内，进去就能恢复体温）
        //         只有体温<33°C（严重失温）才强制覆盖，就近避险
        const isHeadingIndoor = this._priorityOverride === 'medical_urgent' || this._priorityOverride === 'health_critical';
        const needHypothermiaOverride = !isHeadingIndoor || this.bodyTemp < 33;
        if (this.bodyTemp !== undefined && this.bodyTemp < 35 && this.currentScene === 'village' && needHypothermiaOverride) {
            this._behaviorPriority = 'P0';
            if (this._priorityOverride !== 'hypothermia') {
                this._priorityOverride = 'hypothermia';
                this.stateDesc = '体温过低！紧急返回暖炉';
                this._logDebug('schedule', `[P0] 体温${this.bodyTemp.toFixed(1)}°C，紧急返回暖炉`);
                // AI模式日志：P0体温过低紧急返回
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('EMERGENCY', `${this.name} [P0]体温${this.bodyTemp.toFixed(1)}°C,紧急返回暖炉 | ${snap}`);
                }
                // 【增强】体温<34°C时，优先寻找最近的室内建筑入口，而不是只去暖炉
                // 【修复】兜底目标改为宿舍而非户外暖炉广场
                const hypoTarget = this.homeName + '_door';
                if (this.bodyTemp < 34) {
                    const nearestDoor = this._findNearestIndoorDoor(game);
                    if (nearestDoor) {
                        this._logDebug('schedule', `[P0] 体温极低(${this.bodyTemp.toFixed(1)}°C)，紧急前往最近室内入口: ${nearestDoor.key}`);
                        this._navigateToScheduleTarget(nearestDoor.key, game);
                    } else {
                        this._navigateToScheduleTarget(hypoTarget, game);
                    }
                } else {
                    const nearestDoor2 = this._findNearestIndoorDoor(game);
                    if (nearestDoor2) {
                        this._navigateToScheduleTarget(nearestDoor2.key, game);
                    } else {
                        this._navigateToScheduleTarget(hypoTarget, game);
                    }
                }
            } else if (!this.isMoving && this.currentPath.length === 0) {
                // 【防卡住兜底】已处于hypothermia但NPC不在移动，重新导航
                const hypoTarget2 = this.homeName + '_door';
                if (this.bodyTemp < 34) {
                    const nearestDoor = this._findNearestIndoorDoor(game);
                    if (nearestDoor) {
                        this._navigateToScheduleTarget(nearestDoor.key, game);
                    } else {
                        this._navigateToScheduleTarget(hypoTarget2, game);
                    }
                } else {
                    const nearestDoor2 = this._findNearestIndoorDoor(game);
                    if (nearestDoor2) {
                        this._navigateToScheduleTarget(nearestDoor2.key, game);
                    } else {
                        this._navigateToScheduleTarget(hypoTarget2, game);
                    }
                }
            }
            // P0同时暂停taskOverride
            if (this._taskOverride.isActive) {
                this._taskOverride.isActive = false;
                this._logDebug('schedule', `[P0] 低体温暂停任务覆盖`);
            }
            return;
        }

        // P0-3: 健康危急 — 使用动态阈值（行为锁下收紧）
        // 【行为锁优化】正在吃饭/睡觉/治疗时，阈值从<20收紧到<10
        const p0t = this._getP0Thresholds();
        if (this.health < p0t.healthThreshold && this.currentScene !== 'medical') {
            // 【行为锁】如果当前行为即将完成(5秒内)，等待完成后再触发P0
            if (this.isEating && this.eatingTimer > 0 && this.eatingTimer < 5) {
                this._logDebug('schedule', `[P0] 健康${Math.round(this.health)}但吃饭即将完成(${this.eatingTimer.toFixed(1)}s)，等待完成`);
                return; // 等吃完再触发
            }
            if (this.isSleeping) {
                if (this.health >= 10) {
                    return; // 睡觉中health>=10，不打断睡眠
                }
                console.warn(`[NPC-${this.name}] [异常] NPC在睡觉时段被P0驱动出门 health:${Math.round(this.health)}`);
            }
            this._behaviorPriority = 'P0';
            // 【修复】健康危急导航到宿舍而非户外暖炉广场，避免NPC站在户外无法恢复
            const healthTarget = this.homeName + '_door';
            if (this._priorityOverride !== 'health_critical') {
                this._priorityOverride = 'health_critical';
                this.stateDesc = '健康危急！赶紧回家休息';
                this._logDebug('schedule', `[P0] 健康${Math.round(this.health)}，紧急回宿舍`);
                // AI模式日志：P0健康危急
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('EMERGENCY', `${this.name} [P0]健康${Math.round(this.health)},紧急回宿舍 | ${snap}`);
                }
                this._navigateToScheduleTarget(healthTarget, game);
            } else if (!this.isMoving && this.currentPath.length === 0) {
                // 【防卡住兜底】已处于health_critical但NPC不在移动，重新导航
                this._navigateToScheduleTarget(healthTarget, game);
            }
            // P0同时暂停taskOverride
            if (this._taskOverride.isActive) {
                this._taskOverride.isActive = false;
                this._logDebug('schedule', `[P0] 健康危急暂停任务覆盖`);
            }
            return;
        }

        // P0-4: 体力不支时暂停任务覆盖，前往宿舍休息
        // 【复合需求仲裁】极度饥饿时跳过体力不支，让饥饿系统处理
        // 【修复】饱腹<15时无论体力多少都优先吃饭（不能饿着肚子去睡觉）
        // 【修复】睡觉中的NPC不触发体力不足出门（宿舍内本身就在恢复体力）
        if (this.hunger < 15) {
            // 饱腹极低（<15）：优先吃饭，跳过体力不支判断，让饥饿系统处理
            // 不能饿着肚子去睡觉，吃饭只需8秒很快就能完成
        } else if (this.hunger < 35 && this.stamina < 15) {
            // 都比较低时优先吃饭（吃饭只需8秒更快完成）
            // 跳过stamina_critical，让饥饿系统处理
        } else if (this.isSleeping && this.stamina < p0t.staminaThreshold) {
            // 睡觉中体力低不出门，静默跳过（宿舍内睡觉本身就在恢复体力）
            return;
        }
        // 【修复】正在吃饭或前往吃饭途中，不触发体力不支（让NPC先吃完再去休息）
        if (this.stamina < p0t.staminaThreshold && (this.isEating || this._hungerOverride)) {
            // 吃饭中/前往吃饭中，不打断
            return;
        }
        if (this.stamina < p0t.staminaThreshold && this._taskOverride.isActive) {
            // 【行为锁】如果当前行为即将完成(5秒内)，等待完成后再触发P0
            if (this.isEating && this.eatingTimer > 0 && this.eatingTimer < 5) {
                this._logDebug('schedule', `[P0] 体力${Math.round(this.stamina)}但吃饭即将完成(${this.eatingTimer.toFixed(1)}s)，等待完成`);
                return;
            }
            this._behaviorPriority = 'P0';
            this._taskOverride.isActive = false;
            // 【修复】体力不支导航到宿舍而非户外暖炉广场，避免NPC站在户外无法恢复
            const staminaTarget = this.homeName + '_door';
            if (this._priorityOverride !== 'stamina_critical') {
                this._priorityOverride = 'stamina_critical';
                this.stateDesc = '体力不支！赶紧回家休息';
                this._logDebug('schedule', `[P0] 体力${Math.round(this.stamina)}，暂停任务回宿舍`);
                // AI模式日志：P0体力不支
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('EMERGENCY', `${this.name} [P0]体力${Math.round(this.stamina)},暂停任务回宿舍 | ${snap}`);
                }
                this._navigateToScheduleTarget(staminaTarget, game);
            } else if (!this.isMoving && this.currentPath.length === 0) {
                // 【防卡住兜底】已处于stamina_critical但NPC不在移动，说明导航被中断，重新导航
                this._logDebug('schedule', `[P0] 体力不支且NPC静止，重新导航宿舍`);
                this._navigateToScheduleTarget(staminaTarget, game);
            }
            return;
        }

        // P0-5: 医疗需求 — 健康<30时前往医疗站
        // 【修复】睡觉中的NPC只有health<10才打断睡眠去医疗站
        if (this.health < 30 && this.currentScene !== 'medical') {
            if (this.isSleeping && this.health >= 10) {
                return; // 睡觉中health>=10，不打断睡眠去医疗站
            }
            this._behaviorPriority = 'P0';
            if (this._priorityOverride !== 'medical_urgent') {
                this._priorityOverride = 'medical_urgent';
                this.stateDesc = '健康危急！前往医疗站';
                this._logDebug('schedule', `[P0] 健康${Math.round(this.health)}，前往医疗站`);
                // AI模式日志：P0医疗需求
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('EMERGENCY', `${this.name} [P0]健康${Math.round(this.health)},前往医疗站 | ${snap}`);
                }
                this._navigateToScheduleTarget('medical_door', game);
            } else if (!this.isMoving && this.currentPath.length === 0) {
                // 【修复】已处于medical_urgent但NPC不在移动（如刚出门到village），重新导航到medical_door
                this._navigateToScheduleTarget('medical_door', game);
            }
            return;
        }

        // P0-6: 第2天户外任务2小时轮换机制
        if (currentDay === 2 && this.currentScene === 'village') {
            if (!this._outdoorTimer) this._outdoorTimer = 0;
            this._outdoorTimer += dt;
            if (this._outdoorTimer > 120) { // 2分钟真实时间≈游戏2小时
                this._behaviorPriority = 'P0';
                if (this._priorityOverride !== 'day2_return') {
                    this._priorityOverride = 'day2_return';
                    this.stateDesc = '户外超时2小时，必须返回室内';
                    this._logDebug('schedule', `[P0] 第2天户外超时，强制返回宿舍`);
                    // 【修复】导航到宿舍而非户外暖炉广场
                    this._navigateToScheduleTarget(this.homeName + '_door', game);
                }
                return;
            }
        } else {
            this._outdoorTimer = 0;
        }

        // P0优先级覆盖清除检测
        if (this._priorityOverride) {
            const canClear = (
                (this._priorityOverride === 'hypothermia' && (this.bodyTemp === undefined || this.bodyTemp >= 35.5)) ||
                (this._priorityOverride === 'medical_urgent' && this.health >= 40) ||
                (this._priorityOverride === 'health_critical' && this.health >= 30) ||
                (this._priorityOverride === 'stamina_critical' && this.stamina >= 40) ||
                (this._priorityOverride === 'day2_return' && this.currentScene !== 'village') ||
                (this._priorityOverride === 'day4_lockdown' && this.currentScene !== 'village')
            );
            if (canClear) {
                const clearedType = this._priorityOverride;
                this._priorityOverride = null;
                this._logDebug('schedule', `[P0] 优先级覆盖(${clearedType})已清除，恢复正常行为`);
                // 【v3.0修复】P0 hypothermia 清除后设置户外冷却保护期，防止日程立即导航到户外又触发P0
                if (clearedType === 'hypothermia') {
                    this._outdoorCooldown = 30; // 30秒真实时间内不允许导航到户外
                }
                // 【行为锁】P0恢复后检查是否仍在就寝时段，如果是则导航回宿舍继续睡觉
                const curHour = game.getHour();
                if (this._isBedtime(curHour) && !this.isSleeping) {
                    this._logDebug('schedule', `[P0恢复] 仍在就寝时段(${curHour}时)，导航回宿舍继续睡觉`);
                    this._navigateToScheduleTarget(this.homeName + '_door', game);
                    return;
                }
                // P0恢复后自动重启被暂停的任务
                if (this._taskOverride.targetLocation && this._taskOverride.taskId && !this._taskOverride.isActive) {
                    this._taskOverride.isActive = true;
                    this._taskOverrideReached = false;
                    this._taskOverrideStuckTimer = 0;
                    this._taskOverrideTravelTimer = 0;
                    this._logDebug('schedule', `[P0恢复] 自动重启被暂停的任务: ${this._taskOverride.taskId} → ${this._taskOverride.targetLocation}`);
                    this._navigateToScheduleTarget(this._taskOverride.targetLocation, game);
                }
            } else {
                return; // P0行为未完成，继续执行
            }
        }

        // ========== P1: 任务驱动覆盖层 ==========
        // 当_taskOverride激活时，跳过P2日程，导航到任务目标位置

        // 【一致性检查】饥饿覆盖和任务覆盖不能同时存在
        if (this._hungerOverride && this._taskOverride && this._taskOverride.isActive) {
            console.log(`[一致性] ${this.name} 饥饿覆盖与任务覆盖同时存在，强制取消任务覆盖`);
            this.deactivateTaskOverride();
        }

        // P1-1: 任务覆盖激活检测
        if (this._taskOverride.isActive && this._taskOverride.targetLocation) {
            this._behaviorPriority = 'P1';

            // 第4天禁止户外任务
            if (currentDay === 4) {
                const targetLoc = GST.SCHEDULE_LOCATIONS[this._taskOverride.targetLocation];
                if (targetLoc && targetLoc.scene === 'village') {
                    // 户外目标在第4天禁止
                    this._taskOverride.isActive = false;
                    this._logDebug('schedule', `[P1] 第4天禁止户外任务，取消任务覆盖`);
                    // 继续往下执行P2
                } else {
                    // 室内任务可以执行
                    this._updateTaskOverrideNavigation(dt, game);
                    return;
                }
            } else {
                this._updateTaskOverrideNavigation(dt, game);
                return;
            }
        }

        // ========== P2: 日程默认层 ==========
        this._behaviorPriority = 'P2';

        // 【修复】睡眠全局保护：NPC在睡觉中时跳过P2层几乎所有逻辑
        // 仅在真正致命情况（体温<33°C、健康<10）才允许P0穿透（已在上面P0层处理）
        if (this.isSleeping && this.health >= 10 && (this.bodyTemp === undefined || this.bodyTemp >= 33)) {
            return; // 睡觉中，跳过日程执行、饥饿检查、状态覆盖等所有P2逻辑
        }

        // 【饥饿系统】检查是否到达吃饭地点（每帧都检测）
        this._checkEatingArrival(dt, game);

        // 【饥饿系统】如果正在吃饭，完全跳过日程
        if (this.isEating) return;

        // 【状态覆盖系统】状态覆盖期间完全跳过正常日程
        if (this._stateOverride || this._isBeingTreated) return;

        // 【LLM行动决策系统】行动覆盖期间完全跳过正常日程
        if (this._actionOverride && this._actionTarget) return;
        // 【LLM行动决策系统】同伴跟随期间完全跳过正常日程
        if (this._isCompanion && this._companionDestination) return;

        // 【饥饿系统】饥饿覆盖状态下，完全跳过正常日程调度
        // 【兜底】如果_hungerOverride=true但_hungerTarget为空（说明_triggerHungerBehavior被出门保护/P0保护拦截了），
        // 自动重置_hungerOverride，让饥饿系统在下一帧可以重新触发
        if (this._hungerOverride && !this._hungerTarget && !this.isEating) {
            this._hungerOverride = false;
        }
        if (this._hungerOverride && this._hungerTarget) {
            // 正在移动中 → 继续走，不干预
            if (this.isMoving || this.currentPath.length > 0) return;

            // 已到达目标场景 → _checkEatingArrival 会在上面处理
            const eatingScenes = {
                'kitchen_door': 'kitchen',
                'warehouse_door': 'warehouse',
                'dorm_a_door': 'dorm_a', 'dorm_b_door': 'dorm_b',
            };
            const targetScene = eatingScenes[this._hungerTarget.target];
            if (this.currentScene === targetScene) return; // 等待 _checkEatingArrival 处理

            // 既不在移动，也没到目标场景 → 卡住了，重新导航
            this._hungerStuckTimer = (this._hungerStuckTimer || 0) + 1;
            if (this._hungerStuckTimer > 2) {
                // 卡住超过2帧，强制重新导航
                this._hungerStuckTimer = 0;
                this._navigateToScheduleTarget(this._hungerTarget.target, game);
            }
            return; // 饥饿覆盖期间完全不执行正常日程
        }

        // hour 已在函数开头声明
        const sched = this.scheduleTemplate;
        let targetIdx = -1;

        for (let i = 0; i < sched.length; i++) {
            const s = sched[i];
            if (s.start <= s.end) {
                if (hour >= s.start && hour < s.end) { targetIdx = i; break; }
            } else {
                // 跨午夜
                if (hour >= s.start || hour < s.end) { targetIdx = i; break; }
            }
        }

        // 【天气影响】如果正在下雨，NPC在户外（village场景），且当前日程原本是户外目标，
        // 强制触发重新导航到室内（即使日程没有切换）
        if (targetIdx >= 0 && game.isRaining() && this.currentScene === 'village' && this.scheduleReached) {
            const rawTarget = sched[targetIdx].target;
            if (NPC.OUTDOOR_TARGETS.has(rawTarget)) {
                // 原始目标是户外，但下雨了，需要重新导航到室内替代目标
                const adjusted = this._getWeatherAdjustedEntry(sched[targetIdx], game);
                this.stateDesc = adjusted.desc;
                this.scheduleReached = false;
                this._navigateToScheduleTarget(adjusted.target, game);
            }
        }

        if (targetIdx !== this.currentScheduleIdx) {
            this.currentScheduleIdx = targetIdx;
            // 【关键修复】行动覆盖期间，日程切换只更新索引，不覆盖状态和导航
            // 否则NPC决定去做B事，日程切换会覆盖stateDesc并重置scheduleReached，
            // 导致NPC走一半转头去执行旧日程
            if (this._actionOverride) {
                // 行动覆盖中，仅记录日程变化，不干预当前行为
                this._logDebug('schedule', `日程切换到#${targetIdx}但行动覆盖中，不干预`);
            } else if (this._chatWalkTarget) {
                // 【修复】社交走路中，仅记录日程变化，不干预（防止日程打断走向聊天目标的路径）
                this._logDebug('schedule', `日程切换到#${targetIdx}但正在走向聊天目标，不干预`);
            } else if (this.isSleeping) {
                // 【修复】NPC正在睡觉时日程切换：判断新日程是否也是睡觉日程
                // 如果是（如22-24点切换到0-6点），只更新索引不打断睡眠
                const newSched = targetIdx >= 0 ? sched[targetIdx] : null;
                const isNewSchedSleep = newSched && (
                    (newSched.action === 'STAY' && newSched.target && newSched.target.includes('_bed_')) ||
                    (newSched.action === 'STAY' && newSched.desc && newSched.desc.includes('休息') && newSched.desc.includes('睡觉'))
                );
                if (isNewSchedSleep) {
                    // 新日程也是睡觉日程，平滑延续睡眠，不重置scheduleReached
                    this.scheduleReached = true; // 标记已到达（NPC已在床上）
                    this.stateDesc = newSched.desc;
                    this._logDebug('schedule', `日程切换到#${targetIdx}:${newSched.desc} 睡眠中平滑过渡，不重新导航`);
                } else {
                    // 新日程不是睡觉日程（如6点以后的起床日程），正常处理
                    this.scheduleReached = false;
                    this._enterWalkTarget = null;
                    if (targetIdx >= 0) {
                        const rawS = sched[targetIdx];
                        const s = this._getWeatherAdjustedEntry(rawS, game);
                        this.stateDesc = s.desc;
                        this._logDebug('schedule', `日程切换→#${targetIdx}:${s.desc} 目标:${s.target} (睡眠将由_updateSleepState结束)`);
                    }
                }
            } else {
                this.scheduleReached = false;
                this._enterWalkTarget = null; // 清空旧的室内走路目标
                if (targetIdx >= 0) {
                    const rawS = sched[targetIdx];
                    const s = this._getWeatherAdjustedEntry(rawS, game);
                    this.stateDesc = s.desc;
                    // 【修复】CHATTING、饥饿覆盖状态下不触发导航
                    if (this.state !== 'CHATTING' && !this._hungerOverride) {
                        this._logDebug('schedule', `日程切换→#${targetIdx}:${s.desc} 目标:${s.target}`);
                        this._navigateToScheduleTarget(s.target, game);
                    }
                }
            }
        }

        // 【任务4】日程导航超时兜底：如果导航超过30秒仍未到达，强制传送
        // 【修复】持有行为锁/吃饭/休息缓冲/前往吃饭途中时跳过超时传送
        if (targetIdx >= 0 && !this.scheduleReached && this._scheduleNavTarget) {
            this._scheduleNavTimer += dt;
            // 行为锁保护：持有行为锁时重置计时器，不触发超时传送
            if (this._currentBehaviorLock) {
                this._scheduleNavTimer = 0;
            }
            // 吃饭/休息缓冲期保护
            if (this.isEating || this._restCooldownTimer > 0 || this._isBeingTreated) {
                this._scheduleNavTimer = 0;
            }
            // 前往吃饭途中且正在移动，不触发超时
            if (this._hungerOverride && this.isMoving) {
                this._scheduleNavTimer = 0;
            }
            if (this._scheduleNavTimer > 30) {
                const rawST = sched[targetIdx];
                const sT = this._getWeatherAdjustedEntry(rawST, game);
                const locT = GST.SCHEDULE_LOCATIONS[sT.target];
                if (locT) {
                    // 【天气保护】超时传送目标为室外且天气禁止外出时，取消传送
                    const wsT = game && game.weatherSystem;
                    if (wsT && !wsT.canGoOutside() && locT.scene === 'village' && this.currentScene !== 'village') {
                        console.warn(`[NPC-${this.name}] [天气保护] 日程导航超时但目标在室外，取消传送，就地待命`);
                        this.scheduleReached = true;
                        this._scheduleNavTimer = 0;
                        this._scheduleNavTarget = null;
                        return;
                    }
                    console.warn(`[NPC-${this.name}] 日程导航超时30秒，强制传送到 ${sT.target} (${locT.scene},${locT.x},${locT.y})`);
                    this._teleportTo(locT.scene, locT.x, locT.y);
                    this.scheduleReached = true;
                    this._scheduleNavTimer = 0;
                    this._scheduleNavTarget = null;
                    this._logDebug('schedule', `[P2] 日程导航超时，强制传送到 ${sT.target}`);
                    return;
                }
                this._scheduleNavTimer = 0; // 目标无效，重置计时器
            }
        }

        // 如果日程未到达，且NPC没在移动中，可能需要重新导航
        // （处理多步传送的情况：酒馆→村庄后，还需从村庄→公寓）
        // 【行为锁保护】当持有resting/sleeping行为锁时，跳过P2日程导航
        const _lockType = this._getBehaviorLockType();
        if (_lockType === 'resting' || _lockType === 'sleeping' || _lockType === 'eating') {
            // 行为锁保护中，跳过P2日程导航
        } else if (targetIdx >= 0 && !this.scheduleReached && !this.isMoving && this.currentPath.length === 0 && !this.isSleeping && this.state !== 'CHATTING' && !this._hungerOverride && !this._actionOverride && !this._chatWalkTarget) {
            const rawS = sched[targetIdx];
            const s = this._getWeatherAdjustedEntry(rawS, game);
            const loc = GST.SCHEDULE_LOCATIONS[s.target];
            const isDoorTarget = s.target.endsWith('_door');
            const doorToScene = {
                warehouse_door: 'warehouse', medical_door: 'medical',
                dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
                kitchen_door: 'kitchen', workshop_door: 'workshop',
            };

            // 【修复】如果目标是门口类（xxx_door），NPC已经进入对应室内场景
            if (isDoorTarget) {
                const insideScene = doorToScene[s.target];
                if (insideScene && this.currentScene === insideScene) {
                    // NPC已在目标室内场景中，直接标记到达，不再反复寻路
                    this.scheduleReached = true;
                    this._enterWalkTarget = null;
                    return;
                }
            }

            // 【修复】如果NPC在村庄且已站在门口附近（5格内），直接进入建筑
            if (isDoorTarget && this.currentScene === 'village' && loc) {
                const pos = this.getGridPos();
                const dist = Math.abs(pos.x - loc.x) + Math.abs(pos.y - loc.y);
                if (dist <= 5) {
                    const insideScene = doorToScene[s.target];
                    if (insideScene) {
                        this._enterIndoor(insideScene, game);
                        return;
                    }
                }
            }

            if (loc && loc.scene !== this.currentScene) {
                this._navigateToScheduleTarget(s.target, game);
            } else if (loc && loc.scene === this.currentScene) {
                // 同场景但还没到达，重新导航
                this._navigateToScheduleTarget(s.target, game);
            }
        }

        // 【安全网】如果日程标记为已到达，但目标是门口类（xxx_door）且NPC仍在村庄，说明进入建筑失败，先传送到室内门口再走进去
        // 【休息缓冲期】缓冲期内跳过安全网逻辑，避免把NPC传送出去
        // 【修复】饥饿覆盖/进屋保护期内跳过安全网，避免NPC刚走出门就被传送回去
        if (this.scheduleReached && targetIdx >= 0 && !this.isSleeping && this.state !== 'CHATTING' && !this.isRestingCooldown
            && !this._currentBehaviorLock && !this.isEating && !this._isBeingTreated
            && !this._hungerOverride && !this._resourceGatherOverride && this._indoorEntryProtection <= 0) {
            const curTarget = this._getWeatherAdjustedEntry(sched[targetIdx], game).target;
            if (curTarget.endsWith('_door') && this.currentScene === 'village') {
                const safetyDoorToScene = {
                    warehouse_door: 'warehouse', medical_door: 'medical',
                    dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
                    kitchen_door: 'kitchen', workshop_door: 'workshop',
                };
                const targetScene = safetyDoorToScene[curTarget];
                if (targetScene) {
                    this._enterIndoor(targetScene, game);
                }
            }
        }

        // 已到达目的地后，动态感知环境并调整状态描述
        // 【修复】CHATTING 状态下不触发环境感知，避免把正在聊天的NPC传送走
        // 【位置偏移修正】scheduleReached=true但NPC远离目标时，重新导航
        // 【休息缓冲期】缓冲期内跳过位置偏移修正，避免把NPC导航出去
        if (this.scheduleReached && targetIdx >= 0 && !this.isSleeping && this.state !== 'CHATTING' && !this.isMoving && this.currentPath.length === 0 && !this.isRestingCooldown
            && !this._currentBehaviorLock && !this.isEating && !this._isBeingTreated
            && !this._hungerOverride && !this._stateOverride && !this._enterWalkTarget) {
            const rawSCheck = sched[targetIdx];
            const sCheck = this._getWeatherAdjustedEntry(rawSCheck, game);
            const locCheck = GST.SCHEDULE_LOCATIONS[sCheck.target];
            if (locCheck && locCheck.scene === this.currentScene) {
                const posCheck = this.getGridPos();
                const distCheck = Math.abs(posCheck.x - locCheck.x) + Math.abs(posCheck.y - locCheck.y);
                if (distCheck > 6) {
                    console.warn(`[NPC-${this.name}] [位置偏移修正] scheduleReached=true但距目标${sCheck.target}距离=${distCheck}格(>6)，重新导航`);
                    this.scheduleReached = false;
                    this._navigateToScheduleTarget(sCheck.target, game);
                    return;
                }
            }
        }
        if (this.scheduleReached && targetIdx >= 0 && !this.isSleeping && this.state !== 'CHATTING') {
            this._postArrivalAwareness(game, this._getWeatherAdjustedEntry(sched[targetIdx], game));

            // 店主无客外出招揽机制：当在自己店里且连续无客超过30分钟，出门招揽
            if (this.workplaceName === this.currentScene && this.shopAloneMinutes > 30) {
                const hour = game.getHour();
                // 只在正常营业时间触发（不在睡觉时间）
                if (hour >= 7 && hour <= 20 && !this.isMoving && this.currentPath.length === 0) {
                    this.shopAloneMinutes = 0; // 重置计时
                    this.stateDesc = '店里太冷清了，出门转转招揽客人';
                    this.expression = '唉，今天怎么没人来呢…出门看看吧';
                    this.expressionTimer = 6;
                    this.mood = '无聊';
                    if (game.addEvent) {
                        game.addEvent(`🚶 ${this.name} 因无客外出招揽生意`);
                    }
                    // 离开店铺去广场/街上
                    this._leaveAndWander(game);
                    this.scheduleReached = false;
                    return;
                }
            }
        }
    }

    // ============ P1任务驱动覆盖导航 ============

    /**
     * 处理任务覆盖状态下的导航逻辑
     * 当_taskOverride.isActive时由_updateSchedule的P1层调用
     */;

    proto._updateSleepState = function(game) {
        const hour = game.getHour();
        
        // 【兜底硬保护】NPC在village(户外)绝对不能处于睡眠状态
        if (this.isSleeping && this.currentScene === 'village') {
            console.warn(`[户外睡觉兜底] ${this.name} 在village处于isSleeping状态，强制清除并导航回家`);
            this.isSleeping = false;
            this.state = 'IDLE';
            this._forcedSleep = false;
            // 强制导航回家
            const homeDoorKey = this.homeName + '_door';
            const homeDoorLoc = GST.SCHEDULE_LOCATIONS[homeDoorKey];
            if (homeDoorLoc && !this.isMoving && this.currentPath.length === 0) {
                this._pendingEnterScene = this.homeName;
                this._pendingEnterKey = homeDoorKey;
                this._pathTo(homeDoorLoc.x, homeDoorLoc.y, this.game);
            }
            return;
        }
        
        // 找到当前时段的日程
        const sched = this.scheduleTemplate;
        let currentAction = null;
        for (const s of sched) {
            if (s.start <= s.end) {
                if (hour >= s.start && hour < s.end) { currentAction = s; break; }
            } else {
                if (hour >= s.start || hour < s.end) { currentAction = s; break; }
            }
        }

        // 判断是否该睡觉：必须是STAY动作且target包含_bed_（精确匹配床位日程）
        // 避免WALK_TO + "准备休息"类日程误触发入睡
        const isSleepAction = currentAction && (
            (currentAction.action === 'STAY' && currentAction.target && currentAction.target.includes('_bed_')) ||
            (currentAction.action === 'STAY' && currentAction.desc && currentAction.desc.includes('休息') && currentAction.desc.includes('睡觉'))
        );
        const shouldSleep = isSleepAction && this._isAtHome();

        // 【修复】深夜了(23点~6点)，如果NPC还在外面且处于饥饿覆盖状态，
        // 强制清除饥饿覆盖，让回家逻辑可以接管
        if (isSleepAction && !this._isAtHome() && this._hungerOverride) {
            this._hungerOverride = false;
            this._hungerTarget = null;
            this._hungerStuckTimer = 0;
            this._hungerTravelTimer = 0;
            this.isEating = false;
            this.currentPath = [];
            this.isMoving = false;
            this.currentScheduleIdx = -1;
            this.scheduleReached = false;
        }

        // 如果该睡觉了但还不在家，强制导航回宿舍（避免在路上站着睡）
        // 【修复】CHATTING状态下不强制回家，等对话结束后再说
        if (isSleepAction && !this._isAtHome() && !this.isSleeping && this.state !== 'CHATTING') {
            if (!this.isMoving && this.currentPath.length === 0) {
                if (this.currentScene === 'village') {
                    // 在村庄里 → 走向宿舍门口，到达后自动进入
                    const homeDoorKey = this.homeName + '_door';
                    const homeDoorLoc = GST.SCHEDULE_LOCATIONS[homeDoorKey];
                    if (homeDoorLoc) {
                        this._pendingEnterScene = this.homeName;
                        this._pendingEnterKey = homeDoorKey;
                        this._pathTo(homeDoorLoc.x, homeDoorLoc.y, this.game);
                    }
                } else if (this.currentScene !== this.homeName) {
                    // 在其他室内 → 先传送出门到村庄
                    const doorPos = this._getDoorPos();
                    this._teleportTo('village', doorPos.x, doorPos.y);
                }
            }
        }

        if (shouldSleep && !this.isSleeping && this.state !== 'CHATTING' && !this._hungerOverride) {
            // 【硬保护】绝对不能在village(户外)入睡！必须在室内场景
            // 【修复】饥饿覆盖期间不入睡：NPC被饿醒后必须先吃饭再睡觉，否则入睡会清除饥饿导航路径导致梦游循环
            if (this.currentScene === 'village') {
                console.warn(`[户外入睡阻止] ${this.name} 在village(户外)触发入睡条件但被阻止，强制导航回家`);
                // 强制导航回宿舍
                const homeDoorKey = this.homeName + '_door';
                const homeDoorLoc = GST.SCHEDULE_LOCATIONS[homeDoorKey];
                if (homeDoorLoc && !this.isMoving && this.currentPath.length === 0) {
                    this._pendingEnterScene = this.homeName;
                    this._pendingEnterKey = homeDoorKey;
                    this._pathTo(homeDoorLoc.x, homeDoorLoc.y, this.game);
                }
                return; // 不入睡
            }
            // 【修复】入睡时强制修正坐标到床位位置
            const bedLoc = GST.SCHEDULE_LOCATIONS[this.homeName + '_inside'];
            if (bedLoc) {
                this.x = bedLoc.x * GST.TILE;
                this.y = bedLoc.y * GST.TILE;
            }
            this.isSleeping = true;
            this.state = 'SLEEPING';
            this.stateDesc = '正在睡觉 💤';
            this.currentPath = [];
            this.isMoving = false;
            this.expression = '';
            this._logDebug('sleep', `开始睡觉(日程) 体力:${Math.round(this.stamina)} San:${Math.round(this.sanity)}`);
            // AI模式日志：入睡
            if (this.game && this.game.aiModeLogger) {
                const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                this.game.aiModeLogger.log('SLEEP_START', `${this.name} 开始睡觉(日程) | ${snap} | ${this.currentScene || '?'}`);
            }
        } else if (!shouldSleep && this.isSleeping) {
            // 【修复】防震荡保护：如果当前时间仍在0-6点睡觉时段且NPC在家中，
            // 可能是日切换导致的单帧震荡，不起床
            const wakeHour = game.getHour();
            if (this._dayChangeWhileSleeping && wakeHour >= 0 && wakeHour < 6 && this._isAtHome()) {
                // 日切换震荡，强制维持睡眠状态
                this._logDebug('sleep', `[防震荡] 日切换后0-6点仍在家中，忽略起床信号 hour:${wakeHour}`);
                this._dayChangeWhileSleeping = false; // 消耗标记
                return; // 不起床
            }
            // 【强制睡眠保护】体力不支/白天休息强制入睡时，不受日程驱动的起床影响
            if (this._forcedSleep) {
                const staminaOk = this.stamina >= 40;
                const timeoutOk = this._forcedSleepTimer > 7200; // 游戏内2小时安全超时
                const fatalOverride = (this.health < 10) || (this.bodyTemp !== undefined && this.bodyTemp < 33);
                if (!staminaOk && !timeoutOk && !fatalOverride) {
                    // 强制睡眠尚未恢复，阻止起床
                    this._logDebug('sleep', `[强制睡眠] 阻止起床 体力:${Math.round(this.stamina)} 已睡:${Math.round(this._forcedSleepTimer)}s`);
                    return; // 不起床
                }
                // 强制睡眠条件满足，允许起床并清除标记
                const reason = fatalOverride ? '致命紧急穿透' : staminaOk ? `体力恢复到${Math.round(this.stamina)}` : `安全超时(${Math.round(this._forcedSleepTimer)}s)`;
                this._logDebug('sleep', `[强制睡眠结束] ${reason}`);
                this._forcedSleep = false;
                this._forcedSleepTimer = 0;
                // 标记本次起床是强制睡眠恢复，用于后续stateDesc判断
                this._wasForcedSleep = true;
            }
            // 正常起床
            this._dayChangeWhileSleeping = false;
            // AI模式日志：醒来（在isSleeping置false之前记录，便于对比入睡值）
            if (this.game && this.game.aiModeLogger) {
                const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                this.game.aiModeLogger.log('SLEEP_END', `${this.name} 醒来 | ${snap} | ${this.currentScene || '?'}`);
            }
            this.isSleeping = false;
            this.state = 'IDLE';
            this.mood = '平静';
            // 【修复B2】根据起床原因和时间设置合理的stateDesc和expression
            if (this._wasForcedSleep) {
                // 强制睡眠恢复后的描述
                this.stateDesc = '休息好了';
                this.expression = '精神好多了';
                this._wasForcedSleep = false;
            } else if (wakeHour >= 5 && wakeHour < 9) {
                // 早上5-9点：正常起床
                this.stateDesc = '刚起床';
                this.expression = '新的一天开始了~';
            } else if (wakeHour >= 9 && wakeHour < 18) {
                // 白天9-18点：小憩醒来
                this.stateDesc = '小憩醒来';
                this.expression = '精神好了一些';
            } else {
                // 夜间18-24点或0-5点
                this.stateDesc = '醒了过来';
                this.expression = '醒了...';
            }
            this.expressionTimer = 5;
            this.sleepZTimer = 0;
            if (game.addEvent) {
                game.addEvent(`🌅 ${this.name} ${this.stateDesc}`);
            }
        }
    };

    proto._updateTaskOverrideNavigation = function(dt, game) {
        const override = this._taskOverride;
        if (!override.isActive || !override.targetLocation) return;

        // 【出门过程保护】NPC正在出门时不执行任务导航
        if (this._walkingToDoor) return;

        // 【饥饿覆盖保护】饥饿覆盖中直接取消任务
        if (this._hungerOverride) {
            console.log(`[饥饿优先] ${this.name} 正在进食/前往进食，取消任务导航 ${override.taskId}`);
            this.deactivateTaskOverride();
            return;
        }
        // 【极度饥饿保护】hunger<15时强制取消任务
        if (this.hunger < 15) {
            console.log(`[极度饥饿] ${this.name} hunger=${Math.round(this.hunger)}<15，强制取消任务 ${override.taskId}`);
            this.deactivateTaskOverride();
            return;
        }
        // 【状态覆盖保护】状态覆盖中跳过任务导航
        if (this._stateOverride) return;

        let targetLoc = GST.SCHEDULE_LOCATIONS[override.targetLocation];
        if (!targetLoc) {
            // 尝试去掉_enter后缀修正
            const stripped = override.targetLocation.replace(/_enter$/, '');
            if (GST.SCHEDULE_LOCATIONS[stripped]) {
                override.targetLocation = stripped;
                targetLoc = GST.SCHEDULE_LOCATIONS[stripped];
                console.warn(`[NPC-${this.name}] 自动修正任务目标: "${override.targetLocation}" → "${stripped}"`);
            } else {
                // 根据资源类型使用备用坐标
                const fallbackMap = {
                    woodFuel: 'lumber_camp',
                    food: 'frozen_lake',
                    material: 'ruins_site',
                    power: 'workshop_door'
                };
                const fallbackKey = (override.resourceType && fallbackMap[override.resourceType]) || 'furnace_plaza';
                targetLoc = GST.SCHEDULE_LOCATIONS[fallbackKey];
                if (targetLoc) {
                    override.targetLocation = fallbackKey;
                    console.warn(`[NPC-${this.name}] 任务覆盖目标无效，回退到 "${fallbackKey}"`);
                } else {
                    console.warn(`[NPC-${this.name}] 任务覆盖目标 "${override.targetLocation}" 无法修正，取消任务`);
                    override.isActive = false;
                    return;
                }
            }
        }

        // 如果正在吃饭/治疗，不干预
        if (this.isEating || this._isBeingTreated) return;

        // CHATTING状态处理：urgent任务可以打断聊天，其他优先级等待
        if (this.state === 'CHATTING') {
            if (override.priority === 'urgent') {
                console.log(`[NPC-${this.name}] urgent任务打断聊天导航`);
                this._forceEndChat();
            } else {
                return; // 非urgent任务等待聊天结束
            }
        }

        // 检查是否已到达目标场景和位置
        // 【关键修复】_door类型目标需要区分：NPC站在门口(village) vs 已进入室内
        const isDoorTarget = override.targetLocation.endsWith('_door');
        const doorToSceneMap = {
            warehouse_door: 'warehouse', medical_door: 'medical',
            dorm_a_door: 'dorm_a', dorm_b_door: 'dorm_b',
            kitchen_door: 'kitchen', workshop_door: 'workshop',
        };
        const targetIndoorScene = isDoorTarget ? doorToSceneMap[override.targetLocation] : null;

        // 如果是_door目标且NPC已进入对应室内场景 → 真正到达
        if (targetIndoorScene && this.currentScene === targetIndoorScene) {
            if (!this._taskOverrideReached) {
                this._taskOverrideReached = true;
                this._taskOverrideStuckTimer = 0;
                this._taskOverrideTravelTimer = 0;
                this._logDebug('schedule', `[P1] 已进入室内${targetIndoorScene}，任务目标到达 ${override.targetLocation}`);
                if (this.game && this.game.aiModeLogger) {
                    const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                    this.game.aiModeLogger.log('WORK', `${this.name} 到达任务目标(室内) ${override.targetLocation} | 任务:${override.taskId || '?'} | ${snap}`);
                }
            }
            this.scheduleReached = true;
            return;
        }

        // 如果是_door目标且NPC在village场景靠近门口 → 需要进入室内，不算到达
        if (targetIndoorScene && this.currentScene === 'village' && this.currentScene === targetLoc.scene) {
            const pos = this.getGridPos();
            const dist = Math.abs(pos.x - targetLoc.x) + Math.abs(pos.y - targetLoc.y);
            if (dist <= 4) {
                // NPC在门口附近但未进入室内，触发进入
                if (!this.isMoving && this.currentPath.length === 0) {
                    console.log(`[任务导航] ${this.name} 到达${override.targetLocation}门口(dist=${dist})，触发进入室内${targetIndoorScene}`);
                    this._logDebug('schedule', `[P1] 到达门口，触发进入室内 ${targetIndoorScene}`);
                    this._pendingEnterScene = targetIndoorScene;
                    this._pendingEnterKey = override.targetLocation;
                    this._pathTo(targetLoc.x, targetLoc.y, game);
                }
                return; // 不标记到达，等待进入室内
            }
            // 距离较远，继续导航到门口
            if (!this.isMoving && this.currentPath.length === 0) {
                this._navigateToScheduleTarget(override.targetLocation, game);
            }
        } else if (this.currentScene === targetLoc.scene) {
            const pos = this.getGridPos();
            const dist = Math.abs(pos.x - targetLoc.x) + Math.abs(pos.y - targetLoc.y);
            if (dist <= 4) {
                // 已到达任务目标位置，标记为"正在执行任务"
                if (!this._taskOverrideReached) {
                    this._taskOverrideReached = true;
                    this._taskOverrideStuckTimer = 0;
                    this._taskOverrideTravelTimer = 0;
                    this._logDebug('schedule', `[P1] 已到达任务目标位置 ${override.targetLocation}`);
                    // AI模式日志：工作/采集任务到达
                    if (this.game && this.game.aiModeLogger) {
                        const snap = GST.AIModeLogger.npcAttrSnapshot(this);
                        this.game.aiModeLogger.log('WORK', `${this.name} 到达任务目标 ${override.targetLocation} | 任务:${override.taskId || '?'} | ${snap}`);
                    }
                }
                // 到达后保持在位，不执行日程导航
                this.scheduleReached = true;
                return;
            }
            // 同场景但还没到位，继续导航
            if (!this.isMoving && this.currentPath.length === 0) {
                this._pathTo(targetLoc.x, targetLoc.y, game);
            }
        } else {
            // 不同场景，需要跨场景导航
            this._taskOverrideReached = false;
            if (!this.isMoving && this.currentPath.length === 0) {
                this._navigateToScheduleTarget(override.targetLocation, game);
            }
        }

        // 更新状态描述
        const taskDesc = this._getTaskOverrideDesc();
        if (taskDesc) this.stateDesc = taskDesc;

        // 卡住检测
        this._taskOverrideTravelTimer += dt;
        if (this._taskOverrideTravelTimer > 60) { // 60秒超时
            // 【超时保护】饥饿覆盖或状态覆盖中不传送，取消任务
            if (this._hungerOverride || this._stateOverride) {
                console.log(`[超时保护] ${this.name} 任务超时但处于${this._hungerOverride ? '饥饿' : '状态'}覆盖中，取消任务而非传送`);
                this.deactivateTaskOverride();
                return;
            }
            // 强制传送到目标位置
            // 【修复】_door类型目标应传送到室内，而非门口
            if (targetIndoorScene) {
                const indoorDoorKey = targetIndoorScene + '_indoor_door';
                const indoorDoorLoc = GST.SCHEDULE_LOCATIONS[indoorDoorKey];
                const insideKey = targetIndoorScene + '_inside';
                let insideLoc = GST.SCHEDULE_LOCATIONS[insideKey];
                const seatLoc = this._pickIndoorSeat(targetIndoorScene, game);
                if (seatLoc) insideLoc = { scene: targetIndoorScene, x: seatLoc.x, y: seatLoc.y };
                if (indoorDoorLoc) {
                    this._teleportTo(indoorDoorLoc.scene, indoorDoorLoc.x, indoorDoorLoc.y, true);
                    if (insideLoc) {
                        this._enterWalkTarget = { x: insideLoc.x, y: insideLoc.y };
                        this._pathTo(insideLoc.x, insideLoc.y, game);
                    }
                } else if (insideLoc) {
                    this._teleportTo(insideLoc.scene, insideLoc.x, insideLoc.y);
                }
                console.log(`[超时传送] ${this.name} 任务超时，传送到室内${targetIndoorScene}`);
            } else {
                this._teleportTo(targetLoc.scene, targetLoc.x, targetLoc.y);
            }
            this._taskOverrideReached = true;
            this._taskOverrideTravelTimer = 0;
            this._logDebug('schedule', `[P1] 任务导航超时，强制传送到 ${override.targetLocation}`);
        }
    }

    /**
     * 激活任务覆盖
     * @param {string} taskId - 任务ID
     * @param {string} targetLocation - 目标位置key
     * @param {string} priority - 优先级
     * @param {string} resourceType - 关联资源类型（可选）
     */;

    proto.activateTaskOverride = function(taskId, targetLocation, priority, resourceType) {
        // 【防卡住】P0紧急状态下拒绝接受新任务，防止与体力不支/健康危急等状态冲突导致NPC卡住
        if (this._priorityOverride) {
            this._logDebug('schedule', `[P1] 拒绝任务 ${taskId}：当前处于P0状态(${this._priorityOverride})，等待恢复后再接受`);
            return false;
        }

        // 【饥饿保护】NPC饥饿时不接受非urgent任务
        if (this.hunger < 25 && priority !== 'urgent') {
            this._logDebug('schedule', `[P1] 拒绝任务 ${taskId}：NPC饥饿(hunger=${Math.round(this.hunger)})`);
            console.log(`[P1拒绝] ${this.name} 饥饿(${Math.round(this.hunger)})<25，拒绝非urgent任务 ${taskId}`);
            return false;
        }

        // 【进食保护】NPC正在进食/前往进食时不接受非urgent任务
        if (this._hungerOverride === true && priority !== 'urgent') {
            this._logDebug('schedule', `[P1] 拒绝任务 ${taskId}：NPC正在进食/前往进食`);
            console.log(`[P1拒绝] ${this.name} 正在进食/前往进食，拒绝非urgent任务 ${taskId}`);
            return false;
        }

        // 【状态覆盖保护】NPC处于状态覆盖中（exhausted/sick/mental）不接受任务
        if (this._stateOverride) {
            this._logDebug('schedule', `[P1] 拒绝任务 ${taskId}：NPC处于状态覆盖(${this._stateOverride})`);
            console.log(`[P1拒绝] ${this.name} 处于状态覆盖(${this._stateOverride})，拒绝任务 ${taskId}`);
            return false;
        }

        // 校验targetLocation是否存在于SCHEDULE_LOCATIONS
        let validLocation = targetLocation;
        if (!GST.SCHEDULE_LOCATIONS[validLocation]) {
            // 尝试去掉_enter后缀
            const stripped = validLocation.replace(/_enter$/, '');
            if (GST.SCHEDULE_LOCATIONS[stripped]) {
                console.warn(`[NPC-${this.name}] 位置key "${validLocation}" 不存在，自动修正为 "${stripped}"`);
                validLocation = stripped;
            } else {
                // 根据资源类型回退到合理的采集区
                const fallbackMap = {
                    woodFuel: 'lumber_camp',
                    food: 'frozen_lake',
                    material: 'ruins_site',
                    power: 'workshop_door'
                };
                const fallback = (resourceType && fallbackMap[resourceType]) || 'furnace_plaza';
                console.warn(`[NPC-${this.name}] 位置key "${validLocation}" 无效，回退到 "${fallback}"`);
                validLocation = fallback;
            }
        }

        // 如果是urgent优先级且NPC正在聊天，强制中断聊天
        if ((priority === 'urgent') && this.state === 'CHATTING') {
            console.log(`[NPC-${this.name}] urgent任务打断聊天状态`);
            this._forceEndChat();
        }

        this._taskOverride.taskId = taskId;
        this._taskOverride.targetLocation = validLocation;
        this._taskOverride.isActive = true;
        this._taskOverride.priority = priority || 'normal';
        this._taskOverride.resourceType = resourceType || null;
        // 【覆盖快照】设置任务覆盖
        const oldOverrideT = this._activeOverride;
        this._activeOverride = 'task';
        if (oldOverrideT !== 'task') {
            this._logDebug('override', `[覆盖切换] ${oldOverrideT} → task（原因: 任务${taskId}）`);
        }
        this._taskOverrideReached = false;
        this._taskOverrideStuckTimer = 0;
        this._taskOverrideTravelTimer = 0;
        this._navStartTime = Date.now(); // 记录导航开始时间
        this.scheduleReached = false;

        // 设置具体的状态描述
        const resourceNames = { woodFuel: '砍柴', food: '采集食物', material: '采集建材', power: '维护电力' };
        const actionName = (resourceType && resourceNames[resourceType]) || '执行任务';
        this.stateDesc = priority === 'urgent' ? `紧急前往${actionName}` : `前往${actionName}`;

        this._logDebug('schedule', `[P1] 激活任务覆盖: ${taskId} → ${validLocation} (${priority})`);
    }

    /**
     * 取消任务覆盖，恢复日程控制
     */;

    proto.deactivateTaskOverride = function() {
        if (this._taskOverride.isActive) {
            this._logDebug('schedule', `[P1] 取消任务覆盖: ${this._taskOverride.taskId}`);
        }
        this._taskOverride.taskId = null;
        this._taskOverride.targetLocation = null;
        this._taskOverride.isActive = false;
        this._taskOverride.priority = 'normal';
        this._taskOverride.resourceType = null;
        this._taskOverrideReached = false;
        this._taskOverrideStuckTimer = 0;
        this._taskOverrideTravelTimer = 0;
    }

    /**
     * 强制结束当前聊天状态
     * 用于urgent任务打断CHATTING状态
     */;

    proto.getSceneLabel = function() {
        const SCENE_LABELS = {
            village: '据点',
            warehouse: '仓库',
            medical: '医疗站',
            dorm_a: '宿舍A',
            dorm_b: '宿舍B',
            kitchen: '炊事房',
            workshop: '工坊',
        };
        return SCENE_LABELS[this.currentScene] || this.currentScene;
    }

    /**
     * 获取角色状态摘要行（位置 + 当前意图）
     * 用于头顶显示和GLM prompt
     */;

    proto.getStatusLine = function() {
        const loc = this.getSceneLabel();
        let intent = '';
        if (this.isSleeping) {
            intent = '💤 睡觉中';
        } else if (this.state === 'CHATTING') {
            intent = '💬 聊天中';
        } else if (this.isEating) {
            intent = '🍜 吃饭中';
        } else if (this._isBeingTreated) {
            intent = '🏥 看病中';
        } else if (this.isInTherapy) {
            intent = '💆 咨询中';
        } else if (this._isDying) {
            intent = '⚠️ 濒死';
        } else if (this.game && this.game.furnaceSystem && this.game.furnaceSystem.isBuildingSecondFurnace && this.game.furnaceSystem.buildWorkers.includes(this.id)) {
            const pct = Math.round(this.game.furnaceSystem.buildProgress * 100);
            intent = `🔨 建造暖炉${pct}%`;
        } else if (this.isCrazy) {
            intent = '🤯 发疯中';
        } else if (this.isSick) {
            intent = '🤒 生病中';
        } else if (this.stateDesc) {
            intent = this.stateDesc;
        }
        // 截断过长的描述
        if (intent.length > 16) intent = intent.substring(0, 15) + '…';

        return `📍${loc}${intent ? ' · ' + intent : ''}`;
    }

    // ---- 下雨避雨 ----;

})();
