/**
 * 福音镇 - FurnaceSystem（兼容壳层）
 * 挂载到 GST.FurnaceSystem
 */
(function() {
    'use strict';
    const GST = window.GST;

    /**
     * 集中供暖系统
     * - 已移除“暖炉设施 / 第二暖炉 / 暖炉范围 / 暖炉争抢”玩法语义
     * - 现在全镇供暖强度仅由 木材 + 电力 的综合供给决定
     * - 仍沿用 FurnaceSystem 名称，纯为兼容旧模块引用
     */

    const HEATING_CONFIG = {
        indoorScenes: ['dorm_a', 'dorm_b', 'kitchen', 'medical', 'warehouse', 'workshop'],
        targetReserveHours: 24,          // 认为“供暖稳健”的目标储备时长
        warmIndoorTemp: 16,              // 供暖充足时室内目标温度
        passiveShelterTempOffset: 4,     // 即使供暖弱，室内仍比室外略暖
        minEffectiveStrength: 0.08,
        bodyTempRecoveryRate: 0.18,      // °C/分钟（满供暖时）
        staminaRecoveryRate: 0.018,      // /秒（满供暖时）
        healthRecoveryRate: 0.006,       // /秒（满供暖时）
        day3RecoveryBoost: 1.25,
    };

    class FurnaceSystem {
        constructor(game) {
            this.game = game;
            this._tick = 0;

            // 当前集中供暖状态
            this.heatingStrength = 1.0;       // 0~1
            this.heatingStatus = 'stable';    // stable | strained | critical | failed
            this.active = true;
            this.indoorTemp = HEATING_CONFIG.warmIndoorTemp;

            // ---- 兼容旧字段：已废弃，仅为避免旧模块空引用 ----
            this.furnaces = [];
            this.buildProgress = 1;
            this.buildWorkers = [];
            this.isBuildingSecondFurnace = false;
            this.secondFurnaceBuilt = true;
            this._buildPaused = false;
            this._lastReportedProgress = 1;

            this._refreshHeatingState(true);
            console.log('[HeatingSystem] 初始化完成，已启用集中供暖模型');
        }

        update(gameDt) {
            this._tick += gameDt;
            if (this._tick < 1.0) return;
            const dt = this._tick;
            this._tick = 0;

            this._refreshHeatingState();
            this._applyIndoorWarmthEffects(dt);
        }

        onDayChange() {
            this._refreshHeatingState(true);
        }

        _refreshHeatingState(forceLog = false) {
            const rs = this.game.resourceSystem;
            const ws = this.game.weatherSystem;
            const outdoorTemp = ws && ws.getEffectiveTemp ? ws.getEffectiveTemp() : 0;

            let woodHours = 0;
            let powerHours = 0;
            if (rs) {
                woodHours = typeof rs.getWoodFuelHoursRemaining === 'function' ? rs.getWoodFuelHoursRemaining() : 0;
                powerHours = typeof rs.getPowerHoursRemaining === 'function' ? rs.getPowerHoursRemaining() : 0;
            }

            const woodRatio = Math.max(0, Math.min(1, woodHours / HEATING_CONFIG.targetReserveHours));
            const powerRatio = Math.max(0, Math.min(1, powerHours / HEATING_CONFIG.targetReserveHours));

            // 木材是热源主体，电力负责维持送风/照明/循环，故权重 65/35
            let strength = woodRatio * 0.65 + powerRatio * 0.35;

            // 两种资源都彻底耗尽时，供暖彻底失败
            if ((rs && rs.woodFuel <= 0) && (rs && rs.power <= 0)) {
                strength = 0;
            }

            strength = Math.max(0, Math.min(1, strength));
            this.heatingStrength = strength;
            this.active = strength >= HEATING_CONFIG.minEffectiveStrength;

            if (strength >= 0.75) this.heatingStatus = 'stable';
            else if (strength >= 0.45) this.heatingStatus = 'strained';
            else if (strength >= 0.12) this.heatingStatus = 'critical';
            else this.heatingStatus = 'failed';

            const targetTemp = HEATING_CONFIG.warmIndoorTemp;
            const passiveTemp = outdoorTemp + HEATING_CONFIG.passiveShelterTempOffset;
            this.indoorTemp = passiveTemp + (targetTemp - passiveTemp) * strength;

            if (forceLog) {
                console.log(`[HeatingSystem] 供暖强度 ${Math.round(this.heatingStrength * 100)}% | 室内温度 ${this.indoorTemp.toFixed(1)}°C`);
            }
        }

        _applyIndoorWarmthEffects(dt) {
            const boost = this.game._day3RecoveryBoost ? HEATING_CONFIG.day3RecoveryBoost : 1.0;
            const prepBonus = this.game._warmthPrepBonus ? 1.1 : 1.0;
            const effectiveStrength = this.heatingStrength * boost * prepBonus;

            for (const npc of this.game.npcs) {
                if (npc.isDead) continue;
                if (!this.isIndoorScene(npc.currentScene)) continue;

                if (npc.bodyTemp !== undefined) {
                    const bodyRate = (HEATING_CONFIG.bodyTempRecoveryRate / 60) * effectiveStrength * dt;
                    npc.bodyTemp = Math.min(36.5, npc.bodyTemp + bodyRate);
                }

                const hungerPenalty = (npc.hunger !== undefined && npc.hunger < 20) ? 0.5 : 1.0;
                npc.stamina = Math.min(100, npc.stamina + HEATING_CONFIG.staminaRecoveryRate * effectiveStrength * hungerPenalty * dt);
                npc.health = Math.min(100, npc.health + HEATING_CONFIG.healthRecoveryRate * effectiveStrength * dt);
            }
        }

        isIndoorScene(scene) {
            return HEATING_CONFIG.indoorScenes.includes(scene);
        }

        getHeatingStrength() {
            return this.heatingStrength;
        }

        getHeatingLevelLabel() {
            switch (this.heatingStatus) {
                case 'stable': return '稳定';
                case 'strained': return '吃紧';
                case 'critical': return '危险';
                default: return '失效';
            }
        }

        getHeatingSummary() {
            return `供暖${Math.round(this.heatingStrength * 100)}%（${this.getHeatingLevelLabel()}）`;
        }

        /**
         * 兼容旧接口：过去用于判定“是否在暖炉旁”，现在改为“是否处于有效室内供暖环境中”
         */
        isNearActiveFurnace(npc) {
            if (!npc) return null;
            if (!this.isIndoorScene(npc.currentScene)) return null;
            if (!this.active) return null;
            return {
                id: 'central_heating',
                name: '集中供暖',
                indoorTemp: this.indoorTemp,
                active: this.active,
            };
        }

        /** 兼容旧接口：保留为“供暖是否有效” */
        getActiveFurnaceCount() {
            return this.active ? 1 : 0;
        }

        /** 兼容旧接口：转为供暖摘要 */
        getFurnaceSummary() {
            return this.getHeatingSummary();
        }

        /** 获取NPC所在位置的室内温度 */
        getIndoorTempForNpc(npc) {
            const ws = this.game.weatherSystem;
            const outdoorTemp = ws ? ws.getEffectiveTemp() : 0;
            if (npc && this.isIndoorScene(npc.currentScene)) {
                return this.indoorTemp;
            }
            return outdoorTemp;
        }

        /** 旧接口兼容：资源耗尽时刷新供暖状态 */
        onFuelDepleted() {
            this._refreshHeatingState(true);
        }

        /** 旧接口兼容：断电时刷新供暖状态 */
        onPowerOut() {
            this._refreshHeatingState(true);
        }

        /** 已废弃：不再支持第二暖炉建造 */
        checkBuildCondition() {
            return false;
        }

        /** 已废弃：不再支持第二暖炉建造 */
        startBuildSecondFurnace() {
            return false;
        }

        serialize() {
            return {
                heatingStrength: this.heatingStrength,
                heatingStatus: this.heatingStatus,
                active: this.active,
                indoorTemp: this.indoorTemp,
            };
        }

        deserialize(data) {
            if (!data) return;
            this.heatingStrength = Number.isFinite(data.heatingStrength) ? data.heatingStrength : this.heatingStrength;
            this.heatingStatus = data.heatingStatus || this.heatingStatus;
            this.active = typeof data.active === 'boolean' ? data.active : this.active;
            this.indoorTemp = Number.isFinite(data.indoorTemp) ? data.indoorTemp : this.indoorTemp;
            this.secondFurnaceBuilt = true;
            this.isBuildingSecondFurnace = false;
            this.buildProgress = 1;
            this.buildWorkers = [];
        }
    }

    GST.FurnaceSystem = FurnaceSystem;
})();
