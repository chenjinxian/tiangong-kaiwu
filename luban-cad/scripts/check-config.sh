#!/bin/bash
#
# Open Cloud CAD - 配置检查脚本
# 检查所有服务的配置是否一致，发现潜在问题
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

IMODELHUB_DIR="${IMODELHUB_DIR:-/Users/xunzhang/Documents/GitHub/imodelhub-services}"

echo "========================================"
echo "  Open Cloud CAD - 配置检查"
echo "========================================"
echo ""

errors=0
warnings=0

# 检查目录结构
check_directories() {
    log_info "检查目录结构..."

    if [ ! -d "$IMODELHUB_DIR" ]; then
        log_error "imodelhub-services 目录不存在: $IMODELHUB_DIR"
        errors=$((errors + 1))
    else
        log_success "imodelhub-services 目录存在"
    fi

    if [ ! -d "../backend" ]; then
        log_error "backend 应用目录不存在"
        errors=$((errors + 1))
    else
        log_success "backend 应用目录存在"
    fi

    if [ ! -d "../web-agent" ]; then
        log_error "web-agent 应用目录不存在"
        errors=$((errors + 1))
    else
        log_success "web-agent 应用目录存在"
    fi

    if [ ! -d "apps/web" ]; then
        log_error "web 应用目录不存在"
        errors=$((errors + 1))
    else
        log_success "web 应用目录存在"
    fi
}

# 检查 .env 文件
check_env_files() {
    log_info "检查环境配置文件..."

    # backend .env
    if [ ! -f "../backend/.env" ]; then
        log_warning "backend/.env 不存在，将从 .env.example 创建"
        if [ -f "../backend/.env.example" ]; then
            cp ../backend/.env.example ../backend/.env
            log_success "已创建 backend/.env"
        else
            log_error "backend/.env.example 也不存在"
            errors=$((errors + 1))
        fi
    else
        log_success "backend/.env 存在"
    fi

    # web-agent .env
    if [ ! -f "../web-agent/.env" ]; then
        log_warning "web-agent/.env 不存在，将从 .env.example 创建"
        if [ -f "../web-agent/.env.example" ]; then
            cp ../web-agent/.env.example ../web-agent/.env
            log_success "已创建 web-agent/.env"
        else
            log_error "web-agent/.env.example 也不存在"
            errors=$((errors + 1))
        fi
    else
        log_success "web-agent/.env 存在"
    fi

    # web .env
    if [ ! -f "apps/web/.env" ]; then
        log_warning "web/.env 不存在"
        warnings=$((warnings + 1))
    else
        log_success "web/.env 存在"
    fi
}

# 检查关键配置一致性
check_config_consistency() {
    log_info "检查配置一致性..."

    # 检查 webhook secret
    backend_secret=""
    webagent_secret=""

    if [ -f "../backend/.env" ]; then
        backend_secret=$(grep "WEBHOOK_SECRET" ../backend/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
    fi

    if [ -f "../web-agent/.env" ]; then
        webagent_secret=$(grep "WEBHOOK_SECRET" ../web-agent/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
    fi

    if [ "$backend_secret" != "$webagent_secret" ]; then
        log_error "WEBHOOK_SECRET 不一致:"
        echo "  backend:  '$backend_secret'"
        echo "  web-agent: '$webagent_secret'"
        errors=$((errors + 1))
    else
        log_success "WEBHOOK_SECRET 一致"
    fi

    # 检查端口配置
    backend_port=$(grep "PORT" ../backend/.env | head -1 | cut -d= -f2 | tr -d ' ')
    if [ "$backend_port" != "4001" ]; then
        log_warning "backend 端口不是 4001: $backend_port"
        warnings=$((warnings + 1))
    else
        log_success "backend 端口配置正确 (4001)"
    fi

    webagent_port=$(grep "PORT" ../web-agent/.env | head -1 | cut -d= -f2 | tr -d ' ')
    if [ "$webagent_port" != "4002" ]; then
        log_warning "web-agent 端口不是 4002: $webagent_port"
        warnings=$((warnings + 1))
    else
        log_success "web-agent 端口配置正确 (4002)"
    fi

    # 检查 Azurite 配置
    backend_azurite=$(grep "AZURITE_URL" ../backend/.env | cut -d= -f2 | tr -d ' ')
    webagent_azurite=$(grep "BLOB_STORAGE_URL" ../web-agent/.env | cut -d= -f2 | tr -d ' ')

    if [[ "$backend_azurite" != *"10000"* ]]; then
        log_warning "backend AZURITE_URL 可能配置错误: $backend_azurite"
        warnings=$((warnings + 1))
    else
        log_success "backend Azurite URL 配置正确"
    fi

    # 检查 IMODELHUB_URL
    backend_hub=$(grep "IMODELHUB_URL" ../backend/.env | cut -d= -f2 | tr -d ' ')
    webagent_hub=$(grep "IMODELHUB_API_URL" ../web-agent/.env | cut -d= -f2 | tr -d ' ')

    if [ -z "$backend_hub" ]; then
        log_error "backend IMODELHUB_URL 未设置"
        errors=$((errors + 1))
    else
        log_success "backend IMODELHUB_URL: $backend_hub"
    fi
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # Node.js
    if command -v node &> /dev/null; then
        node_version=$(node --version)
        log_success "Node.js: $node_version"
    else
        log_error "Node.js 未安装"
        errors=$((errors + 1))
    fi

    # npm
    if command -v npm &> /dev/null; then
        npm_version=$(npm --version)
        log_success "npm: $npm_version"
    else
        log_error "npm 未安装"
        errors=$((errors + 1))
    fi

    # Azurite
    if command -v azurite &> /dev/null; then
        azurite_version=$(azurite --version 2>&1 | head -1)
        log_success "Azurite: $azurite_version"
    else
        log_warning "Azurite 未安装 (npm install -g azurite)"
        warnings=$((warnings + 1))
    fi

    # PostgreSQL
    if command -v psql &> /dev/null; then
        psql_version=$(psql --version | head -1)
        log_success "PostgreSQL client: $psql_version"
    else
        log_warning "PostgreSQL client 未安装"
        warnings=$((warnings + 1))
    fi

    # Redis
    if command -v redis-cli &> /dev/null; then
        redis_version=$(redis-cli --version | head -1)
        log_success "Redis: $redis_version"
    else
        log_warning "Redis 未安装 (可选)"
        warnings=$((warnings + 1))
    fi
}

# 修复常见问题
fix_common_issues() {
    log_info "尝试修复常见问题..."

    # 修复 webhook secret 不一致
    backend_secret=$(grep "WEBHOOK_SECRET" ../backend/.env 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
    webagent_secret=$(grep "WEBHOOK_SECRET" ../web-agent/.env 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")

    if [ "$backend_secret" != "$webagent_secret" ]; then
        log_info "修复 WEBHOOK_SECRET 不一致..."

        # 使用 backend 的值
        if [ -n "$backend_secret" ]; then
            sed -i '' "s|WEBHOOK_SECRET=.*|WEBHOOK_SECRET=$backend_secret|" ../web-agent/.env
            log_success "已将 web-agent WEBHOOK_SECRET 更新为: $backend_secret"
        else
            # 使用统一的默认值
            echo "WEBHOOK_SECRET=local-dev-secret" >> ../backend/.env
            echo "WEBHOOK_SECRET=local-dev-secret" >> ../web-agent/.env
            log_success "已设置统一的 WEBHOOK_SECRET: local-dev-secret"
        fi
    fi
}

# 执行检查
check_directories
check_env_files
check_config_consistency
check_dependencies

echo ""
echo "========================================"
echo "  检查结果"
echo "========================================"

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    log_success "所有检查通过！"
    exit 0
elif [ $errors -eq 0 ]; then
    log_warning "发现 $warnings 个警告，但没有错误"
    echo ""
    read -p "是否尝试自动修复问题? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        fix_common_issues
    fi
    exit 0
else
    log_error "发现 $errors 个错误，$warnings 个警告"
    echo ""
    echo "请修复上述错误后再启动服务"
    exit 1
fi
