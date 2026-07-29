#!/bin/bash
# ==============================================================
# tunnel-keeper.sh — 自愈隧道守护进程
# 功能：
#   1. 启动 cloudflared quick tunnel (需后端已在 localhost:8000 运行)
#   2. 提取分配的 .trycloudflare.com URL
#   3. 更新 js/main.js 中的 FALLBACK_BACKEND 常量
#   4. git commit + push，让 GitHub Pages 自动重建
#   5. 每 30 秒健康检查，隧道断线则自动重连
# ==============================================================

PROJECT_DIR="/workspace/ai-website"
MAIN_JS="$PROJECT_DIR/js/main.js"
TUNNEL_LOG="/tmp/tunnel.log"
CHECK_INTERVAL=30
GIT_USER="ai-toolbox-bot"
GIT_EMAIL="bot@ai-toolbox.local"

stop_tunnel() {
    # 按 PID 杀 cloudflared（避免 pkill 自杀）
    local pids=$(ps -eo pid,args | grep "cloudflared tunnel --url" | grep -v grep | awk '{print $1}' 2>/dev/null)
    for pid in $pids; do
        kill "$pid" 2>/dev/null
    done
    sleep 1
    pids=$(ps -eo pid,args | grep "cloudflared tunnel --url" | grep -v grep | awk '{print $1}' 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
}

get_new_url() {
    local f="$TUNNEL_LOG"
    # 等待最多 60 秒让 cloudflared 注册并打印 URL
    local waited=0
    while [ $waited -lt 60 ]; do
        local url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$f" 2>/dev/null | head -1)
        if [ -n "$url" ]; then
            echo "$url"
            return 0
        fi
        sleep 3
        waited=$((waited + 3))
    done
    return 1
}

start_tunnel() {
    echo "[tunnel-keeper] 启动 cloudflared tunnel..."
    # 清除旧日志
    : > "$TUNNEL_LOG"
    # 后台启动 cloudflared（彻底脱离当前会话）
    setsid bash -c "cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate >> '$TUNNEL_LOG' 2>&1" < /dev/null &
    disown
    # 等待注册和 URL 分配
    local url=$(get_new_url)
    if [ -z "$url" ]; then
        echo "[tunnel-keeper] ❌ 无法获取隧道 URL"
        return 1
    fi
    echo "[tunnel-keeper] ✅ 隧道 URL: $url"
    # 更新前端
    update_fallback "$url"
    return 0
}

update_fallback() {
    local url="$1"
    local escaped_url=$(echo "$url" | sed 's/\//\\\//g')
    echo "[tunnel-keeper] 更新 FALLBACK_BACKEND -> $url"
    # 静默替换
    if grep -q "const FALLBACK_BACKEND" "$MAIN_JS"; then
        sed -i "s|const FALLBACK_BACKEND = 'https://.*\.trycloudflare\.com'|const FALLBACK_BACKEND = '$url'|" "$MAIN_JS"
    else
        echo "[tunnel-keeper] ⚠️ 没找到 FALLBACK_BACKEND 常量!"
        return 1
    fi
    # 提交并推送
    git_push "$url"
}

git_push() {
    cd "$PROJECT_DIR" || return 1
    # 检查是否有修改
    if ! git diff --quiet js/main.js; then
        git config user.email "$GIT_EMAIL"
        git config user.name "$GIT_USER"
        git add js/main.js
        git commit -m "auto: update tunnel URL [$(date '+%H:%M')]"
        git push origin master 2>&1 | tail -2
        echo "[tunnel-keeper] 📤 已推送到 GitHub Pages"
    else
        echo "[tunnel-keeper] ℹ️  无需更新"
    fi
}

check_health() {
    # 从 js/main.js 读当前 FALLBACK_BACKEND 值
    local url=$(grep "const FALLBACK_BACKEND" "$MAIN_JS" 2>/dev/null | grep -oE "https://[^']+" | tr -d "'" | tr -d ";")
    if [ -z "$url" ]; then
        echo "[tunnel-keeper] 无法从 main.js 读取 URL"
        return 1
    fi
    # 快速探测隧道（3 秒超时）
    local code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "$url/api/health" 2>/dev/null)
    if [ "$code" = "200" ]; then
        echo "[tunnel-keeper] 👍 隧道健康 ($url)"
        return 0
    else
        echo "[tunnel-keeper] 👎 隧道返回 HTTP $code"
        # 也可能是 cloudflared 换了 URL 但 main.js 还没更新
        # 检查 cloudflared 是否还在跑
        local cf_pid=$(ps -eo pid,args | grep "cloudflared tunnel --url" | grep -v grep | awk '{print $1}' | head -1)
        if [ -z "$cf_pid" ]; then
            echo "[tunnel-keeper] cloudflared 进程已消失，需要重启"
            return 2
        fi
        # cloudflared 还在但 URL 不通，可能是新 URL
        local latest_url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
        if [ -n "$latest_url" ] && [ "$latest_url" != "$url" ]; then
            echo "[tunnel-keeper] 检测到新 URL: $latest_url"
            update_fallback "$latest_url"
            return 0
        fi
    fi
    return 1
}

# ==============================================================
# 主循环
# ==============================================================
echo "=========================================="
echo "  tunnel-keeper 自愈隧道守护进程启动"
echo "=========================================="

# 确保本地后端在跑
local_ok=$(curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null)
if [ "$local_ok" != "200" ]; then
    echo "[tunnel-keeper] ❌ 本地后端未运行 (127.0.0.1:8000)，请先启动 node server/index.js"
    exit 1
fi

# 清理旧 cloudflared 进程
stop_tunnel

# 首轮启动
start_tunnel || exit 1

# 监控循环
while true; do
    sleep "$CHECK_INTERVAL"
    check_health
    rc=$?
    if [ "$rc" = "2" ]; then
        echo "[tunnel-keeper] 🔄 隧道已死，重启中..."
        stop_tunnel
        sleep 2
        start_tunnel || echo "[tunnel-keeper] ❌ 重启失败, 30s 后重试"
    fi
done
