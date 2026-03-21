# 🥶 福音雪镇 — 末日生存 v4.0 启动说明

## 网页地址

http://localhost:8080

---

## 🚀 一键重启（推荐）

```bash
cd /data/project/project_revol/vibegame/20260305-gospel-snow-town
python3 tools/restart.py
```

> 指定端口：`python3 tools/restart.py 8081`

脚本会自动执行：检测进程 → 检测端口 → kill进程 → 释放端口 → 启动服务 → 健康检查

---

## 🛑 仅关闭服务

```bash
cd /data/project/project_revol/vibegame/20260305-gospel-snow-town
if [ -f .server.pid ]; then kill $(cat .server.pid) 2>/dev/null && rm -f .server.pid && echo "✅ 已关闭"; fi
```

---

## 📁 项目文件结构（v4.0 重构版）

```
20260305-gospel-snow-town/
├── index.html                      # 入口页面
├── style.css                       # 冰霜深色主题样式
├── server.js                       # Node.js 静态服务器
│
├── src/                            # 源码目录（按功能分层）
│   ├── core/                       # 核心引擎（game / renderer / input / camera / constants / startup）
│   ├── map/                        # 地图系统（base-map / village-map / indoor/* / map-registry）
│   ├── npc/                        # NPC 系统 mixin（npc / ai / attributes / renderer / schedule / effects / specialty）
│   ├── systems/                    # 游戏子系统（resource / furnace / weather / task / death / event / reincarnation / difficulty）
│   ├── dialogue/                   # 对话系统（dialogue-manager / dialogue-ui）
│   ├── ai/                         # AI/LLM（llm-client / llm-status / aimode-logger）
│   ├── ui/                         # UI 模块（hud）
│   └── utils/                      # 工具函数（pathfinding / sprite-loader / helpers）
│
├── data/                           # 纯数据配置（NPC配置 / 日程 / 行动效果 / 地图数据等）
├── asset/                          # 素材目录（仅最终版，tiles / decorations / buildings / indoor / character / map）
├── tools/                          # 工具脚本（Python / HTML / Shell）
├── testcode/                       # 模块测试脚本（node testcode/check-syntax.js）
└── guide/                          # 项目文档
```

### 模块加载顺序

Layer 0: GST 命名空间 → constants → helpers → sprite-loader → pathfinding
Layer 1: data/* 纯配置
Layer 2: map 系统
Layer 3: NPC 核心 + mixin
Layer 4: 游戏子系统
Layer 5: 对话 + AI
Layer 6: 核心引擎 + UI + 启动

### 设计原则

- **GST 命名空间**：所有模块通过 `window.GST` 统一管理
- **Mixin 模式**：NPC 系统通过原型链 mixin 实现职责分离
- **数据与逻辑分离**：`data/` 目录可独立修改
- **双击即用**：直接打开 `index.html` 即可运行



### 使命！
真正的通用，一定要记住通用，优雅，你要先想想重构的那些原则，不能这样修一个bug冒出来一个bug，这样我们
永远修不好，你想好我们到底是要做一个什么样的游戏，你现在清楚吗，"
"我们是要做一个8个ai在末日自主决策生活的游戏，我们想要看到他们能够自己决策思考对话，然后不断轮回，不断思考讨论来修正自己的决策直到全员存活这样的一个游戏。你不能让我看一个bug你改一个bug，这样效率太低了。你要时刻记得我们这个伟大的使命，我们是要做一个非常伟大的游戏，让世界都对我们刮目相看！然后也要让玩家感受到这个时代最新的ai游戏应该是多么有意思！你要牢记，每次做完一个工作，你都要思考，离我们这个伟大的愿景是不是更近了一大步。 你要从大局出发 

他们现在讨论太执着于上辈子前一世了，应该是给它们看上一世的记忆，但是不强制提示一定要提到前一世，而是只给他们看记忆和当前的数据情况。让LLM作出决策。你再仔细检查和思考整个游戏流程，像这种定死的，一律要废除，全权交给ai LLM去思考。只做情报的提供者，不做决策的辅助者，这条我也要写入我们的伟大使命里

### 核心设计原则
1. **情报提供者，不做决策辅助者** — 系统只负责向AI提供准确的情报（前世记忆、资源数据、天气状况等），绝不在prompt中强制要求AI必须如何决策、必须提及什么内容。一切决策权交给LLM自主判断。
2. **废除一切"定死的"规则** — 所有"必须引用前世""必须体现轮回意识"类的强制prompt全部废除。前世记忆作为背景情报注入，AI自行判断是否引用。
3. **AI自主决策** — NPC的行动、对话、思考完全由LLM根据当前状况和情报自主决定，不预设行为模式。