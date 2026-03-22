# 📝 更新日志

> 详细记录每个版本的改动、Bug 修复和新功能。

---

## v4.18 — 系统性修复NPC"弹弹乐"死循环 (2026-03-22)

### 🎯 核心问题

NPC 在深夜时段被 `_updateSleepState` 和 `_updateSchedule` 两个系统交替控制，形成"弹弹乐"无限循环：
- `_updateSleepState`（先执行）：深夜检测到"该睡觉但不在家" → 把NPC从非宿舍室内踢出到village
- `_updateSchedule`（后执行）：P0/P1检测到"NPC不在目标位置" → 又导航NPC回室内
- 每帧循环一次，同一秒内可刷几十次进门

**日志证据**：陆辰 **336次** 重复进门、清璇 **194次**、李婶 **108次**

### 🐛 Bug修复（6处）

#### 1. `_updateSleepState` 不从非宿舍室内踢出有P0/P1任务的NPC
**修复**：`else if (this.currentScene !== this.homeName && !hasActiveHighPriority)` — 有 `_priorityOverride` 或 `_taskOverride` 时不踢出
**改动**：`src/npc/npc-schedule.js`

#### 2. `_updateSleepState` 整个"该睡觉但不在家"导航块在有P0/P1时跳过
**修复**：外层 if 增加 `&& !hasActiveHighPriority` 条件，P0覆盖正在赶路时（如去medical），睡眠日程不打断
**改动**：`src/npc/npc-schedule.js`

#### 3. `_enterIndoor` 防抖
**修复**：NPC已在目标场景中直接 return，不执行重复进门。兜底保护
**改动**：`src/npc/npc.js`

### 📝 代码改动
- `src/npc/npc-schedule.js`: `_updateSleepState` 增加 `hasActiveHighPriority` 保护（2处）
- `src/npc/npc.js`: `_enterIndoor` 入口防抖

---

## v4.17 — 苏岩弹弹乐修复 + 日志增强 + 探索数值明确 (2026-03-22)

### 🎯 核心问题

1. **苏岩(及其他NPC)在室内被反复踢出又拉回**：体力/健康低时P0/状态覆盖把NPC从医疗站/工坊踢出 → 恢复一点后任务覆盖又拉回 → 无限循环
2. **日志系统**：断点续玩时无法区分"新存档"和"续玩存档"
3. **探索废墟日志**：发现物品缺少具体数值（"发现罐头"但不知道加了多少食物）

### 🐛 Bug修复（4处）

#### 1. P0-4 `stamina_critical`：室内不踢出
**问题**：NPC在医疗站体力低 → P0暂停任务导航回宿舍 → 到宿舍恢复 → 任务恢复回医疗站 → 又不够 → 循环
**修复**：新增 `isIndoor` 检查，NPC在非village室内场景时暂停任务、原地休息不踢出
**改动**：`src/npc/npc-schedule.js` P0-4分支

#### 2. P0-3 `health_critical`：已在宿舍不触发 + 室内原地休息
**问题**：NPC已在自己宿舍时健康低仍触发导航到宿舍门口 → 出门 → 又进门 → 循环
**修复**：新增 `isInHomeDorm` 检查跳过；非village室内场景原地休息不踢出
**改动**：`src/npc/npc-schedule.js` P0-3分支

#### 3. `exhausted` 状态覆盖：室内不触发
**问题**：NPC在医疗站/工坊体力低 → exhausted驱动回宿舍 → 到宿舍恢复 → 任务恢复回 → 循环
**修复**：新增 `!isInIndoorScene` 检查，已在非village室内时不触发exhausted
**改动**：`src/npc/npc-attributes.js`

#### 4. `sick`/`mental` 状态覆盖：已在medical不触发
**问题**：NPC已在医疗站，但sick/mental仍触发 → 重复导航
**修复**：新增 `this.currentScene !== 'medical'` 条件
**改动**：`src/npc/npc-attributes.js`

### ✨ 增强

#### 5. 日志系统：断点续玩标记
- `_writeHeader()` 增加断点续玩检测，session header中追加 `⚠️ 断点续玩恢复` 信息
- 新增 `logContinueInfo()` 方法，记录续玩时的世数、天数、资源、存活人数
**改动**：`src/ai/aimode-logger.js`、`src/core/startup.js`

#### 6. 轮回模式启动：自动检测存档
- 轮回模式按钮点击时自动检测是否有同模式存档，有则走断点续玩路径
**改动**：`src/core/startup.js`

#### 7. 探索废墟日志增加具体数值
- 改动前：`歆玥 探索废墟: 🥫 发现罐头 (今日1/3)`
- 改动后：`歆玥 探索废墟: 🥫 发现罐头 → 食物+15 (今日1/3, 剩余2次)`
**改动**：`src/systems/resource-system.js`

### 📝 代码改动
- `src/npc/npc-schedule.js`: P0-3 health_critical（isInHomeDorm+室内原地休息）、P0-4 stamina_critical（室内检测+原地休息）
- `src/npc/npc-attributes.js`: exhausted（!isInIndoorScene）、sick（!=='medical'）、mental（!=='medical'）
- `src/ai/aimode-logger.js`: _writeHeader断点续玩标记、logContinueInfo()
- `src/core/startup.js`: _isContinueSession标记、轮回模式自动检测存档
- `src/systems/resource-system.js`: 探索废墟日志增加资源类型和数量

---

## v4.16 — 精神恢复系统修复 + 物资充足时NPC自主决策 (2026-03-21)

### 🎯 核心问题

**问题1**：从截图中看到第16~17世资源超级充足（🔥714 🥩19 ⚡411）但全员精神崩溃致死。
**问题2**：NPC不知道物资够用，被死板的日程/安排表绑死，即使物资充足也一直干活不休息。

### 🐛 Bug修复（精神恢复系统）

#### 1. 白天rest不恢复San（核心Bug）
**问题**：NPC白天选择rest回家，`_restCooldownTimer`缓冲期只恢复体力（`stamina + 2*dt`），**完全没有San恢复**！只有`isSleeping=true`才恢复San，而白天rest不是isSleeping。
**修复**：白天rest缓冲期增加San恢复 `+0.06/dt`（与社交`+0.12`类似但低一些）。
**改动**：`src/npc/npc.js` L1076

#### 2. 白天rest缓冲期仍被San自然衰减扣减
**问题**：即使NPC在家休息中（`_restCooldownTimer > 0`），清醒时的自然衰减（`-0.02/dt`）和恶性循环（`-0.03*dt`）仍在持续扣San。导致白天休息几乎无法有效恢复精神。
**修复**：白天rest缓冲期中跳过自然衰减和恶性循环，让休息真正有效。
**改动**：`src/npc/npc-attributes.js` naturalDecay + 恶性循环判断

#### 3. 白天rest被拦截太严格
**问题**：`reallyNeedRest`条件为`sanity < 35`才允许白天rest，San在35~50的NPC被拦截赶去干活→San继续掉→恶性循环。
**修复**：放宽为`sanity < 50`允许休息，体力阈值从`<15`提升到`<25`。
**改动**：`src/npc/npc-ai.js` L1455

### ✨ 增强

#### 4. Prompt信息增强：物资充足度 + 精神恢复提示
- 资源紧张度"正常"改为"正常，物资充足"，让NPC知道不需要拼命干活
- San<50时action prompt增加提示"精神状态不佳时，回家休息或找人聊天都能恢复精神"
- 注意：这是**信息提供**，不是决策辅助，完全遵循核心设计原则
**改动**：`src/npc/npc-ai.js`、`src/npc/npc-renderer.js`

### 📊 数值影响分析

**修改前（白天rest 1小时）**：
- 体力恢复 +2*dt*3600 ≈ +120（有效）
- San变化 = 0（无恢复）- 0.02*dt（自然衰减）- 0.03*dt（恶性循环） ≈ **-5点/h**（越休息越差！）

**修改后（白天rest 1小时）**：
- 体力恢复 +2*dt*3600 ≈ +120（不变）
- San变化 = +0.06*dt（rest恢复）- 0（跳过自然衰减）- 0（跳过恶性循环） ≈ **+3.6点/h**（有效恢复）

### 📝 代码改动
- `src/npc/npc.js`: 白天rest缓冲期增加San恢复 `+0.06*dt`
- `src/npc/npc-attributes.js`: 白天rest缓冲期跳过自然衰减和恶性循环
- `src/npc/npc-ai.js`: rest拦截阈值放宽（San<35→<50，体力<15→<25）+ 资源紧张度提示增强 + San低时增加rest/社交提示
- `src/npc/npc-renderer.js`: 资源紧张度"正常"→"正常，物资充足"

### ✨ 新功能：物资充足时NPC自主决策

#### 核心理念
遵循设计原则"只做情报的提供者，不做决策的辅助者"：当物资充足、机器修好时，在prompt中注入综合态势评估（如"物资充足，发电机和伐木机都在自动运转，你可以自由安排时间"），让LLM自己去想他们要干什么。

#### 1. 新增 `getResourceSituationBrief()` 方法
在resource-system中新增综合态势评估方法，根据资源紧张度+机器状态+供暖状态+人员状况，生成一段自然语言描述。
**改动**：`src/systems/resource-system.js`

示例输出（物资充足时）：
```
📊【当前态势】物资充足（木柴够48小时，食物够12餐，电力够36小时），发电机和伐木机都在自动运转。供暖稳定。
当前不需要紧急采集。你可以自由安排时间——休息恢复精力、找人聊天社交、探索废墟、或者做任何你觉得有意义的事。
```

#### 2. 废除"必须严格执行工作安排表"的强制规则
- think prompt规则4：从"🎯最高优先 你必须严格执行工作安排表"→"工作安排表供你参考，物资充足时完全可以自主决定做什么"
- action prompt规则2：从"🎯最高优先 不要擅自偏离"→"当资源紧张时积极执行，物资充足时自主决定"
- action prompt规则3：从"应该优先完成任务"→"参考信息，根据当前态势自行判断"
- action prompt规则9：新增强调"物资充足时可以选择休息、聊天、探索"
**改动**：`src/npc/npc-ai.js`、`src/npc/npc-renderer.js`

#### 设计原则
- ✅ 综合态势评估是**信息提供**（"物资充足，发电机在运转"）
- ✅ 没有任何"你应该去休息"之类的决策辅助
- ✅ 日程表和任务仅标注为"参考"
- ✅ LLM完全自主决策要干什么

### 📝 完整代码改动清单
---

## v4.15 — 5倍速整体适配：统一游戏时间与真实时间语义 (2026-03-21)

### 🎯 核心改动：高倍速下保持“推进更快”，但不让安全计时器失真

**设计理念**：5倍速应该让游戏的宏观推进更快（资源变化更快、昼夜更快、行动推进更快），但不应该让“冷却、保护期、卡住检测、导航超时、行为锁”等安全机制也同步缩短为 1/5。否则 NPC 会在高倍速下表现出抖动、频繁重规划、刚出门就被判超时、任务被过早打断等异常。

### 📝 具体改动

#### 1. `src/core/game.js` — 建立真实时间入口，碰撞卡住计时不再写死 `0.016`

- 在 `update(dt)` 中缓存每帧的真实 `dt` 与游戏 `dt`
- `collisionStallTimer` 改为使用真实时间累积
- 消除原先依赖固定帧率的写法，避免 5 倍速和低帧率叠加时计时失真

#### 2. `src/npc/npc.js` — NPC 主循环中的安全计时器统一改为真实时间

- 行为锁 `startTime` / 超时判断改为真实时间
- `aiCooldown`、`_restCooldownTimer`、`_yieldTimer`、`stuckTimer`、`collisionStallTimer` 衰减、聊天紧急检查、亲和冷却等统一切到真实时间
- 保留体力恢复、位移推进等应该跟随游戏倍速的行为推进逻辑

#### 3. `src/npc/npc-ai.js` — 行动决策冷却与兜底超时真实时间化

- `_actionDecisionCooldown` 改为真实时间递减，避免 5 倍速下 LLM 思考频率暴涨
- `_actionStuckTimer`、`_actionTravelTimer`、`_idleWatchdogTimer` 改为真实时间
- 发呆恢复任务与 pending intent 恢复改走统一仲裁入口，不再被 taskOverride 硬阻塞

#### 4. `src/npc/npc-schedule.js` / `src/npc/npc-attributes.js` — 导航超时与状态覆盖超时统一真实时间

- `_scheduleNavTimer`、`_taskOverrideTravelTimer` 改为真实时间
- `_stateOverrideStuckTimer`、`_stateOverrideTravelTimer` 改为真实时间
- 这样 5 倍速下“就医/回家/任务导航”仍按现实秒数判断是否卡住或超时，不会被提前 5 倍触发

### ✅ 最终统一规则

| 类型 | 时间语义 | 说明 |
|------|----------|------|
| 资源生产/消耗、属性演化、移动推进 | **游戏时间** | 5倍速下理应更快推进 |
| 冷却、保护期、卡住检测、导航超时、行为锁、发呆兜底 | **真实时间** | 防止高倍速下安全机制失真 |

### 🐛 解决的问题

- 5倍速下 `LLM` 决策过于频繁，NPC 像“神经过敏”一样频繁换目标
- 刚出门、刚让路、刚进屋时保护期和缓冲期过早结束
- 导航超时、卡住检测、碰撞脱困在高倍速下被提前触发
- 行为锁和恢复兜底与资源/移动使用同一时间语义，导致系统表现撕裂

### 📝 代码改动

- `src/core/game.js`: 缓存 `_lastRealDt` / `_lastGameDt`；碰撞卡住计时改为真实时间
- `src/npc/npc.js`: 行为锁、休息缓冲、AI冷却、让路、路径卡住、碰撞衰减等真实时间化
- `src/npc/npc-ai.js`: 决策冷却、行动卡住、旅行超时、发呆看门狗真实时间化；放宽 taskOverride 对意图恢复的硬阻塞
- `src/npc/npc-schedule.js`: 日程导航超时、任务覆盖旅行超时真实时间化；任务暂停/恢复统一走标准入口
- `src/npc/npc-attributes.js`: stateOverride 卡住与超时真实时间化

---

## v4.14 — 去除白天日程，LLM全权行动决策 (2026-03-20)

### 🎯 核心改动：白天行为由LLM驱动，日程只管睡觉

**设计理念**：NPC是有自主意志的角色，白天的行动不应该被固定日程表驱动。日程表机械地按时段导航NPC到指定位置，玩家看到的只是NPC按部就班的移动，缺乏"AI在自主思考和生活"的感觉。

**改动前**：
```
update → _updateSchedule(P2日程) → 每个时段根据scheduleTemplate导航NPC → LLM决策几乎不被触发（只在对话结束后和空闲兜底时）
```

**改动后**：
```
update → _updateSchedule(P0紧急+P1任务+睡觉日程) → _actionDecision(LLM) → NPC白天完全由LLM自主决策去哪里做什么
```

### 📝 具体改动

#### 1. `src/npc/npc.js` — 在update循环中加入LLM决策定时调用

- 在 `_updateSchedule` 之后、`_updateIdleWatchdog` 之前，新增 `_actionDecision` 的定时调用
- 当 `_actionDecisionCooldown <= 0` 时自动触发LLM决策
- 决策基础间隔从 **45~75秒** 缩短为 **25~45秒**（因为现在是白天行为的唯一驱动力）

#### 2. `src/npc/npc-schedule.js` — P2日程层改为只管睡觉

- 新增 `isBedtime` 和 `isSleepSchedule` 判断
- **白天（6:00~22:00）非睡觉日程**：跳过P2日程导航，交给LLM自主决策
- **夜间（22:00~6:00）睡觉日程**：保持原有日程导航（回宿舍睡觉）
- **P0（生存紧急）和 P1（任务驱动）完全不变**
- 饥饿系统、进屋安全网、超时兜底等都不受影响

#### 3. `src/npc/npc-ai.js` — LLM决策增强

- **夜间保护**：22:00~6:00不触发LLM决策（除非身体极差需要紧急决策）
- **动态间隔加速**：危险时10~20秒、资源紧张时15~30秒
- **Prompt优化**：
  - 日程从"仅供参考"改为明确提示"你可以完全自主决定做什么"
  - 夜间提示回家休息
  - 白天提示自主行动（采集/工作/社交/探索）
  - 优先级描述更新：生存 > 任务 > 健康 > **自主行动**（替代"日常日程"）

### ⚠️ 保留的机制

| 机制 | 状态 | 说明 |
|------|------|------|
| P0 紧急层 | ✅ 完全保留 | 体温/健康/体力危急时的紧急处理 |
| P1 任务层 | ✅ 完全保留 | taskOverride/council任务驱动 |
| 睡觉日程 | ✅ 保留 | 22:00~6:00的scheduleTemplate睡觉条目 |
| 饥饿系统 | ✅ 完全保留 | 饿了自动去吃饭 |
| 空闲兜底 | ✅ 保留 | 20秒发呆→_fallbackToRoleDefaultAction |
| scheduleTemplate数据 | ✅ 保留 | LLM prompt中作为"参考"展示 |
| 白天日程导航 | ❌ 移除 | 不再根据时段驱动NPC移动 |

---

## v4.13 — 移除暖炉维护 + 修复决策被打断Bug (2026-03-20)

### 🔥 移除暖炉维护行动

**设计理念**：暖炉是被动系统，自动燃烧消耗木柴，不需要人维护。"维护暖炉"在玩家眼里看不到任何可见效果（没有进度条、没有状态变化），却占用AI决策空间，还会让NPC挂在嘴上说"要去维护暖炉"。

**清理范围**（8个文件）：

| 文件 | 清理内容 |
|------|---------|
| `data/action-effects.js` | 删除`furnace_maintain`效果映射条目 + `build_progress`暖炉修复条目 |
| `src/npc/action-effects.js` | 删除`furnace_maintain` case执行代码（体温+50%/体力+20%/柴耗-30%）+ 气泡代码 |
| `src/npc/specialty.js` | 删除`furnace_maintain`专长描述和乘数计算 |
| `src/npc/npc-attributes.js` | 从体力型角色判断中移除`furnace_maintain` |
| `src/npc/npc-schedule.js` | 删除'暖炉/维护暖炉/加柴'关键词映射 |
| `src/npc/npc-ai.js` | 暖炉广场描述去掉"维护暖炉→减少燃料消耗" |
| `src/systems/council-system.js` | 删除暖炉维护关键词映射 + 默认方案"维护暖炉"→"安抚士气" |
| `src/systems/council-prompt-builder.js` | 删除"维护暖炉→柴耗-30%+暖区增强"说明 + 策略描述去掉"修暖炉" |
| `src/systems/resource-system.js` | 删除`_furnaceFuelSaving`燃料节约代码 |
| `src/core/input.js` | 删除`MAINTAIN_FURNACE`玩家指令 |
| `data/npc-configs.js` | 赵铁柱日程"维护暖炉、添加柴火"→"在暖炉广场休息取暖" |

### 🐛 关键Bug修复：决策让NPC去建造，但他在人工发电

**根因**：`council-system.js` 的 TASK_ACTION_MAP 关键词匹配顺序错误

1. **关键词匹配串台**：通用关键词"建造"被放在了一个 `stateDesc: '人工发电'` 的兜底条目里。当council分配"建造发电机"任务时，如果LLM写的任务文本只包含"建造"而不是精确的"建造发电机"，"建造"先被兜底条目命中 → stateDesc变成"人工发电"而不是"建造发电机" → action-effects匹配到人工发电效果。

2. **taskOverride未阻止LLM新决策**：`_actionDecision()` 中有一行注释 `// taskOverride 不再硬跳过 LLM 决策`，导致即使taskOverride激活（council分配了任务），LLM仍然可以发起新的行动决策并覆盖stateDesc。

**修复**：

1. **重排关键词匹配顺序**：精确匹配（建造发电机/建造伐木机）放在前面，通用匹配（建造/建设/搭建）放在后面。通用"建造"关键词的stateDesc改为"建造发电机"而非"人工发电"。
2. **恢复taskOverride硬保护**：`_actionDecision()` 中加回 `if (this._taskOverride && this._taskOverride.isActive) return;`，taskOverride激活时硬跳过LLM决策，防止stateDesc被覆盖。

### 📝 改动文件

- `src/systems/council-system.js`: 关键词匹配顺序修正、暖炉清理
- `src/npc/npc-ai.js`: 恢复taskOverride硬保护、暖炉描述清理
- `data/action-effects.js`: 暖炉条目清理
- `src/npc/action-effects.js`: 暖炉效果代码清理
- `src/npc/specialty.js`: 暖炉专长清理
- `src/npc/npc-attributes.js`: 体力型判断清理
- `src/npc/npc-schedule.js`: 暖炉关键词清理
- `src/systems/resource-system.js`: 燃料节约代码清理
- `src/systems/council-prompt-builder.js`: 暖炉prompt清理
- `src/core/input.js`: MAINTAIN_FURNACE指令清理
- `data/npc-configs.js`: 日程描述清理

---

## v4.12 — 行动系统精简：LLM决策从7选1→3选1 (2026-03-20)

### 🎯 核心改动：精简LLM行动类型

**设计理念**：如果一个行动在玩家眼里看不出区别，那它就不该存在。每个行动 = 一个清晰的画面 = 一个可见的结果。

**文件**: `src/npc/npc-ai.js`、`src/core/input.js`

#### LLM可选行动：7种 → 3种

| 保留 | 说明 |
|------|------|
| **go_to** | 前往某地（到达后自动触发采集/工作/社交等效果） |
| **rest** | 回家休息/睡觉 |
| **eat** | 去炊事房吃饭 |

| 移除 | 原因 |
|------|------|
| ~~work~~ | 等于"放弃决策交给系统"，和go_to无区别 |
| ~~accompany~~ | 条件太苛刻几乎不触发，退化后和go_to无区别 |
| ~~stay~~ | 执行后立即清除覆盖，玩家看不出效果 |
| ~~wander~~ | 被Prompt和拦截器双重压制，形同虚设 |

#### 智能兼容机制

LLM如果仍然返回废弃类型，系统会智能纠正：
- `work`/`wander` → 调用 `_fallbackToRoleDefaultAction()` 转为角色默认go_to
- `stay` → 跳过，让日程系统接管
- `accompany` + 有target → 转为 `go_to` 到目标位置

#### 系统内部保留

- `_executeAction` 的 switch 分支全部保留（拦截器/日程系统仍可产出这些类型）
- `GST.NPC.ALL_ACTION_TYPES`（7种）用于系统内部
- `GST.NPC.ACTION_TYPES`（3种）用于LLM校验
- `_wanderToNearbyLandmark()` 保留给日程系统调用
- `_fallbackToRoleDefaultAction()` 保留给空闲时系统调用

#### Prompt优化

- 行动类型说明精简为3种 + 💡提示（想找人聊天→go_to目的地，想工作→go_to工作地点）
- JSON格式移除 companion 字段
- 决策规则第10条和第13条更新
- 暴风雪拦截器改为go_to回家（原为stay）
- 白天rest拦截改为return跳过（原为改写stay）

### 🔧 input.js 玩家指挥系统适配

- 玩家"待命/原地"命令 → go_to furnace_plaza
- 玩家"巡视/逛逛"命令 → go_to furnace_plaza
- 玩家"工作/干活"命令 → go_to workshop_door
- COMMANDER_LLM_INTENT_LIBRARY 中 WORK/STAY/WANDER 映射更新

### 📝 代码改动

- `src/npc/npc-ai.js`: ACTION_TYPES精简、新增ALL_ACTION_TYPES、Prompt重写、校验逻辑增加智能纠正、拦截器更新
- `src/core/input.js`: 玩家命令映射更新、target校验逻辑更新

---

## v4.11.1 — 讨论结束San恢复 + 暖炉维护文档校正 (2026-03-16)

### 🔧 CouncilSystem：讨论结束统一恢复 San

**文件**: `src/systems/council-system.js`

- 普通讨论结束后，在进入投票前对所有参与会议且存活的成员统一恢复一次 San
- `继续讨论` 分支也走同一结算，避免普通讨论与继续讨论行为不一致
- 使用 `_discussionSanRecovered` 防重，确保同一场会议不会通过多次“继续讨论”反复刷 San
- 恢复量按难度递减：easy=15、normal=13、hard=12、harder=10、arctic=7、hell=5
- 会议面板会追加系统提示，并向事件日志写入简要记录

### 📝 Guide 同步

**文件**: `guide/04-attributes.md`、`guide/03-npc.md`、`guide/guide.md`

- 在 San 恢复途径中补充“讨论结束”一次性恢复说明
- 将暖炉维护效果修正为与当前代码一致：**柴耗-30% + 暖区增强**
- 更新 guide 总览版本号为 `v4.11.1`

## v4.11 — 投票决策系统 + 自动化机器 + 统一行为仲裁 + 大量Bug修复 (2026-03-16)

### 🆕 新系统：投票决策系统 (CouncilSystem)

**文件**: `src/systems/council-system.js`（1151行）、`src/systems/council-prompt-builder.js`（680行）

NPC 集体投票决策系统，通过 LLM 驱动的多轮讨论和投票选出最优生存方案：
- **触发方式**：资源危机自动触发（`checkResourceCrisisTrigger()`）、NPC死亡自动触发（`death-system.js`）、手动触发
- **流程**：老钱（或存活领袖）提出2-3个方案 → 全体NPC轮流发言讨论 → 投票表决 → 赢家方案通过 `activateTaskOverride()` 分配到具体NPC
- **TASK_ACTION_MAP**：将投票结果（如"砍柴"、"建造发电机"）模糊匹配映射为具体的目标位置、资源类型和 stateDesc 关键词
- **与 NPC 系统对接**：`npc._councilTask` 记录投票分配任务、`npc._councilStateDesc` 保护关键词不被 LLM 行动决策覆盖
- **Prompt 注入**：think/action prompt 中新增 `🗳️ 投票决策分工` 段落，NPC 优先执行投票结果
- **过期清理**：`cleanExpiredCouncilTasks()` 在 game.update 中定期清理过期的投票任务

### 🆕 新系统：自动化机器系统 (MachineSystem)

**文件**: `src/systems/machine-system.js`（473行）

自动发电机和自动伐木机，由 NPC 建造完成后自动运行：
- **自动发电机**：建造耗时 14400 游戏秒，建成后自动产电 5/h（消耗木柴 1/h）
- **自动伐木机**：建造耗时 21600 游戏秒，建成后自动产柴 6/h（消耗电力 1.5/h）
- **建造流程**：NPC 到达工坊 → stateDesc 匹配 `建造发电机`/`建造伐木机` → action-effects 触发 `build_machine` → MachineSystem 驱动进度
- **多人协作**：多个 NPC 同时在工坊可加速建造（`buildWorkers` 数组）
- **跳夜补算**：`_skipNightMachineCalc()` 在跳夜期间模拟机器运行
- **HUD 显示**：发电机/伐木机建造进度、运行状态、产出速率在 HUD 面板展示
- **任务类型**：`BUILD_GENERATOR`（urgent 优先分配给王策）、`BUILD_LUMBER_MILL`（high 分配给清璇）

### 🔧 核心架构改进：统一行为仲裁机制

**文件**: `src/npc/npc-schedule.js`（新增 `_getScheduleControl()`）

解决长期存在的"多系统同时控制NPC导致互相覆盖"问题，建立统一的行为优先级仲裁：
- **`_getScheduleControl()`**：返回当前控制方（owner）、优先级（P0/P1/P2）、是否阻塞日程（blocksSchedule）、是否允许重定向（canRetargetFromSchedule）等控制信号
- **优先级链**：P0紧急 > stateOverride(sick/mental) > 治疗中 > taskOverride > actionOverride > 同伴跟随 > P2日程
- **消除硬编码**：原来分散在各处的 `if (this._actionOverride)` / `if (this._stateOverride)` 判断统一收敛到 `scheduleControl` 对象
- **5 个控制信号**：`canRetargetFromSchedule`（日程能否改目标）、`canRetryScheduleNavigation`（日程能否重试导航）、`canRecoverTimeout`（日程超时兜底是否允许）、`canUseDoorSafetyNet`（进门安全网是否允许）、`canCorrectArrivalOffset`（到达偏移修正是否允许）、`canRunPostArrivalBehavior`（环境感知是否允许）

### 🔧 核心改进：统一 taskOverride stateDesc 管道

**根因**：发电机/伐木机永远不被建造。task-system 只建映射不驱动导航；`activateTaskOverride()` 不支持自定义 stateDesc；LLM 决策可在任务期间覆盖 stateDesc。

**修复**：
- `activateTaskOverride()` 新增第5参数 `stateDesc`，存入 `_taskOverride.stateDesc`，与 taskId 同生命周期
- `_getTaskOverrideDesc()` 优先级链：`override.stateDesc` > `_councilStateDesc` > resourceType 映射 > 默认
- `_actionDecision()` 在 taskOverride 活跃时跳过 LLM 决策
- task-system 的 `_activateDailyTaskNavigation()` 传入 `detail.name` 作为 stateDesc
- council-system 通过同一接口传入 `matched.stateDesc`

**改动**: `npc-schedule.js`、`npc-ai.js`、`task-system.js`、`council-system.js`

### 🔧 核心改进：户外安全门控统一

**新增** `canSafelyGoOutdoor()` 统一判断 NPC 能否安全出门：
- 检查体温（<36.5°C 不出门）、精神（<55 不出门）、体力（<45 不出门）、健康（<40 不出门）
- 检查天气（暴风雪禁止）、户外冷却期（P0 恢复后 30s 缓冲）
- P0 紧急状态自身的导航不受限（如 health_critical 需出门去医疗站）
- 替代之前分散在各处的单独天气检查和 P0 类型枚举

### 🐛 Bug 修复

#### 1. 任务系统只建映射不驱动导航
**问题**：`_assignTasks()` 设了 `npcAssignments[npcId] = taskId`，但从未调用 `activateTaskOverride()` 让 NPC 物理移动。
**修复**：新增 `_activateDailyTaskNavigation()` 方法，在 `_assignTasks()` 后立即调用，遍历分配结果对每个 NPC 调用 `activateTaskOverride()`。
**改动**：`src/systems/task-system.js`

#### 2. _door 类型任务位置校验错误
**问题**：`_updateNpcTask` 中校验 NPC 是否在正确场景时，`_door` 类型目标（如 `workshop_door`）在 `SCHEDULE_LOCATIONS` 中 scene 为 `village`，但之前的代码要求 NPC 在室内场景（`doorToScene[tLoc]`），导致站在门口或已进入室内的 NPC 都无法产出。
**修复**：`_door` 类型任务允许 NPC 在 `village`（门口）或对应室内场景都算到达。
**改动**：`src/systems/task-system.js`

#### 3. 精神危急 NPC 不返回室内
**问题**：苏岩等 NPC 精神状态很差（San<40）仍在户外工作直到崩溃。
**修复**：新增 P0-7 精神危急检测，San<40 + 在户外 → 强制返回宿舍休息。配套新增日程精神状态调整（`_getSanityAdjustedEntry`）。
**改动**：`src/npc/npc-schedule.js`

#### 4. 苏岩找自己做心理咨询
**问题**：苏岩（医生）精神状态差时触发 `_triggerStateOverride('mental')`，然后去医疗站找"苏医生"给自己看病。
**修复**：`su_doctor` 不触发 mental stateOverride；心理咨询需要苏医生在场才开始；苏岩自己的治疗文本改为"自己调整"。
**改动**：`src/npc/npc-attributes.js`

#### 5. P0 health_critical 与 stateOverride=sick 冲突导致进门出门死循环
**问题**：NPC 生病中 `stateOverride=sick` 前往医疗站，途中健康低于 P0 阈值触发 `health_critical`→目标改为宿舍→与 sick 覆盖冲突→两个系统交替控制→死循环。
**修复**：P0-3 检测时跳过已处于 `stateOverride=sick` 的 NPC。同理 `stateOverride=mental` 时跳过 P0-7。
**改动**：`src/npc/npc-schedule.js`

#### 6. 出门保护期内被重新导航
**问题**：NPC 刚出门（`_indoorEntryProtection > 0`）时被 stateOverride 卡住检测触发重新导航→进错门→死循环。
**修复**：stateOverride 卡住检测和 P2 日程导航在 `_indoorEntryProtection > 0` 时跳过。
**改动**：`src/npc/npc-attributes.js`、`src/npc/npc-schedule.js`

#### 7. 睡眠 San 恢复量不足导致"死亡螺旋"
**问题**：8 小时睡眠仅恢复约 19 San（0.04/dt × 8h ≈ 19），不足以对冲白天户外+死亡事件的 San 扣减，导致全队 San 逐天下滑直至崩溃。
**修复**：睡眠 San 恢复从 0.04→0.10/dt（8h 约恢复 48 San）；跳夜补算从 3/h→6/h。
**改动**：`src/npc/npc-attributes.js`、`src/core/game.js`

### ⚙️ 系统调整

#### 任务类型清理
- **移除** `SET_TRAP`（效果太弱不值得浪费人力）、`REPAIR_RADIO`（性价比太低）、`MAINTAIN_FURNACE`（暖炉自动燃烧消耗木柴，无需人工维护）
- **新增** `BUILD_GENERATOR`、`BUILD_LUMBER_MILL`
- **NPC 专长更新**：赵铁柱/陆辰/王策增加机器建造专长；清璇从陷阱/无线电改为药剂/急救

#### 资源消耗人口缩减
- **新增** `getPopulationRatio()`：`max(0.3, alive/total)`，人少了木柴/电力消耗按比例降低（最低 30%）
- 影响：木柴消耗、电力消耗、剩余小时数估算、紧急任务阈值、跳夜补算

#### 暖炉维护效果增强
- 暖炉维护 NPC 的燃料节约从 10%→30%
- 新增暖区增强：同场景 NPC 体温恢复+50%、体力恢复+20%

#### NPC 死亡触发紧急会议
- death-system 检测到 NPC 死亡后延迟 5s 触发 CouncilSystem 紧急决策会议
- 存活≥2 人时才触发（避免最后一人独自开会）

### 🧠 LLM Prompt 增强

#### 轮回记忆强制体现
- think prompt 和 action prompt 新增规则：**必须**具体引用前世记忆
- 示例引导："上一世就是因为柴火不够，第三天暖炉熄了冻死了三个人…"
- `threat_analysis`/`opportunity_analysis`/`reasoning` 字段示例全部更新为包含前世记忆引用
- 轮回系统对话规则从"可以引用"改为"**必须**自然地引用前世经验"

#### 投票决策注入
- action prompt 新增 `3b. 🗳️【投票决策】` 规则：投票结果优先级仅次于生存紧急需求
- 新增 `${this._councilTask ? ... : ''}` 条件注入投票决策上下文

### 📊 UI/HUD 增强

- **自动化机器面板**：发电机/伐木机建造进度、运行状态、产出速率
- **医疗气泡增强**：显示具体治疗对象（如"治疗对象: 老钱等3人"）
- **安抚气泡增强**：显示安抚对象（如"安抚对象: 歆玥"）
- **NPC 行动日志**：AI 行动决策输出到右侧事件列表（emoji 标记）
- **资源 prompt 增强**：`getResourceStatusForPrompt()` 新增自动化机器状态信息

### 📝 代码改动总览

| 文件 | 改动内容 |
|------|---------|
| `src/systems/council-system.js` | 🆕 投票决策系统（1151行） |
| `src/systems/council-prompt-builder.js` | 🆕 投票 Prompt 构建器（680行） |
| `src/systems/machine-system.js` | 🆕 自动化机器系统（473行） |
| `src/systems/task-system.js` | 移除 SET_TRAP/REPAIR_RADIO/MAINTAIN_FURNACE；新增 BUILD_GENERATOR/BUILD_LUMBER_MILL；新增 `_activateDailyTaskNavigation()`；`_door` 类型位置校验修复 |
| `src/systems/death-system.js` | NPC 死亡触发紧急 council 会议 |
| `src/systems/resource-system.js` | 人口缩减系数；暖炉维护增强；机器状态注入 prompt |
| `src/systems/reincarnation-system.js` | 移除 REPAIR_RADIO/MAINTAIN_FURNACE 引用；轮回记忆对话规则增强 |
| `src/systems/weather-system.js` | 修复 tempOffset 双重扣减 |
| `src/core/game.js` | 初始化 MachineSystem/CouncilSystem；移除无线电系统；碰撞系统室内/室外差异化；跳夜机器补算；资源危机自动触发投票 |
| `src/npc/npc-schedule.js` | `canSafelyGoOutdoor()` 统一门控；`_getScheduleControl()` 统一仲裁；`_getSanityAdjustedEntry()` 精神调整；`activateTaskOverride()` 第5参数 stateDesc；P0-7 精神危急；P0 恢复后统一冷却 |
| `src/npc/npc-ai.js` | `_getTaskOverrideDesc()` 统一优先级链；`_actionDecision()` taskOverride guard；`_fallbackToRoleDefaultAction()` 补全 actionOverride；action prompt 轮回记忆+投票决策注入 |
| `src/npc/npc-attributes.js` | 苏岩不自己找自己咨询；心理咨询需苏医生在场；出门保护期检查；睡眠 San 恢复增强 |
| `src/npc/npc-renderer.js` | think prompt 轮回记忆强制体现；清璇角色描述更新；投票决策上下文注入 |
| `src/npc/action-effects.js` | `_councilStateDesc` 三路匹配；`addResource()` 统计修复；`build_machine` 效果类型；暖炉维护增强；医疗/安抚气泡显示治疗对象 |
| `src/npc/npc.js` | 位置修复冷却；碰撞参数调整 |
| `src/npc/specialty.js` | 新增 BUILD_GENERATOR/BUILD_LUMBER_MILL 专长映射 |
| `src/ai/llm-client.js` | `callLLMDirect()` 绕过队列 |
| `src/ui/hud.js` | 自动化机器面板 |
| `data/action-effects.js` | 电力关键词补充；新增建造发电机/伐木机映射 |
| `data/npc-configs.js` | 清璇角色描述更新；NPC 配置调整 |
| `index.html` | 引入 council-system.js / council-prompt-builder.js / machine-system.js |
| `style.css` | 投票决策弹窗样式；机器面板样式 |

---

## v4.10 — 多系统Bug修复：电力/碰撞/LLM队列/废墟循环 (2026-03-07)

### 🐛 Bug 修复

#### 1. 电力维护无效 — ACTION_EFFECT_MAP 关键词不匹配

**问题**：多个NPC在工坊显示"🔧 正在维护电力"，但电力一点没增加。
**根因**：任务系统设置NPC的 `stateDesc = "🔧 正在维护电力"`，但 `ACTION_EFFECT_MAP` 中产出电力的关键词是 `['维修发电机', '检查发电机', '技术工作', '制造工具']`——`"维护电力"` 完全匹配不到任何关键词，行动效果系统每帧空转。
**修复**：在 `ACTION_EFFECT_MAP` 电力产出条目中补充 `'维护电力'` 和 `'正在维护电力'` 关键词。
**改动**：`data/action-effects.js`

#### 2. 温度双重扣减 — getEffectiveTemp 重复减 tempOffset

**问题**：高难度下电力消耗异常高，4人维护电力仍涨不上去。
**根因**：`onDayChange()` 中 `currentTemp -= tempOffset`（第1次扣减），`getEffectiveTemp()` 中 `temp -= tempOffset`（第2次扣减），导致实际温度比设计值低了 `tempOffset` 度。hard难度(tempOffset=10) Day2 实际温度从-35°C变成**-50°C**，电力消耗乘数翻倍。
**修复**：移除 `getEffectiveTemp()` 中的重复 tempOffset 扣减。
**改动**：`src/systems/weather-system.js: getEffectiveTemp()`

#### 3. 行动效果产出绕过 addResource — 产出不被统计

**问题**：NPC通过行动效果系统产出的资源不被记录到 `dailyCollected`，不触发电力恢复检测。
**根因**：`action-effects.js` 中 `produce_resource` 效果直接写 `rs[type] += produced`，绕过了 `addResource()` 方法。
**修复**：改为调用 `rs.addResource()` 方法。
**改动**：`src/npc/action-effects.js`

#### 4. 室内NPC碰撞抖动/闪现 — 碰撞推挤在狭小空间死循环

**问题**：多个NPC在工坊(12×8格)里疯狂闪现抖动，日志刷屏"被推进墙壁，自动修复位置"。
**根因**：室内使用与室外相同的碰撞参数（推力2.0、碰撞半径0.45×TILE），多NPC在狭小空间被反复推进家具/墙壁→修复位置→又被推→无限循环。随机推力(nudge)和强制传送脱困(forceUnstuck)加剧了闪现。
**修复**：
- 室内场景**完全跳过碰撞推挤**，只做气泡偏移计算（`_computeBubbleOffsets`）
- 室内NPC通过座位系统(`_pickIndoorSeat`)精确定位，不需要碰撞推力
- 位置修复逻辑加5秒冷却(`_posFixCooldown`)避免每帧触发
**改动**：`src/core/game.js: _resolveNPCCollisions()`、`src/npc/npc.js`

#### 5. 讨论系统LLM队列堵塞 — 暂停后讨论等几分钟才发言

**问题**：打开讨论弹窗后NPC一直"正在发言..."但不说话，等了几分钟才出第一句。
**根因**：所有LLM调用共用一个串行队列(`_llmQueuePromise`)，暂停前NPC的AI决策请求(think-action)已经进入队列。讨论系统的请求排在队尾，要等前面5-6个AI请求各10-30秒处理完才轮到。
**修复**：
- 新增 `callLLMDirect()` 函数——绕过串行队列直接调用LLM
- 讨论系统改用 `GST.callLLMDirect` 替代 `GST.callLLM`
**改动**：`src/ai/llm-client.js`（新增callLLMDirect）、`src/systems/council-system.js`

#### 6. NPC废墟↔矿渣堆无限来回跑 — fallback行动覆盖缺失

**问题**：歆玥在废墟(43,5)和矿渣堆(43,35)之间反复来回跑，无法停下来。
**根因**：废墟探索3次用完后 `_fallbackToRoleDefaultAction` 设置了 `_actionTarget = ore_pile`，但**漏了设置 `_actionOverride = true`**。日程系统的一致性检查检测到 `_actionOverride=false` 但 `_actionTarget` 存在→清除 `_actionTarget`→日程重新导航到废墟→到达后又exhausted→又fallback→死循环。同时 `explore_ruins` 效果在exhausted后每帧都会触发fallback，加剧了循环。
**修复**：
- `_fallbackToRoleDefaultAction` 补全 `_actionOverride = true` 和 `_currentAction` 设置
- `explore_ruins` 效果新增 `_ruinsExhaustedDay` 当天标记和 `_ruinsFallbackDone` 单次触发保护
**改动**：`src/npc/npc-ai.js: _fallbackToRoleDefaultAction()`、`src/npc/action-effects.js: explore_ruins`

### 📝 日志增强

- NPC AI行动决策现在输出到右侧事件列表（emoji标记：🚶/😴/🍽️/⚒️/👫/📍/🔄）
- 被推进墙壁的位置修复事件输出到右侧事件列表
- 位置偏移修正事件输出到右侧事件列表
**改动**：`src/npc/npc-ai.js`、`src/npc/npc.js`、`src/npc/npc-schedule.js`

### 📝 代码改动总览

| 文件 | 改动内容 |
|------|---------|
| `data/action-effects.js` | 电力关键词补充 `维护电力`/`正在维护电力` |
| `src/systems/weather-system.js` | 修复 `getEffectiveTemp()` 双重 tempOffset 扣减 |
| `src/npc/action-effects.js` | `produce_resource` 改用 `addResource()`；`explore_ruins` 加exhausted标记 |
| `src/core/game.js` | 室内场景跳过碰撞推挤；气泡偏移用场景化碰撞半径 |
| `src/npc/npc.js` | 位置修复加5秒冷却 |
| `src/npc/npc-ai.js` | `_fallbackToRoleDefaultAction` 补全行动覆盖；AI行动日志输出到事件列表 |
| `src/npc/npc-schedule.js` | 位置偏移修正日志输出到事件列表 |
| `src/ai/llm-client.js` | 新增 `callLLMDirect()` 绕过队列 |
| `src/systems/council-system.js` | 讨论系统改用 `callLLMDirect` |

---

## v4.9 — Prompt架构重构：Few-shot + 角色隔离 (2026-03-06)

### 🏗️ 核心改进：参考业界Agent对话最佳实践彻底重构prompt结构

**问题诊断**：
- 赵铁柱（设定话极少）说了一大段指挥式发言
- 苏岩把赵铁柱的话错误归因给老钱（"老钱刚才那句'先补饭'"）
- 所有人说话风格趋同，像在发演讲稿

**根因分析**：
1. System Prompt 信息过载——角色卡、规则、状态全塞一起，LLM忽略关键约束
2. 聊天记录用 `XX说：` 平铺——LLM难以分清"谁是谁"，张冠李戴
3. 缺少 few-shot 示例——光描述"你话少"没用，必须给具体示例
4. 所有角色用相同 maxTokens=300——导致话少的角色被"撑大"

**解决方案**：

| 改进项 | 旧设计 | 新设计 |
|--------|--------|--------|
| System Prompt | 身份+性格+状态+关系+规则(超长) | 精简为身份锁定+角色卡+few-shot示例 |
| 角色卡 | 5段描述文字(archetype/voice/focus/quirks) | bio+style+字数要求+2-3个说话示例 |
| 情境信息 | 塞在System Prompt | 移到User Prompt（属于"当前情境"不是"你是谁"） |
| 聊天记录 | `XX说：YYY` 平铺 | `[XX]: YYY` 角色标签格式 |
| maxTokens | 所有人300 | 按角色差异化(赵铁柱80/老钱200) |
| User结尾 | `${name}说：` | `${name}：` + 规则放最后(注意力最强位置) |

**角色maxTokens配置**：
- 赵铁柱: 80（话极少）
- 陆辰/清璇: 120（短句）
- 歆玥: 160（中等）
- 苏岩/王策: 180（需要分析）
- 老钱/李婶: 200（需要统筹/唠叨）

**few-shot示例效果**——比任何文字描述都有效：
- 赵铁柱示例: "柴不够了。" / "我去砍。" / "少废话，干活。"
- 清璇示例: "爷爷……你手好凉，往火边靠靠。" / "那个……我查过资料"
- 老钱示例: "大伙儿别慌……当年矿难那会儿，比这还险"

### 🔧 技术改动
- `council-system.js` — `_buildCharacterCard()` 彻底重写为 few-shot 角色卡
- `council-system.js` — System Prompt 精简化，情境移入 User Prompt
- `council-system.js` — 聊天记录格式改为 `[XX]:` 标签格式
- `council-system.js` — maxTokens 按角色动态配置
- `council-system.js` — 增加角色名前缀清除（防止LLM重复名字）
- `council-system.js` — User Prompt 末尾用 `${name}：` 引导续写

---

## v4.8 — 角色性格深度重构：动漫原型锚定 (2026-03-06)

### 🎭 核心改进：每个角色对标3个经典动漫/游戏角色

通过动漫/游戏角色的性格原型（archetype）来锚定每个NPC的说话风格和行为模式，让LLM生成更有辨识度的对白：

| 角色 | 对标1 | 对标2 | 对标3 |
|---|---|---|---|
| 老钱 | 火影·三代目猿飞日斩 | 钢炼·霍恩海姆 | 进击的巨人·艾尔文团长 |
| 李婶 | 银魂·阿妙 | 鬼灭·香奈惠 | 咒术回战·野蔷薇 |
| 赵铁柱 | 进击的巨人·利威尔 | 鬼灭·义勇 | FF7·巴雷特 |
| 苏岩 | 火影·卡卡西 | 咒术·家入硝子 | 辐射4·柯丁顿 |
| 王策 | 死亡笔记·L | 心理测量者·槙岛圣护 | 三体·罗辑 |
| 陆辰 | 咒术·虎杖悠仁 | 进击的巨人·让 | 鬼灭·伊之助 |
| 歆玥 | 钢炼·温莉 | 86·蕾娜 | 鬼灭·蜜璃 |
| 清璇 | 钢炼·阿尔冯斯 | 约定梦幻岛·艾玛 | 86·安洁 |

### 📝 改动范围

- `data/npc-configs.js`: 重写全部8个NPC的`personality`字段（从2-3句书面语→多段落口语化性格描写，包含动漫原型、说话习惯、暗恋表现、压力反应等）
- `src/systems/council-system.js`: 重写`SPEECH_STYLES`（新增`archetype`字段），角色卡增加【性格原型】维度
- 同步升级讨论系统的好感度/记忆/暴风雪/轮回/反重复注入（v4.7.5的改进保留）

---

## v4.7 — 营地讨论系统（暂停时NPC围坐聊天） (2026-03-06)

### 🔥 新功能：营地讨论（Council）

- **触发方式**：点击暂停按钮 `⏸️` 时自动弹出"营地讨论"弹窗
- **功能描述**：3-5个活着的NPC围坐在暖炉旁，轮流就当前局势发言
- **讨论内容**：分析物资状况、规划分工、抱怨困难、互相鼓励、商讨对策等
- **AI驱动**：每个NPC的发言由LLM根据当前环境+角色性格+生存数据实时生成
- **环境感知**：弹窗顶部显示当前天数/温度/天气/资源/存亡摘要
- **角色差异化**：
  - 老钱：统筹全局、安抚民心
  - 苏岩：关注健康、医疗建议
  - 赵铁柱：务实分析物资、分配方案
  - 陆辰：行动派、具体方案
  - 王策：哲学思考、不同视角
  - 歆玥：关注情绪、表达希望
  - 清璇：药物/急救角度建议
  - 李婶：照顾细节、暖心唠叨
- **San值影响**：低San值NPC发言会变得暴躁、悲观、抱怨
- **悲痛影响**：正在悲痛的NPC会提到逝者
- **继续讨论**：讨论结束后可点击"继续讨论"追加2-3人发言
- **关闭即继续**：关闭弹窗自动取消暂停，继续游戏

### 📁 新增/修改文件

- **新增** `src/systems/council-system.js` — 营地讨论系统核心逻辑（选择发言者、LLM调用、UI渲染）
- `index.html` — 添加 `#council-overlay` 弹窗DOM + 引入脚本
- `style.css` — 暖色调讨论弹窗样式（橙色主题，暖炉氛围）
- `src/core/game.js` — `togglePause()` 暂停时调用 `councilSystem.open()`、初始化 `CouncilSystem`

---

## v4.6 — 移除无意义任务 + 场景限制修复 (2026-03-06)

### 🗑️ 移除：MAINTAIN_FURNACE 维护暖炉任务

- **原因**：暖炉自动燃烧消耗木柴，不需要专人"维护"，占用人力毫无实际意义
- **替代**：原来分配到MAINTAIN_FURNACE的NPC（赵铁柱Day2/4、李婶Day2、陆辰Day4）改为PREPARE_WARMTH（准备御寒物资）
- **影响文件**：task-system.js, reincarnation-system.js, game.js

### 🗑️ 移除：SET_TRAP 布置陷阱任务

- **原因**：全员San+5效果太弱，不值得浪费清璇的人力。末日生存应集中力量在医疗和物资上
- **替代**：清璇的Day1陷阱任务改为纯医疗
- **影响文件**：task-system.js, game.js

### 🔧 修复：BUILD_FURNACE 目标位置

- **问题**：修建第二暖炉的目标位置是`dorm_b_door`（宿舍B门口），不合理
- **修复**：改为`workshop_door`（工坊门口），工具齐全更合理

### 🔧 修复：ACTION_EFFECT_MAP 场景限制

- **巡查(medical_heal)**：从"不限场景"改为`requiredScene: 'medical'`，医疗效果只在医疗站生效
- **维护暖炉(furnace_maintain)**：从"不限场景"改为`requiredScene: 'village'`（暖炉在广场，不能隔空维护）

### 🔧 修复：清璇日程 + 角色描述

- **日程修改**：15-17时和19-22时从"在工坊修理无线电台"改为"在医疗站制作草药制剂和急救包"
- **专长修改**：移除`radio_repair`，替换为`craft_medkit: 1.3`
- **AI描述**：从"药剂师学徒/陷阱工…修理无线电"改为"药剂师学徒…急救包"

### 🔧 修复：苏岩日程描述

- **17-18时**：从"巡查大家的健康状况"改为"安抚大家、查看健康状况"（匹配morale_boost而非medical_heal）
- **19-21时**：从"巡查大家的健康、安抚民心"改为"安抚大家、心理支持"

### 📝 代码改动清单

- `data/action-effects.js`: 巡查限定medical场景，维护暖炉限定village场景
- `data/npc-configs.js`: 清璇日程修理无线电→制药，苏岩巡查→安抚，清璇radio_repair→craft_medkit
- `src/systems/task-system.js`: 移除MAINTAIN_FURNACE/SET_TRAP枚举+配置+专长+Day1~4任务+效果case，BUILD_FURNACE目标→workshop_door
- `src/systems/reincarnation-system.js`: MAINTAIN_FURNACE→PREPARE_WARMTH，taskShort映射更新
- `src/core/game.js`: taskShort映射移除MAINTAIN_FURNACE/SET_TRAP
- `src/npc/specialty.js`: 移除radio_repair描述
- `src/npc/npc-renderer.js`: 清璇AI prompt移除修理无线电描述

## v4.5 — 移除无线电系统 + 进出门诊断日志 (2026-03-06)

### 🗑️ 移除：REPAIR_RADIO 无线电修理系统

- **原因**：修无线电任务性价比极低（清璇花4h修理，实际效果仅第4天全员San+10），在前两天生死攸关时浪费宝贵人力
- **移除范围**：
  - `task-system.js`: 移除 `TASK_TYPES.REPAIR_RADIO` 定义、任务配置、专长权重、两处任务生成逻辑（Day2/Day3）、执行case
  - `game.js`: 移除 `_radioRepairProgress`/`_radioRepaired`/`_radioRescueTriggered` 初始化、第4天求救触发逻辑、序列化/反序列化、HUD映射
  - `action-effects.js`: 移除 `repair_radio` 执行case和气泡显示case
  - `npc-attributes.js`: 移除 `radioRepaired` 目标追踪（返回0兼容旧存档）
  - `reincarnation-system.js`: 移除Day3清璇任务分配（改为PREPARE_MEDICAL）、两处taskShort映射
  - `specialty.js`: 移除 `repair_radio` 专长倍率case
  - `npc-ai.js`: 移除 `productiveTypes` 中的 `repair_radio`
  - `data/action-effects.js`: 移除无线电效果配置
  - `data/npc-configs.js`: 移除清璇的repair_radio目标

### 🔍 新增：NPC进出门诊断日志系统

- **问题**：NPC在kitchen/village间反复WALKING（进门→出门→进门循环），无法确定根因
- **方案**：在所有关键场景切换点添加 `aiModeLogger.log('DOOR', ...)` 详细日志
- **日志覆盖点**：
  - `_enterIndoor()`: 每次进门记录目标场景、当前场景、原因（饥饿覆盖/任务/日程导航）、调用栈
  - `_walkToDoorAndExit()`: 每次出门记录当前场景、原因、调用栈
  - 安全网进门: 当scheduleReached=true但NPC仍在village时触发的自动进门
  - P2日程恢复导航: 吃完饭/休息完后日程重新接管时的跨场景导航
  - `_triggerHungerBehavior()`: 饥饿覆盖导航目标
  - `_onEatingComplete()`: 吃饭完成后日程恢复
- **日志格式**：`DOOR | NPC名 进门/出门←→场景 | 原因=xxx | HP/STA/HUN/SAN快照 | caller=调用栈`

### 📝 代码改动

- `src/systems/task-system.js`: 移除REPAIR_RADIO定义+配置+生成+执行（6处）
- `src/core/game.js`: 移除radio初始化+求救逻辑+序列化+HUD映射（5处）
- `src/npc/action-effects.js`: 移除repair_radio执行+气泡（2处）
- `src/npc/npc-attributes.js`: radioRepaired返回0 + 饥饿导航日志 + 吃饭完成日志
- `src/npc/npc.js`: _enterIndoor + _walkToDoorAndExit 添加DOOR日志
- `src/npc/npc-schedule.js`: 安全网进门 + P2日程恢复 + 跨场景导航 添加DOOR日志
- `src/npc/specialty.js`: 移除repair_radio case
- `src/npc/npc-ai.js`: 移除productiveTypes中的repair_radio
- `src/systems/reincarnation-system.js`: 移除任务分配+映射
- `data/action-effects.js`: 移除无线电效果配置
- `data/npc-configs.js`: 移除清璇repair_radio目标

---

## v4.4.3 — 户外天气防护 + 气泡信息增强 (2026-03-06)

### 🐛 修复：OUTDOOR_TARGETS 缺失导致极寒天气NPC照常去户外采集

- **现象**：Day 2（-30°C大雪），NPC仍然被派去冰湖/伐木场采集，导致大面积失温→体力耗尽→饥饿→连锁死亡
- **根因**：`NPC.OUTDOOR_TARGETS` 只包含了 `furnace_plaza`, `lumber_yard`, `ruins`, `north_gate`, `south_gate`
  - 遗漏了4个真正的户外资源采集区：`frozen_lake`（冰湖）、`lumber_camp`（伐木场）、`ruins_site`（废墟）、`ore_pile`（矿渣堆）
  - `_getWeatherAdjustedEntry()` 检查目标是否在 `OUTDOOR_TARGETS` 中来决定是否替换为室内日程
  - 遗漏 → 极端天气下NPC照常去户外 → 快速失温死亡

### ✨ 优化：医疗/安抚气泡显示具体作用对象

- **之前**：苏岩气泡只显示 `医疗救治中（HP+36/h）`，无法知道在治疗谁
- **现在**：显示 `医疗救治中（HP+36/h）→ 治疗对象: 王策等3人`
- 安抚同理：`安抚鼓舞中（San+21.6/h）→ 安抚对象: 赵铁柱等5人`
- 无需治疗/安抚时显示"待命"状态

### 📝 代码改动

- `src/npc/npc.js`：`OUTDOOR_TARGETS` 新增 `frozen_lake`, `lumber_camp`, `ruins_site`, `ore_pile`
- `src/npc/action-effects.js`：`medical_heal` 和 `morale_boost` 气泡文本增加作用对象名字

---

## v4.4.2 — 第二暖炉永远无法建成 Bug 修复 (2026-03-06)

### 🐛 修复：第二暖炉建造任务因位置校验错误永远不执行

- **现象**：第4世、资源充足（木柴86、食物78），但暖炉始终只有1座，第3天分配了BUILD_FURNACE任务，NPC站在dorm_b门口却永远不开工
- **根因**：`task-system.js` 的任务位置校验存在逻辑错误

**详细分析**：

1. BUILD_FURNACE任务的 `targetLocation = 'dorm_b_door'`
2. `dorm_b_door` 在 `SCHEDULE_LOCATIONS` 中定义为 `{ scene: 'village', x: 33, y: 24 }`（**村庄场景的门口坐标**）
3. NPC导航到 `dorm_b_door` 后实际站在 **village场景**
4. 但任务执行时的位置校验逻辑是：`_door → 映射为室内场景 → requiredScene = 'dorm_b'`
5. 校验 `npc.currentScene('village') !== requiredScene('dorm_b')` → **不匹配** → `return` 不执行效果

```
死循环：NPC站在dorm_b门口(village) → 校验要求在dorm_b(室内) → 永远不匹配 → 永远不开工
```

**修复**：`_door` 类型任务的位置校验同时接受 `village`（门口）和对应室内场景（如 `dorm_b`）

### 📝 代码改动

- `src/systems/task-system.js`（第997-1013行）：
  - 旧逻辑：`_door` 目标 → 仅接受室内场景
  - 新逻辑：`_door` 目标 → 接受 `village`（门口）或对应室内场景

### 影响范围

此bug不仅影响BUILD_FURNACE，还影响所有 `targetLocation` 为 `_door` 类型的任务：
- `MAINTAIN_POWER`（workshop_door）
- `DISTRIBUTE_FOOD`（kitchen_door）
- `PREPARE_MEDICAL`（medical_door）
- `REPAIR_RADIO`（workshop_door）

这些任务之前**NPC站在门口也不会执行**，修复后全部恢复正常。

---

## v4.4.1 — 轮回记忆强制体现修复 (2026-03-06)

### 🐛 修复：NPC在轮回模式下不引用前世记忆

- **问题**：轮回系统已将前世记忆（死亡记录、资源状况、教训等）注入到NPC的think/行动决策/对话prompt中，但NPC的想法和对话中完全没有体现前世经验，表现得和第1世一样
- **根因**：prompt中虽然有前世记忆数据，但**重要规则/决策规则中没有强制要求NPC引用前世记忆**，LLM自然忽略了这些信息
- **解决方案**：在3个核心prompt的规则中新增**强制引用前世记忆**规则

### 📝 代码改动

- `src/npc/npc-renderer.js`（think/想法prompt）：
  - 重要规则新增第8条：🔮【轮回记忆·必须体现】要求thought中**必须**明确引用前世记忆事件，如"记得上一世XXX在第二天冻死了"
  - thought字段描述增强：明确要求"如果有前世记忆，必须引用具体的前世事件"
  
- `src/npc/npc-ai.js`（行动决策prompt）：
  - 决策规则新增第15条：🔮【轮回记忆·必须体现】要求threat_analysis和reasoning中必须引用前世记忆
  - threat_analysis字段示例增强：引导NPC说出"上一世就是因为柴火不够，第三天暖炉熄了冻死了三个人"
  - opportunity_analysis字段示例增强：引导NPC引用前世成功经验
  - reasoning字段示例增强：引导NPC体现轮回意识

- `src/dialogue/dialogue-manager.js`（NPC对话prompt）：
  - 重要规则新增第7条：🔮【轮回记忆】要求对话中自然引用前世经历

- `src/systems/reincarnation-system.js`（前世记忆生成）：
  - `getPastLifeHintForDialogue()` 对话指令增强："可以直接引用" → "**必须**自然地引用前世经验"

### 预期效果

轮回模式下NPC的想法、行动决策、对话中会出现：
- 想法：*"记得上一世老钱第二天就冻死了，这次绝不能重蹈覆辙，必须优先建第二暖炉"*
- 决策：*"上一世就是因为柴火不够，第三天暖炉熄了冻死了三个人…这次绝不能重蹈覆辙"*
- 对话：*"上次咱们就是栽在这上面了，这回可得提前备足柴火！"*

---

## v4.4 — 断点续玩功能 (2026-03-06)

### ✨ 新功能：刷新/关闭页面后可从上次进度继续

- **问题**：之前刷新页面后只能从第N世的第1天重新开始，游戏中途的进度（第几天、NPC状态、资源等）全部丢失
- **方案**：完整存档系统 + 启动页面"继续游戏"按钮

### 📦 存档系统增强（game.js `save()`/`load()`）

- **save() v2 存档格式**：新增保存所有子系统状态
  - 基础：天数、时间、场景、天气、速度档位
  - NPC：8人全部属性（体力/San/健康/体温/饱腹/死亡状态/行为锁/任务覆盖等）
  - 子系统：resourceSystem / furnaceSystem / deathSystem / taskSystem / eventSystem / reincarnationSystem 各自的 serialize() 数据
  - 全局物品：急救包、无线电修理进度、食物浪费减少、巡逻加成、暖炉维护等
  - 保存时间戳：`savedAt` 用于启动页面显示
- **load() 增强**：加载时恢复全部子系统状态，同步天气系统和UI
- **静态方法 `Game.getSaveInfo()`**：不实例化Game即可读取存档摘要（天数/时间/存活数/模式/保存时间），用于启动页面展示
- **存档版本检测**：ver=2才视为完整存档支持断点续玩，ver=1旧版存档自动忽略
- **自动存档频率**：每120秒自动存档（保持不变）

### 🎮 启动页面新增"继续游戏"按钮（startup.js + index.html）

- **按钮显示逻辑**：页面加载时检测 `localStorage` 中是否有 ver=2 完整存档，有则显示绿色大按钮
- **存档摘要展示**：按钮副标题显示 `📦 第3天 14:30 · 暴风雪 · 存活6/8 · 轮回模式 · 保存于3/6 15:30`
- **加载流程**：点击"继续游戏" → 使用存档中记录的原始模式创建Game实例 → 调用 `load()` 恢复全部状态
- **样式**：绿色渐变（#059669→#10b981），宽度100%突出显示

### 🔄 轮回系统适配

- **轮回后自动存档**：`reincarnate()` 完成后不再删除存档，改为立即 `save()` 保存新世代初始状态
- **刷新后继续**：轮回模式下刷新页面 → 点继续游戏 → 从当前世代当前进度继续（而非回到第1天）

### 📝 代码改动

- `src/core/game.js`：
  - `save()` 增强：保存6个子系统serialize数据 + 全局物品状态 + 速度档位 + 时间戳，ver升级为2
  - `load()` 增强：恢复6个子系统deserialize数据 + 全局物品状态 + 速度档位 + 天气同步
  - 新增静态方法 `Game.getSaveInfo()`：读取存档摘要（不实例化Game）
  - `reincarnate()` 第18步：`localStorage.removeItem` → `this.save()`
- `src/core/startup.js`：
  - 新增 `btnContinue` 引用和存档检测逻辑
  - `startGame()` 新增 `_continue_` 模式支持：使用存档中的真实mode创建Game，创建后调用 `load()` 恢复状态
  - 轮回数据清除和难度设置逻辑在断点续玩时跳过
  - 按钮禁用/恢复逻辑同步更新包含继续按钮
- `index.html`：模式选择区域前新增 `#btn-mode-continue` 按钮和 `#continue-save-hint` 摘要区域
- `style.css`：新增 `.mode-btn.continue` 绿色渐变样式

---

## v4.3.1 — P0 优先级死循环修复：NPC 无法到达医疗站 (2026-03-05)

### 🐛 Bug 修复：P0-2(体温) 与 P0-5(医疗) 优先级互相打架

- **问题现象**：NPC 健康危急(HP<30)触发 P0-5 `medical_urgent` 前往医疗站，一出门到 village 就被 P0-2 `hypothermia`(体温<35°C)覆盖送回宿舍，形成死循环
- **问题根因**：P0 层内的5个子优先级按代码顺序执行，P0-2(体温)在 P0-5(医疗)之前，出门瞬间体温降到<35°C 就会覆盖掉 medical_urgent
- **修复方案**：
  1. P0-2 增加例外：当 NPC 正赶往室内目标(`medical_urgent`/`health_critical`)且体温≥33°C时，不覆盖为 hypothermia（医疗站也是室内，进去就能恢复体温）；体温<33°C(严重失温)仍强制覆盖就近避险
  2. P0-5 增加兜底：NPC 已处于 `medical_urgent` 但不在移动（如刚出门到 village），重新导航到 medical_door

### 📝 代码改动

- `src/npc/npc-schedule.js`：
  - P0-2 条件增加 `isHeadingIndoor` 和 `needHypothermiaOverride` 判断
  - P0-5 增加 `else if (!this.isMoving && this.currentPath.length === 0)` 重新导航兜底

---

## v4.3 — 游戏后台运行支持 (2026-03-05)

### ✨ 功能：浏览器标签页隐藏时游戏继续运行

- **问题现象**：浏览器标签页切走或最小化后，`requestAnimationFrame` 被浏览器节流（降到 ~1fps 甚至暂停），NPC AI 决策停滞，Ollama 空闲释放 GPU
- **根因**：游戏主循环完全依赖 `requestAnimationFrame` 驱动，浏览器出于性能考虑会对后台标签页限制 rAF 频率
- **方案**：智能双模式切换
  - **前台**（标签页活跃）→ `requestAnimationFrame` 驱动，~60fps，正常渲染
  - **后台**（标签页隐藏）→ `setTimeout` 驱动，15fps，只执行 `update()` 不执行 `draw()`
  - 通过 `document.visibilitychange` 事件自动无缝切换
- **效果**：NPC 决策、游戏时间流逝、自动存档在后台标签页中正常运行

### 📝 代码改动

- `src/core/game.js`：
  - 启动处新增 `_bgTimerId`、`_isBgMode`、`_BG_FPS` 属性
  - 新增 `document.visibilitychange` 事件监听器
  - `loop(time)` 方法增加后台模式退出守卫
  - 新增 `_bgLoop()` 方法 — setTimeout 驱动的后台循环（只 update 不 draw）

---

## v4.2.1 — AIModeLogger 裸引用修复 + 检查工具增强 (2026-03-05)

### 🐛 Bug：AIModeLogger.npcAttrSnapshot 裸引用导致运行时崩溃

- **问题现象**：`npc-schedule.js:1180 Uncaught ReferenceError: AIModeLogger is not defined`，游戏卡死
- **根因**：v4.2 修复了 `typeof` 检查问题使子系统能实例化了，但 `AIModeLogger.npcAttrSnapshot()` 这个**静态方法调用**散布在 5 个文件共 14 处，全都是裸引用（不通过 GST），运行时报错
- **修复**：`AIModeLogger.npcAttrSnapshot` → `GST.AIModeLogger.npcAttrSnapshot`（5文件14处）

### 🧪 测试工具增强

- 新增**检查6**：裸全局类名直接使用检测（如 `AIModeLogger.xxx`、`DeathSystem.xxx` 等）
- 检查项从 746 → **1106**，全部通过

### 📝 代码改动
- src/npc/npc-schedule.js：9 处 `AIModeLogger.` → `GST.AIModeLogger.`
- src/systems/death-system.js：3 处
- src/core/game.js：1 处
- src/npc/npc-attributes.js：1 处
- src/npc/npc-ai.js：1 处

---

## v4.2 — 五大系统实例化修复 + 轮回系统恢复 (2026-03-05)

### 🐛 Critical Bug：所有子系统未实例化 — `typeof` 检查 IIFE 内部类名

- **问题现象**：轮回模式的轮回没了、不能查看上一世和前几世的结局、完美结局等功能全部失效
- **根因分析**：v4.0 模块化重构后，所有子系统类（`WeatherSystem`、`ResourceSystem`、`FurnaceSystem`、`DeathSystem`、`TaskSystem`、`EventSystem`、`ReincarnationSystem`、`AIModeLogger`）定义在各自 IIFE 内部，只通过 `GST.XXXSystem` 暴露。但 `game.js` 中用 `typeof WeatherSystem !== 'undefined'` 检查——这些裸类名在 IIFE 外部不可见，`typeof` 永远返回 `'undefined'`，导致**所有 7 个子系统 + AI日志器都没有被实例化**！
- **修复**：将 game.js 中 15 处 `typeof XXX !== 'undefined'` 全部改为 `GST.XXX ? new GST.XXX(this) : null`
- **影响范围**：game.js 第83-101行（初始化）+ 第1278-1295行（轮回重建）共 15 处

### 🧪 测试工具增强

- `testcode/check-syntax.js` 新增**检查5**：`typeof` 检查 IIFE 内部类名的自动检测
- 检查项从 386 项增加到 746 项，全部通过

### 📝 代码改动
- src/core/game.js：15 处 `typeof XXX !== 'undefined'` → `GST.XXX ?` 检查

---

## v4.1 — IIFE 作用域修复 + 模块语法检查工具 (2026-03-05)

### 🐛 Bug修复：`LLM_SOURCE is not defined` — 跨 IIFE 引用私有变量

- **问题现象**：浏览器控制台报 `Uncaught (in promise) ReferenceError: LLM_SOURCE is not defined`，游戏无法启动
- **根因分析**：v4.0 模块化重构后，`LLM_SOURCE`、`EXTERNAL_API_URL`、`EXTERNAL_API_KEY`、`EXTERNAL_MODEL`、`API_KEY`、`API_URL`、`USE_OLLAMA_NATIVE`、`AI_MODEL` 等变量定义在 `llm-client.js` 的 IIFE 内部，通过 `GST.LLM` 暴露了 getter/setter。但 `startup.js` 和 `hud.js` 的 IIFE 中直接以裸变量名引用这些变量，跨 IIFE 无法访问
- **修复**：
  - `startup.js`：顶部引入 `const LLM = GST.LLM`，全部 9 处裸变量引用改为通过 `LLM.source`、`LLM.model`、`LLM.externalUrl` 等 getter/setter 访问
  - `hud.js`：第339行 `AI_MODEL` 改为 `GST.LLM ? GST.LLM.model : '未知'`

### 🧪 新增：模块语法 & 作用域检查工具

- **`testcode/check-syntax.js`**：Node.js 命令行检查工具，4 项自动化检查
  - [检查1] Node.js 语法检查（`node -c`）— 所有 `src/` 和 `data/` 下的 JS 文件
  - [检查2] Mixin 文件中的裸方法定义检测 — 缺少 `proto.` 前缀的方法
  - [检查3] IIFE 中的 `static get/set` 检测 — 不能在 IIFE mixin 中使用 class 语法
  - [检查4] 跨 IIFE 变量引用检测 — 其他 IIFE 中直接引用 `llm-client.js` 等文件的私有变量
- **运行方式**：`node testcode/check-syntax.js`
- **推荐工作流**：修改代码 → 跑检查脚本 → 修复报错 → 浏览器刷新验证

### 📖 新增：模块测试方法论文档

- **`guide/10-module-testing.md`**：记录 IIFE 架构下三类常见 bug（语法错误/方法定义错误/作用域泄露）的检测方法和编码规范速查

### 📝 代码改动
- src/core/startup.js：引入 `const LLM = GST.LLM` + 9 处裸变量引用替换为 `LLM.*`
- src/ui/hud.js：第339行 `AI_MODEL` → `GST.LLM.model`
- **新增** testcode/check-syntax.js：模块语法检查工具（4 项检查，386 项验证全通过）
- **新增** guide/10-module-testing.md：模块测试方法论文档

---

## v4.0 — 全项目模块化重构 (2026-03-05)

### 🏗️ 架构重构概要
- **原项目**：14个JS文件平铺根目录，总计 26,700 行，npc.js 8,370 行，game.js 3,794 行
- **新项目**：49个JS文件按 7 层分类组织，总计 24,561 行
- **目录结构**：`src/`（core/map/npc/systems/dialogue/ai/ui/utils）+ `data/` + `asset/` + `tools/` + `guide/`
- **设计原则**：SRP / OCP / LSP / ISP / DIP / LoD / LKP 七大原则贯穿

### 🧩 模块化拆分

#### NPC 系统（8,370行 → 7个文件）
| 文件 | 行数 | 职责 |
|------|------|------|
| `src/npc/npc.js` | 1,758 | NPC 核心类（构造/update/移动/序列化） |
| `src/npc/npc-ai.js` | 1,468 | AI行动决策/同伴系统/社交判断 (18个proto mixin) |
| `src/npc/npc-attributes.js` | 2,323 | 属性更新/饥饿/体温/目标/医疗 (41个proto mixin) |
| `src/npc/npc-renderer.js` | 591 | Sprite绘制/气泡/状态标签 (3个proto mixin) |
| `src/npc/npc-schedule.js` | 1,404 | 日程调度/天气调整/睡眠 (14个proto mixin) |
| `src/npc/action-effects.js` | 419 | ACTION_EFFECT_MAP效果应用 (1个proto mixin) |
| `src/npc/specialty.js` | 94 | 专长效率计算 (2个proto mixin) |

#### Game 引擎（3,794行 → 6个文件）
| 文件 | 行数 | 职责 |
|------|------|------|
| `src/core/game.js` | 1,457 | Game 主类（主循环/子系统调度/场景切换） |
| `src/core/renderer.js` | 381 | Canvas 渲染引擎（日夜/雨雪/HUD/小地图） |
| `src/core/input.js` | 164 | 键盘鼠标输入 |
| `src/core/camera.js` | 59 | 摄像机 |
| `src/core/startup.js` | 605 | 模型选择/游戏启动 |
| `src/ai/llm-client.js` | 309 | callLLM/parseLLMJSON/模型配置 |

#### 地图系统（2,416行 → 12个文件）
| 文件 | 行数 | 职责 |
|------|------|------|
| `src/map/base-map.js` | 355 | BaseMap 基类 |
| `src/map/village-map.js` | 1,203 | VillageMap 村庄主地图 |
| `src/map/indoor/indoor-map.js` | 114 | IndoorMap 基类 |
| `src/map/indoor/*.js` (7个) | 68-121 | 7个室内地图子类 |
| `src/map/map-registry.js` | 49 | 地图注册中心 |

### 📦 数据与逻辑分离
- `data/npc-configs.js` — 8个NPC静态配置提取到独立文件
- `data/npc-schedules.js` — 日程位置映射 + 室内座位定义
- `data/action-effects.js` — 行为优先级 + ACTION_EFFECT_MAP
- `data/map-data.js` — 地图共享常量

### 🔧 GST 命名空间体系
- 所有模块通过 `window.GST` 命名空间统一管理
- IIFE 包装避免全局变量污染
- NPC/Game 系统使用 Mixin 模式（proto 原型链扩展）
- index.html 按 7 层依赖顺序加载 48 个 script
- 向后兼容别名层保证渐进迁移

### 🧹 素材清理
- 移除所有 `*0.png` 旧版素材
- 移除 `gen/` 生成目录
- 仅保留 6 张最终版室内底图、9 张建筑精灵图、2 张村庄底图
- Python/HTML/Shell 工具脚本统一收纳到 `tools/` 目录

### 🐛 启动脚本路径修复
- **问题**：`tools/restart.py` 和 `tools/start-tmux.sh` 中 `PROJECT_DIR` 通过 `__file__`/`$0` 获取自身所在目录（`tools/`），但 `server.js` 在项目根目录，导致 `Cannot find module .../tools/server.js`
- **修复**：两个脚本的 `PROJECT_DIR` 改为上溯到父目录（项目根目录）
  - `restart.py`：`os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`
  - `start-tmux.sh`：`$(dirname "$0")/..`
- **日志目录**：保持在 `tools/log/` 下

### 📝 文档更新
- `start.md` 重写为 v4.0 新项目结构说明
- `guide/guide.md` 全面重写（v4.0 架构概览 + 新 mermaid 架构图 + 文档索引）
- `guide/06-tech.md` 完全重写技术架构文档（49个模块清单 + 加载顺序 + Mixin模式说明）
- `guide/08-changelog.md` 新增 v4.0 完整记录
- `guide/09-pitfalls.md` 新增重构踩坑记录（坑39）

---

## v3.3 — 住宿安排调整：男女分宿 (2026-03-04)

### 🏠 宿舍男女分开安排
- **问题**：老钱（♂60）之前被分配到宿舍B与3位女性（李婶、歆玥、清璇）同住，不合理
- **调整**：老钱搬到宿舍A，实现**纯男/纯女**分宿
  - **宿舍A（男生，5人）**：赵铁柱、王策、苏岩、陆辰、老钱
  - **宿舍B（女生，3人）**：李婶、歆玥、清璇（第4张床空置）
- **床位重排**：宿舍A 5张床紧凑排布（x=1,3,5,7,9），宿舍B 3张床（x=1,4,7）+ 1空床位

### 📝 涉及修改文件
- `maps.js`：DormAMap（5张床 + 5个beds）、DormBMap（3张床 + 3个beds + 1空床位）、describe()文本
- `npc.js`：老钱 home→dorm_a、日程 dorm_b→dorm_a、KNOWN_POSITIONS 床位坐标/编号、INDOOR_SEATS 座位配置、歆玥/清璇 bed编号调整
- `generate_indoor_maps.py`：同步更新宿舍A/B家具和座位定义
- `guide/02-map.md`、`guide/03-npc.md`：更新文档中的宿舍描述

---

## v3.2 — 室内场景底图PNG替换：AI生成6张室内图 + IndoorMap底图渲染支持 (2026-03-04)

### 🎨 室内场景AI生成底图替换（resize_indoor.py）
- **6张AI生成室内场景图**：用户在 `asset/indoor/gen/` 目录准备了6张AI生成的室内场景底图
- **自动缩放脚本**（`resize_indoor.py`）：将AI生成大图缩放为游戏所需尺寸（Lanczos滤镜）+ 4x放大备份版
  - warehouse（仓库）：→ 320×256 / 1280×1024
  - medical（医疗站）：→ 320×256 / 1280×1024
  - dorm_a（宿舍A）：→ 384×256 / 1536×1024
  - dorm_b（宿舍B）：→ 384×256 / 1536×1024
  - kitchen（炊事房）：→ 256×256 / 1024×1024
  - workshop（工坊）：→ 384×256 / 1536×1024
- 直接覆盖 `asset/indoor/*.png`，替换了之前代码生成的布局图

### 🔧 IndoorMap底图渲染支持（maps.js）
- **IndoorMap基类新增 `indoorMapKey` 属性**：子类设置对应的sprite-manifest中的底图key
- **IndoorMap.drawGrid() 重写**：
  - 优先使用 `SpriteLoader.getMap(this.indoorMapKey)` 绘制底图PNG（一次drawImage覆盖整个室内区域）
  - 设置 `this._hasBaseMap` 标记供子类判断
  - 无底图时 fallback 到原有逐格 `getTileColor()` 纯色渲染
- **7个子类drawGrid()改造**：
  - 家具色块绘制包裹在 `if (!this._hasBaseMap)` 条件中（底图已含家具，不重复绘制）
  - **动态效果始终绘制**：火盆火焰🔥、发电机运行指示灯💡、无线电台状态灯📡、通讯台指示灯、第二暖炉预留区虚线/已建成火焰、灶台火焰
- **渲染流程**：`子类drawGrid() → super.drawGrid()（底图或fallback）→ 条件家具色块 → 动态特效`

### 📦 sprite-manifest.json 注册室内底图
- 新增6个室内场景底图条目（`*_indoor`）：
  - `warehouse_indoor`：320×256, 10×8网格
  - `medical_indoor`：320×256, 10×8网格
  - `dorm_a_indoor`：384×256, 12×8网格
  - `dorm_b_indoor`：384×256, 12×8网格
  - `kitchen_indoor`：256×256, 8×8网格
  - `workshop_indoor`：384×256, 12×8网格
- SpriteLoader 自动加载（基于已有的 maps 遍历逻辑），无需修改 sprite-loader.js

### 📝 代码改动
- **新增** resize_indoor.py：室内场景图片缩放脚本（gen目录→游戏尺寸+4x备份）
- asset/sprite-manifest.json：maps 中新增6个 `*_indoor` 底图条目
- maps.js：IndoorMap 构造函数新增 `indoorMapKey` 属性
- maps.js：IndoorMap 新增 `drawGrid()` 方法重写（底图PNG优先 + fallback逐格着色）
- maps.js：DormAMap 构造函数设置 `indoorMapKey = 'dorm_a_indoor'` + drawGrid 家具色块条件绘制
- maps.js：DormBMap 构造函数设置 `indoorMapKey = 'dorm_b_indoor'` + drawGrid 家具色块条件绘制
- maps.js：MedicalMap 构造函数设置 `indoorMapKey = 'medical_indoor'` + drawGrid 家具色块条件绘制
- maps.js：WarehouseMap 构造函数设置 `indoorMapKey = 'warehouse_indoor'` + drawGrid 家具色块条件绘制
- maps.js：WorkshopMap 构造函数设置 `indoorMapKey = 'workshop_indoor'` + drawGrid 家具色块条件绘制
- maps.js：KitchenMap 构造函数设置 `indoorMapKey = 'kitchen_indoor'` + drawGrid 家具色块+座位标记条件绘制
- maps.js：CommandMap 无底图（indoorMapKey未设置），保持原有纯色渲染
- asset/indoor/*.png：6张室内场景底图替换
- asset/indoor/*_4x.png：6张4x放大备份版

---

## v3.1 — 美术资源大更新：AI生成建筑图替换 + 抠图 + 角色精灵图全部重绘 (2026-03-04)

### 🏗️ 建筑图替换（replace_buildings.py + remove_bg.py）
- **AI生成7栋建筑图**：用户通过裁剪工具从AI生成的大图中裁出7张建筑图（`asset/buildings/gen/building_crop_1~7.png`）
- **布局映射**：按"12/34/567"排列对应 warehouse/medical/dorm_a/dorm_b/kitchen/workshop/command
- **自动缩放+替换流程**（`replace_buildings.py`）：
  - 将裁剪图缩放为游戏精灵图（用于SpriteLoader渲染）
  - 生成4倍版底图合成图（0后缀）
  - 重新合成村庄底图 `village_base_with_buildings.png`
- **新增 command 指挥所**：sprite-manifest.json 注册 + maps.js 新增 CommandMap 室内场景（8×6）+ game.js 注册到地图字典

### 🔪 建筑抠图（remove_bg.py）
- **OpenCV flood fill + FIXED_RANGE**：从图像边缘200+个种子点向内扩散，去除与边缘连通的背景色
- **每张图独立容差参数**（FUZZ_MAP），防止深色背景建筑被误删
- **边缘羽化**：对边缘做高斯模糊使透明→不透明过渡更自然
- **安全检查**：背景比例>95%时警告可能抠过头
- 抠图效果：19%~33%背景去除，四角透明、建筑主体完整保留

### 🎨 角色精灵图全部重绘
- **8个核心角色**（李婶/赵铁柱/王策/老钱/苏岩/陆辰/歆玥/清璇）全部由AI重新生成
- **中国角色风格**：根据每人性格和职业设计外观（参见历史设计方案）
- **格式保持不变**：96×128像素，3列×4行精灵表（朝下/左/右/上 × 左脚/站立/右脚）
- 原始大图（3000+×4700+）使用Lanczos滤镜缩放到96×128
- `texture0.png` 保留为旧版备份
- **老钱二次更新**：`2老钱texture.png`（1543×2199）缩放替换

### 📝 代码改动
- **新增** replace_buildings.py：建筑图缩放+替换+底图合成一键脚本
- **新增** remove_bg.py：OpenCV建筑抠图脚本（flood fill + FIXED_RANGE + 边缘羽化）
- sprite-manifest.json：新增 command 建筑条目
- maps.js：新增 CommandMap 室内场景类（8×6，指挥桌/资料架/通讯台/物资箱）
- game.js：注册 command 到地图字典
- asset/buildings/*.png：7栋建筑精灵图替换
- asset/buildings/gen/nobg/：抠图结果
- asset/character/\*/texture.png：8个角色精灵图全部替换
- asset/map/village_base_with_buildings.png：重新合成的村庄底图

### 🎨 室内场景PNG图片（generate_indoor_maps.py）
- 生成6个室内场景布局图到 `asset/indoor/`（原始版+4x放大版）
- 绿色圆点标注NPC可站立座位，底部中间2格为出口门
- 4x放大版适合拿去AI重绘室内场景

---

## v3.0 — 5倍速NPC"出门闪现回屋"死循环修复：时间缩放隔离 + 出门保护期 + 饥饿分级冷却 (2026-03-04)

### 🐛 Bug修复：5倍速下NPC反复"走出门→闪现回屋→走出门→闪现回屋"

- **问题现象**：游戏以5倍速运行时，NPC不断循环"走出门→瞬间被传送回室内→又走出门→又被传送回来"，同时显示"肚子饿了"和"采集建材中"两个矛盾状态。1倍速下正常。
- **根因分析**：5倍速下 `dt` 被放大5倍，所有使用 `dt` 递减的计时器都加速5倍消耗，导致：
  1. **饥饿触发冷却10秒→2秒真实**：NPC吃完饭2秒后又饿了
  2. **出门超时3秒→0.6秒真实**：NPC还没走到门口就被强制传送出去
  3. **饥饿传送15秒→3秒真实**：NPC走路中被强制传送进室内
  4. **进屋保护期5秒→1秒真实**：NPC刚出门保护期就过了，安全网立即传送回去
  5. **多系统同帧竞争**：饥饿系统和日程系统/任务系统互相打断导航

### 🔧 修复内容（7 项关键改动）

#### 1. `_indoorEntryProtection` 改用真实时间递减
- **修复前**：`_indoorEntryProtection -= dt`（5倍速下5秒保护期只持续1秒真实时间）
- **修复后**：`_indoorEntryProtection -= _realDt`（`_realDt = dt / speedMult`，5秒保护期 = 5秒真实时间）

#### 2. `_hungerTravelTimer` 改用真实时间递减
- **修复前**：`_hungerTravelTimer += dt`（5倍速下15秒超时只需3秒真实时间）
- **修复后**：使用真实时间递增，15秒超时 = 15秒真实时间

#### 3. `_exitDoorTimer` 改用真实时间递减
- **修复前**：`_exitDoorTimer += dt`（5倍速下3秒超时只需0.6秒真实时间）
- **修复后**：使用真实时间递增，3秒超时 = 3秒真实时间

#### 4. 所有出门路径设置5秒出门保护期
- `_walkToDoorAndExit` 近距离直接出门：`_indoorEntryProtection = 5`
- `_updateDoorWalk` 走到门口后传送出门：`_indoorEntryProtection = 5`
- `_updateDoorWalk` 超时强制传送出门：`_indoorEntryProtection = 5`
- `_updateDoorWalk` 路径为空兜底传送出门：`_indoorEntryProtection = 5`
- 出门保护期内安全网不执行，防止NPC刚出门就被传送回室内

#### 5. 出门时清理 `_pendingEnterScene`
- `_walkToDoorAndExit` 中设置 `_pendingEnterScene = null`
- 防止残留的进门标记导致NPC走出门后又被自动进门逻辑拉回室内

#### 6. 吃完饭设20秒真实时间饱食冷却
- **修复前**：`_hungerTriggerCooldown = 30`（30真实秒）
- **修复后**：`_hungerTriggerCooldown = 20`（20真实秒，更合理）
- 冷却期内常规饥饿（hunger < 35）不触发，避免频繁打断日程

#### 7. hunger < 15 / hunger < 10 极度饥饿无视冷却
- **修复前**：P0 强制进食（hunger < 15）和打断睡眠（hunger < 10）都检查 `_hungerTriggerCooldown`
- **修复后**：极度饥饿（hunger < 15 和 hunger < 10）无视冷却直接触发进食，确保NPC在极端消耗下不会饿死
- 20秒真实冷却到期时 hunger 正常约在45左右（远未到15），不会误触发

### 📝 代码改动
- npc.js: `_indoorEntryProtection` 递减改用 `_realDt`（真实时间）
- npc.js: `_updateDoorWalk` 中 `_exitDoorTimer` 改用真实时间递增 + 3个出门路径添加 `_indoorEntryProtection = 5`
- npc.js: `_walkToDoorAndExit` 近距离出门路径添加 `_indoorEntryProtection = 5` + `_pendingEnterScene = null`
- npc.js: `_walkToDoorAndExit` 远距离出门路径添加 `_pendingEnterScene = null`
- npc.js: `_startEating` 完成后饱食冷却 30 → 20 真实秒
- npc.js: P0 hunger < 15 强制进食移除 `_hungerTriggerCooldown` 检查
- npc.js: P0 hunger < 10 打断睡眠移除 `_hungerTriggerCooldown` 检查

---

## v2.9 — 室内位置循环重置修复：消除 _teleportTo 随机偏移 + distToInside 无限导航循环 (2026-03-04)

### 🐛 Bug修复：NPC在室内不断"走到一个位置就重置位置"，无法走出房间

- **问题现象**：NPC 进入室内后不断被重置位置——走到一个位置就被拉回来，走到一个位置又被拉回来，反复循环，导致 NPC 很长时间无法走出房间执行其他任务
- **根因分析**：v2.8 的 `_enterIndoor` 修复了堵门口问题（直接传送到座位），但引入了新的循环 bug。3 个代码路径形成无限循环：

  **循环触发链路**：
  1. `_enterIndoor` 使用 `_teleportTo()` 传送到座位，但 `_teleportTo` 默认模式有 **±1.5 格随机偏移**
  2. NPC 传送后实际位置 ≠ 座位精确坐标（如座位 (6,5) 但实际传送到 (6.8, 4.2)）
  3. 下一帧 `_navigateToScheduleTarget()` / `_updateSchedule()` 检测到 NPC 已在目标室内场景，但 `_enterWalkTarget = null` → 调用 `_pickIndoorSeat()` **随机选了一个新座位**
  4. 计算 `distToInside`，如果新座位和当前位置距离 > 3 格 → 设置 `_enterWalkTarget`，调用 `_pathTo` 导航
  5. 到达后清空 `_enterWalkTarget` → 下一帧又重复步骤 3-4，**无限循环**

  同样的循环逻辑存在于 3 处代码中：
  - `_updateSchedule()`（日程检查中的"已在室内"分支）
  - `_navigateToScheduleTarget()`（跨场景导航中的"已在室内"分支）
  - `_actionOverride` 行动覆盖系统（"已在室内"分支）

### 🔧 修复内容（3 个关键改动）

#### 1. `_enterIndoor()` 改为精确像素坐标设置（不再使用 `_teleportTo`）
- **修复前**：`this._teleportTo(insideLoc.scene, insideLoc.x, insideLoc.y)` — 带 ±1.5 格随机偏移
- **修复后**：直接设置 `this.currentScene = scene; this.x = x * TILE; this.y = y * TILE;` — **零偏移精确传送**
- 同时设置 `_indoorEntryProtection = 3`（3秒进屋保护期，防止刚进屋就被其他系统拉出去）

#### 2. `_navigateToScheduleTarget()` 和 `_updateSchedule()` 中"已在室内"逻辑简化
- **修复前**：NPC 已在目标室内场景时，仍然调用 `_pickIndoorSeat()` 选新座位 → 检查 `distToInside` → 寻路导航 → 形成循环
- **修复后**：NPC 只要在目标室内场景中 → **直接 `scheduleReached = true`**，不再反复选座位和寻路

#### 3. `_actionOverride` 行动覆盖系统中"已在室内"逻辑简化
- **修复前**：同上，反复选座位 + `distToInside` 检查 + 寻路循环
- **修复后**：NPC 在目标室内场景中 → **直接 `_onActionArrived(game)`**

### 📝 代码改动
- npc.js: `_enterIndoor()` — 移除 `_teleportTo` 调用，改为精确像素坐标设置 `this.x = x * TILE; this.y = y * TILE;` + 新增 `_indoorEntryProtection = 3`
- npc.js: `_updateSchedule()` — "已在室内"分支简化为 `scheduleReached = true; _enterWalkTarget = null; return;`
- npc.js: `_navigateToScheduleTarget()` — "已在室内"分支简化为 `scheduleReached = true; _enterWalkTarget = null; return;`
- npc.js: `_actionOverride` — "已在室内"分支简化为 `_onActionArrived(game); return;`
- npc.js: 移除所有 3 处 `distToInside` 变量及相关判定逻辑

---

## v2.8 — 室内堵门口修复：统一进门方法 + 室内场景 PNG 图片生成 (2026-03-04)

### 🐛 Bug修复：NPC 进屋后堵在门口吃饭睡觉

- **问题现象**：NPC 进入宿舍/厨房等室内后，全部堆在门口（y=7）位置，在门口吃饭、睡觉，不走到房间内部的床/桌子位置
- **根因分析**：
  - 所有10处进门代码路径都采用"**先传送到 `indoor_door` 门口 (y=7) → 再 `_pathTo` 寻路走到座位**"的两步模式
  - 室内空间太小（8格高），y=7 是南墙整行（仅门口2格可走），NPC 横向无法移动
  - 家具碰撞把可走区域切分成多个独立区域，从门口 (y=7) 到座位 (y=2~5) 的寻路经常失败
  - 寻路失败后 NPC 卡在门口，日程系统的 `distToInside <= 3` 宽松判定又把门口误判为"已到达"

### 🔧 修复内容

#### 1. 新增统一进门方法 `_enterIndoor(targetScene, game)`
- 选择未被占用的座位（`_pickIndoorSeat`）
- **直接传送到座位位置**，跳过门口中转
- 设置 `scheduleReached = true` + 清除所有移动状态

#### 2. 全部 10 处进门代码统一替换
| 代码位置 | 触发场景 |
|---------|---------|
| followPath 走完后 | 走到建筑门口，自动进门 |
| 日程系统门口5格内 | NPC 站在门口附近，直接进门 |
| 安全网兜底 | scheduleReached=true 但还在村庄 |
| _pathTo 4格内 / 寻路成功 / 寻路失败 | 多种寻路结果分支 |
| _followPath 走完 | 另一套移动系统到达门口 |
| 饥饿系统门口6格 / 超时15秒 | 饿了赶到厨房门口 / 兜底传送 |
| 状态覆盖→医疗站 | 生病/心理问题紧急就医 |
| 行动系统超时20秒 | LLM 行动兜底传送 |

### 🎨 新增：室内场景 PNG 图片

生成 6 个室内场景布局图到 `asset/indoor/` 目录：

| 场景 | 原始大小 | 4倍放大版 |
|------|---------|-----------|
| warehouse 仓库 | 320×256 | 1280×1024 |
| medical 医疗站 | 320×256 | 1280×1024 |
| dorm_a 宿舍A | 384×256 | 1536×1024 |
| dorm_b 宿舍B | 384×256 | 1536×1024 |
| kitchen 炊事房 | 256×256 | 1024×1024 |
| workshop 工坊 | 384×256 | 1536×1024 |

- 绿色小圆点 = NPC可站立的座位位置
- 底部中间2格 = 出口门
- 4x放大版适合拿去 AI 重绘

### 📝 代码改动
- npc.js: 新增 `_enterIndoor(targetScene, game)` 统一进门方法（直接传送到座位）
- npc.js: 10处"先传送到门口再寻路"代码全部替换为 `_enterIndoor()` 调用
- **新增** generate_indoor_maps.py: Python PIL 室内场景 PNG 生成脚本
- **新增** asset/indoor/*.png: 6个室内场景的原始+4x放大版布局图（共12张）

---

## v2.7 — 底图渲染修复：消除黑色方块和棋盘格 (2026-03-04)

### 🐛 Bug修复：底图加载后画面变脏（黑色小方块+棋盘格色差）

- **问题现象**：游戏启动第一瞬间画面干净（纯色 fallback），1秒后底图 PNG 加载完成反而变脏——雪地上出现大量黑色小方块、棋盘格色差、围墙区域整行深棕色方块
- **排查过程**（历经5轮排查）：
  1. 第1轮：怀疑 SpriteLoader 的 tile/decoration 小图素材质量差 → 从 manifest 移除 tiles/decorations/buildings → 问题依旧
  2. 第2轮：怀疑浏览器缓存旧 JS → 添加 Cache-Control + JS 版本号 → 问题依旧
  3. 第3轮：怀疑底图 PNG 本身有问题 → 像素级扫描确认底图纯雪地区域无暗色方块 → 底图干净
  4. 第4轮：怀疑 JS 代码在底图之上叠加绘制 → 逐个检查所有 draw 调用 → 无额外绘制
  5. 第5轮：**在底图渲染前先用纯色清除视口** → 问题解决！**根因是 canvas 残留内容 + 旧底图缓存**
- **根因分析**：
  - **根因1**：`generate-map-base.py` 的 `get_tile_color` 函数仍是旧版代码，包含 `(x+y)%5==0`、`(x+y)%3==0`、`(x+y)%7==0` 棋盘格逻辑和围墙返回 `C.FENCE` 深棕色。虽然 `maps.js` 中对应的 `getTileColor` 已修复，但**底图 PNG 是用旧代码生成的**
  - **根因2**：浏览器可能缓存了旧版底图 PNG（即使 URL 带了 `?v=Date.now()`，但 JS 文件本身被缓存时加载的图片 URL 不变）
  - **根因3**：`drawGrid` 底图渲染分支没有先清除 canvas 视口区域，导致之前帧的残留内容透出

### 🔧 修复内容

#### 1. 底图生成器修复（generate-map-base.py `get_tile_color`）
- **安全区内**：移除 `(x+y)%5==0` 棋盘格 → 改用 `lerp_color` 噪声插值平滑渐变
- **围墙线上**：不再返回 `C.FENCE`（深棕色整格方块）→ 改为雪地渐变色（围墙线条由 `draw_wall()` 叠加绘制）
- **外围雪原**：移除 `(x+y)%3==0` 和 `(x+y)%7==0` 密集棋盘格 → 改用噪声阈值平滑过渡

#### 2. 底图 PNG 重新生成
- 执行 `python3 generate-map-base.py --force` 重新生成 `village_base_clean.png` 和 `village_base.png`
- 像素级验证：纯雪地区域暗色 tile 数量从 182 降至 0

#### 3. drawGrid 底图渲染前清除视口（maps.js）
- 底图 `drawImage` 前先用 `#E6EAF0`（雪地底色）`fillRect` 填满整个视口区域，确保无 canvas 残留

#### 4. 装饰物/建筑素材渲染移除
- `sprite-manifest.json` 移除 `tiles` 和 `decorations` 分类（已烘焙到底图 PNG），清空 `buildings`（占位图质量差）
- `BaseMap.drawDecoration()` 移除 SpriteLoader 素材分支，始终使用代码绘制

#### 5. 浏览器缓存彻底解决
- `server.js` 对 `.js/.css/.json/.html` 文件设置 `Cache-Control: no-cache, no-store, must-revalidate`
- `index.html` 所有 `<script>` 标签添加版本号参数 `?v=20260304b`
- 底图 URL 在 `sprite-loader.js` 中已使用 `?v=Date.now()` 动态时间戳

### 📝 代码改动
- generate-map-base.py: `get_tile_color()` 移除3处棋盘格逻辑 + 围墙改为雪地渐变色
- maps.js: `drawGrid()` 底图分支增加纯色预清除 + 增强调试标记显示底图尺寸和文件名
- maps.js: `BaseMap.drawDecoration()` 移除 SpriteLoader 素材分支
- asset/sprite-manifest.json: 移除 tiles/decorations 分类，清空 buildings
- server.js: 添加 `Cache-Control: no-cache, no-store, must-revalidate` 响应头
- index.html: 所有 script 标签添加 `?v=20260304b` 版本号
- asset/map/village_base_clean.png: 重新生成（消除棋盘格和暗色方块）
- asset/map/village_base.png: 重新生成（带标注版）

---

## v2.6 — 素材图片系统（Sprite Asset Pipeline）(2026-03-04)

### 🎨 素材加载器系统（sprite-loader.js）
- **SpriteLoader 模块**：统一的素材加载和管理模块，基于 `sprite-manifest.json` 清单文件批量预加载所有 PNG 素材
- **异步预加载**：游戏启动时异步加载所有素材图片，不阻塞游戏启动，加载完毕后自动切换到图片绘制模式
- **统一接口**：`SpriteLoader.get(category, name)` 获取素材图片，`drawTile/drawDecoration/drawBuilding` 便捷绘制
- **Graceful Fallback**：素材未加载完毕或图片不存在时，自动回退到纯代码绘制（Canvas 程序化绘制）
- **运行时开关**：`SpriteLoader.enabled = false` 可随时禁用图片素材回到纯代码绘制
- **加载进度追踪**：`SpriteLoader.progress` 返回 0~1 的加载进度

### 📦 素材目录结构
- **`asset/tiles/`**：11 张地砖素材（32×32 PNG）
  - snow / snow_dark / snow_light — 雪地三种变体
  - path / path_dark — 踩过的雪路
  - plaza — 广场石砖
  - dirt — 冻土
  - ice / ice_deep — 冰面
  - sand — 雪覆盖沙地
  - wall_stone — 围墙石砖
- **`asset/decorations/`**：13 张装饰物素材（32×32 PNG）
  - tree / bush / snowpile / icicle — 自然物
  - debris / bench / lamppost / lamppost_lit / sign / well — 建筑物件
  - flower_pink / flower_yellow / flower_blue — 花卉
- **`asset/buildings/`**：7 张建筑素材（多尺寸 PNG）
  - warehouse (192×192) / dorm_a (160×160) / dorm_b (160×160)
  - medical (128×160) / kitchen (160×160) / workshop (160×160) / command (128×128)

### 🔧 地图渲染引擎改造（maps.js）
- **drawGrid 改造**：新增 `_colorToSprite` 颜色→素材名映射表，绘制地砖时优先使用 `SpriteLoader.drawTile()`，图片不可用时 fallback 到代码纹理绘制
- **drawDecoration 改造**：装饰物绘制时优先使用 `SpriteLoader.drawDecoration()`，支持路灯昼夜自动切换（lamppost / lamppost_lit）
- **建筑 draw 改造**：建筑绘制时优先使用 `SpriteLoader.drawBuilding()`，通过建筑 `id` 自动匹配素材文件名，图片绘制成功后仅叠加名称标签

### 🛠️ 素材制作工具（generate-sprites.py）
- **Python Pillow 占位符生成器**：自动生成带像素风纹理的占位符 PNG 素材
  - 地砖：逐像素噪声纹理 + 雪点/冰裂纹/石砖缝等细节
  - 装饰物：树/灌木/雪堆/冰锥/废墟/长椅/路灯/告示牌/水井/花卉
  - 建筑：砖缝纹理 + 三角形屋顶 + 积雪层 + 窗户 + 门 + 烟囱
- **sprite-manifest.json**：素材清单文件，记录所有素材的路径、尺寸、描述信息
- **热替换支持**：用像素画工具（Aseprite/Piskel/LibreSprite）替换 PNG 文件后刷新浏览器即可生效，无需改代码

### 📝 代码改动
- **新增** sprite-loader.js：素材加载器模块（SpriteLoader 单例 + load/get/drawTile/drawDecoration/drawBuilding）
- **新增** generate-sprites.py：占位符素材批量生成脚本（Pillow）
- **新增** asset/sprite-manifest.json：素材清单
- **新增** asset/tiles/*.png：11 张地砖素材
- **新增** asset/decorations/*.png：13 张装饰物素材
- **新增** asset/buildings/*.png：7 张建筑素材
- index.html：引入 sprite-loader.js（在 maps.js 之前）
- maps.js：BaseMap 新增 `_colorToSprite` 静态映射表 + drawGrid/drawDecoration/建筑draw 优先图片绘制 + fallback
- game.js：游戏启动时异步调用 `SpriteLoader.load()` 加载素材

---

## v2.5 — 全员入睡跳夜机制 (2026-03-01)

### 🌙 新增：全员入睡→快进到早6点（game.js `_checkNightSkip`）

- **问题**：设计上约定"所有人睡着后跳到次日早6点"，但该逻辑从未被实现过，NPC入睡后玩家需要干等真实时间经过漫长夜晚。
- **实现方案**：
  - 在 `update()` 主循环中 NPC 更新前新增 `_checkNightSkip()` 检测
  - **触发条件**：所有存活NPC的 `isSleeping === true` 且当前游戏时间在 22:00~05:59
  - **跳过行为**：直接将 `gameTimeSeconds` 设为 `06:00`（21600秒）
  - **每天仅一次**：`_nightSkipDone` 标志防止重复跳，日切换时重置
  - **跨午夜处理**：22:00后跳过需正确触发日切换（dayCount++、子系统通知、NPC属性保护）
  - **NPC睡眠恢复补算**：体力+8/h、San+3/h、健康+1/h、体温回升+0.5°C/h
  - **资源消耗补算**：通过 `resourceSystem._tickConsumption(skipSeconds)` 补扣木柴和电力
  - **小时变化补触发**：跳过的每个小时都调用 `_onHourChange()` 确保天气同步
  - **UI通知**：`🌙💤 全员入睡，夜间快进到早上 06:00`
  - **AI模式日志**：记录跳夜事件和跳过时长

---

## v2.4 — P0紧急修复：采集产出为0 + 死亡NPC幻觉安抚 (2026-02-26)

### 🐛 Bug修复

- **采集产出为0**：NPC到达任务目标（伐木场/冰湖等）但实际资源产出接近0。
  - **根因**：`_updateActionEffect()` 用 `this.stateDesc` 匹配 `ACTION_EFFECT_MAP` 关键词，但 LLM `_actionDecision()` 返回的 `action.reason`（如"前往伐木场协助采集"）会覆盖 `stateDesc`，导致原本的日程关键词（如"砍柴"、"伐木"）丢失，匹配失败。
  - **修复**：`_updateActionEffect()` 现在同时匹配 `stateDesc` 和日程原始 `scheduleTemplate[schedIdx].desc`，两者任一命中即可触发效果。

- **LLM安抚已死角色**：存活NPC（如王策、清璇）反复决策"去安抚陆辰/歆玥"——但这些人已经死亡，浪费大量行动时间。
  - **根因**：`allNPCStatus`（行动决策prompt）、`sameSceneNPCs`（思考prompt）、`_getNearbyNPCs()`（附近感知）、`friendsInCrisis`（挚友告警）这4处NPC列表构建均未过滤 `isDead` 的NPC。
  - **修复**：在以上4处全部添加 `!n.isDead` 过滤条件，确保死亡NPC不再出现在任何LLM prompt中。

### 📝 代码改动
- npc.js: `_updateActionEffect()` 新增 `scheduleDesc` 变量 + 双路径关键词匹配（stateDesc ∪ scheduleDesc）
- npc.js: `_actionDecision()` 中 `allNPCStatus` 添加 `!n.isDead` 过滤
- npc.js: `_actionDecision()` 中 `friendsInCrisis` 添加 `!n.isDead` 过滤
- npc.js: `think()` 中 `sameSceneNPCs` 添加 `!n.isDead` 过滤
- npc.js: `_getNearbyNPCs()` 添加 `npc.isDead` 跳过逻辑

---

## v2.3 — 超级智能AI分工协调系统 + 决策硬性拦截 (2026-02-25)

### 🧠 智能分工系统（reincarnation-system.js）
- **`generateWorkPlan()`**：基于前世轮回记忆自动生成本世分工方案，精确到「谁-做什么-多长时间-目标量-原因」
  - 分析前世数据：resourceSnapshot、deathRecords、npcFinalStates、unfinishedTasks、secondFurnaceBuilt
  - 输出结构化 `lifePlan` 对象：每天(day1-day4) → 每个NPC → { npcId, task, targetLocation, hours, target, reason }
  - 第1世无记忆：fallback 到硬编码默认方案
  - 前世全员存活：复用上世方案微调
  - 存活人数下降：生成更激进的调整策略
- **`_generateDeepLessons()`**：前世教训深度分析（替代原有粗略的 `generateLessons()`）
  - 资源比例分析：检测采集「偏科」（如食物采了200但木柴只采了30）
  - 人力分配分析：推断谁的时间被「浪费」
  - 时序分析：按死亡时间判断关键时间节点
  - 因果链推导：具体到人员调整建议
  - 输出分层教训：`{ strategic: [...], tactical: [...], execution: [...] }`
- **`analyzeMultiLifePatterns()`**：多世学习演进（pastLives≥2时启用）
  - 成功策略库：提取资源平衡好/存活人数多的分配模式
  - 失败模式库：识别反复出现的失败模式
  - 资源趋势分析：多世间各资源采集量/消耗量的变化趋势

### 👴 老钱指挥中心（game.js + death-system.js）
- **`_initWorkPlan()`**：Game构造函数和 `reincarnate()` 中调用，生成workPlan并存储到老钱
- **`getWorkPlanHolder()`**：返回当前workPlan持有者（老钱→王策→李婶→歆玥继任链）
- **`_handleWorkPlanTransfer()`**：NPC死亡时自动将workPlan转移给下一个继任者
- **`getWorkPlanSummaryForNpc(npcId)`**：返回给特定NPC看的安排摘要（本人任务★标记+全镇概览）
- **`getLessonsForNpc(npcId)`**：返回与特定NPC相关的前世教训

### 📋 任务系统增强（task-system.js）
- **`_generateTasksFromWorkPlan()`**：根据workPlan分工方案生成当天任务，替代硬编码
- **`_calcResourceTarget()`**：根据当前资源和天数动态计算目标量
- **`_findBestNpcForTask()`**：按专长匹配+体力排序找最佳NPC
- **`reassignDeadNpcTasks()`**：NPC死亡时按专长重分配未完成任务
- **`onWeatherEmergency()`**：暴风雪天气时自动将户外任务转为室内维护暖炉

### 🤖 NPC决策Prompt增强（npc.js）
- **`think()` prompt**：注入workPlan安排摘要+前世教训，新增规则「🎯必须严格执行工作安排表中的分工」
- **`_actionDecision()` prompt**：注入全镇分工总览+相关教训+强约束规则「安排表优先，紧急情况才能偏离」
- **5个硬性约束拦截器**：
  - 【拦截1】暴风雪天户外目标 → 强制stay
  - 【拦截2】暴风雪中在户外 → 强制回室内
  - 【拦截3】体温<33°C → 强制回暖炉
  - 【拦截4】健康<10 → 强制去医院
  - 【拦截5】有安排却wander → 强制work

### 🐛 Bug修复
- **eventLog未初始化导致crash**：`_initWorkPlan()` 在构造函数中被调用时 `this.eventLog` 尚未初始化，导致 `addEvent()` 调用时 `this.eventLog.unshift()` 报错 `Cannot read properties of undefined`。修复：workPlan事件延迟到 `eventLog` 初始化后补发

### 📝 代码改动
- reincarnation-system.js: 新增 `generateWorkPlan()` + `_generateDeepLessons()` + `analyzeMultiLifePatterns()` + `getWorkPlanHolder()` + `getWorkPlanSummaryForNpc()` + `getLessonsForNpc()`
- task-system.js: 新增 `_generateTasksFromWorkPlan()` + `_calcResourceTarget()` + `_findBestNpcForTask()` + `reassignDeadNpcTasks()` + `onWeatherEmergency()`
- game.js: 新增 `_initWorkPlan()` 方法，构造函数和 `reincarnate()` 中调用
- death-system.js: 新增 `_handleWorkPlanTransfer()`，NPC死亡时workPlan转移+任务重分配
- npc.js: `think()` 和 `_actionDecision()` prompt注入分工安排和教训 + 5个硬性约束拦截器
- game.js: 修复 `_initWorkPlan` 中 `addEvent` 调用时 `eventLog` 未初始化的bug

---

## v2.1 — NPC行动效果数值化 + 动态气泡 + 急救包重构 + 苏岩日程优化 (2026-02-23)

### 🎯 NPC行动效果数值化系统（npc.js）
- **ACTION_EFFECT_MAP**：新增行动描述关键词→系统效果的映射表（15条规则），支持10种效果类型
  - produce_resource（木柴10/h、食物8/h、建材5/h、电力8/h）
  - build_progress（暖炉扩建1%/h）
  - craft_medkit（急救包0.5个/h）
  - repair_radio（无线电修理1%/h）
  - reduce_waste（食物浪费-20%）
  - medical_heal（医疗站内治疗）
  - patrol_bonus（巡逻警戒San恢复）
  - morale_boost（安抚鼓舞San恢复）
  - furnace_maintain（暖炉维护保温）
- **_updateActionEffect()**：每个update周期自动匹配当前NPC行为描述中的关键词，触发对应系统效果
- **_getSpecialtyMultiplier()**：专长加成倍率计算，有对应专长的NPC获得×1.5倍率加成
- **动态数值气泡**：行动气泡实时显示当前NPC的实际产出速率（含体力效率×专长倍率×电力加成）

### 🔧 专长名映射修复（7处：npc.js）
- `chop` → `chopping`（赵铁柱砍柴专长）
- `gather_food` → `gathering_food`（李婶采集食物专长）
- `repair` → `generator_repair`（老钱发电机维修专长）
- `build` → `gathering_material`（赵铁柱建材采集专长）
- `medkit` → `herbal_craft`（苏岩草药制作专长）
- `radio` → `radio_repair`（老钱无线电修理专长）
- `medical` → `medical_treatment`（苏岩医疗专长）
- **新增3个缺失效果类型分支**：morale_boost / furnace_maintain / reduce_waste

### 📊 数值修正（npc.js）
- morale_boost San恢复速率：0.10 → 0.003/游戏秒（≈10.8/h），避免San瞬间拉满
- patrol_bonus San恢复速率：0.02 → 0.005/游戏秒（≈18/h），合理化巡逻加成

### 🛠️ 空转行为修复（7处：npc.js）
- 补充王策22-24点desc关键词（匹配repair_radio）
- 补充老钱17-18点desc关键词（匹配furnace_maintain）
- 补充苏岩17-18点desc关键词（匹配medical_heal）
- 补充苏岩22-24点desc关键词（匹配craft_medkit）
- 补充陆辰22-24点desc关键词（匹配patrol_bonus）
- 补充歆玥22-24点desc关键词（匹配morale_boost）
- 补充清璇13-15点desc关键词（匹配reduce_waste）

### 💊 急救包系统重构（resource-system.js + npc.js + game.js + index.html + style.css）
- **独立消耗品物资**：急救包作为独立资源类型，数量显示在资源面板
- **全局自动检查**：任何NPC健康<50时自动消耗1个急救包恢复健康
- **苏岩专长加成**：苏岩medical_treatment专长翻倍急救包恢复量
- **资源面板新增**：index.html + style.css新增急救包🩹图标和数量显示

### 👨‍⚕️ 苏岩日程优化（npc.js）
- **修改前**：medical_heal 11小时（大部分空转）+ craft_medkit 2小时
- **修改后**：medical_heal 5小时（更精准）+ produce_resource(food) 4小时（+32食物/天）+ craft_medkit 2小时 + morale_boost 2小时
- 具体日程调整：
  - 8-10：医疗站坐诊（保留medical_heal）
  - 10-12：冰湖采集食物（新增produce_resource）
  - 13-15：冰湖采集食物（新增produce_resource）
  - 15-17：医疗站坐诊（保留medical_heal）
  - 19-21：暖炉广场巡查安抚（medical_heal + morale_boost）
  - 21-22：医疗站值班（保留medical_heal）
  - 22-24：医疗站整理药品（保留craft_medkit）

### 📝 代码改动
- npc.js: 新增ACTION_EFFECT_MAP（15条映射规则）+ _updateActionEffect() + _getSpecialtyMultiplier()
- npc.js: 7处专长名映射修复 + 3个缺失效果类型分支
- npc.js: morale_boost/patrol_bonus数值修正
- npc.js: 7处NPC日程desc关键词补充（消除空转）
- npc.js: 苏岩schedule重构（13条日程条目）
- resource-system.js: 急救包独立资源管理 + 全局自动检查
- game.js: 急救包系统初始化和update集成
- index.html: 资源面板新增急救包显示区域
- style.css: 急救包图标样式

---

## v2.2 — 难度选择UI优化：直接嵌入开始界面 + 轮回锁定 (2026-02-24)

### 🎮 难度选择器UI重构（index.html + style.css + game.js）
- **直接嵌入开始界面**：难度选择器从隐藏弹出改为始终显示在模式按钮下方，与"选择AI模型"区域风格一致
- **去掉"开始轮回"确认按钮**：选好难度后直接点"轮回模式"按钮即可启动游戏，减少一步操作
- **难度提示文案**：新增"难度仅在轮回模式生效 · 轮回中途无法切换，需勾选「从第1世重新开始」才能重选"提示
- **轮回中难度锁定**：有存档时难度卡片变为半透明不可点击状态，当前难度标注🔒图标
- **勾选重置解锁**：勾选"从第1世重新开始"后解锁所有难度卡片，取消勾选则重新锁定
- **非轮回模式强制简单**：AI观察模式和Debug模式启动时自动使用简单难度

### 🎨 视觉优化（style.css）
- 难度卡片布局从 `grid 3列` 改为 `flex-wrap` 自适应排列，每张卡片固定宽度130px
- hover效果增强：`scale(1.05)` + 紫色发光
- 选中态增强：双层发光 `box-shadow`
- 新增 `.locked` 锁定态（半透明+灰度+禁止点击）和 `.current-locked` 当前难度高亮态
- 移除 `.difficulty-confirm-btn` 相关所有样式
- 新增 `.difficulty-locked-text` 锁定提示文字样式

### 🧹 代码清理（game.js）
- 移除 `difficultyConfirmBtn`、`difficultyLockedHint`、`difficultyLockedLabel` DOM引用
- 新增 `lockDifficultyCards(currentKey)` / `unlockDifficultyCards()` 辅助函数
- 页面加载时根据 `localStorage` 轮回存档状态自动锁定/解锁难度卡片
- 轮回模式按钮点击事件简化：有存档直接启动，新轮回保存选中难度后启动
- "从第1世重新开始"勾选事件：勾选解锁卡片、取消勾选重新锁定
- `startGame()` 函数内新增非轮回模式强制 `setDifficulty('easy')`

### 📝 代码改动
- index.html: 移除 `#difficulty-selector` 的 `display:none`，移除确认按钮，移除独立的 `#difficulty-locked-hint`，新增内部锁定提示和难度说明文字
- style.css: `.difficulty-options` 改 flex-wrap，`.difficulty-option` 加固定宽度，新增 locked/current-locked/hover/选中态样式，移除确认按钮样式
- game.js: 重写难度选择器初始化（移除确认按钮引用+添加锁定辅助函数+存档检测+勾选事件+非轮回强制简单）

---

## v2.0 — 全面系统升级：健康死亡链路 + 物资平衡 + 暖炉实质化 + UI优化 (2026-02-21)

### 🔄 重构：健康→死亡链路（death-system.js + npc.js）
- **健康归零致死**：NPC健康值降到0后30游戏秒内触发死亡
- **饥饿加速致死**：饱腹=0持续超过4小时，健康扣减提升为0.15/秒（约11分钟从100到0）
- **严重失温致死**：体温<33°C持续超过30分钟，健康扣减0.2/秒
- **濒死状态**：饱腹=0 + 体力=0 + 健康<30时触发濒死，NPC停止所有活动、发出求救信号
- **濒死超时**：5分钟无人救助则标记死亡
- **死亡通知增强**：全员悲痛San-10，UI显示死因详情

### ⚖️ 重新平衡：物资采集速率（task-system.js + resource-system.js）
- **采集速率重设计**：
  - 木柴：8单位/小时（原30），2人×8h=128单位 > 60单位消耗 ✓
  - 食物：5单位/小时（原24），2人×6h=60单位 > 24单位消耗 ✓
  - 电力：12单位/小时（原20），1人×6h=72单位 ≈ 72单位消耗 ✓
  - 建材：6单位/小时（原15），2人×4h=48单位 ≈ 50单位暖炉 ✓
- **体力效率修正**：≥80→×1.2, 50-79→×1.0, 20-49→×0.6, <20→×0.3
- **天气采集效率**：第1天×0.9, 第2天×0.7, 第3天×1.1, 第4天×0（禁止外出）
- **日结算收支平衡检查**：自动警告今日收支不平衡的资源类型

### 🌡️ 新增：物资消耗受天气影响（resource-system.js）
- 第1天（-10°C）：木柴×1.0基础消耗
- 第2天（-25°C）：木柴×1.3, 电力×1.2
- 第3天（0°C喘息日）：木柴×0.5, 电力×0.7
- 第4天（-60°C暴风雪）：木柴×2.0, 电力×1.5
- 天气变化时事件日志自动提示消耗变化

### 🖥️ UI布局优化（index.html + style.css + game.js）
- 物资栏（木柴/食物/电力/建材）移至屏幕顶部，与survival-bar紧挨
- 数值变化带颜色动画：增加=绿色闪烁，减少=红色闪烁
- z-index调整确保物资栏始终可见不被遮挡

### 🔥 暖炉建设机制实质化（furnace-system.js + task-system.js + npc.js + game.js）
- **初始改为1座**：从2座改为仅主暖炉1座，第二座需通过建造获得
- **建造进度可视**：每10%进度报告一次，NPC状态显示"🔨 建造暖炉XX%"
- **资源不足暂停**：木柴<5时自动暂停建造并通知
- **工人效率系统**：1人=0.5x慢速, 2人=1.0x, 3人+=加速
- **建造条件检查**：建材≥50且木柴≥20时自动通知可开始建造
- **暖炉显示修复**：未建成前不再错误显示"2座"

### 🎯 任务目标实质化（task-system.js + npc.js）
- **无线电修理**：追踪进度0%→100%，完成后第4天可请求外部救援（生存概率+20%）
- **急救包制作**：每2游戏小时产出1份急救包，可对健康<40的NPC使用（+20健康）
- **陷阱布置**：完成后激活夜间预警系统，全员San+5
- **食物分配**：实际消耗食物储备，全员饱腹+25
- **御寒准备**：完成后全员体温+0.5°C, San+3保暖加成
- **暖炉维护**：标记维护状态，暖炉旁NPC体温恢复微量加成
- **休息恢复**：暖炉旁加速恢复体力和健康

### 🤫 NPC行为合理性（npc.js + task-system.js）
- **资源critical时禁止聊天**：`_canChatWith`检查资源紧急度
- **资源warning时降低聊天概率**：30%概率允许聊天
- **CHATTING中资源紧急强制结束**：每5秒检查一次，critical时强制`_forceEndChat`
- **urgent任务打断聊天**：`activateTaskOverride`中urgent优先级强制中断CHATTING
- **资源紧急自动分配**：`_checkResourceUrgency`每2秒检查，critical/warning时自动分配空闲NPC采集

### 🔄 轮回系统修复（reincarnation-system.js）
- **独立世数存储**：`currentLifeNumber`存储在独立localStorage key，不受pastLives上限影响
- **正确递增**：`advanceLife()`直接递增世数，不从pastLives.length推导
- **旧存档兼容**：无独立世数key时回退到`pastLives.length + 1`

### 🧘 NPC发呆兜底 + 起床闪现冻死修复（npc.js）
- **极端天气日程替换**：`_getWeatherAdjustedEntry`不仅检查下雨，还检查`canGoOutside()`
- **传送天气保护**：`_teleportTo`从室内到village时检查极端天气
- **出门天气保护**：`_walkToDoorAndExit`检查`canGoOutside()`
- **发呆兜底已有**：10秒无驱动触发恢复，60秒内>3次强制传送暖炉广场

### 📋 第3天日程规划修复（task-system.js + resource-system.js）
- **第4天准备清单**：第3天自动计算第4天所需物资并广播评估
- **动态优先级**：物资缺口越大，采集任务优先级越高（urgent）
- **增派人力**：木柴缺口>30时增派陆辰同去砍柴
- **第3天日结算评估**：明确显示"木柴✅/❌ 食物✅/❌ 电力✅/❌ 暖炉✅/❌"
- **不足警告**：物资不足以度过第4天时发出强烈警告

### 📝 代码改动
- death-system.js: 饥饿加速阈值4h→健康0.15/秒, 新增失温致死(33°C→0.2/秒), 濒死状态5分钟
- npc.js: 新增_hypothermiaDuration/_isDying/_dyingTimer属性, getStatusLine显示建造暖炉状态
- npc.js: _getWeatherAdjustedEntry增加canGoOutside检查, update中资源紧急强制结束聊天
- task-system.js: GATHER_RATES重设(woodFuel:8,food:5,material:6,power:12)
- task-system.js: BUILD_FURNACE持续同步buildWorkers, 新增DISTRIBUTE_FOOD/PREPARE_WARMTH/REST_RECOVER效果
- task-system.js: SET_TRAP激活预警+San恢复, REPAIR_RADIO追踪进度+25%报告, CRAFT_MEDICINE产出急救包
- task-system.js: _generateDay3Tasks动态计算第4天需求+广播评估+动态优先级
- resource-system.js: 新增_getWeatherConsumptionMult天气消耗乘数, 日结算增加第4天准备评估
- furnace-system.js: 初始1座暖炉, 建造进度每10%报告, 木柴不足暂停建造
- game.js: 暖炉显示修复(区分运转/总数/建造进度)
- weather-system.js: onDayChange通知资源系统天气变化
- guide/: 全面更新(guide.md+08-changelog.md+09-pitfalls.md+04-attributes.md)

---

## v1.5 — 对话系统深度修复 + 关系上下文注入 + 模型升级14B (2026-02-20)

### 🐛 修复：对话只有1句（第一层 — 移动状态残留）
- **问题**：NPC打完招呼后，对方不回复，对话只有1句
- **第一层根因**：`startNPCChat` 设置 CHATTING 状态后没有清除NPC正在执行的路径，`_followPath` 在等待LLM期间继续执行，走完路径后 state 被重置为 IDLE 并触发进门传送
- **修复**：
  - `startNPCChat` 中清除双方所有移动状态（currentPath/isMoving/pathIndex/_pendingEnterScene/_walkingToDoor等）
  - `_followPath` 入口加 CHATTING 检查
  - `_updateDoorWalk` 入口加 CHATTING 检查
  - 入睡判定加 CHATTING 检查
  - 强制回家导航加 CHATTING 检查

### 🐛 修复：对话只有1句（第二层 — async竞态条件，核心Bug）
- **问题**：第一层修复后仍有大量1句对话
- **第二层根因**：`think()` 和 `_actionDecision()` 是 async 函数，在 `await callLLM` 之前检查了 CHATTING（通过），但在 await 期间 NPC 被另一个 NPC 设为 CHATTING。LLM 响应回来后，决策代码无条件覆盖 state 为 WALKING 并设置新路径
- **修复（4层防护 + 最终防线）**：
  - `think()` 的 `await callLLM` 之后重新检查 `state === 'CHATTING'`，是则放弃决策
  - `_actionDecision()` 的 `await callLLM` 之后同样检查
  - `_executeAction()` 入口加 CHATTING 检查
  - `_navigateToScheduleTarget()` 入口加 CHATTING 检查
  - `_teleportTo()` 入口禁止 CHATTING 时跨场景传送（最终防线）

### ✨ 新增：对话关系上下文注入
- **问题**：NPC昨天吵完架今天聊天像没事人一样，好感度/冷淡期/历史记忆都没传给LLM
- **修复**：`_generateNPCLineWithEnd` 的 systemPrompt 新增3项上下文
  - **好感度描述**：根据 `getAffinity()` 分5档（≥90知心好友 → <30很反感），告知LLM说话态度
  - **冷淡期状态**：检测 `_affinityCooldown`，吵架后告知LLM态度冷淡、不想搭理
  - **近期对话记忆**：筛选 `memories` 中与对方相关的最近3条记忆（含对话最后2句摘要）
  - **规则强化**：第3条改为"态度必须严格符合好感度和关系状态"

### 📊 调试日志服务端化
- 对话循环的关键中断日志从 `console.warn`（浏览器端）改为 `npc._logDebug`（服务端持久化）
- 记录每轮循环的关键状态：场景值、state值、LLM状态、fallback计数等
- 中断原因可在服务端debug日志文件中直接查看

### 🔧 模型升级
- 从 Qwen3-4B 升级到 **Qwen3-14B Q8**（15GB），对话质量和指令跟随大幅提升
- `callLLM` 中 `num_predict` 参数调整适配14B模型

### 📝 代码改动
- dialogue.js: startNPCChat 新增双方全部移动状态清除（10+个字段）
- dialogue.js: _generateNPCLineWithEnd prompt 新增好感度/冷淡期/记忆3项上下文
- dialogue.js: 对话循环关键日志改用 _logDebug 输出到服务端
- npc.js: think() await callLLM 后新增 CHATTING 二次检查
- npc.js: _actionDecision() await callLLM 后新增 CHATTING 二次检查
- npc.js: _executeAction() 入口新增 CHATTING 检查
- npc.js: _navigateToScheduleTarget() 入口新增 CHATTING 检查
- npc.js: _teleportTo() 新增 CHATTING 跨场景传送保护（最终防线）
- npc.js: _followPath() 入口新增 CHATTING 检查
- npc.js: _updateDoorWalk() 入口新增 CHATTING 检查
- npc.js: shouldSleep 判定新增 CHATTING 检查
- npc.js: 强制回家导航新增 CHATTING 检查
- guide/09-pitfalls.md: 新增坑10(async竞态)/坑11(对话无上下文)/坑12(调试日志服务端化) + 更新通用原则

---

## v1.4 — 奖惩驱动行为 + Ollama本地部署 + API增强 + Debug日志系统 (2026-02-19)

### 🧠 奖惩驱动行为系统

#### think() 思考系统优化
- **新增规则8（奖惩意识）**：NPC在思考时必须关注属性变化趋势
  - 属性下降 → 焦虑恐惧（越低越怕）
  - 属性提升 → 高兴满足
  - 明确后果链：San低→发疯、健康低→生病、饥饿→体力和健康下降
- **JSON输出新增字段**：`concern`（当前最担忧的事）、`goalFocus`（当前最想推进的目标）
- **属性提示大幅增强**：多级紧迫度描述（🚨🚨极度危险 → 🚨危险 → ⚠️警告），明确告知负面影响
- **多重危险叠加警告**：≥2项指标处于危险时额外发出🆘紧急警告

#### _actionDecision 行动决策系统优化
- **LLM输出格式增强**：新增 `threat_analysis`（威胁分析）和 `opportunity_analysis`（机会分析）字段
- **决策规则扩展至12条**：新增身心状态紧急处理规则、多指标优先级排序、精神差必须urgent等
- **userPrompt状态标注**：属性值旁标注危险等级和影响说明（如 `🚨极低！`、`🚨危险！体力恢复变慢、工作效率下降！`）

#### 连锁惩罚机制（10种）
| 惩罚 | 触发条件 | 效果 |
|------|----------|------|
| 体力消耗加速 | 健康<30/50 | 体力消耗 ×1.5/×1.2 |
| 吃饭恢复变差 | San<25/40 | 体力恢复效率 ×0.5/×0.7 |
| 工作效率下降 | San<20/40 + 健康<25/50 | 赚钱效率 ×0.3~1.0 |
| 社交质量降低 | San<30 | 魅力/情商提升减半 |
| 魅力持续下降 | San<30 / 健康<35 | 额外魅力衰减 |
| 情商持续下降 | San<25 | 额外情商衰减 |
| San恶性循环 | San<30 | 额外San加速下降 |
| 健康拖累San | 健康<35 | 额外San下降 |
| 压力致病 | San<25 + 健康<50 | 随机触发生病 |
| 移动减速 | 健康<25/40，San<20 | 速度 ×0.6/×0.8，×0.7 |

#### 状态覆盖阈值提升
- 看病（健康差）：<25 → **<35**
- 心理咨询（San差）：<25 → **<35**
- 发疯触发：<15 → **<20**，概率梯度化（San<10: 0.003, <15: 0.002, <20: 0.001）

#### 对话惩罚加强
- San极低时伤害：5 → **8**，低San时：2 → **4**
- 亲密关系伤害倍率：×2.0 → **×2.5**
- 好感度下降（极低San）：-1 → **-4**

### 🔧 think↔action 协调完善
- `_actionDecision()` 入口新增 `_chatWalkTarget` 检查，防止打断社交走路
- `_triggerStateOverride()` / `_executeAction()` 中清除 `_chatWalkTarget` 并记录日志
- `_updateSchedule()` 日程切换时保护正在走向聊天目标的NPC

### 🚶 走路发起对话增强
- **途中距离检测**：走路过程中一旦距离目标 ≤4格就提前发起对话
- **目标离开检测**：走路途中持续监控目标是否还在同场景，离开则放弃

### 🌐 Ollama 本地部署（替代GLM-4云端API）
- **部署 Ollama**：brew install + 配置自定义模型目录 `/Users/.../vibegame/model/`
- **模型**：qwen3:4b (2.3GB)
- **API切换**：从 GLM-4 云端切换到 Ollama 原生接口 (`/api/chat`)
- **Qwen3 think模式修复**：使用 `think: false` 关闭思考模式，解决 content 为空的问题
- **CORS修复**：添加 `OLLAMA_ORIGINS="*"` 环境变量解决跨域
- **新增** `start-ollama.sh` 启动脚本

### 🔄 callLLM 函数重写
- **重试机制**：每次调用最多重试2次（共3次），429/网络错误自动等待
- **全局状态跟踪**：新增 `LLM_STATUS` 对象（总调用/成功/失败/连续失败/最后错误）
- **宕机保护**：连续失败10次 → 暂停60秒
- **Ollama原生接口支持**：`USE_OLLAMA_NATIVE` 开关，支持 `think:false`
- **`<think>` 标签清理**：兼容 Qwen3 的思考标签输出
- **Authorization 头条件发送**：API_KEY 为空时不发送

### 💬 对话系统容错增强
- **Fallback多样化**：从8种随机回复中选择（替代所有人都说"嗯嗯。"）
- **连续失败检测**：`_generateNPCLineWithEnd` 返回 `isFallback` 标记
- **对话中断保护**：连续3轮fallback自动结束对话 + API宕机时跳过对话

### 📊 Debug日志系统大幅增强
- **时间日期**：所有日志增加 `day`(游戏天数) 和 `realTime`(真实时间戳)
- **控制台格式**：`[DEBUG·名字] [D1 08:00] [2026/2/19 21:23] [type] 详情`
- **新增日志类型**：`reward`(⚖️奖惩分析)、`penalty`(⚠️连锁惩罚)、`goal`(🎯目标进度)、`health`(🏥健康事件)
- **Debug面板新增**：🎯 目标系统区域（进度条+完成状态）、⚖️ 奖惩日志区域（彩色分类）、🌐 API状态行

### 📝 代码改动
- npc.js: think() systemPrompt 新增规则8奖惩意识 + JSON输出新增concern/goalFocus
- npc.js: think() attrHints 大幅增强（多级紧迫度+多重危险叠加警告）
- npc.js: _actionDecision() JSON输出新增threat_analysis/opportunity_analysis
- npc.js: _actionDecision() 决策规则扩展至12条 + userPrompt属性标注增强
- npc.js: _updateAttributes() 新增10种连锁惩罚机制
- npc.js: _updateStateOverride() 阈值提升（健康<35/San<35）
- npc.js: 发疯触发阈值<20 + 概率梯度化
- npc.js: 移动速度新增健康/San低额外减速
- npc.js: _actionDecision() 入口新增_chatWalkTarget保护
- npc.js: _triggerStateOverride()/_executeAction() 清除_chatWalkTarget
- npc.js: _updateSchedule() 新增_chatWalkTarget日程切换保护
- npc.js: _followPath() 后新增途中距离检测和目标离开检测
- npc.js: _logDebug()/_logDebugDialogue() 增加day/realTime字段
- npc.js: getDebugLogText() 新增reward/penalty/goal/health图标 + 天数显示
- dialogue.js: 对话伤害/好感度惩罚加强
- dialogue.js: fallback回复多样化（8种随机回复）
- dialogue.js: _generateNPCLineWithEnd() 返回isFallback标记
- dialogue.js: 对话循环新增fallbackCount追踪 + API宕机检测
- game.js: callLLM() 重写（重试/状态跟踪/宕机保护/Ollama原生接口）
- game.js: 新增LLM_STATUS全局对象 + USE_OLLAMA_NATIVE开关
- game.js: Debug面板新增目标系统区域 + 奖惩日志区域 + API状态行
- **新增** start-ollama.sh: Ollama启动脚本（自定义模型目录+CORS）

---

## v1.3 — 隔空对话修复 + 状态显示系统 + 渲染分层 (2026-02-18)

### 🐛 修复：隔空对话（关键Bug）
- **问题**：NPC在不同场景仍能对话（如一个在酒馆、一个在公寓）
- **根因**：多个系统的超时兜底传送在CHATTING状态下仍然生效，把正在聊天的NPC传送走
- **修复**：全链路同场景保护
  - `startNPCChat()` 入口校验同场景
  - `_processNPCChat()` 每轮LLM调用前检查同场景
  - `_playNextLine()` 每句播放前检查同场景
  - `_checkStateOverrideArrival()` / `_checkEatingArrival()` / `_updateActionOverride()` 加 CHATTING 保护
  - `_chatWalkTarget` 到达后二次验证同场景

### 🐛 修复：NPC卡在公寓门口
- **问题**：多NPC同时出门时堆在公寓走廊卡死不动
- **根因**：公寓垂直走廊仅1格宽（x=18），多NPC互相阻塞
- **修复**：
  - 公寓地图从 20×29 扩展为 21×29
  - 垂直走廊加宽为2格（x=18~19）
  - 出门超时保护从5秒缩短为3秒

### ✨ 新增：角色状态显示系统
- **`getSceneLabel()`** — 场景ID→中文名映射（village→小镇、tavern→酒馆等）
- **`getStatusLine()`** — 统一的状态摘要（`📍位置 · 意图`）
  - 例：`📍酒馆 · 🍜 吃饭中`、`📍公寓 · 💤 睡觉中`
- **头顶标签**：半透明圆角背景板 + 白色文字，始终显示（非睡觉时）
- **侧边栏同步**：NPC卡片状态使用 `getStatusLine()`
- **GLM Prompt注入**：think() 和 _actionDecision() 中加入自身状态摘要 + 其他NPC的状态摘要

### 🎨 修复：对话气泡被状态标签遮挡
- **问题**：说话气泡被其他NPC的状态标签覆盖
- **修复**：分层渲染架构
  - `draw()` 只绘制身体/名字/状态标签（不含对话气泡）
  - 新增 `drawBubbleLayer()` 专门绘制对话气泡
  - game.js 中先绘制所有entities，再单独绘制所有NPC对话气泡

### 📝 代码改动
- npc.js: 新增 `getSceneLabel()` / `getStatusLine()` / `drawBubbleLayer()` 方法
- npc.js: draw() 中 expression 气泡移出，状态标签改为带背景板的小标签
- npc.js: 5处传送系统加 CHATTING 保护
- npc.js: _chatWalkTarget 到达后二次同场景验证
- npc.js: think()/\_actionDecision() prompt 注入状态摘要
- dialogue.js: startNPCChat/\_processNPCChat/\_playNextLine 全链路同场景检查
- game.js: 渲染循环新增对话气泡独立绘制层
- game.js: 侧边栏状态改用 getStatusLine()
- maps.js: 公寓地图 20×29→21×29，垂直走廊加宽为2格
- **新增** guide/09-pitfalls.md: 踩坑记录 & 开发注意事项文档

---

## v1.2 — NPC 感知增强 + 寻路修复 (2026-02-17)

### 🔭 NPC 环境感知大幅增强
- **修复 `_getNearbyNPCs` 方法**：不再使用 `{...npc}` 展开整个NPC复杂对象（含game循环引用、Image对象等），改为只提取 `id/name/state/stateDesc` 等必要属性
- **统一感知范围**：到达后感知范围从 8格 → 64格，与 think 函数保持一致
- **新增同场景NPC概览**：AI prompt 中增加"同一区域较远处还有：xxx"，NPC 不再只看到身边5格内的人
- **AI 强调提示**：当附近确实有人时，prompt 中增加 `⚠️ 注意：你附近有N个人，你不是一个人！`，防止 LLM 生成"空无一人"的幻觉
- **wantChat 走向远处NPC**：NPC 可以走向同场景远处的人发起聊天（自动寻路过去），而不只限于身边6格

### 🤯 发疯连锁影响增强
- 体力消耗 -0.03 → **-0.08/秒**（大幅消耗）
- 健康消耗 -0.01 → **-0.03/秒**（大幅伤害）
- **新增**：魅力持续下降（-0.02/秒），形象恶化
- **新增**：情商持续下降（-0.01/秒），胡言乱语损伤社交能力
- **新增**：社交关系恶化 — 同场景目击者对发疯者好感度 **-2**，发疯者对目击者好感度 **-1**
- 形成完整恶性循环：San低→发疯→属性暴降→关系恶化→更难社交恢复→San继续低

### 🐛 Bug 修复
- **修复 `findPath` 返回 null 导致崩溃**：`findPath()` 找不到路径时返回 null，后续访问 `currentPath.length` 报错 `Cannot read properties of null`。修复：赋值时加 `|| []` 保护
- **修复发疯乱走时 `map.isWalkable` 报错**：发疯状态下随机移动时 map 可能为 null
- **修复 `hour` 变量重复声明**：San值更新代码中 `hour` 与外层作用域变量冲突

### 📝 代码改动
- npc.js: `_getNearbyNPCs` 重写（安全属性提取 + isSleeping 过滤）
- npc.js: think() prompt 增加同场景NPC概览 + nearbyEmphasis 强调
- npc.js: wantChat 逻辑重构（支持走向远处NPC）
- npc.js: 发疯连锁影响增强（魅力/情商/关系）
- npc.js: `findPath` 返回值保护（`|| []`）
- npc.js: 添加 `[感知调试]` console.log 日志

---

## v1.1 — San 值系统增强：发疯 + 演出 + 心理咨询 (2026-02-17)

### 🎵 歆玥文艺演出（San值恢复 — 少量花钱）
- 演出时间：**14:00-16:00 广场**、**19:00-21:00 酒馆驻唱**
- 同场景NPC自动观看，San值恢复 **+0.20/秒**
- 观众花费约 **1元/次**（少量），歆玥获得 0.04/秒演出收入
- 非演出时间，酒馆内有歆玥也有微量 San 值氛围恢复（+0.03/秒，免费）

### 💬 苏医生心理咨询（San值恢复 — 大量花钱）
- 条件：NPC在医院 + 苏医生在岗 + NPC存款≥10
- San值恢复 **+0.30/秒**（最快的恢复方式）
- 咨询费约 **6元/次**（大量花钱），苏医生获得 0.25/秒咨询收入

### 🤯 发疯机制（San值<15触发）
- San值<15时有概率触发发疯状态（`isCrazy=true`）
- 持续约 **3游戏小时**
- 发疯表现：随机乱走、说胡话、不执行日程/社交
- 发疯惩罚：体力/健康持续下降
- 恢复条件：San值≥30 或 发疯计时结束
- 新增 `isCrazy` / `isWatchingShow` / `isInTherapy` 状态属性

### 🖥️ UI 更新
- 侧边栏状态显示：发疯🤯 / 看演出🎵 / 咨询中💬 标记
- 详情面板 meta 增加发疯状态
- hints 区新增发疯/演出/咨询的动态提示
- San值提示词分级增强（发疯中/快疯了/精神差/一般/良好）

### 📝 代码改动
- npc.js: 新增 `isCrazy`/`isWatchingShow`/`isInTherapy` 属性 + 序列化
- npc.js: 歆玥演出检测 + 自动观看 + 收费逻辑
- npc.js: 苏医生心理咨询检测 + 自动触发 + 收费逻辑
- npc.js: 发疯状态机（触发/表现/恢复）
- npc.js: think() 发疯短路（发疯时随机乱走，不调用LLM）
- npc.js: AI prompt San值提示增强（发疯/快疯/精神差分级）
- game.js: 侧边栏/详情面板/hints 发疯/演出/咨询 UI 显示
- guide/04-attributes.md: San值章节全面重写（三大恢复途径 + 发疯机制 + mermaid图）

---

## v1.0 — 角色重构：性别年龄情感关系大改 (2026-02-17)

### 🎭 角色属性重构
- **李婶** 55→42岁，丧夫多年独自带大儿子
- **赵大厨** 42→38岁，暗恋李婶
- **王老师** 38→32岁，暗恋歆玥
- **老钱** 65→60岁，清璇的爷爷→孙女，操心孙女婚事
- **苏医生** 45→35岁，改为男性，暗恋歆玥（三角关系核心）
- **歆玥** 28→22岁，被苏医生和王老师同时追求
- **陆辰** 12→18岁，大学生假期回乡，暗恋清璇
- **清璇** 17岁男→16岁女，改为老钱的孙女/文学少女，与陆辰青春暗恋线

### 💕 三条情感主线
1. 中年暖心线：赵大厨(♂38) → 李婶(♀42)
2. 三角关系：苏医生(♂35) vs 王老师(♂32) → 歆玥(♀22)
3. 青春暗恋：陆辰(♂18) ↔ 清璇(♀16)

### 💘 差异化初始好感度
- 赵大厨→李婶 75 / 李婶→赵大厨 65
- 苏医生→歆玥 70 / 王老师→歆玥 68
- 歆玥→苏医生 60 / 歆玥→王老师 62
- 陆辰→清璇 72 / 清璇→陆辰 65
- 其他关系默认 50

### 🎨 素材更新
- 苏医生: 使用瑞恩(29岁男性)形象
- 清璇: 使用阿比盖尔(女高中生)形象
- 歆玥: 使用塔玛拉形象

### 📝 代码改动
- npc.js: 全部8人age/gender/personality/schedule/attrs更新
- npc.js: NPC构造函数新增gender属性和初始affinity
- npc.js: think() AI prompt 更新老钱/清璇/王老师的角色描述
- npc.js: 清璇不再作为"哲学型主动社交角色"
- dialogue.js: 对话生成加入gender信息
- dialogue.js: 移除清璇的哲学对话设定
- maps.js: 公寓301室NPC标注更新
- guide/03-npc.md: 完全重写角色设定与情感关系文档

---

## v0.9 — Guide 拆分 + 天气影响日程 (2026-02-17)

### 📂 Guide 文档拆分
- `guide.md` 精简为总目录索引
- 各章节拆分为独立文档（01~08）

### 🌧️ 天气影响 NPC 日程（npc.js）
- 下雨时，NPC 的户外日程（公园/广场/医院）自动替换为室内活动
- 替代目标：酒馆、杂货铺、医院、公寓（随机选择）
- NPC 的日程描述也同步更新（如"在公园晒太阳"→"下雨了，去酒馆坐坐"）
- systemPrompt 新增天气行为规则：下雨时不应该想去户外

---

## v0.8 — 六大属性系统 (2026-02-17)

引入角色六大基础属性系统：体力、存款、魅力、智慧、健康、情商。

- 缓慢连续变化机制（每帧微量增减）
- 属性联动效果（体力→移动速度、健康→生病等）
- 生病机制（健康<30触发、可看病康复）
- 属性注入 AI Prompt
- 侧边栏迷你属性条 + 详情面板属性 Tab
- 属性存档/读档 + 每日重置

---

## v0.7 — Bug 修复合集 + 进出门过渡 (2026-02-17)

集中修复 v0.6 饥饿值系统和进出建筑相关的 9 个 bug。

---

## v0.6 — 饥饿值系统 + 日程全面优化 (2026-02-17)

引入饥饿值驱动 NPC 主动前往餐饮场所，全员日程大幅优化增加客流。

---

## v0.5 — NPC 详情面板 + 场所感知修复 (2026-02-17)

详情面板（日程/记录/关系）、聊天记录气泡重设计、场所环境动态感知。

---

## v0.4 — 日程优化 + AI轮询加速 (2026-02-16)

AI轮询加速3倍、丰富晚间社交活动、睡眠安全机制。

---

## v0.3 — 公寓楼 + 新角色 (2026-02-16)

公寓楼系统、清璇角色、王老师康德哲学重设。

---

## v0.2 — 昼夜天气 + 对话系统 (2026-02-16)

昼夜光照、天气系统、NPC睡眠/避雨、对话系统重构、三列UI布局。

---

## 当前已实现功能 Checklist（更新至 v2.3）

### Phase 1: 🗺️ 地图骨架 + 基础移动 ✅
### Phase 2: 🤖 NPC 系统 + AI 驱动 ✅
### Phase 3: 📊 属性系统 ✅
### Phase 4: 🎨 美化 + 细节 🔧 进行中
### Phase 5: 🧠 奖惩行为驱动 + 本地LLM ✅
### Phase 6: 🗣️ 对话深度修复 + 关系上下文 ✅
### Phase 7: ⚔️ 末日生存系统 + 健康死亡链路 ✅
### Phase 8: 🎯 行动效果数值化 + 急救包重构 ✅
### Phase 9: ⚔️ 难度系统 + UI优化 ✅
### Phase 10: 🧠 智能分工协调系统 ✅
### Phase 11: 🏗️ v4.0 全项目模块化重构 ✅

- [x] 8 个 NPC + 固定日程 + 天气动态调整
- [x] AI 决策 + 轮询加速
- [x] 七大属性系统（六大+心情值）+ 生病机制
- [x] NPC↔NPC 对话 + 玩家对话
- [x] 详情面板（属性/日程/记录/关系）
- [x] 天气系统 + 昼夜光照
- [x] Sprite 动画 + 高DPI适配
- [x] 饥饿系统 + 餐饮日程 + 吃饭扣钱
- [x] 进出门自然过渡 + 防堵门
- [x] 角色性别/年龄/情感关系重构 + 差异化好感度
- [x] 心情值系统 + 属性变化速率分级
- [x] San值系统增强：歆玥演出恢复 + 苏医生心理咨询 + 三级恢复体系
- [x] 发疯机制：San<15触发 → 乱走/胡话/属性暴降/关系恶化
- [x] NPC环境感知增强：同场景远距离感知 + AI prompt 强调
- [x] wantChat 走向远处NPC：NPC可以主动走过去找人聊天
- [x] 隔空对话修复：全链路同场景保护 + 传送系统CHATTING白名单
- [x] 角色状态显示系统：头顶标签 + 侧边栏 + GLM prompt 统一
- [x] 渲染分层：对话气泡独立层，不被其他元素遮挡
- [x] 公寓地图优化：走廊加宽防堵塞
- [x] 奖惩驱动行为：think/action中注入奖惩意识 + 10种连锁惩罚 + 阈值梯度化
- [x] think↔action协调：防止行动决策打断社交走路 + 日程保护
- [x] 走路发起对话增强：途中距离检测（≤4格提前发起）+ 目标离开检测
- [x] Ollama本地部署：qwen3:4b模型 + 自定义模型目录 + CORS修复
- [x] callLLM重写：重试机制 + 全局状态跟踪 + 宕机保护 + Ollama原生接口
- [x] 对话容错增强：fallback多样化 + 连续失败检测 + API宕机中断
- [x] Debug日志系统增强：时间日期 + 奖惩日志 + 目标进度 + API状态
- [x] 对话1句修复（第一层）：startNPCChat清除移动状态 + _followPath/传送/入睡/回家CHATTING保护
- [x] 对话1句修复（第二层）：async think/action await后CHATTING二次检查 + _teleportTo最终防线
- [x] 对话关系上下文：好感度描述 + 冷淡期状态 + 近期对话记忆注入prompt
- [x] 调试日志服务端化：对话循环关键状态 _logDebug 持久化
- [x] 模型升级：Qwen3-4B → Qwen3-14B Q8（对话质量大幅提升）
- [x] 健康→死亡链路：健康归零致死 + 饥饿加速 + 严重失温 + 濒死状态 + 死亡通知
- [x] 物资采集速率重平衡：木柴8/h、食物5/h、电力12/h、建材6/h + 体力效率 + 天气效率
- [x] 物资消耗受天气影响：4天天气周期×不同消耗乘数
- [x] 暖炉建设机制实质化：初始1座 + 建造进度 + 资源不足暂停 + 工人效率
- [x] 任务目标实质化：无线电修理进度 + 急救包制作 + 陷阱布置 + 食物分配 + 御寒准备
- [x] NPC行为合理性：资源紧急禁止聊天 + urgent任务打断 + 自动分配空闲NPC
- [x] 轮回系统修复：独立世数存储 + 正确递增 + 旧存档兼容
- [x] 发呆兜底 + 起床冻死修复：极端天气日程替换 + 传送/出门天气保护
- [x] 第3天日程规划：第4天准备清单 + 动态优先级 + 增派人力 + 日结算评估
- [x] ACTION_EFFECT_MAP行动效果数值化：15条映射规则 + 10种效果类型
- [x] _updateActionEffect自动匹配：每update周期匹配行为关键词→触发系统效果
- [x] _getSpecialtyMultiplier专长加成：有对应专长×1.5倍率
- [x] 动态数值气泡：实时显示产出速率（体力效率×专长倍率×电力加成）
- [x] 专长名映射修复：7处错误专长名 + 3个缺失效果类型分支
- [x] 数值修正：morale_boost 0.003/s, patrol_bonus 0.005/s
- [x] 7处空转行为修复：补充NPC日程desc关键词匹配
- [x] 急救包系统重构：独立消耗品 + 全局自动检查 + 资源面板显示
- [x] 苏岩日程优化：11h坐诊→5h坐诊+4h采集食物+2h巡查安抚
- [x] 难度系统（difficulty-config.js）：6个等级（简单→地狱）完整参数表
- [x] 难度选择器UI重构：直接嵌入开始界面 + 轮回中锁定 + 勾选重置解锁
- [x] 非轮回模式强制简单难度：AI观察/Debug模式启动时自动setDifficulty('easy')
- [x] 智能分工系统：generateWorkPlan()基于前世轮回记忆自动生成最优分工方案（精确到人/任务/目标量/原因）
- [x] 前世教训深度分析：_generateDeepLessons()分层教训（战略/战术/执行）+ 资源比例/人力/时序/因果链分析
- [x] 多世学习演进：analyzeMultiLifePatterns()识别成功策略模式和反复失败模式
- [x] 老钱指挥中心：workPlan存储在老钱身上 + 死亡时自动转移给继任者（王策→李婶→歆玥）
- [x] workPlan驱动任务生成：_generateTasksFromWorkPlan()替代硬编码任务分配
- [x] NPC死亡任务重分配：reassignDeadNpcTasks()按专长匹配重分配未完成任务
- [x] 暴风雪天气应急：onWeatherEmergency()自动将户外任务转为室内维护暖炉
- [x] think/action prompt增强：注入workPlan安排摘要+前世教训+强约束「安排表优先」
- [x] 5个硬性决策拦截器：暴风雪户外→stay、体温<33→回暖炉、健康<10→去医院、有安排却wander→work
- [x] Bug修复：eventLog未初始化导致_initWorkPlan中addEvent crash
- [x] 🔴 ~~采集产出量修复~~：v2.4修复 — `_updateActionEffect()` 双路径关键词匹配（stateDesc ∪ scheduleDesc）
- [x] 🔴 ~~死亡NPC从prompt过滤~~：v2.4修复 — allNPCStatus/sameSceneNPCs/_getNearbyNPCs/friendsInCrisis 全部添加 isDead 过滤
- [x] **断点续玩**：save()/load() v2完整存档（6个子系统+全局物品+速度档位），启动页面"继续游戏"按钮+存档摘要显示
- [x] **存档系统完善**：ver=2存档格式，Game.getSaveInfo()静态方法，轮回后自动存档替代删除存档
- [x] **v4.0 模块化重构**：26,700行单体代码 → 49个模块文件（7层分类）
- [x] GST 命名空间 + IIFE 隔离 + 向后兼容别名层
- [x] NPC系统拆分：8,370行 npc.js → 7个文件（核心类+6个 proto mixin，79个方法挂载）
- [x] Game引擎拆分：3,794行 game.js → 6个文件（核心调度+renderer/input/camera/hud/startup）
- [x] 地图系统拆分：maps.js → 12个文件（BaseMap/VillageMap/IndoorMap×7/MapRegistry）
- [x] 数据与逻辑分离：7个 data/*.js 纯配置文件（NPC配置/日程/prompt/效果/地图/任务/事件）
- [x] 素材清理：移除旧版 *0.png + gen/ 目录，仅保留最终版76个素材文件
- [x] 工具脚本统一收纳到 tools/ 目录
- [x] 启动脚本路径修复：restart.py/start-tmux.sh 的 PROJECT_DIR 上溯到父目录
- [x] guide 文档全面更新：start.md/guide.md/06-tech.md/08-changelog.md/09-pitfalls.md
- [x] 素材图片系统（sprite-loader.js）：SpriteLoader异步预加载 + drawTile/drawDecoration/drawBuilding + graceful fallback
- [x] 素材清单（sprite-manifest.json）：tiles(11) + decorations(13) + buildings(7) 完整素材目录
- [x] 地图渲染引擎改造：drawGrid/drawDecoration/建筑draw 优先使用图片素材 + _colorToSprite映射表
- [x] 占位符素材生成器（generate-sprites.py）：Python Pillow批量生成像素风纹理PNG + 热替换支持
- [x] 底图渲染修复：消除棋盘格+黑色方块，同步Python/JS地面颜色逻辑，重新生成底图PNG
- [x] 装饰物/建筑回归代码绘制：从manifest移除tiles/decorations/buildings占位图，等有真正美术素材再启用
- [x] 浏览器缓存解决：server.js添加Cache-Control:no-cache + index.html添加JS版本号参数
- [x] drawGrid底图渲染前清除视口：防止canvas残留内容透出
- [x] 室内堵门口修复：统一 `_enterIndoor()` 方法，10处进门代码全部替换为直接传送到座位
- [x] 室内场景PNG图片：6个场景布局图生成到 `asset/indoor/`（generate_indoor_maps.py）
- [x] 室内循环重置修复：`_enterIndoor` 改精确像素坐标（不用 `_teleportTo`）+ 移除 `distToInside` 循环判定
- [x] "已在室内"检查简化：`_updateSchedule/_navigateToScheduleTarget/_actionOverride` 中 NPC 已在目标室内→直接标记到达
- [x] 室内场景AI底图替换：6张AI生成室内图（resize_indoor.py缩放）替换代码生成的布局图
- [x] IndoorMap底图渲染：indoorMapKey属性 + drawGrid()重写（SpriteLoader底图优先 + fallback逐格着色）
- [x] 7个室内子类改造：家具色块条件绘制（底图模式跳过）+ 动态效果始终绘制（火焰/指示灯等）
- [x] sprite-manifest注册室内底图：6个 `*_indoor` 条目，SpriteLoader自动加载
- [x] 投票决策系统(CouncilSystem)：LLM驱动多轮讨论+投票表决+activateTaskOverride分配
- [x] 自动化机器系统(MachineSystem)：发电机+伐木机建造/运行/产出
- [x] 统一行为仲裁(_getScheduleControl)：P0>stateOverride>taskOverride>actionOverride>P2日程
- [x] 统一taskOverride stateDesc管道：activateTaskOverride第5参数+_getTaskOverrideDesc优先级链
- [x] 户外安全门控(canSafelyGoOutdoor)：属性+天气+冷却统一判断
- [x] 精神危急P0-7：San<40+户外→强制返回室内
- [x] 苏岩不自己找自己咨询：id检查+在场检查+文本区分
- [x] P0/stateOverride冲突修复：sick时跳过P0-3、mental时跳过P0-7
- [x] 出门保护期防重导航：_indoorEntryProtection>0时跳过卡住检测
- [x] 任务只建映射不导航修复：_activateDailyTaskNavigation桥接
- [x] _door类型位置校验修复：village和室内都算到达
- [x] 睡眠San恢复增强：0.04→0.10/dt
- [x] 资源消耗人口缩减：getPopulationRatio()
- [x] 暖炉维护增强：10%→30%燃料节约+暖区体温/体力加速
- [x] NPC死亡触发紧急council会议
- [x] 轮回记忆Prompt强制体现
- [x] 移除SET_TRAP/REPAIR_RADIO/MAINTAIN_FURNACE，新增BUILD_GENERATOR/BUILD_LUMBER_MILL
- [ ] 🟡 San值崩溃速度调优：第2天清晨3小时内5人精神崩溃致死，户外寒冷+死亡惩罚+San<30恶性循环三者叠加形成不可逆的"死亡螺旋"
- [ ] 🟡 食物消耗异常排查：第1天实际消耗64单位 vs 设计预期24单位（2.6倍差异），需逐环排查消耗触发点
- [ ] 🟡 资源消耗日志增强：每次资源消耗记录触发原因和具体数量（目前只有每小时总量，无法定位异常消耗来源）
- [ ] 更多装饰物
- [ ] 音效