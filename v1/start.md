# 🥶 福音雪镇 — 末日生存 启动说明

## 网页地址

http://localhost:8080
python3 restart.py 
---

## 🚀 一键重启（推荐）

```bash
cd /data/project/project_revol/vibegame/20260220-gospel_snow_town
python3 restart.py
```

> 指定端口：`python3 restart.py 8081`

脚本会自动执行：检测进程 → 检测端口 → kill进程 → 释放端口 → 启动服务 → 健康检查

---

## 🛑 仅关闭服务

```bash
cd /data/project/project_revol/vibegame/20260220-gospel_snow_town
if [ -f .server.pid ]; then kill $(cat .server.pid) 2>/dev/null && rm -f .server.pid && echo "✅ 已关闭"; fi
```

---

## 🔍 查看状态

```bash
ps aux | grep "node server.js" | grep -v grep   # 进程
cat .server.pid 2>/dev/null                       # PID
ss -tlnp | grep -E ":(8080|8081) "               # 端口
tail -20 log/server.log                           # 日志
```

---

## 📁 项目文件说明

| 文件 | 说明 |
|------|------|
| `restart.py` | **Python重启脚本（检测+kill+重启+健康检查）** |
| `index.html` | 主页面（含生存状态栏 + 资源面板 + 难度选择器） |
| `game.js` | 主游戏逻辑，集成所有子系统 |
| `npc.js` | NPC系统（含体温/失温/死亡属性 + AI决策prompt + 决策拦截器） |
| `maps.js` | 地图系统（冬季末日配色） |
| `dialogue.js` | 对话系统（含关系上下文注入） |
| `weather-system.js` | 4天温度周期 + 雪花粒子 |
| `resource-system.js` | 木柴/食物/电力/建材/急救包资源管理 |
| `furnace-system.js` | 暖炉系统 + 室内温度 |
| `task-system.js` | NPC专长 + workPlan驱动任务分配 |
| `death-system.js` | 死亡判定 + 4种结局 + workPlan转移 |
| `event-system.js` | 冲突事件 + 调解/鼓舞机制 |
| `reincarnation-system.js` | 轮回记忆 + 前世教训分析 + 智能分工方案生成 |
| `difficulty-config.js` | 6个难度等级参数表（简单→地狱） |
| `aimode-logger.js` | AI模式运行日志记录（服务端持久化） |
| `style.css` | 冰霜深色主题样式 |
| `server.js` | Node.js 静态服务器 + Debug/AImode日志API |
