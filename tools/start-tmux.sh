#!/bin/bash
# ============================================
# 🥶 福音雪镇 — tmux 一键启动脚本
# ============================================
# 使用方法:
#   bash start-tmux.sh          # 默认端口 8080
#   bash start-tmux.sh 8081     # 指定端口
#
# tmux 操作:
#   tmux attach -t gospel       # 进入查看
#   Ctrl+B 然后按 1             # 切到窗口1 (Ollama)
#   Ctrl+B 然后按 2             # 切到窗口2 (游戏服务器)
#   Ctrl+B 然后按 D             # 退出但不关闭 (detach)
#
# 关闭:
#   tmux kill-session -t gospel # 关闭整个session（Ollama+游戏都会停）
# ============================================

SESSION_NAME="gospel"
# tools/ 目录的父目录 = 项目根目录
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8080}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  🥶 福音雪镇 — tmux 一键启动${NC}"
echo -e "${CYAN}============================================${NC}"

# ---- Step 1: 清理旧进程 ----
echo -e "\n${YELLOW}[1/4] 清理旧进程...${NC}"

# 如果已经有同名 tmux session，先杀掉
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "  ⚠️  发现旧的 tmux session '$SESSION_NAME'，正在关闭..."
    tmux kill-session -t "$SESSION_NAME"
    sleep 1
fi

# 杀掉残留的 node server.js 进程
if pgrep -f "node server.js" > /dev/null 2>&1; then
    echo -e "  ⚠️  发现残留的游戏服务器进程，正在关闭..."
    pkill -f "node server.js"
    sleep 1
fi

# 清理 PID 文件
rm -f "$PROJECT_DIR/.server.pid"

echo -e "  ${GREEN}✅ 清理完成${NC}"

# ---- Step 2: 检查 Ollama 状态 ----
echo -e "\n${YELLOW}[2/4] 检查 Ollama 状态...${NC}"

OLLAMA_RUNNING=false
if curl -s --connect-timeout 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
    OLLAMA_RUNNING=true
    echo -e "  ${GREEN}✅ Ollama 已在运行中${NC}"
else
    # 检查是否有 ollama serve 进程但还没响应
    if pgrep -f "ollama serve" > /dev/null 2>&1; then
        echo -e "  ⚠️  Ollama 进程存在但未响应，先关闭后重启..."
        pkill -f "ollama serve"
        sleep 2
    fi
    echo -e "  ℹ️  Ollama 未运行，将在 tmux 中启动"
fi

# ---- Step 3: 创建 tmux session ----
echo -e "\n${YELLOW}[3/4] 创建 tmux session...${NC}"

# 创建新 session，第一个窗口命名为 "ollama"
tmux new-session -d -s "$SESSION_NAME" -n "ollama" -c "$PROJECT_DIR"

if [ "$OLLAMA_RUNNING" = true ]; then
    # Ollama 已在运行，窗口显示状态监控
    tmux send-keys -t "$SESSION_NAME:ollama" "echo '🟢 Ollama 已在运行中 (非 tmux 管理)'; echo '---'; echo '执行以下命令查看状态:'; echo '  curl http://localhost:11434/api/ps'; echo '  curl http://localhost:11434/api/tags'; echo '---'; watch -n 5 \"echo '=== Ollama 进程状态 ==='; curl -s http://localhost:11434/api/ps | python3 -m json.tool 2>/dev/null || echo '❌ Ollama 无响应'\"" C-m
else
    # 启动 Ollama（使用项目的环境变量配置）
    tmux send-keys -t "$SESSION_NAME:ollama" "export OLLAMA_MODELS='/data/project/project_revol/vibegame/LLM/model' && export OLLAMA_HOST='0.0.0.0:11434' && export OLLAMA_ORIGINS='*' && export OLLAMA_FLASH_ATTENTION='1' && export OLLAMA_KV_CACHE_TYPE='q8_0' && echo '🚀 启动 Ollama 服务...' && echo '📂 模型目录: \$OLLAMA_MODELS' && echo '🌐 服务地址: http://\$OLLAMA_HOST' && echo '---' && ollama serve" C-m
fi

# 创建第二个窗口，命名为 "game"，运行游戏服务器
tmux new-window -t "$SESSION_NAME" -n "game" -c "$PROJECT_DIR"

# 如果 Ollama 是新启动的，等它准备好
if [ "$OLLAMA_RUNNING" = false ]; then
    tmux send-keys -t "$SESSION_NAME:game" "echo '⏳ 等待 Ollama 服务就绪...' && for i in \$(seq 1 30); do if curl -s --connect-timeout 2 http://localhost:11434/api/tags > /dev/null 2>&1; then echo '✅ Ollama 就绪！'; break; fi; echo \"  等待中... (\$i/30)\"; sleep 1; done && echo '---' && echo '🎮 启动游戏服务器 (端口: $PORT)...' && PORT=$PORT node server.js" C-m
else
    tmux send-keys -t "$SESSION_NAME:game" "echo '🎮 启动游戏服务器 (端口: $PORT)...' && PORT=$PORT node server.js" C-m
fi

# 创建第三个窗口，命名为 "monitor"，显示实时状态
tmux new-window -t "$SESSION_NAME" -n "monitor" -c "$PROJECT_DIR"
tmux send-keys -t "$SESSION_NAME:monitor" "echo '📊 福音雪镇 — 运行监控'; echo '---'; echo 'tmux 操作提示:'; echo '  Ctrl+B 然后 1  → Ollama 窗口'; echo '  Ctrl+B 然后 2  → 游戏服务器窗口'; echo '  Ctrl+B 然后 3  → 监控窗口(当前)'; echo '  Ctrl+B 然后 D  → 退出(不关闭)'; echo '---'; watch -n 10 \"echo '=== 游戏服务器 ==='; curl -s --connect-timeout 2 http://localhost:$PORT/ > /dev/null 2>&1 && echo '🟢 运行中 (端口 $PORT)' || echo '🔴 未响应'; echo ''; echo '=== Ollama 服务 ==='; curl -s --connect-timeout 2 http://localhost:11434/api/ps 2>/dev/null | python3 -m json.tool 2>/dev/null || echo '🔴 未响应'; echo ''; echo '=== GPU 状态 ==='; nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo '无GPU信息'; echo ''; echo '=== 最新日志 (最后3行) ==='; tail -3 $PROJECT_DIR/log/server.log 2>/dev/null || echo '无日志'\"" C-m

# 默认切到 game 窗口
tmux select-window -t "$SESSION_NAME:game"

echo -e "  ${GREEN}✅ tmux session 创建完成${NC}"

# ---- Step 4: 等待服务就绪 & 输出信息 ----
echo -e "\n${YELLOW}[4/4] 等待服务就绪...${NC}"

# 等待游戏服务器启动
for i in $(seq 1 15); do
    if curl -s --connect-timeout 2 "http://localhost:$PORT/" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅ 游戏服务器已就绪！${NC}"
        break
    fi
    echo -e "  ⏳ 等待中... ($i/15)"
    sleep 1
done

# 检查 Ollama
if curl -s --connect-timeout 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "  ${GREEN}✅ Ollama 服务正常${NC}"
else
    echo -e "  ${YELLOW}⚠️  Ollama 可能还在启动中，请稍后检查${NC}"
fi

# ---- 最终输出 ----
echo -e "\n${CYAN}============================================${NC}"
echo -e "${GREEN}  🎉 启动完成！${NC}"
echo -e "${CYAN}============================================${NC}"
echo -e ""
echo -e "  🌐 游戏地址: ${GREEN}http://localhost:$PORT/${NC}"
echo -e "  🤖 Ollama:   ${GREEN}http://localhost:11434/${NC}"
echo -e ""
echo -e "  ${YELLOW}📺 查看运行状态:${NC}"
echo -e "     tmux attach -t gospel          # 进入 tmux"
echo -e "     ${CYAN}Ctrl+B 然后 1${NC}  → Ollama 窗口"
echo -e "     ${CYAN}Ctrl+B 然后 2${NC}  → 游戏服务器窗口"
echo -e "     ${CYAN}Ctrl+B 然后 3${NC}  → 监控面板"
echo -e "     ${CYAN}Ctrl+B 然后 D${NC}  → 退出(不关闭服务)"
echo -e ""
echo -e "  ${RED}🛑 关闭所有服务:${NC}"
echo -e "     tmux kill-session -t gospel"
echo -e ""
echo -e "${CYAN}============================================${NC}"
