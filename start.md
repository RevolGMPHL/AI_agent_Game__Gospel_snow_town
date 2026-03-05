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
