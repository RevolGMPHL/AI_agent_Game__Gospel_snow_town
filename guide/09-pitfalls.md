# 🚧 踩坑记录 & 开发注意事项

> 这是项目开发过程中积累的经验教训，都是实际遇到的坑。后续开发时务必参考此文档，避免重蹈覆辙。

---

## 🔥 坑1：隔空对话 — 超时兜底传送无视 CHATTING 状态

### 问题现象
两个NPC在不同场景（比如一个在酒馆、一个在公寓），却在进行对话。对话内容正常，但画面上两人根本不在一起。

### 问题根因
**不是对话发起时的检测问题**，而是 **对话进行中** NPC被其他系统传送走了。

项目中有多个系统带有"超时兜底传送"机制（NPC长时间走不到目标就强制传送过去），这些传送会在 CHATTING 状态下仍然生效，把正在聊天的NPC传送到其他场景。

涉及的传送系统：
- `_checkStateOverrideArrival` — 状态覆盖（体力低→回家等）的15秒超时传送
- `_checkEatingArrival` — 饥饿覆盖（去吃饭）的15秒超时传送
- `_updateActionOverride` — 行动覆盖（AI决策）的20秒超时传送

### 解决方案：全链路同场景保护

```
发起 → 生成中 → 播放中 → 对话期间禁止传送
```

1. **`startNPCChat()` 入口**：校验 `npc1.currentScene === npc2.currentScene`
2. **`_processNPCChat()` 生成循环**：每轮LLM调用前检查两人同场景，不同则中断
3. **`_playNextLine()` 播放**：每句播放前检查同场景，不同则结束
4. **所有传送系统入口**：加 `if (this.state === 'CHATTING') return;`
5. **`_chatWalkTarget` 到达后**：再次验证同场景，目标走了就不发起对话

### ⚠️ 开发注意
- **任何新增的传送/场景切换逻辑，都必须先检查 `state === 'CHATTING'`**
- 对话是异步的（LLM调用需要时间），期间NPC的状态可能被任何系统修改
- 不要只在"入口"做检查，**全链路每一步都要检查**，因为异步执行中间状态可能随时变化

---

## 🔥 坑2：NPC卡在公寓门口 — 垂直走廊太窄

### 问题现象
多个NPC同时要出门（去酒馆吃饭、去杂货铺等），全部堆在公寓走廊里不动，卡死在门口。

### 问题根因
公寓地图（`ApartmentMap`）的垂直走廊（连接各楼层水平走廊的通道）**只有1格宽（x=18）**。

当多个NPC同时出门时：
1. NPC从各自房间走到水平走廊
2. 所有人都要通过 x=18 这一列的垂直通道走到底层门口
3. 寻路算法把其他NPC视为可通行（不当障碍物），但走路时NPC会互相碰撞/挤压
4. 走廊太窄导致NPC来回挤，触发超时保护才能出去

### 解决方案
1. **加宽垂直走廊**：从1格（x=18）扩展为2格（x=18~19），地图宽度从20→21
2. **缩短出门超时**：从5秒→3秒，即使寻路失败也能快速兜底传送出去

### ⚠️ 开发注意
- **设计室内地图时，走廊至少要2格宽**，否则多NPC必定互相堵塞
- 修改地图尺寸时，**需要同步更新所有引用尺寸的地方**：
  - `maps.js` 中的 `super(w, h, ...)` 构造
  - `npc.js` 中的 `_SCENE_SIZES` 尺寸映射
  - `npc.js` 中相关注释
- 公寓的房间布局（x坐标）需要和走廊坐标兼容，不能重叠
- x=18~19 是走廊，x=13~17 是第三列房间（103/203/303/403），刚好不冲突

---

## 🔥 坑3：对话气泡被状态标签遮挡 — 分层渲染

### 问题现象
NPC说话时，对话气泡被其他NPC的状态标签（📍位置 · 意图）遮挡，看不清说话内容。

### 问题根因
所有绘制（身体、名字、状态标签、对话气泡）都在每个NPC的 `draw()` 方法中一次性完成。当多个NPC重叠时，**后绘制的NPC的状态标签会盖住先绘制的NPC的对话气泡**。

### 解决方案：分层渲染

将对话气泡从 `draw()` 中移出，单独在更高层绘制：

```javascript
// game.js 渲染循环
// 第1层：所有实体（建筑 + NPC身体 + 名字 + 状态标签）
for (const e of entities) e.draw(ctx);

// 第2层：所有NPC对话气泡（最上层）
for (const npc of this.npcs) {
    if (npc.currentScene === this.currentScene) {
        npc.drawBubbleLayer(ctx);
    }
}
```

NPC类中：
- `draw(ctx)` — 绘制身体、名字、Zzz动画、状态标签（不含对话气泡）
- `drawBubbleLayer(ctx)` — 只绘制对话气泡（expression）

### ⚠️ 开发注意
- **需要在最上层显示的UI元素（对话、提示等），不要放在单个实体的 draw() 中**
- 正确的分层顺序应该是：`地面/装饰 → 建筑 → NPC身体+状态 → 对话气泡 → 系统UI`
- 新增头顶显示元素时，考虑它和对话气泡的z-order关系
- `drawBubbleLayer()` 必须在所有 entities 的 `draw()` 之后调用

---

## 🔥 坑4：状态显示系统设计经验

### 背景
NPC需要在头顶显示当前位置和意图（"📍酒馆 · 🍜 吃饭中"），同时这个信息也要传给GLM作为prompt。

### 设计方案

采用 **`getStatusLine()` 统一出口** 模式：

```javascript
getStatusLine() {
    const loc = this.getSceneLabel();  // 场景ID → 中文
    let intent = '';
    // 按优先级判断当前意图
    if (this.isSleeping) intent = '💤 睡觉中';
    else if (this.state === 'CHATTING') intent = '💬 聊天中';
    else if (this.isEating) intent = '🍜 吃饭中';
    // ... 更多状态
    else if (this.stateDesc) intent = this.stateDesc;
    return `📍${loc}${intent ? ' · ' + intent : ''}`;
}
```

### 使用位置
- **头顶渲染**：带半透明圆角背景板的小标签
- **侧边栏**：NPC卡片上的状态文字
- **GLM prompt**：think() 和 _actionDecision() 中注入自己的状态 + 其他NPC的状态
- **其他NPC描述**：从 `在${currentScene}` 升级为 `${getStatusLine()}`

### ⚠️ 开发注意
- **一个信息只有一个计算来源**（`getStatusLine()`），避免在不同地方重复拼接导致不一致
- 状态文字要控制长度（≤16字符），否则在头顶标签中显示不下
- 头顶标签和对话气泡同时显示时，标签要有额外的向上偏移（`extraOff`），避免重叠
- 新增NPC状态时，记得在 `getStatusLine()` 中增加对应的判断分支

---

## � 坑5：Ollama 本地部署 — CORS 跨域被拦截

### 问题现象
游戏通过 `file://` 协议打开 `index.html`，浏览器控制台报错：
```
Access to fetch at 'http://localhost:11434/v1/chat/completions' from origin 'null' 
has been blocked by CORS policy
```
所有 LLM 调用全部失败，NPC 完全无法思考和对话。

### 问题根因
浏览器通过 `file://` 打开 HTML 时，origin 为 `null`。Ollama 默认不允许来自其他 origin 的跨域请求，CORS 预检请求（OPTIONS）被拒绝。

### 解决方案
启动 Ollama 时设置环境变量 `OLLAMA_ORIGINS="*"`，允许所有来源的跨域请求：
```bash
export OLLAMA_ORIGINS="*"
ollama serve
```

### ⚠️ 开发注意
- **本地开发纯前端项目 + 本地 API 时，CORS 是必须解决的第一个问题**
- Ollama 的 CORS 配置通过环境变量 `OLLAMA_ORIGINS` 控制，不是配置文件
- 建议把所有环境变量写进 `start-ollama.sh` 启动脚本，避免每次手动设置
- 其他需要配置的 Ollama 环境变量：`OLLAMA_MODELS`(模型路径)、`OLLAMA_HOST`(监听地址)

---

## 🔥 坑6：Qwen3 思考模式 — content 为空，reasoning 有内容

### 问题现象
Ollama + Qwen3-4B 调用成功（HTTP 200），但 NPC 全部说"嗯嗯。"（fallback 回复）。API 返回的 JSON 中 `content` 为空字符串，所有内容跑到了 `reasoning` 字段。

### 问题根因
Qwen3 系列模型默认开启**思考模式（thinking mode）**，模型会把思维链放到 `reasoning` 字段，最终回复放到 `content`。但 4B 小模型的 token 预算经常被思考过程耗尽，导致还没来得及输出最终回复 `content` 就到达了 `max_tokens` 限制。

**关键发现**：
- Ollama 的 OpenAI 兼容接口 (`/v1/chat/completions`) **不支持** `chat_template_kwargs` 参数来关闭思考
- 在 system prompt 中添加 `/no_think` 指令对 Ollama 版 Qwen3 **无效**
- 只有 Ollama **原生接口** (`/api/chat`) 支持 `"think": false` 参数

### 解决方案
1. **切换到 Ollama 原生 API**：`/api/chat` 代替 `/v1/chat/completions`
2. **请求体中设置 `"think": false, "stream": false`**
3. **响应格式兼容**：原生接口返回 `{ message: { content } }` 而非 `{ choices: [{ message: { content } }] }`
4. **代码中保留双模式切换**：`USE_OLLAMA_NATIVE` 开关，方便在本地 Ollama 和云端 GLM-4 之间切换

```javascript
// Ollama 原生接口
requestBody = {
    model: AI_MODEL,
    messages: [...],
    think: false,      // 关闭思考模式
    stream: false,     // 非流式
    options: { num_predict: maxTokens, temperature: 0.85 }
};
```

### ⚠️ 开发注意
- **小模型（≤4B）的思考模式是陷阱**：思考消耗的 token 远超实际回复，得不偿失
- **始终在 `callLLM` 返回内容中清理 `<think>` 标签**：即使关了 think，有些模型仍会在 content 里输出思考过程
- **切换 LLM 后端时，一定要测试返回格式**：不同 API 的 JSON 结构不同（OpenAI 格式 vs Ollama 原生格式）
- **建议保留 `<think>` 正则清理作为兜底**：`content.replace(/<think>[\s\S]*?<\/think>/g, '')`

---

## 🔥 坑7：callLLM 全部静默失败 — 所有对话变"嗯嗯。"

### 问题现象
所有 NPC 的所有对话内容都是 `"嗯嗯。"`，看起来游戏在正常运行，但实际上 LLM 完全没有工作。

### 问题根因
旧版 `callLLM` 的错误处理太弱：
1. API 调用失败只 `console.error` 然后返回 `null`
2. 没有重试机制，一次失败就放弃
3. 对话系统收到 `null` 后无条件 fallback 到固定的 `'嗯嗯。'`
4. 没有全局 API 状态跟踪，无法判断是偶发失败还是系统性故障
5. API 宕机时仍然持续发请求，浪费资源

### 解决方案
1. **全局 `LLM_STATUS` 状态跟踪**：记录总调用/成功/失败次数、连续失败数、最后错误信息
2. **重试机制**：每次调用最多重试 2 次（共 3 次），429 错误时递增等待
3. **宕机保护**：连续失败 10 次 → 暂停 60 秒，避免无意义请求风暴
4. **对话中断保护**：连续 3 轮 fallback → 自动结束对话，不再浪费 API 请求
5. **Fallback 多样化**：8 种不同的随机回复替代固定的"嗯嗯。"
6. **Debug 面板显示 API 状态**：实时查看 API 健康度和错误信息

### ⚠️ 开发注意
- **LLM API 是不可靠的外部依赖**，必须假设它随时会失败
- **静默失败是最危险的 bug**——看起来一切正常，但实际功能完全丧失。一定要在 UI 上显示 API 状态
- **Fallback 回复一定要有多样性**，否则一眼就能看出系统坏了
- **对话循环中要检测 API 状态**，不要在 API 已宕机的情况下还持续发请求
- **控制台日志要分级**：正常调用 `console.log`、异常 `console.warn`、错误 `console.error`

---

## � 坑8：think↔action 系统打架 — NPC 走一半转头

### 问题现象
NPC 收到 `think()` 的 `wantChat` 指令后开始走向聊天目标，但走到一半突然转头去了别的地方。或者 NPC 正在走向某人聊天，突然被日程系统拉走。

### 问题根因
NPC 有多个独立的 AI 系统同时运行，它们之间缺乏协调：
1. **`think()` 设置 `_chatWalkTarget`** 让 NPC 走向聊天目标
2. **`_actionDecision()` 不检查 `_chatWalkTarget`**，在 NPC 走向聊天目标途中发出新行动指令
3. **`_triggerStateOverride()` 不清除 `_chatWalkTarget`**，状态覆盖后 NPC 既在执行新任务又记着旧的聊天目标
4. **日程切换不保护 `_chatWalkTarget`**，日程变化直接覆盖导航路径

### 解决方案：多系统协调保护
1. `_actionDecision()` 入口：`if (this._chatWalkTarget) return;`（走向聊天目标时不做新决策）
2. `_triggerStateOverride()`：清除 `_chatWalkTarget` 并记录日志（状态覆盖 > 社交意愿）
3. `_executeAction()`：清除 `_chatWalkTarget` 并记录日志（行动执行 > 社交意愿）
4. `_updateSchedule()` 日程切换：检查 `_chatWalkTarget`，社交走路中只更新索引不干预导航
5. **走路途中距离检测**：持续检测与目标距离，≤4 格时提前发起对话
6. **走路途中目标离开检测**：目标离开同场景时放弃追踪并显示失望表情

### ⚠️ 开发注意
- **NPC 的多个 AI 子系统之间必须有明确的优先级**：状态覆盖 > 行动执行 > 社交走路 > 日程
- **任何新增的"打断当前行为"逻辑，都要清理 `_chatWalkTarget`**
- **走路目标不是一次性设置就不管了**，途中要持续监控目标状态变化
- **设置了走路目标后，要防止其他系统在途中覆盖路径**

---

## 🔥 坑9：属性惩罚力度不够 — NPC 对危险状态无感

### 问题现象
NPC 的 San 值/健康值已经很低了，但他们的行为没有任何改变，依然按日程闲逛，不会主动去治疗。LLM 生成的对话和行动决策中也看不出焦虑感。

### 问题根因
1. **状态覆盖触发阈值太低**：San<25 才触发去医院，NPC 在 25-50 之间的漫长区间内毫无反应
2. **Prompt 中属性提示太温和**：`"你精神状态很差"` 这种描述对 LLM 来说不够紧迫
3. **缺乏连锁惩罚**：属性值低没有实际的游戏机制惩罚，只是一个数字
4. **缺乏恶性循环**：San 值低不会导致其他属性加速下降，NPC 感受不到"越来越差"

### 解决方案：10 种连锁惩罚 + Prompt 焦虑增强

**连锁惩罚机制**：
| 惩罚 | 触发条件 | 效果 |
|------|----------|------|
| 体力消耗加速 | 健康<30/50 | ×1.5/×1.2 |
| 食欲不振 | San<25/40 | 体力恢复效率 ×0.5/×0.7 |
| 工作效率下降 | San<20/40 + 健康<25/50 | 赚钱效率 ×0.3~1.0 |
| 社交质量降低 | San<30 | 魅力/情商提升减半 |
| 魅力/情商持续下降 | San<25~30 | 额外衰减 |
| San 恶性循环 | San<30 | 额外加速下降 |
| 健康拖累 San | 健康<35 | 额外 San 下降 |
| 压力致病 | San<25 + 健康<50 | 随机触发生病 |
| 移动减速 | 健康<25/40, San<20 | 速度 ×0.6~0.8 |
| 对话伤害加大 | San<15/25 | 伤害 8/4, 好感-4/-2 |

**Prompt 焦虑增强**：用 🚨🚨 和 `!!` 标记紧急程度，明确告知后果链（"你会发疯、攻击朋友"），多重危险叠加时额外 🆘 警告。

**状态覆盖阈值提升**：San<35 和 健康<35 就触发自动去医院（原来<25）。

### ⚠️ 开发注意
- **属性系统不是数值模拟器**——它必须通过实际的游戏机制惩罚/奖励来影响 NPC 行为
- **LLM 对"温和提示"不敏感**，必须用强烈的语气（🚨、!!、"立刻"、"必须"）才能驱动它做出紧急行动
- **连锁惩罚要形成恶性循环**：一个属性差 → 拖累其他属性 → 让 NPC 真正感到"越来越差"
- **奖惩机制的核心是让 NPC 的行为有目的性**：不是为了折磨 NPC，而是让他们主动追求目标、回避危险
- **Debug 面板中要能实时看到惩罚状态**，否则很难调试和验证机制是否生效

---

## 🔥 坑10：对话只有1句（第二层）— async think/action 在 await 后覆盖 CHATTING 状态

### 问题现象
修复了坑1（隔空对话/传送保护）后，仍然有大量对话只有1句就结束。第一个NPC成功打了招呼（内容是有意义的长句），但第二个NPC完全没回复。LLM成功率99.5%，排除API失败。

### 第一轮排查（坑1扩展修复）
首先排查了 `_followPath` 在 CHATTING 期间仍然执行的问题：

**第一层问题**：`startNPCChat` 设置了双方 `state = 'CHATTING'`，但没有清除他们正在执行的路径（`currentPath`、`isMoving`、`_pendingEnterScene` 等）。在 `await callLLM` 等待LLM响应期间，`_followPath` 继续执行，NPC走完路径后 `state` 被重置为 `IDLE`，然后触发进门传送。

**修复**：
1. `startNPCChat` 中设置CHATTING后立即清除双方所有移动状态
2. `_followPath` 入口加CHATTING检查
3. `_updateDoorWalk` 入口加CHATTING检查
4. `_teleportTo` 加CHATTING跨场景传送保护（最终防线）
5. 入睡判定加CHATTING检查
6. 强制回家导航加CHATTING检查

**但修复后问题依然存在！**

### 第二轮排查（真正的根因）

加入服务端调试日志后发现：对话循环的3个中断条件（LLM宕机/fallback过多/场景不同）**都没有触发**。对话循环根本没进入循环体就结束了。

**真正的根因：`think()` 和 `_actionDecision()` 是 async 函数。它们在 `await callLLM` 之前检查了 `state !== 'CHATTING'`（通过），但在 `await` 等待LLM响应的10-60秒内，NPC可能被另一个NPC发起对话设为 CHATTING。当LLM响应回来后，这些 async 函数继续执行决策代码，无条件地：**
- 把 `state` 改成 `'WALKING'`（覆盖了 CHATTING）
- 设置新的 `currentPath`（让NPC开始走路）
- 甚至触发 `startNPCChat`（让NPC发起新对话）

**完整时序**：
```
T0: NPC_A.think() 开始, state=IDLE, 发送LLM请求, await等待
T1: NPC_B.think() 完成, 决定找A聊天 → startNPCChat(B, A)
    → A.state='CHATTING', 清除路径
T2: _processNPCChat开始, B打招呼(await LLM)
T3: A的think()的LLM响应回来, 继续执行:
    → A.state='WALKING'  ← 覆盖了CHATTING！
    → A.currentPath=[...] ← 新路径！
T4: update中_followPath执行 → A走向新位置 → 进入建筑 → currentScene改变
T5: 对话循环检查场景 → A和B不在同一场景 → 对话中断！只有1句
```

### 解决方案：4层async防护 + 最终防线

1. **`think()` 的 `await callLLM` 之后**：重新检查 `state === 'CHATTING'`，是则放弃决策
2. **`_actionDecision()` 的 `await callLLM` 之后**：同样的CHATTING检查
3. **`_executeAction()` 入口**：CHATTING时不执行任何行动
4. **`_navigateToScheduleTarget()` 入口**：CHATTING时不执行导航
5. **`_teleportTo()` 入口**（最终防线）：CHATTING时禁止跨场景传送

### ⚠️ 开发注意（极其重要的通用原则）
- **所有 async 函数在 `await` 之后都必须重新检查前置条件**。不要假设 `await` 前后NPC的状态不变！这是 JavaScript 异步编程的基础但极易遗忘的问题
- 对话系统的 `CHATTING` 状态必须被视为**最高优先级锁**，任何其他系统都不能在未检查的情况下覆盖它
- **新增任何设置 `state`、`currentPath`、`currentScene` 的代码前，都要先问：此时NPC可能在CHATTING吗？**
- 修复这类问题时，**分层防御**比单点修复更可靠：不光在 `startNPCChat` 入口做清理，还要在 `_followPath`、`_teleportTo`、`_navigateToScheduleTarget` 等关键节点加保护
- 这个坑的本质是 **async 竞态条件（race condition）**，在有多个并发 async 任务的系统中普遍存在

---

## 🔥 坑11：对话没有上下文 — NPC每次聊天都像第一次见面

### 问题现象
两个NPC昨天才大吵了一架（好感度下降、进入冷淡期），今天见面却完全和好如初，热情地打招呼、聊天。对话内容完全没有反映他们之间的关系状态。

### 问题根因
对话生成的 `systemPrompt`（在 `_generateNPCLineWithEnd` 中）只传入了以下信息：
- ✅ 名字、年龄、性别、职业、性格、心情
- ✅ San值影响（低San → 攻击性）
- ❌ **好感度** — 完全没有告诉LLM两人关系如何
- ❌ **近期对话记忆** — 完全没有告诉LLM之前聊过什么/吵过什么
- ❌ **冷淡期状态** — 吵架后的冷淡期数值存在，但没传给LLM

好感度系统和吵架惩罚在 `_analyzeDialogue`（对话结束后的分析）中正确地修改了数值，但这些数值**从来没有反馈到对话生成的prompt里**。这是一个经典的**数据闭环断裂**问题：数值被正确更新了，但在需要使用的地方没有读取。

### 解决方案：对话prompt注入3项关键上下文

#### 1. 好感度 → 关系描述
根据 `speaker.getAffinity(listener.id)` 的值，生成不同的关系描述：
```
≥ 90：知心好友，热情亲切
≥ 70：不错的朋友，轻松自然
≥ 50：普通邻居/熟人，比较客气
≥ 30：关系较差，态度冷淡、敷衍
< 30：关系很差，冷嘲热讽、不耐烦
```

#### 2. 冷淡期状态
检查 `speaker._affinityCooldown[listener.id]`，如果 > 0 说明刚吵过架：
```
😤 你们最近刚发生过争执/吵架，你现在对XX还有气（冷淡期还剩约N分钟）。
说话带刺、冷淡、不想搭理对方。除非对方真诚道歉，否则不会轻易原谅。
```

#### 3. 近期对话记忆
从 NPC 的 `memories` 数组中筛选与对方相关的最近3条记忆，包含对话最后2句摘要：
```
你和XX的近期记忆：
[D1 14:00] 与XX聊了5句（XX:你这话什么意思？ / 你:算了不说了）
[D1 09:00] 与XX吵了一架（XX:你太过分了！ / 你:你才过分！）
```

#### 4. 规则调整
第3条规则从泛泛的"要体现关系"改为强硬的：
> "你的说话态度、语气必须**严格符合**上面描述的关系状态和好感度。关系差就态度差，刚吵过架就冷淡。"

### ⚠️ 开发注意
- **NPC的数值系统和AI对话系统是两个独立管线**，修改了数值不代表AI会感知到——必须在prompt中显式注入
- 这是一个通用问题：**任何影响NPC行为的数据，都必须同时出现在两个地方：(1)游戏机制代码 (2)LLM prompt**
- 关系描述要**量化**（告诉LLM好感度数值），不要只给模糊的词语。LLM需要具体数字来判断语气程度
- 记忆注入时**控制数量和长度**（最近3条，每条最后2句摘要），避免prompt过长导致token浪费
- **新增任何NPC间的互动系统（交易、合作、冲突等），都要问：这个状态有没有注入对话prompt？**

---

## 🔥 坑12：调试日志只在浏览器端 — 关键中断信息无法服务端追踪

### 问题现象
对话系统有大量 `console.log` / `console.warn` 调试日志，但这些**只在浏览器控制台显示**。当用户报告问题（如对话只有1句）时，开发者无法从服务端日志中看到中断原因，只能看到结果（"对话结束(1句)"），无法看到过程。

### 问题根因
对话系统的 `_processNPCChat` 中有多个中断检查点：
```javascript
if (LLM_STATUS.isDown) { console.warn('[对话中断] API宕机'); break; }
if (fallbackCount >= 3) { console.warn('[对话中断] 连续fallback'); break; }
if (npc1.currentScene !== npc2.currentScene) { console.warn('[对话中断] 场景不同'); break; }
```

这些 `console.warn` 都只在浏览器端输出。但服务端的 debug log 系统是通过 `npc._logDebug()` → HTTP请求 → 服务器写文件。**关键的中断原因信息没有走服务端日志通道。**

### 解决方案
把对话循环中所有关键的状态日志都改为同时使用 `_logDebug`：
```javascript
npc1._logDebug('chat', `对话循环开始 maxTurns=${chat.maxTurns} 场景=${npc1.currentScene}/${npc2.currentScene}`);
npc1._logDebug('chat', `循环i=${i} 场景=... state=... isDown=... fbCount=...`);
npc1._logDebug('chat', `⚠️对话中断: 场景不同 ...`);
```

### ⚠️ 开发注意
- **区分"开发调试日志"和"运行监控日志"**：`console.log` 只适合开发时实时调试，生产运行的关键状态必须持久化到服务端
- 对话系统是**跨多个 await 的长时间异步流程**，中间状态尤其重要——必须记录每一步的关键状态
- 日志要带**足够的上下文**：不只是"中断了"，还要带上"为什么中断"（场景值、state值、LLM状态等）
- **每个新增的 `break`/`return`/错误退出点，都应该配套一条 `_logDebug`**，否则事后根本无法排查
- 这个经验也适用于任何后端服务：**关键流程的每个分支都要有日志，尤其是异常/提前退出分支**

---

## 🔥 坑14：健康/死亡链路过于宽松 — NPC饥饿失温很久都不会死

### 问题现象
NPC饱腹值为0、体温低于33°C，持续了很长时间（数小时游戏时间），但健康值下降极慢，NPC始终不会死亡。游戏完全没有生存紧迫感。

### 问题根因
1. **健康扣减速率太低**：饥饿时健康扣减仅0.05/秒，从100降到0需要33分钟，期间暖炉恢复就能抵消
2. **没有"健康归零→死亡"的明确链路**：健康值到0后NPC仍然存活，缺乏最终致死判定
3. **失温没有独立致死机制**：体温低只是减速，没有直接导致健康快速下降
4. **缺乏濒死状态**：NPC从健康100到死亡是一个平滑过程，没有"最后警告"阶段

### 解决方案
1. **饥饿加速致死**：饱腹=0持续>4小时 → 健康扣减提升为0.15/秒（约11分钟从100到0）
2. **严重失温致死**：体温<33°C持续>30分钟 → 健康扣减0.2/秒（约8分钟致死）
3. **濒死状态**：饱腹=0 + 体力=0 + 健康<30 → 停止所有活动，5分钟内无救助则死亡
4. **健康归零30秒内死亡**：明确的最终致死时间窗口

### ⚠️ 开发注意
- **健康/死亡链路必须有明确的数值推演**：设计时先算"从满血到死亡需要多久，中间有哪些阶段"
- **生存游戏的死亡不能太难触发**：如果NPC永远不会死，玩家就没有紧迫感
- **多条件叠加要比单条件严重得多**：饥饿+失温+体力耗尽应该是快速致命的

---

## 🔥 坑15：物资收支不平衡 — 采集速度赶不上消耗或远超消耗

### 问题现象
两个极端：(1) NPC一直在采集但物资数值不涨，消耗远大于收集；(2) 物资疯涨到几千单位，游戏毫无挑战。

### 问题根因
1. **没有先设计消耗量再反推采集速率**：采集速率是拍脑袋定的数字
2. **没有考虑"有效工作时间"**：NPC不是24小时工作，扣除睡眠/吃饭/聊天后实际采集时间可能只有6-8小时
3. **专长加成被忽视**：赵铁柱砍柴1.5x加成叠上去后产出可能翻倍

### 解决方案
**先算消耗，再反推采集**：
- 木柴：1座暖炉2.5/h×24h=60单位/天 → 2人砍柴8小时需产≥70 → 基础速率=8/h
- 食物：8人×1.5/餐×2餐=24/天 → 2人捕鱼6小时需产≥30 → 基础速率=5/h
- 电力：3/h×24h=72/天 → 1人工作6小时需产≥80 → 基础速率=12/h

### ⚠️ 开发注意
- **物资系统必须先设计消耗→反推采集→验证可玩性**
- **日结算报告中要显示收支对比**，方便验证平衡性
- **留10-20%余量**：采集能力略大于消耗，但不能差太多

---

## 🔥 坑16：任务目标"过家家" — NPC假装做事但没有实际效果

### 问题现象
NPC状态显示"修理无线电"、"建造暖炉"、"准备御寒物资"，但游戏中完全没有任何实际效果。无线电永远修不好，暖炉数量不变，御寒物资不存在。

### 问题根因
`task-system.js`中定义了任务类型和描述，但`_applyTaskEffect`中对应的case是空的（`break;`），没有任何效果逻辑。任务只有"进度"（一个浮点数），完成后什么都不会发生。

### 解决方案
**每个任务必须有可验证的游戏效果**：
- 修理无线电 → 追踪修理进度，完成后标记`_radioRepaired=true`，第4天可触发救援
- 急救包制作 → 每2小时产出1份，可对健康<40的NPC使用
- 暖炉建造 → 消耗建材+木柴，完成后在宿舍B激活第二暖炉
- 食物分配 → 实际消耗食物储备，全员饱腹恢复

### ⚠️ 开发注意
- **每个任务目标必须有effectType回调和可验证的游戏效果（不允许"假装做事"）**
- 新增任务时必须同时实现：(1) 任务定义 (2) 效果回调 (3) UI反馈 (4) 事件日志通知
- 用空`break;`占位可以，但必须在TODO中标注并尽快实现

---

## 🔥 坑17：NPC"说到不做到" — think()产生结论但不行动

### 问题现象
NPC的AI思考产生了"必须去砍柴"的结论，对话中也说"我要去伐木场"，但NPC站在原地不动，30秒后又开始闲聊。

### 问题根因
1. **think()和行动系统断裂**：think()产生的结论只影响了对话内容，没有触发实际的导航/任务分配
2. **没有"说到做到"的强制执行机制**：NPC说了要去砍柴，但没有系统确保他真的去了
3. **多系统竞争覆盖**：即使设置了任务，日程系统或其他覆盖系统可能立即把它覆盖掉

### 解决方案
1. **资源紧急自动分配**：`_checkResourceUrgency`每2秒检查，critical时自动`activateTaskOverride`
2. **urgent任务打断聊天**：收到urgent任务时`_forceEndChat`强制结束当前对话
3. **资源critical禁止闲聊**：`_canChatWith`中检查资源紧急度，critical时返回false
4. **CHATTING中定期检查**：update中每5秒检查资源，critical时强制结束聊天

### ⚠️ 开发注意
- **think()产生的行动结论必须有强制执行机制**，不能只靠NPC"自觉"
- **紧急任务必须能打断低优先级活动**（聊天、闲逛等）
- **行动链路要端到端验证**：从think产生结论 → 分配任务 → 中断当前活动 → 导航到目标 → 开始工作

---

## 🔥 坑18：UI信息被遮挡 — 核心资源数值看不到

### 问题现象
物资栏（木柴/食物/电力/建材）被天气面板、survival-bar、游戏画布等元素遮挡，玩家无法看到当前资源数值。

### 问题根因
1. **物资栏放在了容易被遮挡的位置**（底部或侧边）
2. **z-index没有正确设置**：物资栏的层级低于其他UI元素
3. **没有考虑不同分辨率下的布局**：小屏幕上元素重叠更严重

### 解决方案
1. **物资栏移到顶部**：紧贴survival-bar下方，作为第二行固定显示
2. **z-index设为高优先级**：确保不被游戏画布和其他面板遮挡
3. **数值变化动画**：增加=绿色闪烁，减少=红色闪烁，让变化一目了然

### ⚠️ 开发注意
- **核心资源信息必须在最高z-index层可见**
- **玩家需要随时看到的信息（资源、温度、天数）必须固定在屏幕边缘**，不能被任何其他元素遮挡
- **UI设计时先考虑"最小屏幕"**：确保在最小支持分辨率下所有关键信息都可见

---

## 🔥 坑19：NPC闪现传送 — 进屋瞬间被传送到室外（多系统决策竞争）

### 问题现象
三种典型表现：
1. NPC说"饿了"跑进炊事房，**瞬间出现在室外南门附近**，然后说要发电
2. NPC说"太累了要回宿舍休息"，**一进屋就被传送到外面**，然后说饿了
3. NPC在移动途中**反复改变目标**（饿了→发电→饿了→休息），在村庄门口附近原地打转

这是项目中最难修复的 bug，涉及 6 条触发路径、多系统同帧竞争、跨场景导航中转机制等深层架构问题，历经多轮分析和 9 项修复任务才彻底解决。

### 问题根因

#### 核心1：所有跨室内场景导航必须经 village 中转

游戏架构中，NPC从一个室内场景（如宿舍 `dorm_a`）到另一个室内场景（如厨房 `kitchen`），**必须先传送到 village 场景**再走进目标建筑。导航链路：

```
_navigateToScheduleTarget('kitchen_door')
  → loc = SCHEDULE_LOCATIONS['kitchen_door']  (scene: 'village')
  → loc.scene('village') !== currentScene('dorm_a')
  → _walkToDoorAndExit(game, null)
    → dist <= 2 ? 直接 _teleportTo('village', doorPos.x, doorPos.y) ← 【瞬间传送！】
    → 否则 _walkingToDoor = true → 走到门口 → 超时也直接传送
```

关键问题：NPC 被传送进入室内时位置在门口附近（`dist <= 2`），**此时任何系统触发跨场景导航都会瞬间传送回 village**——这就是"进屋就被闪现到屋外"的根因。

#### 核心2：多系统同帧竞争互相覆盖路径

NPC 到达 village 后，**下一帧**多个系统同时检测并争抢控制：
- P0 检测到体力低 → 导航到宿舍
- 饥饿系统检测到 hunger 低 → 导航到厨房
- P1 任务系统检测到任务未完成 → 导航到工坊
- 日程系统检测到日程未到达 → 导航到日程目标

这些系统互相覆盖路径，NPC 每帧被拉向不同方向，在门口外反复闪现。

#### 核心3：`activateTaskOverride` 不检查饥饿状态

任务系统在 NPC `hunger=0` 时仍然激活 P1 任务覆盖。`_triggerHungerBehavior` 只清除了 `_actionOverride`，没有清除 `_taskOverride`，导致饥饿系统和任务系统交替覆盖路径。

### 闪现的 6 条触发路径

| # | 触发源 | 代码方法 | 典型场景 |
|---|--------|----------|----------|
| A | 饥饿系统 | `_triggerHungerBehavior` → `_navigateToScheduleTarget('kitchen_door')` → `_walkToDoorAndExit` | NPC 在宿舍，饥饿触发去厨房 |
| B | P0 体力不支 | `_updateP0Check` → `_navigateToScheduleTarget(homeName+'_door')` → `_walkToDoorAndExit` | NPC 在厨房吃饭，体力低触发回宿舍 |
| C | P1 任务导航 | `_updateTaskOverrideNavigation` → `_navigateToScheduleTarget(targetLocation)` → `_walkToDoorAndExit` | NPC 在宿舍，任务系统分配去工坊 |
| D | 状态覆盖 | `_triggerStateOverride` → `_navigateToScheduleTarget(target)` → `_walkToDoorAndExit` | NPC 在厨房，体力极低触发回宿舍睡觉 |
| E | 日程导航超时 30s | `_teleportTo(locT.scene, locT.x, locT.y)` | 导航卡住，直接跨场景传送 |
| F | P1 任务导航超时 60s | `_teleportTo(targetLoc.scene, targetLoc.x, targetLoc.y)` | 任务导航卡住，直接跨场景传送 |

### 解决方案：5 层防护体系

#### 第一层：进屋保护期（3 秒冻结跨场景导航）

NPC 被传送进入室内时（`_teleportTo` 中 `scene !== 'village'`），设置 `_indoorEntryProtection = 3`（3 秒保护计时器）。在保护期内，`_navigateToScheduleTarget` 遇到需要出门的导航（目标场景 ≠ 当前场景）直接 `return`，不执行。

```javascript
// _teleportTo 中设置
if (scene !== 'village') {
    this._indoorEntryProtection = 3; // 3秒保护期
}

// _navigateToScheduleTarget 开头检查
if (this._indoorEntryProtection > 0 && this.currentScene !== 'village') {
    const loc = SCHEDULE_LOCATIONS[targetKey];
    if (loc && loc.scene !== this.currentScene) return; // 阻止出门
}
```

#### 第二层：出门过程保护（`_walkingToDoor` 期间阻止新导航）

NPC 正在走向室内门口准备出门时（`_walkingToDoor = true`），以下系统跳过执行：
- `_triggerHungerBehavior`、`_triggerStateOverride`、`_updateTaskOverrideNavigation`
- 例外：P0 致命紧急（`health < 10` 或 `bodyTemp < 33`）可穿透

#### 第三层：决策锁定（饥饿/任务/状态覆盖互斥）

| 触发系统 | 保护规则 |
|----------|----------|
| `activateTaskOverride` | hunger<25 或 `_hungerOverride=true` 且非 urgent → 拒绝任务；`_stateOverride` 存在 → 拒绝任务 |
| `_triggerHungerBehavior` | `_priorityOverride` 存在且 hunger≥10 → 跳过饥饿触发（让 P0 先完成） |
| `_updateTaskOverrideNavigation` | `_hungerOverride` 或 `_stateOverride` 存在 → 取消任务导航 |
| 60s 任务超时 | `_hungerOverride` 或 `_stateOverride` 存在 → 取消任务而非传送 |

饥饿触发时同时处理任务覆盖：hunger<15 彻底取消任务；hunger≥15 暂停任务。

#### 第四层：P0 复合需求仲裁

NPC 同时饿+累时，按严重程度排序（避免在宿舍和厨房间反复闪现）：
- `hunger < 10`（极度饥饿）→ 跳过 `stamina_critical`，让饥饿系统处理
- `hunger < 35 && stamina < 10`（都极低）→ 优先吃饭（吃饭只需 8 秒更快完成）
- `hunger >= 10 && stamina < threshold` → 先回宿舍休息

P1 层增加一致性检查：`_hungerOverride` 和 `_taskOverride.isActive` 同时为 true 时，强制取消任务覆盖。

#### 第五层：LLM 感知（prompt 注入覆盖状态）

在 `think()` 方法的 prompt 中注入当前覆盖状态：
- `_hungerOverride` → "🍽️ 我正在去吃饭，不要改变目标"
- `_taskOverride.isActive` → "📋 我正在执行任务：{taskId}"
- `_stateOverride` → "🚨 紧急处理中，不要干预"
- `_priorityOverride` → "⚠️ P0 紧急状态"

引导 LLM 不要做出与当前行为冲突的决策。

### ⚠️ 开发注意
- **跨场景导航是高风险操作**：NPC 从室内 A 到室内 B 必须经 village 中转，任何调用 `_navigateToScheduleTarget` 的代码都要问——此时 NPC 可能刚进入室内吗？（参见坑 8：think↔action 系统打架）
- **新增驱动 NPC 移动的系统时**，必须定义与现有系统（饥饿/任务/状态覆盖/P0）的优先级关系和互斥规则
- **`_walkToDoorAndExit` 的 `dist <= 2` 瞬间传送**是闪现的直接触发点——如果不加进屋保护期，NPC 刚进门就会被传送出去
- **多系统同帧竞争**的根本解法是互斥锁和仲裁，而不是"谁先执行谁说了算"
- **不要信任 LLM 的自觉**：即使 prompt 中提到了"正在吃饭"，LLM 仍可能决定做别的事——必须在代码层做硬保护
- **debug 日志是定位此类 bug 的唯一手段**：每个保护点都要 `console.log` 和 `_logDebug`，记录被阻止的操作和原因

---

## 🔥 坑20：P0紧急导航到户外暖炉广场 — NPC站在室外无法恢复

### 问题现象
两种典型表现：
1. NPC 显示"⚡ 体力不支！暂停任务回暖炉休息"，但**站在户外暖炉广场原地不动**，不进任何建筑，体力/San 持续下降却无法恢复
2. NPC 的 San 值已经 **100（满值）**，但仍然在执行"巡逻+San"行为，气泡始终显示"San+18.0/h"，浪费行动力

### 问题根因

#### 根因1：P0 紧急导航目标 `furnace_plaza` 是户外坐标

P0 系统中多个紧急分支的导航目标都是 `furnace_plaza`（村庄广场的暖炉位置）：
- **P0-3**（San 极低）→ 导航到 `furnace_plaza`
- **P0-4**（体力极低）→ 导航到 `furnace_plaza`
- **P0-6**（复合危机）→ 导航到 `furnace_plaza`

问题在于 `furnace_plaza` 是 **village 场景中的一个户外坐标**。NPC 到达后处于室外，而游戏中的恢复机制（暖炉加温、睡眠恢复、室内 San 回升等）都绑定在**室内场景**中。NPC 站在户外无法触发任何恢复逻辑，P0 清除条件（如体力>阈值）永远达不到，导致 NPC 一直卡在户外。

#### 根因2：`patrol_bonus` 不排除自身且气泡不检查属性上限

巡逻系统在计算 `patrol_bonus`（巡逻加成效果）时：
- **不排除自身**：NPC 给自己也加了 San bonus，导致 San 已满的 NPC 仍然获得"+San"效果（实际上被 `Math.min(100, ...)` 截断了，但气泡仍显示）
- **气泡不检查上限**：气泡显示逻辑只看"是否有 bonus 效果"，不检查 San 是否已经 100，导致满 San 仍显示"San+18.0/h"

### 解决方案

#### 1. 所有 P0 紧急导航改为宿舍入口

将 P0-3/P0-4/P0-6 的导航目标从 `furnace_plaza` 改为 `this.homeName + '_door'`（NPC 所属宿舍的入口）：

```javascript
// 修复前
this._navigateToScheduleTarget('furnace_plaza');

// 修复后
this._navigateToScheduleTarget(this.homeName + '_door');
```

NPC 导航到宿舍入口后，会自动进入室内，室内的暖炉/睡眠系统自然接管恢复流程。

#### 2. `patrol_bonus` 效果排除自身

```javascript
// 巡逻加成计算时排除自身
const nearbyNPCs = allNPCs.filter(other => 
    other.id !== this.id && // 排除自身
    other.currentScene === this.currentScene &&
    distance(this, other) <= PATROL_RANGE
);
```

#### 3. 气泡动态显示（检查属性上限）

```javascript
// 气泡显示前检查属性是否已满
if (this.san >= 100) {
    // 不显示 "San+X/h" 气泡，或改为显示 "San已满"
}
```

### ⚠️ 开发注意
- **P0 紧急目标必须是 NPC 能实际恢复的室内位置**——不能导航到户外坐标（如 `furnace_plaza`），因为户外没有恢复机制
- **正确的 P0 紧急目标是 `this.homeName + '_door'`**：导航到宿舍入口→自动进入室内→暖炉/睡眠系统接管恢复
- **新增任何"紧急回家"类逻辑时**，一定要验证目标位置是否在室内场景中，室外坐标会导致 NPC 永远无法恢复
- **效果类系统（bonus/buff）必须排除自身**，否则会出现"自己给自己加 buff"的逻辑错误
- **UI 气泡/状态显示必须检查边界条件**：属性已满时不应显示"+X"效果，属性为 0 时不应显示"-X"效果（参见坑 9：属性惩罚力度）

---

## 🔥 坑21：难度选择器藏在按钮后面 — 用户发现不了功能

### 问题现象
难度选择器被设计为点击"轮回模式"按钮后才弹出，用户进入开始界面时完全看不到有难度选项。而且弹出后还需要再点一次"开始轮回"确认按钮才能启动游戏，操作链路过长。

### 问题根因
1. **功能隐藏在交互后面**：难度选择器默认 `display:none`，只有点击轮回模式按钮后才显示。用户在开始界面看不到任何关于难度的信息，不知道游戏有难度选择功能。
2. **多余的确认步骤**：选好难度后还需要点击独立的"开始轮回"按钮，而不是直接用已有的"轮回模式"按钮启动。
3. **轮回中途锁定缺失**：有存档时不能直观看出当前难度是什么，也没有锁定机制告诉用户"轮回中不能切换"。

### 解决方案
1. **难度选择器始终可见**：移除 `display:none`，直接嵌入开始界面模式按钮下方，与"选择AI模型"区域风格一致
2. **去掉确认按钮**：选好难度 → 点"轮回模式" → 直接启动游戏，减少一步操作
3. **提示文案**：添加"难度仅在轮回模式生效 · 轮回中途无法切换"的说明
4. **视觉锁定**：有存档时卡片半透明不可点击，当前难度标🔒；勾选"从第1世重新开始"才解锁重选

### ⚠️ 开发注意
- **功能入口必须在界面上直接可见**：不要把重要功能藏在"点击后才显示"的弹出层里，用户不知道点了才有
- **减少操作步骤**：如果一个按钮（"轮回模式"）可以直接完成启动，就不要再加一个确认按钮
- **锁定状态要有视觉反馈**：用户需要直观看到"这个选项现在不能改"，而不是点了没反应还以为是bug
- **设计UI交互时先画用户操作流程图**：从"用户进入界面"到"开始游戏"最少需要几步？能不能再少一步？

---

## 🔥 坑28：底图加载后画面变脏 — 预烘焙底图与代码渲染不一致

### 问题现象
游戏启动第一瞬间画面干净整洁（纯色 fallback 渲染），约1秒后底图 PNG 加载完成，画面反而变脏——雪地上出现大量黑色小方块（3-5px）、tile 级别的棋盘格色差、围墙区域深棕色整格方块。问题持续了5轮排查才最终解决。

### 问题根因

**底图 PNG 和 JS 代码使用了不同版本的地面颜色逻辑：**

项目中存在两套地面颜色计算代码：
1. `maps.js` 中的 `getTileColor()` — JS 版本（已修复，使用噪声插值）
2. `generate-map-base.py` 中的 `get_tile_color()` — Python 版本（旧版，包含棋盘格逻辑）

底图 PNG 是用 Python 脚本生成的**静态文件**，修改 JS 代码时**没有同步更新 Python 脚本并重新生成底图**。

Python 旧版的三个致命缺陷：
| 缺陷代码 | 产生的视觉问题 |
|----------|---------------|
| `(x + y) % 5 == 0 → GRASS_DARK` | 安全区内对角线深色条纹 |
| `(x + y) % 3 == 0` 和 `(x + y) % 7 == 0` | 外围雪原密集棋盘格 |
| 围墙格 `return C.FENCE`（深棕色） | 围墙位置整格 32px 暗色方块 |

排查过程中还遇到了两个加重问题的因素：
- **浏览器缓存**：没有 `Cache-Control` 头 + 没有 JS 版本号参数 = 代码更新后浏览器仍加载旧文件
- **canvas 残留**：`drawGrid` 底图分支直接 `drawImage` 不先清除视口，之前帧的渲染残留透出

### 解决方案

1. **同步 Python 和 JS 的颜色逻辑**：修改 `generate-map-base.py` 的 `get_tile_color()`，移除棋盘格，改用 `lerp_color` 噪声插值，重新生成底图
2. **底图渲染前清除视口**：`drawImage` 前先 `fillRect` 纯色覆盖
3. **浏览器缓存**：server.js 加 `Cache-Control: no-cache, no-store`，index.html JS 引用加版本号

### ⚠️ 开发注意
- **预烘焙资源（PNG/JSON等静态文件）与代码逻辑必须保持同步**。修改了 JS 中的渲染逻辑后，如果有对应的 Python 生成器用于生成静态资源，**必须同步更新生成器并重新生成**
- **两套代码做同一件事是灾难的根源**。`maps.js` 的 `getTileColor` 和 `generate-map-base.py` 的 `get_tile_color` 各有一份，修改了一个忘了另一个。**理想情况下同一个逻辑只有一个权威来源**
- **本地开发必须设置 `Cache-Control: no-cache`**。否则修改代码后浏览器不会重新加载，你以为代码没生效但其实是缓存问题——这个坑浪费了大量排查时间
- **底图渲染前必须先清除视口**。canvas 不会自动清除上一帧内容
- **像素级验证是排查渲染 bug 的终极手段**。用 Python/PIL 扫描 PNG 的像素分布、统计暗色区域、比较相邻 tile 色差，比肉眼观察准确得多

---

## 🔥 坑29：NPC 进屋堵在门口 — 室内寻路失败导致卡死

### 问题现象
NPC 进入宿舍/厨房后，全部堆在门口（y=7）位置，在门口吃饭、睡觉，不走到房间内部。

### 问题根因
所有10处进门代码都采用"**先传送到 `indoor_door` 门口 (y=7) → 再 `_pathTo` 寻路走到座位**"的两步模式。但室内空间太小（8格高），y=7 是南墙整行（仅门口2格可走），NPC 横向无法移动。家具碰撞把可走区域切分成多个独立区域，从门口到座位的寻路经常失败。寻路失败后 NPC 就卡在门口，`distToInside <= 3` 的宽松判定还会把门口误判为"已到达"。

### 解决方案
创建统一的 `_enterIndoor(targetScene, game)` 方法，**直接传送到座位位置**，完全跳过门口→寻路→座位的两步流程。全部10处进门代码统一替换。

### ⚠️ 开发注意
- **室内空间太小时（≤8格高），不要用"先传送到门口再寻路"的模式**——寻路在狭小空间极易失败
- **进门入口必须统一为一个方法**（`_enterIndoor`），避免10处代码各自实现导致修复一处漏九处
- **新增任何进门路径时，必须使用 `_enterIndoor`**，不能自行实现传送+寻路逻辑
- **室内地图设计参考**：y=0 北墙，y=h-1 南墙（仅门口2格可走），家具不要把通道完全堵死

---

## 🔥 坑30：NPC 室内位置循环重置 — `_teleportTo` 随机偏移 + `_pickIndoorSeat` 反复选座位

### 问题现象
NPC 进入室内后不断"走到一个位置就被重置位置"，反复循环，很长时间无法走出房间。

### 问题根因
v2.8 修复堵门口后引入的新循环 bug，3 个因素叠加：

1. **`_teleportTo` 默认模式有 ±1.5 格随机偏移**：`_enterIndoor` 调用 `_teleportTo` 传送到座位 (6,5)，实际传送到 (6.8, 4.2)
2. **`_navigateToScheduleTarget` 中 `_enterWalkTarget = null` 时每帧重新 `_pickIndoorSeat`**：随机选了一个不同座位 → 计算 `distToInside > 3` → 设新 `_enterWalkTarget` → `_pathTo` 导航
3. **导航完成后清空 `_enterWalkTarget` → 下一帧又重复选座位**：形成 选座位 → 导航 → 清空 → 选座位 的无限循环

同样的循环逻辑存在于 `_updateSchedule()`、`_navigateToScheduleTarget()`、`_actionOverride` 三处。

### 解决方案

#### 1. `_enterIndoor` 改为精确像素坐标
```javascript
// 修复前：_teleportTo 有 ±1.5 格随机偏移
this._teleportTo(insideLoc.scene, insideLoc.x, insideLoc.y);

// 修复后：直接设置精确像素坐标，零偏移
this.currentScene = insideLoc.scene;
this.x = insideLoc.x * TILE;
this.y = insideLoc.y * TILE;
```

#### 2. "已在室内"检查简化为直接标记到达
```javascript
// 修复前：反复选座位 + distToInside 检查 + 寻路循环
if (insideScene && this.currentScene === insideScene) {
    const seatLoc = this._pickIndoorSeat(insideScene, game); // 每帧随机选
    const distToInside = Math.abs(...); // 可能 > 3
    this._pathTo(...); // 无限循环导航
}

// 修复后：已在目标室内 → 直接到达
if (insideScene && this.currentScene === insideScene) {
    this.scheduleReached = true;
    this._enterWalkTarget = null;
    return;
}
```

### ⚠️ 开发注意
- **`_teleportTo` 的随机偏移（±1.5格）是为了让NPC不堆叠**，但在室内精确传送场景下必须避免——传送到室内座位时应直接设置像素坐标
- **"NPC 已在目标室内场景"时不要再检查"离座位多远"**——`_enterIndoor` 已经把NPC精确传送到座位了，下一帧不需要再验证位置
- **`_pickIndoorSeat` 是随机选择，每次调用可能返回不同座位**——绝不能在每帧的 update 循环中调用它，否则 NPC 会不断被分配新目标
- **修复 A 引入 B 是常见模式**：v2.8 修复了堵门口（不再经门口中转），但引入了循环重置（`_teleportTo` 偏移 + 每帧重新选座位）。**每次修复后必须验证相关联的代码路径是否受影响**

---

## 🔥 坑39：重构迁移脚本到子目录后 PROJECT_DIR 指向错误 — 启动失败

### 问题现象
v4.0 重构后执行 `python3 tools/restart.py` 启动游戏，报错 `Cannot find module '/data/project/project_revol/vibegame/20260305-gospel-snow-town/tools/server.js'`。`server.js` 明明在项目根目录，但脚本在 `tools/` 下找。

### 问题根因
重构前，`restart.py` 和 `start-tmux.sh` 都放在项目根目录，使用 `os.path.dirname(__file__)` / `dirname "$0"` 获取项目根目录——完全正确。

重构时将这些工具脚本统一迁移到 `tools/` 子目录，但**没有同步更新 `PROJECT_DIR` 的计算逻辑**。迁移后：
- `__file__` 解析为 `tools/restart.py` → `dirname` = `tools/` ← ❌ 不是项目根目录
- `$0` 解析为 `tools/start-tmux.sh` → `dirname` = `tools/` ← ❌

两个脚本都在 `tools/` 目录下找 `server.js`、写 `.server.pid`、创建 `log/` 目录，全部路径错误。

### 解决方案
两个脚本的 `PROJECT_DIR` 改为上溯一级到父目录：
```python
# restart.py
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # tools/ 的父目录
```
```bash
# start-tmux.sh
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"  # tools/ 的父目录
```
日志目录调整为 `tools/log/`（通过 `TOOLS_DIR = os.path.join(PROJECT_DIR, "tools")` 中转）。

### ⚠️ 开发注意
- **移动脚本文件位置后，必须检查脚本中所有基于 `__file__` / `$0` 计算的路径**。这些路径是相对于脚本自身位置的，脚本移动 = 所有路径偏移
- **重构迁移文件时，不能只 `cp`/`mv` 然后运行测试**——必须 `grep` 搜索文件中所有路径引用（`__file__`、`$0`、`dirname`、硬编码路径等），逐一验证是否需要调整
- **工具脚本中建议使用"显式项目根目录"而非"相对自身位置推导"**。例如在脚本开头定义 `PROJECT_ROOT = /data/project/.../20260305-gospel-snow-town`，或者通过标记文件（如 `.project-root`）向上搜索确定根目录

---

## 🔥 坑40：v4.0 重构 — 模块化拆分的陷阱和经验

### 背景
将 26,700 行的单体 JS 项目（14个文件平铺根目录）重构为 49 个模块文件、7层分类的架构。核心挑战是将 8,370 行的 `npc.js` 和 3,794 行的 `game.js` 拆分为多个文件而不破坏功能。

### 踩坑要点

#### 1. 全局变量 → GST 命名空间的兼容层
原项目所有类和函数都是全局变量（`var Game = ...`、`class NPC { ... }`），重构为 IIFE + GST 命名空间后，**所有跨文件引用都会断裂**。

**解决方案**：在 `index.html` 最后添加"向后兼容别名层"：
```html
<script>
var Camera = GST.Camera;
var Game = GST.Game;
var NPC = GST.NPC;
// ... 等等
</script>
```
这样旧代码中的 `new Game()` 仍然有效，可以渐进式迁移。

#### 2. Mixin 模式的方法挂载顺序
NPC 核心类在 `npc.js` 中定义，6 个 mixin 文件通过 `GST.NPC.prototype.xxx = function() {...}` 挂载方法。**`npc.js` 必须在所有 mixin 文件之前加载**，否则 `GST.NPC` 为 undefined。

#### 3. 数据文件必须在逻辑文件之前加载
`data/npc-configs.js` 挂载 `GST.NPC_CONFIGS`，`src/npc/npc.js` 在构造函数中读取 `GST.NPC_CONFIGS[id]`。**data/ 层必须在 src/npc/ 层之前加载**。

#### 4. SpriteLoader 的全局引用
原项目中 `SpriteLoader` 是全局变量，多个文件直接引用。重构为 `GST.SpriteLoader` 后，需要在兼容层添加 `var SpriteLoader = GST.SpriteLoader`。

### ⚠️ 开发注意
- **拆分大文件时，先画依赖关系图**：哪些文件引用了哪些全局变量/类/函数，确保加载顺序不破坏依赖链
- **Mixin 模式要求严格的加载顺序**：核心类定义 → mixin 扩展 → 使用方。index.html 中的 script 标签顺序就是加载顺序
- **向后兼容别名层是过渡期的生命线**：不要一步到位全部改为 `GST.xxx`，先加别名层保证功能正常，后续逐步迁移
- **数据与逻辑分离后，data/ 的加载优先级必须高于 src/**：数据文件是"被读取方"，必须先存在

---

## 📋 通用开发原则（从以上踩坑总结）

### 1. async 函数 await 后必须重新检查前置条件 🆕
NPC的很多操作是异步的（LLM调用、寻路、动画过渡），在 `await` 期间NPC状态可能被其他系统改变。**所有 async 函数在 `await` 之后都必须重新检查关键状态**，不要假设 `await` 前后NPC的状态不变。这是 async 竞态条件的根本解法。

### 2. 多系统竞争的安全检查
NPC有多个独立系统（日程、饥饿、状态覆盖、行动覆盖、对话、发疯...）同时运行。**每个系统在执行传送/状态切换前，都要检查当前状态是否允许**。

### 3. 超时兜底传送要加白名单检查
超时兜底传送是防卡必备的，但它是**暴力手段**，可能破坏其他系统的正常运行。新增兜底传送时，一定要排除 `CHATTING`、`isSleeping`、`isEating` 等受保护状态。

### 4. CHATTING 是最高优先级锁 🆕
对话系统的 `CHATTING` 状态必须被视为**全局最高优先级锁**。任何新增的设置 `state`、`currentPath`、`currentScene` 的代码，都要先检查：此时NPC可能在CHATTING吗？防御要分层：入口清理 + 中间节点保护 + 最终传送防线。

### 5. 室内地图设计的走廊宽度
室内地图的通道至少要 **2格宽**，单格走廊在多NPC场景下必定堵塞。

### 6. 渲染分层
需要"始终在最上层"的UI元素（对话气泡、系统提示等），一定要在独立的渲染pass中绘制，不要混入单个实体的 `draw()` 方法。

### 7. 统一信息出口
同一份数据（如NPC状态）在多处使用时，用一个统一的方法生成（如 `getStatusLine()`），避免各处重复计算导致不一致。

### 8. LLM 是不可靠的外部依赖
LLM API 随时可能失败（网络、限速、Key过期、模型宕机）。**必须有完善的 fallback、重试、熔断机制**。静默失败是最危险的 bug——UI上要能看到 API 状态。

### 9. 切换 LLM 后端时要全面测试
不同模型/API 的返回格式、能力差异巨大。切换时必须验证：请求格式、响应结构、思考模式、token 限制、CORS 配置。**保留多后端切换开关**（如 `USE_OLLAMA_NATIVE`），方便随时切回。

### 10. Prompt 工程：对小模型要更强硬
大模型（70B+）能理解温和指令，但小模型（≤4B）需要**非常明确和强烈**的指令才能遵循。用 🚨、`!!`、`必须`、`立刻` 等关键词，明确告知后果链，给 few-shot 示例。

### 11. Debug 可观测性是核心基础设施
任何机制（奖惩、目标、连锁惩罚）如果在 Debug 面板中看不到，就等于不存在。**每个新系统都要配套 Debug 日志和面板展示**，日志要带游戏天数+真实时间，方便事后分析。**关键流程的每个分支（尤其是异常/提前退出）都必须有持久化日志**。

### 12. 数值系统和AI系统的闭环 🆕
NPC有两条管线：(1) 游戏机制管线（好感度、冷淡期、属性数值等） (2) AI决策管线（LLM prompt生成对话/行动）。**任何影响NPC行为的数值变化，都必须同时反映在LLM prompt中**，否则AI会"无视"这些变化。新增数值系统时必问：这个数值有没有注入到对应的prompt？

### 13. 对话系统的全链路状态保护 🆕
NPC对话是一个跨多个 `await` 的长时间异步流程（每句话需要10-60秒LLM响应）。在这个时间窗口内，任何其他系统都可能改变NPC状态。保护策略必须是**全链路的**：
- 发起前校验
- 每轮 await 前后校验
- 所有移动/传送/状态切换的入口处校验
- 最终防线（`_teleportTo` 禁止跨场景传送）

### 14. 每个任务目标必须有可验证的游戏效果 🆕
不允许"假装做事"。每个任务在`_applyTaskEffect`中必须有对应的case和实际效果逻辑。新增任务时同时实现：任务定义 → 效果回调 → UI反馈 → 事件日志。用空`break;`占位必须在TODO中标注。

### 15. 物资系统必须先设计消耗→反推采集→验证可玩性 🆕
不要拍脑袋定采集速率。正确流程：(1) 计算每天各资源消耗量 (2) 考虑NPC有效工作时间(6-8h) (3) 反推基础采集速率 (4) 加入专长/天气修正 (5) 日结算报告验证收支平衡。留10-20%余量。

### 16. 健康/死亡链路必须有明确的数值推演 🆕
设计健康和死亡机制时，必须先做数值推演文档：从满血到死亡需要多久？中间有哪些阶段（正常→虚弱→濒死→死亡）？各阶段的健康扣减速率是多少？多条件叠加（饥饿+失温+体力耗尽）时致死速度是否合理？

### 17. 跨场景导航是高风险操作 🆕
所有跨室内场景导航必须经 village 中转，`_walkToDoorAndExit` 在门口 `dist <= 2` 时会**瞬间传送**。在触发跨场景导航前，必须检查 NPC 是否处于受保护状态（刚进入室内 `_indoorEntryProtection > 0`、正在吃饭 `isEating`、正在出门 `_walkingToDoor` 等）。**新增任何调用 `_navigateToScheduleTarget` 的代码，都要问：此时 NPC 可能刚进入室内吗？**（参见坑 19）

### 18. 多系统驱动 NPC 时必须有互斥锁和仲裁 🆕
饥饿系统、任务系统、状态覆盖、P0 紧急等多个系统不能同时驱动同一个 NPC。新增驱动系统时，必须定义与现有系统的**优先级关系**和**互斥规则**。多个覆盖状态同时为 true 时，必须有自动冲突解决机制（如 P1 一致性检查：`_hungerOverride && _taskOverride.isActive` 同时为 true → 强制取消任务覆盖）。根本解法是互斥锁和仲裁，而不是"谁先执行谁说了算"。（参见坑 19）

### 19. P0 紧急目标必须指向 NPC 能实际恢复的室内位置 🆕
不能导航到户外坐标（如 `furnace_plaza`），因为 NPC 到达户外后没有恢复机制（暖炉加温、睡眠恢复等都绑定在室内场景），P0 清除条件永远达不到，NPC 会一直卡在户外。正确做法是导航到宿舍入口（`this.homeName + '_door'`），进入室内后暖炉/睡眠系统自然接管恢复。**新增任何"紧急回家"类逻辑时，一定要验证目标位置是否在室内场景中。**（参见坑 20）

### 20. 功能入口必须在界面上直接可见 🆕
不要把重要功能藏在"点击后才显示"的弹出层里。用户不知道"点了才有"，等于功能不存在。设计UI交互时先画用户操作流程图：从"用户进入界面"到"开始游戏"最少需要几步？能不能再少一步？减少操作步骤 = 更好的用户体验。锁定状态要有视觉反馈（半透明+🔒图标），而不是"点了没反应"让用户以为是bug。（参见坑 21）

### 21. 构造函数中调用的方法不能依赖尚未初始化的属性 🆕
JavaScript 构造函数中属性初始化有先后顺序。如果在属性 A 初始化之前调用了依赖 A 的方法，会导致 `Cannot read properties of undefined` 错误。典型案例：`_initWorkPlan()` 在第403行被调用，但 `this.eventLog = []` 在第445行才初始化，导致 `addEvent()` 中的 `this.eventLog.unshift()` 崩溃。解决方案：(1) 将事件暂存到临时变量，属性初始化后再补发；(2) 或者调整调用顺序确保依赖属性已初始化。**新增构造函数中的方法调用，必须确认该方法依赖的所有 `this.xxx` 属性已在调用之前初始化。**（参见 v2.3 eventLog bug）

### 22. AI分工方案的prompt注入不能太长 🆕
14B模型的上下文窗口有限（建议input控制在2000 token以内）。workPlan安排表摘要控制在≤200字符，前世教训控制在≤300字符。如果注入过长，LLM会忽略后面的内容（"迷失在长prompt中"）或者截断输出。**新增prompt注入时，必须设定最大长度并做截断保护。**

### 23. LLM决策必须有代码层硬性拦截 🆕
即使prompt中明确说"第4天严禁外出"、"暴风雪天不要去户外"，LLM仍可能返回户外目标（尤其是小模型≤4B）。必须在 `_actionDecision()` 的LLM返回解析后添加硬性约束校验层，在代码层面强制纠正违规决策。拦截规则：暴风雪天户外→stay、体温<33→回暖炉、健康<10→去医院、有安排却wander→work。每个拦截点记录日志 `[决策拦截]`。**LLM的prompt约束是"建议"，代码层的拦截才是"强制"。**

### 24. NPC采集产出量极低 — 到达任务目标但几乎不产出 🆕
实际运行日志显示，第1天8人全天工作，木柴只采集了1单位（消耗35），食物采集0（消耗64），电力采集1（消耗9）。NPC能正确到达任务目标（伐木场/废墟等），日志中大量 `[WORK] 到达任务目标` 记录，但实际资源产出接近于0。可能原因：(1) `_updateActionEffect()` 的行为关键词匹配没有命中，导致NPC"站在伐木场但没在砍柴"；(2) 产出速率在代码中被某个乘数（体力效率/天气效率/电力加成等）拉低到接近0；(3) NPC频繁切换状态（到达→被P0拉走→再回来），实际持续工作时间极短。**每个采集系统在实际运行后都要验证日志中的采集量是否与设计速率一致（如8/h×8h应=64单位木柴），如果实际远低于预期，必须逐环排查匹配链路。**

### 25. NPC对已死亡角色做无效行为 — LLM幻觉"安抚死人" 🆕
实际运行中，王策和清璇在第3天反复出现"陆辰精神濒临崩溃，需立即前往宿舍B进行安抚与陪伴"、"歆玥精神濒临崩溃，需在私密安全环境进行心理疏导"等决策——但陆辰和歆玥在第2天就已经死了。NPC浪费了大量宝贵时间去"安抚"已死的人。原因：`_actionDecision()` prompt中注入的"其他NPC状态"没有明确过滤掉已死亡的NPC，或者死亡NPC的信息仍然残留在prompt中。**prompt中必须明确标注"已死亡"NPC不应被安抚/陪伴/协助，或者直接从可见NPC列表中移除已死亡的NPC。**

### 26. San值崩溃速度过快 — 第2天清晨集体精神崩溃致死 🆕
日志显示：第2天（-30°C）清晨7:25-10:06，不到3小时内6人死亡，其中5人死于"精神崩溃致死"（SAN=0）。这说明San值在-30°C天气下的下降速度过于极端——NPC从San≈60-80降到0只用了几小时。可能问题：(1) 户外低温+死亡事件的San惩罚叠加过于致命（看到同伴死亡San-10，连续死人导致连锁崩溃）；(2) San值恶性循环（San<30额外加速下降）的速率阈值设置不合理，一旦跌破30就再也恢复不了。**需要检查San值的下降速率叠加机制：户外寒冷惩罚 + 看到死亡惩罚 + San<30恶性循环三者叠加时，是否存在"死亡螺旋"（一旦开始崩溃就不可能恢复）。应该设计一个"最低保底"机制或者降低连锁惩罚的速率。**

### 27. 食物消耗异常高 — 第1天64单位远超设计预期 🆕
按设计，8人×1.5/餐×2餐=24单位/天的食物消耗。但实际第1天食物消耗了64单位，是设计值的2.6倍。可能原因：(1) 餐次触发过多（NPC饥饿系统在非正餐时间也触发用餐）；(2) 每餐消耗量不是1.5而是更高；(3) 食物浪费机制（无李婶管理时浪费20%）叠加了其他消耗。**资源消耗系统必须在日志中记录每次消耗的触发原因和具体数量，以便验证是否与设计值一致。目前只看到总消耗，无法定位是哪个环节多消耗的。**

### 28. 预烘焙静态资源（PNG/JSON）与代码逻辑必须保持同步 🆕
项目中存在两套地面颜色计算代码：`maps.js`（JS 运行时）和 `generate-map-base.py`（Python 底图生成器）。修改 JS 版本时忘了同步 Python 版本，导致底图 PNG 是用旧逻辑生成的。底图加载后反而覆盖了干净的 fallback 渲染，画面变脏。**任何时候修改了影响渲染/数据的代码逻辑，都必须检查：是否有对应的静态资源生成器需要同步更新？是否需要重新生成静态资源？** 理想情况下，同一个逻辑只有一个权威来源，避免两套代码做同一件事。（参见坑 28）

### 29. 浏览器缓存是渲染 bug 排查的最大干扰项 🆕
排查底图渲染 bug 时，浪费了大量时间在"代码已修改但效果没变"上，最终发现是浏览器缓存了旧的 JS 文件和 PNG 文件。**本地开发服务器必须从第一天就设置 `Cache-Control: no-cache, no-store`**，且 HTML 中所有静态资源引用必须带版本号参数（`?v=日期`），每次代码更新后递增版本号。这不是"之后再加"的优化项，而是从项目开始就必须有的基础设施。（参见坑 28）

### 30. 室内进门必须使用统一方法 `_enterIndoor`，禁止自行实现传送+寻路 🆕
所有NPC进入室内场景的代码路径都必须调用 `_enterIndoor(targetScene, game)`，直接传送到座位。禁止自行实现"传送到门口→寻路到座位"的两步流程——室内空间太小（≤8格高），寻路极易失败导致NPC卡在门口。新增任何进门路径时，先搜索是否已有 `_enterIndoor` 可用。（参见坑 29）

### 31. 每帧 update 循环中禁止调用随机选择函数 🆕
`_pickIndoorSeat` 等随机选择函数每次调用可能返回不同结果。如果在每帧的 update/日程检查/导航循环中调用，NPC 会每帧被分配不同目标，形成"走向A→下一帧改走B→下一帧改走C"的无限循环。随机选择只应在**一次性事件**中调用（如进门、分配任务），结果要**缓存**到 NPC 状态变量中，后续帧直接使用缓存值。（参见坑 30）### 32. update循环中子系统调用顺序导致的"梦游"竞争条件 🆕
NPC在深夜睡觉时出现"梦游"现象：睡一半突然走出去干活，然后又瞬移回来继续睡。**根因**：`_updateHunger`在`_updateSleepState`之前调用，当`hunger<10`时饿醒NPC（`isSleeping=false`），紧接着`_updateSleepState`检测到`shouldSleep=true`又立刻让NPC重新入睡，清除了饥饿导航路径。下一帧又被饿醒→又入睡→无限循环。NPC在这个循环中部分帧走出了几步又被拉回来，表现为"梦游"。**修复**：(1) 调换调用顺序为`_updateSleepState`→`_updateHunger`，确保睡眠状态先稳定下来；(2) 入睡条件增加`!this._hungerOverride`检查，饥饿覆盖期间禁止入睡，让NPC先吃完饭再睡觉。**教训：update循环中多个子系统的调用顺序至关重要，系统A修改的状态如果被系统B同帧覆盖，就会产生竞争条件。任何新增的"打断睡眠"逻辑都必须确保不会被`_updateSleepState`同帧撤销。**
### 33. `_indoorEntryProtection`保护期被双重递减 🆕
进屋保护期计时器`_indoorEntryProtection`在update循环中被递减了两次（复制粘贴遗留），导致3秒保护期实际只有1.5秒。保护期过早结束可能让日程导航系统在NPC刚进门尚未稳定时就重新触发跨场景导航。**任何计时器递减代码都应该检查是否有重复。**

### 34. 5倍速下冷却计时器被加速导致行为"抖动" 🆕
游戏 update 传入的 `dt` 是经过倍速放大的 `gameDt = rawDt * speedMultiplier`。所有用 `dt` 递减的冷却计时器（如 `_hungerTriggerCooldown`）在5倍速下实际冷却速度也是5倍——10秒冷却只需2秒真实时间就结束。这导致饥饿触发极其频繁，NPC 每2秒就被打断一次去吃饭。**修复**：冷却计时器用 `_realDt = dt / speedMultiplier` 递减，保证冷却时间不受游戏倍速影响。**原则：行为决策的冷却时间应该基于真实时间，而非游戏时间。只有资源消耗/生产速率才应该跟随游戏倍速。**

### 35. 饥饿系统随机选目标导致NPC在建筑间反复跑 🆕
`_chooseEatTarget` 每次饥饿触发时加权随机选一个餐饮场所（厨房/仓库/宿舍）。如果NPC已在仓库采集建材，但随机选中了厨房——NPC走出仓库去厨房，吃完再回来继续采集。5倍速下饥饿消耗也×5，很快又触发饥饿，这次随机选了仓库——NPC就地吃。下次又选厨房——又跑出去。**修复**：`_chooseEatTarget` 增加"就近原则"——NPC已在某个室内场景时优先选择该场景吃饭，只有在户外才走加权随机选择。**原则：NPC在室内执行任务时，非紧急需求应就地解决，不要打断任务来回跑。**

### 36. 常规饥饿打断任务覆盖导致决策振荡 🆕
`hunger<35`（常规饥饿）和 `hunger<25`（强制进食）都会触发 `_triggerHungerBehavior`，暂停或取消当前的 `_taskOverride`。NPC吃完饭后任务恢复 → 刚回到工作位置 → 饥饿又降到阈值 → 又暂停任务去吃饭 → 无限循环。**修复**：`hunger<35` 常规饥饿增加 `!_taskOverride.isActive && !_resourceGatherOverride` 检查，任务/资源采集期间不触发。只有 `hunger<15`（极度饥饿）才能强制打断一切。**分级策略：P0极度饥饿(< 15)打断一切 → P0强制进食(<25)打断日程不打断任务 → 常规饥饿(<35)不打断任务/采集。**

### 37. `_triggerHungerBehavior` 中 `scheduleReached=false` 覆盖导航结果 🆕
`_triggerHungerBehavior` 先调用 `_navigateToScheduleTarget(target)` 再设 `scheduleReached=false`。但 `_navigateToScheduleTarget` 在检测到 NPC 已在目标室内时会设 `scheduleReached=true`。后面的 `=false` 覆盖了这个结果，导致下一帧又重新导航。**修复**：将 `scheduleReached=false` 移到 `_navigateToScheduleTarget` 调用之前。**原则：导航函数可能同步修改状态，调用后不要再覆盖其设置的状态。**


### 34. 5倍速下冷却计时器被加速导致行为"抖动" 🆕
游戏 update 传入的 dt 是经过倍速放大的 gameDt = rawDt * speedMultiplier。所有用 dt 递减的冷却计时器在5倍速下实际冷却速度也是5倍——10秒冷却只需2秒真实时间就结束。修复：冷却计时器用 realDt = dt / speedMultiplier 递减。原则：行为决策的冷却时间应该基于真实时间，而非游戏时间。

### 35. 饥饿系统随机选目标导致NPC在建筑间反复跑 🆕
_chooseEatTarget 每次饥饿触发时随机选餐饮场所。修复：NPC已在某个室内场景时优先选择该场景就地吃饭，只有在户外才走加权随机。

### 36. 常规饥饿打断任务覆盖导致决策振荡 🆕
hunger<35 常规饥饿和任务覆盖互相竞争导致NPC在建筑间反复跑。修复：常规饥饿增加 _taskOverride 和 _resourceGatherOverride 检查，任务/资源采集期间不触发。只有极度饥饿(<15)才能强制打断一切。

### 37. _triggerHungerBehavior 中 scheduleReached=false 覆盖导航结果 🆕
先调用导航再设 scheduleReached=false 会覆盖导航内部设的 true。修复：将 scheduleReached=false 移到导航调用之前。

---

## 🔥 坑38：5倍速下NPC"出门→闪现回屋→出门"死循环 — 出门保护期+时间缩放隔离

### 问题现象
5倍速下NPC不断循环：走出仓库门→瞬间被传送回仓库→又走出门→又被传送回来。同时头顶交替显示"肚子饿了"和"采集建材中"两个矛盾状态。1倍速下正常。

### 问题根因

5个计时器直接使用加速后的 `dt` 递减，在5倍速下保护机制形同虚设：

| 计时器 | 用途 | 设定值 | 5倍速下真实持续时间 |
|--------|------|--------|---------------------|
| `_indoorEntryProtection` | 进屋保护期 | 5秒 | **1秒** |
| `_exitDoorTimer` | 出门超时 | 3秒 | **0.6秒** |
| `_hungerTravelTimer` | 饥饿传送超时 | 15秒 | **3秒** |
| `_hungerTriggerCooldown` | 饱食冷却 | 10秒 | **2秒** |
| `_indoorEntryProtection`（递减） | 出门后安全网延迟 | 5秒 | **1秒** |

**死循环链路**：
1. NPC吃完饭，2秒后又饿了（冷却被加速消耗）
2. 饥饿系统驱动NPC走出仓库去厨房
3. NPC传送到village，但0.6秒后出门超时已过
4. 安全网检测到NPC应在室内→1秒后保护期过→传送回仓库
5. 回仓库后又饿了→又走出门→循环

同时：
- `_walkToDoorAndExit` 没有清理 `_pendingEnterScene`→NPC出门后被残留的进门标记拉回
- 出门的3个传送路径（近距离/走到门口/路径为空兜底）都没有设置出门保护期

### 解决方案

#### 1. 保护期/冷却计时器改用真实时间
```javascript
// 计算真实时间增量
const speedMult = (game && game.speedOptions) ? game.speedOptions[game.speedIdx] : 1;
const _realDt = speedMult > 0 ? dt / speedMult : dt;

// 用真实时间递减保护期
this._indoorEntryProtection -= _realDt;  // 非 dt
```

#### 2. 所有出门路径设置出门保护期
在 `_walkToDoorAndExit`（近距离直接出门）和 `_updateDoorWalk`（3个传送路径）中，传送到village后立即设置：
```javascript
this._indoorEntryProtection = 5;  // 5秒真实时间内安全网不执行
this._pendingEnterScene = null;    // 清理残留进门标记
```

#### 3. 极度饥饿无视冷却
hunger < 15 和 hunger < 10 的P0强制进食不检查 `_hungerTriggerCooldown`，确保极端消耗下NPC能及时吃饭。常规饥饿（hunger < 35）仍受冷却保护。

### ⚠️ 开发注意
- **每个新增的计时器都必须标注"使用真实时间"还是"使用游戏时间"**，并在代码注释中说明原因
- **真实时间计算公式**：`_realDt = dt / speedMultiplier`，其中 `speedMultiplier` 从 `game.speedOptions[game.speedIdx]` 获取
- **所有通过 `_teleportTo` 传送NPC到village的代码路径**，都必须在传送后设置 `_indoorEntryProtection`，否则安全网会在下一帧把NPC传送回去
- **出门时必须清理 `_pendingEnterScene`**，否则NPC出门后可能被自动进门逻辑拉回
- **冷却机制的"紧急豁免"设计**：对于保护NPC生存的冷却（如饱食冷却），当属性达到极端值时（如 hunger < 15）应允许豁免冷却——冷却是为了防止频繁打断，不是为了让NPC饿死

### 38. 迁移脚本到子目录后必须更新所有路径引用 🆕
脚本文件中基于 `__file__`/`$0`/`dirname` 计算的路径是相对于脚本自身位置的。**移动脚本文件位置 = 所有路径偏移**。迁移后必须 `grep` 搜索文件中所有路径引用（`__file__`、`$0`、`dirname`、硬编码路径等），逐一验证是否需要调整。建议在工具脚本中使用"显式项目根目录"或标记文件（如 `.project-root`）向上搜索确定根目录，而非依赖脚本自身位置推导。（参见坑 39）

### 39. 模块化拆分大文件的加载顺序必须画依赖图 🆕
将大文件（如 8370 行 npc.js）拆分为多个 mixin 模块时，**核心类定义必须在所有 mixin 文件之前加载**（否则 `prototype` 挂载目标不存在）。数据文件（`data/*`）必须在逻辑文件（`src/*`）之前加载（否则构造函数读取配置时报 undefined）。正确做法：先画依赖关系图 → 按层级排序 → 在 index.html 中严格按顺序加载。拆分后务必用自动化脚本验证所有文件存在且关键方法已正确挂载。（参见坑 40）

### 40. 重构时保留向后兼容别名层 🆕
将全局变量重构为命名空间（如 `var Game` → `GST.Game`）时，**不要一步到位全部改完**。在 index.html 末尾添加向后兼容别名层：`var Camera = GST.Camera; var Game = GST.Game;` 等。这样旧代码中的全局引用仍然有效，可以逐步、安全地迁移到命名空间引用。兼容层是"安全网"，确保重构过程中功能不中断。

### 41. IIFE 内部变量不能被其他 IIFE 裸引用 — 必须通过 GST 命名空间访问 🆕
v4.0 重构后，各模块使用 IIFE 隔离。IIFE 内部的 `let/const` 变量（如 `llm-client.js` 中的 `LLM_SOURCE`、`API_KEY` 等）对外不可见。其他 IIFE（如 `startup.js`、`hud.js`）如果直接以裸变量名引用，运行时会报 `ReferenceError: xxx is not defined`。**正确做法**：通过 IIFE 暴露的 `GST.LLM` getter/setter 访问（如 `GST.LLM.source`、`GST.LLM.model`）。**检查方法**：运行 `node testcode/check-syntax.js` 自动检测跨 IIFE 变量引用。**新增任何 IIFE 内部变量，如果需要被其他模块使用，必须在 IIFE 末尾通过 GST 命名空间暴露。**（参见坑 40 模块化拆分经验）

### 42. `typeof` 检查 IIFE 内部类名永远为 `undefined` — 导致所有子系统未实例化 🆕🔴
**这是 v4.0 重构后最严重的 bug**。`game.js` 中用 `typeof WeatherSystem !== 'undefined'` 来检查子系统类是否存在，但 `WeatherSystem` 等类定义在各自 IIFE 内部，只通过 `GST.WeatherSystem` 暴露，全局 `typeof` 永远返回 `'undefined'`。结果：**天气、资源、暖炉、死亡、任务、事件、轮回、AI日志 — 全部8个子系统都没有被实例化**！游戏看起来能跑但没有核心逻辑。**正确做法**：检查 `GST.XXXSystem` 而非裸类名。**错误示例**：`(typeof ReincarnationSystem !== 'undefined') ? new GST.ReincarnationSystem(this) : null`。**正确示例**：`GST.ReincarnationSystem ? new GST.ReincarnationSystem(this) : null`。**检查方法**：运行 `node testcode/check-syntax.js`（检查5自动检测此问题）。**通用原则：IIFE 架构下，永远不要用 typeof 检查只挂载到 GST 的类名，直接用 `GST.XXX` 做真值检查。**

### 43. IIFE 外裸引用静态方法也会崩溃 — 修了 typeof 还有 `.xxx` 调用 🆕🔴
坑42修复后系统终于能实例化了，但**运行到静态方法调用时又崩溃**。`AIModeLogger.npcAttrSnapshot(npc)` 散布在5个文件14处，全是裸引用。`typeof` 检查是 IIFE 架构的第一层 bug，**裸类名的静态方法/属性直接调用是第二层 bug**。必须同时排查。**修复方案**：`AIModeLogger.npcAttrSnapshot()` → `GST.AIModeLogger.npcAttrSnapshot()`。**检查方法**：运行 `node testcode/check-syntax.js`（检查6自动检测此问题）。**通用原则：重构为 IIFE + GST 命名空间后，所有跨文件的类引用（无论是 new、typeof、还是静态方法）必须全部走 GST.XXX。**

### 44. P0 子优先级死循环 — 体温避险与医疗需求互相打架，NPC 永远到不了医疗站 🆕🔴

NPC 健康危急(HP<30)触发 P0-5 `medical_urgent`，出门瞬间体温降到 <35°C 被 P0-2 `hypothermia` 覆盖送回宿舍，回宿舍后体温恢复又触发 P0-5 出门，形成**无限死循环**。根因是 **P0 层内的多个子优先级之间没有互斥/优先级仲裁**，按代码顺序执行时高编号的 P0-5 总是被低编号的 P0-2 覆盖。**修复方案**：P0-2 增加"赶往室内目标免疫"（医疗站/宿舍也是室内，进去就能恢复体温），仅当体温 <33°C 严重失温时才强制覆盖。⚠️ **开发注意**：同层 P0 子优先级之间不能无条件互相覆盖，必须考虑 NPC 的目标是否也能满足覆盖者的需求（如"去医疗站"也能解决体温问题因为医疗站是室内）。**通用原则：多个 P0 子优先级之间需要仲裁机制，不能简单地按代码顺序覆盖。**
