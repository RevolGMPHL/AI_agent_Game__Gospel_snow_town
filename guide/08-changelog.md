# 📝 更新日志

> 详细记录每个版本的改动、Bug 修复和新功能。

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
- [ ] 🟡 San值崩溃速度调优：第2天清晨3小时内5人精神崩溃致死，户外寒冷+死亡惩罚+San<30恶性循环三者叠加形成不可逆的"死亡螺旋"
- [ ] 🟡 食物消耗异常排查：第1天实际消耗64单位 vs 设计预期24单位（2.6倍差异），需逐环排查消耗触发点
- [ ] 🟡 资源消耗日志增强：每次资源消耗记录触发原因和具体数量（目前只有每小时总量，无法定位异常消耗来源）
- [ ] 更多装饰物
- [ ] 音效
- [ ] 存档完善