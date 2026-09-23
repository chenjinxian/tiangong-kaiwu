#!/bin/bash
#
# Open Cloud CAD - 统一服务启动脚本
#
# 规范：
#   - 公共服务组件（PostgreSQL, Redis, Azurite）必须使用 Docker 启动
#   - 自研服务（imodelhub-services, backend, web-agent, frontend）使用本地 npm 启动
#
# Usage:
#   ./scripts/start-all.sh [command]
#
# Commands:
#   all       - 启动所有服务（默认）
#   infra     - 只启动基础设施（postgres, azurite, redis）
#   services  - 只启动应用服务（imodelhub, backend, web-agent）
#   web       - 只启动前端
#   stop      - 停止所有服务（包括 Docker）
#   status    - 查看服务状态
#   logs      - 查看服务日志

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 路径配置
IMODELHUB_DIR="${IMODELHUB_DIR:-/Users/xunzhang/Documents/GitHub/imodelhub-services}"
DOCKER_COMPOSE_FILE="$IMODELHUB_DIR/docker-compose.yaml"
PID_DIR="/tmp/open-cloud-cad"

# 创建 PID 目录
mkdir -p "$PID_DIR"

# 日志输出函数
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_section() { echo -e "${CYAN}\n=== $1 ===${NC}"; }

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 检查 TCP 端口是否可连接（使用 nc，兼容 macOS 和 Linux）
check_tcp_port() {
    local host=$1
    local port=$2
    local timeout=${3:-2}
    if nc -z -G "$timeout" "$host" "$port" 2>/dev/null; then
        return 0
    elif nc -z -w "$timeout" "$host" "$port" 2>/dev/null; then
        # Linux 使用 -w 参数
        return 0
    else
        return 1
    fi
}

# 检查服务是否健康（支持 HTTP 和 TCP）
check_health() {
    local url=$1
    local timeout=${2:-5}

    # 处理 tcp://host:port 格式
    if [[ "$url" == tcp://* ]]; then
        local host_port="${url#tcp://}"
        local host="${host_port%%:*}"
        local port="${host_port##*:}"
        check_tcp_port "$host" "$port" "$timeout"
        return $?
    fi

    # 处理 http:// 或 https:// 格式
    if [[ "$url" == http://* ]] || [[ "$url" == https://* ]]; then
        if curl -s --max-time "$timeout" "$url" >/dev/null 2>&1; then
            return 0
        else
            return 1
        fi
    fi

    # 默认按 HTTP 处理
    if curl -s --max-time "$timeout" "$url" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 等待服务启动
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -n "  等待 $name 启动..."
    while [ $attempt -le $max_attempts ]; do
        if check_health "$url" 2; then
            echo -e " ${GREEN}OK${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}失败${NC}"
    return 1
}

# 保存 PID
save_pid() {
    local name=$1
    local pid=$2
    echo "$pid" > "$PID_DIR/$name.pid"
}

# 获取 PID
get_pid() {
    local name=$1
    if [ -f "$PID_DIR/$name.pid" ]; then
        cat "$PID_DIR/$name.pid"
    else
        echo ""
    fi
}

# 检查 Docker 是否运行
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker 未运行，请启动 Docker Desktop"
        return 1
    fi
    return 0
}

# 启动基础设施服务（使用 Docker）
start_infra() {
    log_section "启动基础设施服务（Docker）"

    # 检查 Docker
    if ! check_docker; then
        return 1
    fi

    # 检查 docker-compose 文件
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "未找到 docker-compose 文件: $DOCKER_COMPOSE_FILE"
        echo "  请设置 IMODELHUB_DIR 环境变量指向正确的目录"
        return 1
    fi

    log_info "使用 Docker Compose 启动基础设施..."

    # 启动 PostgreSQL（必需：数据库存储）
    if check_port 5432; then
        log_success "PostgreSQL 已在运行 (端口: 5432)"
    else
        log_info "启动 PostgreSQL (Docker)..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up postgres -d
        if wait_for_service "PostgreSQL" "tcp://localhost:5432" 30; then
            log_success "PostgreSQL 启动成功"
        else
            log_error "PostgreSQL 启动失败"
            return 1
        fi
    fi

    # 启动 Maildev（必需：邮件服务，注册/找回密码需要）
    if check_port 1025; then
        log_success "Maildev 已在运行 (SMTP: 1025, Web: 1080)"
    else
        log_info "启动 Maildev (Docker)..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up maildev -d
        if wait_for_service "Maildev SMTP" "tcp://localhost:1025" 30; then
            log_success "Maildev 启动成功 (Web界面: http://localhost:1080)"
        else
            log_error "Maildev 启动失败"
            return 1
        fi
    fi

    # 启动 Azurite（必需：Blob存储）
    if check_port 10000; then
        log_success "Azurite 已在运行 (端口: 10000)"
    else
        log_info "启动 Azurite (Docker)..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up azurite -d
        if wait_for_service "Azurite" "http://127.0.0.1:10000/devstoreaccount1?comp=list" 30; then
            log_success "Azurite 启动成功"
        else
            log_error "Azurite 启动失败"
            return 1
        fi
    fi

    # 启动 Redis（必需：缓存、会话）
    if check_port 6379; then
        log_success "Redis 已在运行 (端口: 6379)"
    else
        log_info "启动 Redis (Docker)..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up redis -d
        if wait_for_service "Redis" "tcp://localhost:6379" 30; then
            log_success "Redis 启动成功"
        else
            log_error "Redis 启动失败"
            return 1
        fi
    fi

    # 启动 Adminer（可选：数据库管理界面）
    if check_port 8080; then
        log_success "Adminer 已在运行 (端口: 8080)"
    else
        log_info "启动 Adminer (Docker，可选)..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" up adminer -d
        if wait_for_service "Adminer" "http://localhost:8080" 30; then
            log_success "Adminer 启动成功 (http://localhost:8080)"
        else
            log_warning "Adminer 启动失败（可选服务，不影响主要功能）"
        fi
    fi

    log_success "所有基础设施服务已启动"
}

# 启动 imodelhub-services（本地）
start_imodelhub() {
    log_section "启动 imodelhub-services（本地）"

    if check_port 4000; then
        # Port is occupied - find and save the actual PID
        local actual_pid
        actual_pid=$(lsof -Pi :4000 -sTCP:LISTEN -t 2>/dev/null | head -1)
        if [ -n "$actual_pid" ]; then
            save_pid "imodelhub" "$actual_pid"
            log_success "imodelhub-services 已在运行 (端口: 4000, PID: $actual_pid)"
        else
            log_success "imodelhub-services 已在运行 (端口: 4000)"
        fi
        return 0
    fi

    if [ ! -d "$IMODELHUB_DIR" ]; then
        log_error "未找到 imodelhub-services 目录: $IMODELHUB_DIR"
        echo "  请设置 IMODELHUB_DIR 环境变量指向正确的目录"
        return 1
    fi

    log_info "在 $IMODELHUB_DIR 启动 imodelhub-services (生产模式)..."

    cd "$IMODELHUB_DIR"
    # 检查是否需要构建
    if [ ! -f "dist/main.js" ]; then
        log_info "  首次启动，正在构建..."
        npm run build > /tmp/open-cloud-cad/imodelhub-build.log 2>&1
        if [ $? -ne 0 ]; then
            log_error "构建失败，查看日志: tail -f /tmp/open-cloud-cad/imodelhub-build.log"
            cd - > /dev/null
            return 1
        fi
        log_success "  构建完成"
    fi

    npm run start:prod > /tmp/open-cloud-cad/imodelhub.log 2>&1 &
    IMODELHUB_PID=$!
    save_pid "imodelhub" "$IMODELHUB_PID"
    cd - > /dev/null

    if wait_for_service "imodelhub-services" "http://localhost:4000/health/live" 60; then
        log_success "imodelhub-services 启动成功 (生产模式, PID: $IMODELHUB_PID)"
        echo "  日志: tail -f /tmp/open-cloud-cad/imodelhub.log"
    else
        log_error "imodelhub-services 启动失败"
        echo "  查看日志: tail -f /tmp/open-cloud-cad/imodelhub.log"
        return 1
    fi
}

# 启动 backend（本地）
start_backend() {
    log_section "启动 Open Cloud CAD Backend（本地）"

    if check_port 4001; then
        # Port is occupied - find and save the actual PID
        local actual_pid
        actual_pid=$(lsof -Pi :4001 -sTCP:LISTEN -t 2>/dev/null | head -1)
        if [ -n "$actual_pid" ]; then
            save_pid "backend" "$actual_pid"
            log_success "Backend 已在运行 (端口: 4001, PID: $actual_pid)"
        else
            log_success "Backend 已在运行 (端口: 4001)"
        fi
        return 0
    fi

    log_info "启动 Backend..."

    cd ../backend
    npm run dev > /tmp/open-cloud-cad/backend.log 2>&1 &
    BACKEND_PID=$!
    save_pid "backend" "$BACKEND_PID"
    cd - > /dev/null

    if wait_for_service "Backend" "http://localhost:4001/health" 30; then
        log_success "Backend 启动成功 (PID: $BACKEND_PID)"
        echo "  日志: tail -f /tmp/open-cloud-cad/backend.log"
    else
        log_error "Backend 启动失败"
        echo "  查看日志: tail -f /tmp/open-cloud-cad/backend.log"
        return 1
    fi
}

# 启动 web-agent（本地）
start_web_agent() {
    log_section "启动 Web-Agent（本地）"

    if check_port 4002; then
        # Port is occupied - find and save the actual PID
        local actual_pid
        actual_pid=$(lsof -Pi :4002 -sTCP:LISTEN -t 2>/dev/null | head -1)
        if [ -n "$actual_pid" ]; then
            save_pid "web-agent" "$actual_pid"
            log_success "Web-Agent 已在运行 (端口: 4002, PID: $actual_pid)"
        else
            log_success "Web-Agent 已在运行 (端口: 4002)"
        fi
        return 0
    fi

    log_info "启动 Web-Agent..."

    cd ../web-agent
    npm run dev > /tmp/open-cloud-cad/web-agent.log 2>&1 &
    WEB_AGENT_PID=$!
    save_pid "web-agent" "$WEB_AGENT_PID"
    cd - > /dev/null

    if wait_for_service "Web-Agent" "http://localhost:4002/health" 30; then
        log_success "Web-Agent 启动成功 (PID: $WEB_AGENT_PID)"
        echo "  日志: tail -f /tmp/open-cloud-cad/web-agent.log"
    else
        log_error "Web-Agent 启动失败"
        echo "  查看日志: tail -f /tmp/open-cloud-cad/web-agent.log"
        return 1
    fi
}

# 启动前端（本地）
start_web() {
    log_section "启动 Frontend（本地）"

    if check_port 3000; then
        # Port is occupied - find and save the actual PID
        local actual_pid
        actual_pid=$(lsof -Pi :3000 -sTCP:LISTEN -t 2>/dev/null | head -1)
        if [ -n "$actual_pid" ]; then
            save_pid "web" "$actual_pid"
            log_success "Frontend 已在运行 (端口: 3000, PID: $actual_pid)"
        else
            log_success "Frontend 已在运行 (端口: 3000)"
        fi
        return 0
    fi

    log_info "启动 Frontend..."

    cd apps/web
    npm run dev > /tmp/open-cloud-cad/web.log 2>&1 &
    WEB_PID=$!
    save_pid "web" "$WEB_PID"
    cd - > /dev/null

    # 前端启动较慢，给更多时间
    sleep 5

    if check_port 3000; then
        log_success "Frontend 启动成功 (PID: $WEB_PID)"
        echo "  日志: tail -f /tmp/open-cloud-cad/web.log"
    else
        log_warning "Frontend 可能仍在启动中..."
        echo "  查看日志: tail -f /tmp/open-cloud-cad/web.log"
    fi
}

# 停止所有服务
stop_all() {
    log_section "停止所有服务"

    # 停止本地应用服务
    log_info "停止本地应用服务..."
    for service in imodelhub backend web-agent web; do
        pid=$(get_pid "$service")
        if [ -n "$pid" ]; then
            if kill -0 "$pid" 2>/dev/null; then
                log_info "  停止 $service (PID: $pid)..."
                kill "$pid" 2>/dev/null || true
                sleep 1
                if kill -0 "$pid" 2>/dev/null; then
                    kill -9 "$pid" 2>/dev/null || true
                fi
            fi
            rm -f "$PID_DIR/$service.pid"
        fi
    done

    # 停止端口上的其他进程
    for port in 4000 4001 4002 3000; do
        pids=$(lsof -Pi :"$port" -sTCP:LISTEN -t 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log_info "  终止端口 $port 的进程..."
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    done

    log_success "本地应用服务已停止"

    # 停止 Docker 基础设施
    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        log_info "停止 Docker 基础设施..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        log_success "Docker 基础设施已停止"
    fi
}

# 显示服务状态
show_status() {
    log_section "服务状态"

    echo "【基础设施服务（Docker）】"
    printf "%-15s %-15s %-10s\n" "服务" "端口" "状态"
    echo "-----------------------------------------------"

    for service in postgres:5432 maildev:1025/SMTP azurite:10000 redis:6379 adminer:8080; do
        name=$(echo "$service" | cut -d: -f1)
        port_info=$(echo "$service" | cut -d: -f2)
        port=$(echo "$port_info" | cut -d/ -f1)
        label=$(echo "$port_info" | cut -s -d/ -f2)
        if [ -n "$label" ]; then
            port_display="$port($label)"
        else
            port_display="$port"
        fi
        if check_port "$port" 2>/dev/null; then
            status="${GREEN}运行中${NC}"
        else
            status="${RED}未运行${NC}"
        fi
        printf "%-15s %-15s %-20s\n" "$name" "$port_display" "$status"
    done

    echo ""
    echo "【应用服务（本地）】"
    printf "%-20s %-10s %-10s %-10s\n" "服务" "端口" "状态" "PID"
    echo "-----------------------------------------------"

    for service in imodelhub:4000 backend:4001 web-agent:4002 web:3000; do
        name=$(echo "$service" | cut -d: -f1)
        port=$(echo "$service" | cut -d: -f2)
        pid=$(get_pid "$name")

        if check_port "$port" 2>/dev/null; then
            status="${GREEN}运行中${NC}"
            pid_info="${pid:-"N/A"}"
        else
            status="${RED}未运行${NC}"
            pid_info="-"
        fi

        printf "%-20s %-10s %-20s %-10s\n" "$name" "$port" "$status" "$pid_info"
    done

    echo ""
    echo "【健康检查】"
    if check_health "http://localhost:4000/health/live" 2; then
        echo -e "  imodelhub-services: ${GREEN}健康${NC}"
    else
        echo -e "  imodelhub-services: ${RED}异常${NC}"
    fi

    if check_health "http://localhost:4001/health" 2; then
        echo -e "  backend:           ${GREEN}健康${NC}"
    else
        echo -e "  backend:           ${RED}异常${NC}"
    fi

    if check_health "http://localhost:4002/health" 2; then
        echo -e "  web-agent:         ${GREEN}健康${NC}"
    else
        echo -e "  web-agent:         ${RED}异常${NC}"
    fi
}

# 显示使用信息
show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "启动规范："
    echo "  - 公共服务组件（PostgreSQL, Redis, Azurite）必须使用 Docker 启动"
    echo "  - 自研服务（imodelhub-services, backend, web-agent, frontend）使用本地 npm 启动"
    echo ""
    echo "Commands:"
    echo "  all       启动所有服务（默认）"
    echo "  infra     只启动基础设施（Docker: postgres, azurite, redis）"
    echo "  services  只启动应用服务（本地: imodelhub, backend, web-agent）"
    echo "  web       只启动前端（本地）"
    echo "  stop      停止所有服务（包括 Docker 基础设施）"
    echo "  status    查看服务状态"
    echo "  logs      查看服务日志"
    echo ""
    echo "Examples:"
    echo "  $0              # 启动所有服务"
    echo "  $0 infra        # 只启动 Docker 基础设施"
    echo "  $0 stop         # 停止所有服务"
    echo "  $0 status       # 查看服务状态"
    echo ""
    echo "环境变量:"
    echo "  IMODELHUB_DIR   imodelhub-services 目录路径（默认: /Users/xunzhang/Documents/GitHub/imodelhub-services）"
}

# 主命令处理
case "${1:-all}" in
    all)
        mkdir -p /tmp/open-cloud-cad
        start_infra
        start_imodelhub
        start_backend
        start_web_agent
        start_web

        echo ""
        log_success "所有服务启动完成！"
        echo ""
        echo "【基础设施服务（Docker）】"
        echo "  🗄️  PostgreSQL:         localhost:5432"
        echo "  ✉️  Maildev SMTP:       localhost:1025"
        echo "     Maildev Web:        http://localhost:1080"
        echo "  💾 Azurite:            http://localhost:10000"
        echo "  🔴 Redis:              localhost:6379"
        echo "  🔧 Adminer:            http://localhost:8080 (可选)"
        echo ""
        echo "【应用服务（本地）】"
        echo "  📡 imodelhub-services: http://localhost:4000"
        echo "  🔧 Backend:            http://localhost:4001"
        echo "  📨 Web-Agent:          http://localhost:4002"
        echo "  🌐 Frontend:           http://localhost:3000"
        echo ""
        echo "日志文件:"
        echo "  tail -f /tmp/open-cloud-cad/*.log"
        echo ""
        echo "停止所有服务:"
        echo "  $0 stop"
        ;;

    infra)
        start_infra
        ;;

    services)
        start_imodelhub
        start_backend
        start_web_agent
        ;;

    web)
        start_web
        ;;

    imodelhub)
        start_imodelhub
        ;;

    backend)
        start_backend
        ;;

    web-agent)
        start_web_agent
        ;;

    stop)
        stop_all
        ;;

    status)
        show_status
        ;;

    logs)
        if [ -f "/tmp/open-cloud-cad/$2.log" ]; then
            tail -f "/tmp/open-cloud-cad/$2.log"
        else
            echo "查看所有日志:"
            tail -f /tmp/open-cloud-cad/*.log
        fi
        ;;

    help|--help|-h)
        show_usage
        ;;

    *)
        log_error "未知命令: $1"
        show_usage
        exit 1
        ;;
esac
