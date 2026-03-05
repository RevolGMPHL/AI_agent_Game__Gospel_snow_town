# 设计理念 & 项目定位

## 1. 设计理念

### 1.1 为什么不用原 town 项目？

原 `20260215-town` 是斯坦福 Generative Agents 的复现版，特点是：
- **后端驱动**: Python 仿真主循环 + Flask 服务 + LlamaIndex 向量检索
- **回放而非实时**: 前端 Phaser.js 只负责播放仿真结果，不是实时交互
- **重量级**: 25 个 Agent，每步需要大量 LLM 调用（5-15 分钟/step）
- **Tiled 地图**: 需要 Tiled 编辑器制作的 3.5MB tilemap.json

### 1.2 本项目的方向

采用 farm3（喷火龙农场）的轻量级纯前端方案：
- **双击即用**: 直接打开 `index.html`，无需 Python/Node 后端
- **实时交互**: 玩家和 AI 居民同时在地图上活动
- **代码生成地图**: 不依赖 Tiled，用 Canvas API 程序化绘制
- **轻量 AI**: 6~10 个居民，每个用 GLM-4-Flash 驱动（免费 API）
- **星露谷风味**: 布局模仿鹈鹕镇，有广场、商店、酒馆、住宅、公园等

---

## 2. 与 farm3 / town 项目的关系

```
farm3（喷火龙农场）          town（AI 小镇）           tihutown（鹈鹕镇·本项目）
├── 纯前端 Canvas            ├── Python 后端             ├── 纯前端 Canvas ✅
├── 代码生成地图             ├── Tiled tilemap           ├── 代码生成地图 ✅
├── 1 个 AI 角色             ├── 25 个 AI Agent          ├── 6~10 个 AI 居民
├── 3 场景(home/farm/town)   ├── 1 张大地图              ├── 多场景（户外+多个室内）
├── 感知→决策→行动           ├── 认知循环 5 步            ├── 感知→决策→行动→社交
├── localStorage 存档        ├── JSON checkpoint         ├── localStorage 存档 ✅
└── 单人自主行为             └── 多人社交+反思            └── 多人社交（简化版）
```

**复用策略**:
- ✅ 从 farm3 复用：BaseMap 框架、A* 寻路、碰撞系统、输入系统、存档系统、AI 调用架构
- ✅ 从 town 复用：多 Agent 社交逻辑思路、Prompt 模板设计思路、角色性格系统
- ✅ 从 town 复用：角色 Sprite 素材（portrait.png + texture.png）可以直接使用
- ❌ 不复用：Tiled 地图、Python 后端、LlamaIndex、Phaser.js