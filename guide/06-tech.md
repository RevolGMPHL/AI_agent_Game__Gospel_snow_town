# 技术架构 & 模块清单（v4.0 重构版）

## 架构概览

v4.0 对原项目（26,700行单体代码）进行了全面模块化重构：

| 维度 | v3.x（重构前） | v4.0（重构后） |
|------|---------------|---------------|
| 文件组织 | 14个JS文件平铺在根目录 | 49个JS文件按7层分类 |
| 最大文件 | npc.js 8,370行 | npc-attributes.js 2,323行 |
| 模块化 | 无，全局变量 | GST 命名空间 + IIFE 隔离 |
| 数据/逻辑 | 混合在一起 | data/ 目录独立配置 |
| NPC系统 | 1个8370行的巨文件 | 核心类 + 6个mixin模块 |
| Game引擎 | 1个3794行的巨文件 | 核心调度 + renderer/input/hud/startup |

## 目录结构

```
20260305-gospel-snow-town/
├── index.html                  # 入口页面（含 GST 命名空间初始化）
├── style.css                   # 冰霜深色主题样式
├── server.js                   # Node.js 静态服务器 + Debug/AImode日志API
│
├── src/                        # 源码目录
│   ├── core/                   # 核心引擎层
│   │   ├── constants.js        # 全局常量（TILE / 颜色C / 纹理噪声函数）
│   │   ├── game.js             # Game 主类（主循环 / 子系统调度 / 场景切换 / 存档）
│   │   ├── renderer.js         # Canvas 渲染引擎（日夜 / 雨雪 / HUD / 小地图）
│   │   ├── input.js            # 键盘鼠标输入（WASD / 点击交互 / 快捷键）
│   │   ├── camera.js           # 摄像机（跟随 / 缩放 / 边界限制）
│   │   └── startup.js          # 模型选择 / 模式选择 / 游戏启动
│   │
│   ├── map/                    # 地图系统层
│   │   ├── base-map.js         # BaseMap 基类（drawGrid / isSolid / describe）
│   │   ├── village-map.js      # VillageMap（底图PNG / 装饰物 / 建筑入口）
│   │   ├── indoor/             # 室内地图
│   │   │   ├── indoor-map.js   # IndoorMap 基类（底图PNG渲染 / 出口trigger）
│   │   │   ├── dorm-a.js       # 宿舍A（男生5人）
│   │   │   ├── dorm-b.js       # 宿舍B（女生3人）
│   │   │   ├── warehouse.js    # 仓库
│   │   │   ├── medical.js      # 医疗站
│   │   │   ├── kitchen.js      # 炊事房
│   │   │   ├── workshop.js     # 工坊
│   │   │   └── command.js      # 指挥所
│   │   └── map-registry.js     # 地图注册中心（register / get）
│   │
│   ├── npc/                    # NPC 系统层（Mixin 模式）
│   │   ├── npc.js              # NPC 核心类（构造 / update / 移动 / 碰撞 / 序列化）
│   │   ├── npc-ai.js           # AI行动决策 / 同伴系统 / 社交判断 → proto mixin
│   │   ├── npc-attributes.js   # 属性更新（体力/San/健康/饥饿/体温/目标） → proto mixin
│   │   ├── npc-renderer.js     # Sprite绘制 / 气泡绘制 / 状态标签 → proto mixin
│   │   ├── npc-schedule.js     # 日程调度 / 天气调整 / 睡眠 / 任务覆盖 → proto mixin
│   │   ├── action-effects.js   # ACTION_EFFECT_MAP 效果应用 → proto mixin
│   │   └── specialty.js        # 专长效率计算 → proto mixin
│   │
│   ├── systems/                # 游戏子系统层
│   │   ├── resource-system.js  # 资源管理（木柴/食物/建材/零件/急救包）
│   │   ├── furnace-system.js   # 暖炉系统（燃料/温度/建造）
│   │   ├── weather-system.js   # 天气系统（4天温度周期/暴风雪/风力）
│   │   ├── task-system.js      # 任务系统（智能分工/进度追踪/暴风雪应急）
│   │   ├── death-system.js     # 死亡系统（健康→濒死→死亡/4种结局）
│   │   ├── event-system.js     # 事件系统（冲突/调解/鼓舞）
│   │   ├── reincarnation-system.js  # 轮回系统（记忆继承/前世教训/分工方案）
│   │   └── difficulty-config.js     # 6个难度等级参数表
│   │
│   ├── dialogue/               # 对话系统层
│   │   ├── dialogue-manager.js # DialogueManager（对话生成 + AI调用 + UI渲染）
│   │   └── dialogue-ui.js      # 对话UI渲染（预留扩展点）
│   │
│   ├── ai/                     # AI/LLM 层
│   │   ├── llm-client.js       # callLLM / parseLLMJSON / 模型配置 / LLM_STATUS
│   │   ├── llm-status.js       # LLM状态跟踪（预留扩展）
│   │   └── aimode-logger.js    # AI模式日志记录
│   │
│   ├── ui/                     # UI 层
│   │   └── hud.js              # 侧边栏 / NPC详情 / 资源面板 / 事件日志 / 轮回UI / Toast
│   │
│   └── utils/                  # 工具函数层
│       ├── pathfinding.js      # A* 寻路算法
│       ├── sprite-loader.js    # SpriteLoader 素材加载器
│       └── helpers.js          # 通用工具函数
│
├── data/                       # 纯数据配置层（与逻辑分离）
│   ├── npc-configs.js          # 8个NPC静态配置 → GST.NPC_CONFIGS
│   ├── npc-schedules.js        # 日程位置映射 + 室内座位 → GST.SCHEDULE_LOCATIONS / GST.INDOOR_SEATS
│   ├── npc-prompts.js          # AI Prompt 模板 → GST.NPC_PROMPTS
│   ├── action-effects.js       # 行为优先级 + 行动效果映射 → GST.BEHAVIOR_PRIORITY / GST.ACTION_EFFECT_MAP
│   ├── map-data.js             # 地图共享常量 → GST.MAP_DATA
│   ├── task-definitions.js     # 任务定义 → GST.TASK_DEFINITIONS
│   └── event-definitions.js    # 事件定义 → GST.EVENT_DEFINITIONS
│
├── asset/                      # 素材目录
├── tools/                      # 工具脚本
└── guide/                      # 项目文档
```

## 模块加载机制

### GST 命名空间

所有模块通过 `window.GST` 统一命名空间管理，每个文件使用 IIFE 包装避免全局污染：

```javascript
(function() {
    'use strict';
    const GST = window.GST;

    class MyClass { ... }

    GST.MyClass = MyClass;
})();
```

### Mixin 模式（NPC 系统）

NPC 核心类定义在 `npc.js` 中，其他模块通过原型链 mixin 扩展方法：

```javascript
// npc.js — 定义核心类
class NPC { constructor() { ... } update() { ... } }
GST.NPC = NPC;

// npc-ai.js — mixin 扩展
const proto = GST.NPC.prototype;
proto._executeAction = function(...) { ... };
proto._tryProactiveChat = function(...) { ... };
```

### 加载顺序（index.html）

```
Layer 0: window.GST = {} → constants → helpers → sprite-loader → pathfinding
Layer 1: data/*（纯配置数据，挂载到 GST）
Layer 2: map 系统（BaseMap → VillageMap → IndoorMap子类 → MapRegistry）
Layer 3: NPC 核心 + mixin（NPC类 → AI/属性/渲染/日程/效果/专长 mixin）
Layer 4: 子系统（difficulty → weather → resource → furnace → death → reincarnation → task → event）
Layer 5: 对话 + AI（dialogue → llm-client → aimode-logger）
Layer 6: 核心引擎 + UI（camera → Game类 → renderer/input/hud mixin → startup）
Layer 7: 向后兼容别名（var Camera = GST.Camera 等，渐进迁移用）
```

## 核心类设计

### NPC 类（Mixin 架构）

```
GST.NPC (npc.js)            — 核心框架：构造/update/移动/碰撞/序列化
  ├── npc-ai.js              — 18个方法：行动执行/同伴/空闲监视/社交
  ├── npc-attributes.js      — 41个方法：属性衰减/饥饿/体温/目标/医疗
  ├── npc-renderer.js        — 3个方法：draw/drawBubbleLayer/_drawBubble
  ├── npc-schedule.js        — 14个方法：日程/天气调整/睡眠/任务覆盖
  ├── action-effects.js      — 1个方法：_updateActionEffect
  └── specialty.js           — 2个方法：_getSpecialtyMultiplier/_getSpecialtyDescription
```

### Game 类（Mixin 架构）

```
GST.Game (game.js)           — 核心调度：主循环/子系统初始化/场景切换/存档
  ├── renderer.js             — 渲染方法（draw/HUD/minimap/日夜/雨雪）
  ├── input.js                — 输入方法（setupInput/setupControls/tryInteract）
  └── hud.js                  — UI方法（sidebar/NPC详情/资源面板/事件日志）
```

## 渲染层次

```
绘制顺序（从底到顶）:
1. 地面层 — 优先使用预烘焙底图 PNG（village_base_clean.png）
         — 无底图时 fallback 到 getTileColor() 逐格纯色绘制
2. 建筑层 — 代码绘制建筑物外观（Y-Sort）
3. 实体层 — NPC + 玩家 + 状态标签（Y-Sort）
4. 气泡层 — 对话气泡 + 动态数值气泡（drawBubbleLayer，独立pass）
5. UI 层 — 名字标签、时间、小地图、Debug面板、资源面板
```

## LLM 配置

### 双模式 API 架构

`src/ai/llm-client.js` 中的 `GST.callLLM` 支持两种模式：

| 模式 | API URL | 适用模型 |
|------|---------|----------|
| Ollama 原生 | `http://localhost:11434/api/chat` | qwen3.5:4b/9b 本地 |
| OpenAI 兼容 | 云端 URL | GLM-4-Flash 等 |

### LLM_STATUS 全局状态

```javascript
GST.LLM_STATUS = {
    totalCalls,        // 总调用次数
    successCalls,      // 成功次数
    failedCalls,       // 失败次数
    consecutiveFails,  // 连续失败次数（≥10 触发60秒暂停）
    lastError,         // 最后一次错误
    isDown             // API 是否疑似宕机
}
```

## 时间语义约定（v4.15 新增）

项目内部存在两种时间语义，后续开发必须明确区分：

1. **游戏时间（gameDt / gameTime）**
   - 用于资源生产/消耗、属性演化、位移推进、昼夜流逝等“世界推进”逻辑
   - 会跟随倍速一起放大，5倍速下这些系统应更快推进

2. **真实时间（realDt / Date.now）**
   - 用于冷却、保护期、卡住检测、导航超时、行为锁、发呆兜底等“安全计时器”逻辑
   - 不应因为倍速提升而缩短，否则会导致NPC抖动、过早重规划、异常传送

**统一规则**：凡是“让世界更快”的逻辑，用游戏时间；凡是“防止系统失控”的逻辑，用真实时间。

## 重构设计原则

本次重构遵循七大设计原则：

1. **SRP（单一职责）** — 每个文件只负责一个职责（如 npc-ai.js 只管AI决策）
2. **OCP（开闭原则）** — 新增室内地图只需创建文件+注册，不修改现有代码
3. **LSP（里氏替换）** — IndoorMap 子类完全继承 BaseMap 接口
4. **ISP（接口隔离）** — NPC mixin 模块间互不依赖
5. **DIP（依赖倒置）** — 所有模块依赖 GST 命名空间抽象，不直接引用内部实现
6. **LoD（迪米特法则）** — 子系统通过 Game 中枢通信，不直接互访
7. **LKP（最小知识）** — 每个模块只暴露必要接口
