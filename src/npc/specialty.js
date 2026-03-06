/**
 * 福音镇 - NPC 专长系统
 * 通过 mixin 模式挂载到 NPC.prototype
 * 包含：专长效率计算、专长描述
 */
(function() {
    'use strict';
    const GST = window.GST;
    const proto = GST.NPC.prototype;

    proto._getSpecialtyDescription = function() {
        const specialties = this.config.specialties || {};
        const descParts = [];
        // 资源产出类
        if (specialties.chopping) descParts.push(`砍柴效率×${specialties.chopping}`);
        if (specialties.hauling) descParts.push(`搬运效率×${specialties.hauling}`);
        if (specialties.food_processing) descParts.push(`食物加工效率×${specialties.food_processing}`);
        if (specialties.gathering_explore) descParts.push(`废墟探索加成`);
        if (specialties.gathering_food) descParts.push(`食物采集×${specialties.gathering_food}`);
        if (specialties.generator_repair) descParts.push(`发电机维修×${specialties.generator_repair}`);
        if (specialties.furnace_build) descParts.push(`暖炉扩建×${specialties.furnace_build}`);
        if (specialties.furnace_maintain) descParts.push(`暖炉维护×${specialties.furnace_maintain}`);
        if (specialties.construction) descParts.push(`建造×${specialties.construction}`);
        // 辅助类
        if (specialties.inventory_waste) descParts.push(`物资管理减少浪费${(specialties.inventory_waste * 100).toFixed(0)}%`);
        if (specialties.fair_distribution) descParts.push('分配公平（减少冲突）');
        if (specialties.conflict_resolve) descParts.push(`调解冲突×${specialties.conflict_resolve}`);
        if (specialties.morale_boost) descParts.push(`安抚效果×${specialties.morale_boost}`);
        if (specialties.morale_inspire) descParts.push(`鼓舞士气×${specialties.morale_inspire}`);
        if (specialties.team_planning) descParts.push(`全队规划+${(specialties.team_planning * 100).toFixed(0)}%效率`);
        // 医疗类
        if (specialties.medical_treatment) descParts.push(`治疗效果×${specialties.medical_treatment}`);
        if (specialties.hypothermia_save) descParts.push(`失温救治+${(specialties.hypothermia_save * 100).toFixed(0)}%`);
        if (specialties.therapy) descParts.push(`心理疏导×${specialties.therapy}`);
        if (specialties.herbal_craft) descParts.push(`草药制剂×${specialties.herbal_craft}`);
        // 特殊类
        if (specialties.scout_ruins) descParts.push(`废墟侦察稀有物资×${specialties.scout_ruins}`);
        if (specialties.field_aid) descParts.push(`野外急救×${specialties.field_aid}`);
        if (specialties.cold_resist) descParts.push(`耐寒（体温下降×${specialties.cold_resist}）`);
        if (specialties.trap_alarm) descParts.push('可制作陷阱/警报');
        if (specialties.radio_repair) descParts.push('可修理无线电');
        if (specialties.climb_explore) descParts.push('可进入危险区域');
        if (specialties.crisis_predict) descParts.push('经验预警');
        if (specialties.learn_others) descParts.push(`学习效率×${specialties.learn_others}`);
        return descParts.length > 0 ? descParts.join('，') : '无特殊专长';
    }

    /** 每帧更新属性（缓慢变化模式）
     *  dt = gameDt（已含倍速）
     *  设计原则：属性每游戏小时变化约 0.1~0.5 点，一天下来变化 2~8 点
     */;

    proto._getSpecialtyMultiplier = function(effect) {
        const specialties = this.config.specialties || {};
        switch (effect.effectType) {
            case 'produce_resource':
                if (effect.resourceType === 'woodFuel' && specialties.chopping) return specialties.chopping;
                if (effect.resourceType === 'food' && specialties.gathering_food) return specialties.gathering_food;
                if (effect.resourceType === 'power' && specialties.generator_repair) return specialties.generator_repair;
        if (effect.resourceType === 'explore' && specialties.gathering_explore) return specialties.gathering_explore;
                break;
            case 'build_progress':
                if (specialties.furnace_build) return specialties.furnace_build;
                if (specialties.construction) return specialties.construction;
                break;
            case 'craft_medkit':
                if (specialties.herbal_craft) return specialties.herbal_craft;
                break;
            case 'repair_radio':
                // radio_repair 是 boolean(true)，转化为1.5倍率
                if (specialties.radio_repair) return typeof specialties.radio_repair === 'number' ? specialties.radio_repair : 1.5;
                break;
            case 'medical_heal':
                if (specialties.medical_treatment) return specialties.medical_treatment;
                break;
            case 'morale_boost':
                if (specialties.morale_boost) return specialties.morale_boost;
                if (specialties.morale_inspire) return specialties.morale_inspire;
                break;
            case 'furnace_maintain':
                if (specialties.furnace_maintain) return specialties.furnace_maintain;
                break;
            case 'reduce_waste':
                if (specialties.food_processing) return specialties.food_processing;
                break;
        }
        return 1.0; // 默认无加成
    }

    /**
     * 获取角色专长的人类可读描述（供LLM prompt使用）
     */;

})();
