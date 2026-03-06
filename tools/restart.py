#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
福音雪镇 — 优雅重启脚本
功能：检测进程 → 检测端口 → kill进程 → 释放端口 → 启动服务 → 健康检查
"""

import os
import sys
import time
import signal
import subprocess
import urllib.request

# ==================== 配置 ====================
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录（tools/的父目录）
SERVER_FILE = "server.js"
PID_FILE = os.path.join(PROJECT_DIR, ".server.pid")  # 项目根目录下
TOOLS_DIR = os.path.join(PROJECT_DIR, "tools")
LOG_DIR = os.path.join(TOOLS_DIR, "log")
LOG_FILE = os.path.join(LOG_DIR, "server.log")
DEFAULT_PORT = 8080
BACKUP_PORT = 8081
HEALTH_CHECK_RETRIES = 5
HEALTH_CHECK_INTERVAL = 1  # 秒


def log(emoji, msg):
    print(f"  {emoji}  {msg}")


def run_cmd(cmd, capture=True):
    """执行shell命令，返回(returncode, stdout)"""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=capture,
            text=True, timeout=10
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return -1, ""
    except Exception as e:
        return -1, str(e)


# ==================== Step 1: 检测游戏进程 ====================
def check_processes():
    print("\n=== [1/6] 检测游戏进程 ===")
    code, out = run_cmd("pgrep -fa 'node server.js'")
    pids = []
    if code == 0 and out:
        for line in out.split("\n"):
            parts = line.strip().split()
            if parts:
                pids.append(parts[0])
        log("⚠️", f"发现运行中的游戏进程: {', '.join(pids)}")
    else:
        log("✅", "无运行中的游戏进程")

    # 检查PID文件
    if os.path.exists(PID_FILE):
        with open(PID_FILE) as f:
            old_pid = f.read().strip()
        if old_pid:
            log("📋", f"PID文件记录: {old_pid}")
    return pids


# ==================== Step 2: 检测端口占用 ====================
def check_port(port):
    print(f"\n=== [2/6] 检测端口 {port} 占用 ===")
    code, out = run_cmd(f"ss -tlnp 2>/dev/null | grep ':{port} '")
    if code == 0 and out:
        log("⚠️", f"端口 {port} 已被占用:")
        for line in out.split("\n"):
            log("  ", line.strip())
        # 进一步检查是谁占用
        _, lsof_out = run_cmd(f"lsof -i:{port} -t 2>/dev/null")
        if lsof_out:
            log("📋", f"占用PID: {lsof_out}")
        return True
    else:
        log("✅", f"端口 {port} 空闲")
        return False


# ==================== Step 3: 安全关闭进程 ====================
def kill_processes():
    print("\n=== [3/6] 安全关闭游戏进程 ===")
    killed = False

    # 方法0: 关闭已有的 tmux session（如果存在）
    code, _ = run_cmd(f"tmux has-session -t gospel 2>/dev/null")
    if code == 0:
        run_cmd(f"tmux kill-session -t gospel 2>/dev/null")
        log("✅", "关闭了旧的 tmux session: gospel")
        killed = True

    # 方法1: 通过PID文件精确关闭（同时杀父进程组，确保 bash 壳和 node 子进程都被杀掉）
    if os.path.exists(PID_FILE):
        with open(PID_FILE) as f:
            old_pid = f.read().strip()
        if old_pid:
            try:
                pid = int(old_pid)
                # 先尝试杀进程组（如果是 bash 壳进程，会级联杀子进程）
                try:
                    os.killpg(os.getpgid(pid), signal.SIGTERM)
                except (ProcessLookupError, PermissionError):
                    os.kill(pid, signal.SIGTERM)
                log("✅", f"通过PID文件关闭进程: {pid}")
                killed = True
            except (ProcessLookupError, ValueError):
                log("ℹ️", f"PID文件中的进程({old_pid})已不存在")
            except PermissionError:
                log("❌", f"无权限关闭进程 {old_pid}")
        os.remove(PID_FILE)

    # 方法2: 兜底按进程名杀残留
    code, out = run_cmd("pgrep -f 'node server.js'")
    if code == 0 and out:
        run_cmd("pkill -f 'node server.js'")
        log("✅", f"清理残留进程: {out.replace(chr(10), ', ')}")
        killed = True

    if not killed:
        log("ℹ️", "没有需要关闭的进程")

    return killed


# ==================== Step 4: 等待端口释放 ====================
def wait_port_release(port, max_wait=5):
    print(f"\n=== [4/6] 等待端口 {port} 释放 ===")
    for i in range(max_wait * 2):
        code, out = run_cmd(f"ss -tlnp 2>/dev/null | grep ':{port} .*node'")
        if code != 0 or not out:
            log("✅", f"端口 {port} 已释放")
            return port
        time.sleep(0.5)

    # 端口仍被占用，检查是否是转发工具
    _, lsof_out = run_cmd(f"lsof -i:{port} 2>/dev/null")
    if lsof_out and "node" not in lsof_out.lower():
        log("⚠️", f"端口 {port} 被非Node进程占用（可能是转发工具），切换备用端口")
        return BACKUP_PORT
    else:
        log("⚠️", f"端口 {port} 仍被占用，尝试强制清理...")
        run_cmd(f"fuser -k {port}/tcp 2>/dev/null")
        time.sleep(1)
        return port


# ==================== Step 5: 启动服务（tmux 方式） ====================
TMUX_SESSION = "gospel"

def start_server(port):
    print(f"\n=== [5/6] 启动游戏服务 (端口 {port}) ===")

    # 确保日志目录存在
    os.makedirs(LOG_DIR, exist_ok=True)

    # 如果已有同名 tmux session，先关闭
    run_cmd(f"tmux kill-session -t {TMUX_SESSION} 2>/dev/null")
    time.sleep(0.5)

    # 在 tmux 中启动游戏服务器
    start_cmd = f"cd {PROJECT_DIR} && PORT={port} node {SERVER_FILE} 2>&1 | tee -a {LOG_FILE}"
    code, _ = run_cmd(
        f'tmux new-session -d -s {TMUX_SESSION} -n game -c {PROJECT_DIR} "{start_cmd}"'
    )

    if code != 0:
        log("❌", "tmux 启动失败，请确认已安装 tmux")
        return None, port

    # 等待进程出现并获取 **真正的 node 进程** PID（排除 bash 壳进程）
    time.sleep(1.5)
    pid = _get_real_node_pid(port)

    # 写入PID文件
    with open(PID_FILE, "w") as f:
        f.write(str(pid))

    log("✅", f"服务已在 tmux 中启动 | PID: {pid} | 端口: {port}")
    log("📺", f"查看: tmux attach -t {TMUX_SESSION}")
    return pid, port


def _get_real_node_pid(port):
    """获取真正监听端口的 node 进程 PID，而非 bash 壳进程"""
    # 方法1: 通过 lsof 精确获取端口监听进程 PID
    _, lsof_out = run_cmd(f"lsof -i:{port} -sTCP:LISTEN -t 2>/dev/null")
    if lsof_out.strip():
        # 可能有多行，取第一个
        pid = lsof_out.strip().split('\n')[0].strip()
        if pid.isdigit():
            return pid

    # 方法2: 通过 ss 获取
    _, ss_out = run_cmd(f"ss -tlnp 'sport = :{port}' 2>/dev/null")
    if ss_out:
        import re
        m = re.search(r'pid=(\d+)', ss_out)
        if m:
            return m.group(1)

    # 方法3: 兜底 pgrep，但排除 bash 壳进程
    _, pgrep_out = run_cmd("pgrep -a 'node' 2>/dev/null")
    if pgrep_out:
        for line in pgrep_out.split('\n'):
            parts = line.strip().split(None, 1)
            if len(parts) == 2 and 'server.js' in parts[1] and 'bash' not in parts[1]:
                return parts[0]

    # 最终兜底
    _, pid_out = run_cmd("pgrep -f 'node server.js' | tail -1")
    return pid_out.strip() if pid_out.strip() else "未知"


# ==================== Step 6: 健康检查 ====================
def health_check(port):
    print(f"\n=== [6/6] 健康检查 ===")
    url = f"http://localhost:{port}/"

    for i in range(HEALTH_CHECK_RETRIES):
        try:
            req = urllib.request.urlopen(url, timeout=3)
            code = req.getcode()
            if code == 200:
                # 验证 PID 文件中的进程确实在运行
                pid_ok = False
                if os.path.exists(PID_FILE):
                    with open(PID_FILE) as f:
                        recorded_pid = f.read().strip()
                    if recorded_pid.isdigit():
                        try:
                            os.kill(int(recorded_pid), 0)  # 检查进程是否存在
                            pid_ok = True
                        except (ProcessLookupError, PermissionError):
                            pass
                log("✅", f"服务正常运行！")
                log("🌐", f"访问地址: http://localhost:{port}/")
                if not pid_ok:
                    log("⚠️", f"PID文件记录可能不准确，但服务确实在运行")
                return True
        except Exception:
            pass

        if i < HEALTH_CHECK_RETRIES - 1:
            log("⏳", f"等待服务就绪... ({i + 1}/{HEALTH_CHECK_RETRIES})")
            time.sleep(HEALTH_CHECK_INTERVAL)

    log("❌", f"服务异常！请检查日志: tail -20 {LOG_FILE}")
    return False


# ==================== 主流程 ====================
def main():
    print("=" * 50)
    print("  🥶 福音雪镇 — 优雅重启")
    print("=" * 50)

    # 支持命令行指定端口
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            if sys.argv[1] in ("--help", "-h"):
                print(f"\n用法: python3 restart.py [端口号]")
                print(f"  默认端口: {DEFAULT_PORT}")
                print(f"  备用端口: {BACKUP_PORT}")
                return
            print(f"❌ 无效端口号: {sys.argv[1]}")
            return

    # 执行6步流程
    check_processes()
    port_occupied = check_port(port)
    kill_processes()

    if port_occupied:
        port = wait_port_release(port)
    else:
        time.sleep(0.5)  # 等进程完全退出

    pid, final_port = start_server(port)
    time.sleep(1)
    success = health_check(final_port)

    # 最终汇总
    print("\n" + "=" * 50)
    if success:
        print(f"  ✅ 重启成功！PID={pid}  端口={final_port}")
        print(f"  🌐 http://localhost:{final_port}/")
        print(f"  📺 查看运行: tmux attach -t {TMUX_SESSION}")
        print(f"  🛑 关闭服务: tmux kill-session -t {TMUX_SESSION}")
    else:
        print(f"  ❌ 重启可能失败，请检查日志")
        print(f"  📋 tail -30 {LOG_FILE}")
        print(f"  📺 或进入 tmux 查看: tmux attach -t {TMUX_SESSION}")
    print("=" * 50)


if __name__ == "__main__":
    main()
