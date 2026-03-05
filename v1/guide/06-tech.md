# 技术架构 & 素材清单

## 文件结构

```
20260220-gospel_snow_town/
├── index.html                  # 入口页面（含资源面板、急救包显示）
├── game.js                     # 游戏主逻辑（主循环/渲染/昼夜天气/碰撞/输入/LLM调用/Debug面板/子系统调度）
├── maps.js                     # 地图定义（雪原主地图 + 室内场景：炊事房/宿舍/医疗站/工坊/暖炉广场等）
├── npc.js                      # NPC 系统（8个NPC配置/日程/AI思考/移动/属性/行动效果/专长/Sprite渲染）
├── dialogue.js                 # 对话系统（NPC↔NPC对话生成+逐句播放/AI轮询调度/fallback机制）
├── resource-system.js          # 资源系统（木材/食物/建材/零件 产出消耗 + 资源面板 + 急救包管理）
├── furnace-system.js           # 暖炉系统（燃料消耗/温度维护/熄灭→全员失温）
├── task-system.js              # 任务系统（建造避难所/修复电台/日常任务 + 进度追踪）
├── death-system.js             # 死亡系统（健康→濒死→死亡链路/失温致死/饥饿致死/遗体处理/全员San打击）
├── event-system.js             # 事件系统（随机事件/暴风雪/物资发现/野兽袭击等）
├── weather-system.js           # 天气系统（温度曲线/暴风雪周期/风力/室内外温差）
├── reincarnation-system.js     # 轮回系统（全员死亡→重开/记忆继承/难度递增）
├── aimode-logger.js            # AI模式日志（行动决策记录/性能统计/调试输出）
├── server.js                   # 本地开发服务器
├── style.css                   # 样式（含资源面板/急救包/死亡UI样式）
├── start-ollama.sh             # Ollama 本地模型启动脚本（含模型路径/CORS/性能配置）
├── asset/                      # 素材目录
│   ├── character/              # NPC sprite sheets
│   │   ├── 李婶/               # texture.png + portrait.png
│   │   ├── 赵大厨/
│   │   ├── 王老师/
│   │   ├── 老钱/
│   │   ├── 苏医生/
│   │   ├── 陆辰/
│   │   ├── 凌玥/
│   │   ├── 清璇/
│   │   └── sprite.json         # Sprite 帧定义
│   └── 角色设计稿/              # 角色形象设计
└── guide/
    ├── guide.md                # 总目录索引
    ├── 01-design.md            # 设计理念
    ├── 02-map.md               # 地图设计
    ├── 03-npc.md               # NPC 居民设计（专长/日程/行动效果/生存贡献）
    ├── 04-attributes.md        # 属性系统（体力/San值/健康/饱腹/体温 + 行动效果数值表）
    ├── 05-ai.md                # AI 系统
    ├── 06-tech.md              # 技术架构（本文件）
    ├── 07-plan.md              # 开发计划
    ├── 08-changelog.md         # 更新日志
    └── 09-pitfalls.md          # 踩坑记录 & 开发注意事项
```

## 核心类设计

### NPC 类（npc.js）

```javascript
class NPC {
    constructor(config)               // 名字、性格、住所、日程、属性、专长等
    think(gameTime, allNPCs)          // AI 思考主循环（含奖惩意识 + concern/goalFocus）
    _actionDecision(game)             // AI 行动决策（含威胁/机会分析）
    _updateAttributes(dt, game)       // 属性缓慢变化（含10种连锁惩罚）
    _updateSchedule(dt, game)         // 日程调度
    _updateHunger(dt, game)           // 饥饿系统（饱腹值消耗→健康惩罚）
    _updateActionEffect(dt, game)     // 行动效果系统（匹配ACTION_EFFECT_MAP→触发数值产出）
    _getSpecialtyMultiplier(effect)   // 专长加成倍率计算（如chopping×2, medical_treatment×2）
    _updateGoals(dt, game)            // 目标系统（每日/长期目标 + 奖励发放）
    getStatusLine()                   // 统一状态摘要出口
    drawBubbleLayer(ctx)              // 对话气泡独立渲染层（含动态数值气泡）
    _logDebug(type, detail)           // Debug日志（含游戏天数+真实时间）
}

// ACTION_EFFECT_MAP — 行动描述关键词 → 系统效果的映射表
// 支持10种效果类型：produce_resource / medical_heal / morale_boost /
//   craft_medkit / build_progress / repair_radio / reduce_waste /
//   furnace_maintain / patrol_bonus / generate_power
```

### 子系统类

```javascript
class ResourceSystem {
    constructor(game)
    update(dt)                     // 每帧更新：消耗计算 + 产出汇总
    addResource(type, amount)      // 增加资源（wood/food/material/parts/medkit）
    consumeResource(type, amount)  // 消耗资源
    checkMedkit(npcs)              // 全局急救包自动检查（健康<50时自动使用）
    renderPanel()                  // 资源面板渲染（含急救包数量）
}

class FurnaceSystem {
    constructor(game)
    update(dt)                     // 暖炉状态更新（燃料消耗/温度计算）
    addFuel(amount)                // 添加燃料
    isLit()                        // 暖炉是否点燃
    getTemperature()               // 获取当前暖炉温度
}

class TaskSystem {
    constructor(game)
    update(dt)                     // 任务进度更新
    addProgress(taskId, amount)    // 增加任务进度（建造/修复等）
    getActiveTask()                // 获取当前活跃任务
    completeTask(taskId)           // 完成任务
}

class DeathSystem {
    constructor(game)
    update(dt)                     // 死亡检测主循环
    checkHealth(npc)               // 健康→濒死→死亡链路检测
    checkHypothermia(npc)          // 失温致死检测
    checkStarvation(npc)           // 饥饿致死检测
    handleDeath(npc, cause)        // 死亡处理（遗体/全员San打击/UI通知）
}

class EventSystem {
    constructor(game)
    update(dt)                     // 事件触发检测
    triggerEvent(eventType)        // 触发指定事件
    getActiveEvents()              // 获取当前活跃事件
}

class WeatherSystem {
    constructor(game)
    update(dt)                     // 天气状态更新（温度曲线/暴风雪）
    getCurrentTemp()               // 获取室外温度
    isBlizzard()                   // 是否暴风雪
    getWindForce()                 // 风力等级
}

class ReincarnationSystem {
    constructor(game)
    checkTrigger()                 // 检测是否触发轮回（全员死亡）
    startNewCycle()                // 开始新轮回（记忆继承/难度递增）
    getCycleCount()                // 获取当前轮回次数
}

class AIModeLogger {
    constructor()
    log(npcName, action, detail)   // 记录AI行动决策
    getStats()                     // 获取性能统计
}
```

### 对话系统（dialogue.js）

```javascript
class DialogueManager {
    startNPCChat(npc1, npc2)       // NPC间对话（全链路同场景保护）
    startPlayerChat(npc)           // 玩家对话
    _generateNPCLineWithEnd()      // 对话生成（含fallback+连续失败检测）
}
```

### 游戏主类（game.js）

```javascript
class Game {
    constructor()
    // 子系统实例
    this.weatherSystem             // WeatherSystem
    this.resourceSystem            // ResourceSystem
    this.furnaceSystem             // FurnaceSystem
    this.deathSystem               // DeathSystem
    this.taskSystem                // TaskSystem
    this.eventSystem               // EventSystem
    this.reincarnationSystem       // ReincarnationSystem

    update(dt)                     // 主循环（含所有子系统update调度）
    render()                       // 渲染（分层：实体层 → 气泡层）
    switchScene(target, pos)       // 场景切换
    _renderDebugTab(npc)           // Debug面板（状态/行动/目标/奖惩/对话）
}

// 全局
const LLM_STATUS = { ... }        // API状态跟踪（成功率/连续失败/宕机检测）
async function callLLM(...)        // LLM调用（重试/Ollama原生+OpenAI兼容/think标签清理）
```

## 渲染层次

```
绘制顺序（从底到顶）:
1. 地面层 — getTileColor() 绘制基础地面
2. 路径层 — 石板路、泥土路
3. 装饰层 — 花、草丛、栅栏
4. 建筑层 — 房屋外观（Y-Sort）
5. 实体层 — NPC + 玩家 + 状态标签（Y-Sort）
6. 气泡层 — 对话气泡 + 动态数值气泡（drawBubbleLayer，独立pass，不被遮挡）
7. 顶层 — 树冠（遮挡效果）
8. UI 层 — 名字标签、时间、小地图、Debug面板、资源面板
```

---

## 可复用素材清单

### 从 town 项目复用

| 素材 | 路径 | 用途 |
|------|------|------|
| NPC Sprite 素材 | `20260215-town/.../agents/*/texture.png` | 角色行走动画 |
| NPC 头像 | `20260215-town/.../agents/*/portrait.png` | 对话框头像 |
| Sprite Atlas | `20260215-town/.../agents/sprite.json` | 帧定义 |

### 从 farm3 复用

| 模块 | 内容 | 说明 |
|------|------|------|
| BaseMap 框架 | 地图基类 + drawGrid + 碰撞检测 | 核心地图系统 |
| A* 寻路 | findPath + BFS 目标修正 | 路径规划 |
| 碰撞系统 | AABB + 圆形碰撞 + getCirclePush | 物理碰撞 |
| AI 调用架构 | LLM API 调用 + retry + failsafe | AI 引擎 |

---

## LLM 配置

### 双模式 API 架构

game.js 中的 `callLLM` 支持两种模式，通过 `USE_OLLAMA_NATIVE` 开关切换：

| 模式 | API URL | 适用模型 | 特点 |
|------|---------|----------|------|
| Ollama 原生 | `http://localhost:11434/api/chat` | qwen3:4b 等本地模型 | 支持 `think:false` 关闭思考模式 |
| OpenAI 兼容 | `http://localhost:11434/v1/chat/completions` 或云端 | GLM-4-Flash 等 | 标准 OpenAI 格式 |

### Ollama 本地部署

```bash
# 启动（使用项目脚本）
./start-ollama.sh

# 或手动启动（指定模型存储路径 + CORS）
OLLAMA_MODELS=/Users/revolgmphl/Desktop/DEMO/vibegame/model \
OLLAMA_ORIGINS="*" \
ollama serve
```

环境变量说明：
- `OLLAMA_MODELS` — 模型权重存储路径
- `OLLAMA_ORIGINS="*"` — 解决浏览器 CORS 跨域问题（file:// 协议必须）
- `OLLAMA_FLASH_ATTENTION=1` — 启用 Flash Attention 加速
- `OLLAMA_KV_CACHE_TYPE=q8_0` — KV Cache 量化节省显存

### LLM_STATUS 全局状态跟踪

```javascript
LLM_STATUS = {
    totalCalls,        // 总调用次数
    successCalls,      // 成功次数
    failedCalls,       // 失败次数
    consecutiveFails,  // 连续失败次数（≥10 触发60秒暂停）
    lastError,         // 最后一次错误信息
    isDown             // API 是否疑似宕机
}
```