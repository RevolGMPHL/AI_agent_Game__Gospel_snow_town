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
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_FILE = "server.js"
PID_FILE = os.path.join(PROJECT_DIR, ".server.pid")
LOG_DIR = os.path.join(PROJECT_DIR, "log")
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

    # 方法1: 通过PID文件精确关闭
    if os.path.exists(PID_FILE):
        with open(PID_FILE) as f:
            old_pid = f.read().strip()
        if old_pid:
            try:
                pid = int(old_pid)
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


# ==================== Step 5: 启动服务 ====================
def start_server(port):
    print(f"\n=== [5/6] 启动游戏服务 (端口 {port}) ===")

    # 确保日志目录存在
    os.makedirs(LOG_DIR, exist_ok=True)

    # 启动
    env = os.environ.copy()
    env["PORT"] = str(port)

    with open(LOG_FILE, "a") as logf:
        proc = subprocess.Popen(
            ["node", SERVER_FILE],
            cwd=PROJECT_DIR,
            stdout=logf,
            stderr=logf,
            env=env,
            start_new_session=True  # 脱离当前终端
        )

    # 写入PID文件
    with open(PID_FILE, "w") as f:
        f.write(str(proc.pid))

    log("✅", f"服务已启动 | PID: {proc.pid} | 端口: {port}")
    return proc.pid, port


# ==================== Step 6: 健康检查 ====================
def health_check(port):
    print(f"\n=== [6/6] 健康检查 ===")
    url = f"http://localhost:{port}/"

    for i in range(HEALTH_CHECK_RETRIES):
        try:
            req = urllib.request.urlopen(url, timeout=3)
            code = req.getcode()
            if code == 200:
                log("✅", f"服务正常运行！")
                log("🌐", f"访问地址: http://localhost:{port}/")
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
    else:
        print(f"  ❌ 重启可能失败，请检查日志")
        print(f"  📋 tail -30 {LOG_FILE}")
    print("=" * 50)


if __name__ == "__main__":
    main()
