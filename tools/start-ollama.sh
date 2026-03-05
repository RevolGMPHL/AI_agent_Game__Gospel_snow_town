#!/bin/bash
# Ollama 启动脚本 - 福音镇项目
# 模型权重存放在指定的绝对路径

export OLLAMA_MODELS="/data/project/project_revol/vibegame/LLM/model"
export OLLAMA_HOST="0.0.0.0:11434"
export OLLAMA_ORIGINS="*"
export OLLAMA_FLASH_ATTENTION="1"
export OLLAMA_KV_CACHE_TYPE="q8_0"

echo "🚀 启动 Ollama 服务..."
echo "📂 模型目录: $OLLAMA_MODELS"
echo "🌐 服务地址: http://$OLLAMA_HOST"
echo "🧠 当前模型: qwen3:4b-instruct-2507-q8_0"
echo "📦 可用模型: qwen3:4b-instruct-2507-q8_0, qwen3:14b-fp16, qwen3:14b-q8_0"
echo "---"
echo "提示: 也可以通过 systemctl 管理:"
echo "  启动: sudo systemctl start ollama"
echo "  停止: sudo systemctl stop ollama"
echo "  状态: sudo systemctl status ollama"
echo "---"

ollama serve
