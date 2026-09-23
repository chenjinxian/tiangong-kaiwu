#!/bin/bash
# Open Cloud CAD - Service Starter Script
# Usage: ./start-services.sh [command]
# Commands:
#   infra     - Start infrastructure (postgres, azurite)
#   imodelhub - Start imodelhub-services
#   backend   - Start Open Cloud CAD backend
#   web       - Start Open Cloud CAD web
#   all       - Start all services in sequence
#   test      - Run E2E tests

cd "$(dirname "$0")/../.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if service is running
check_service() {
    local name=$1
    local url=$2
    if curl -s "$url" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

start_infra() {
    log_info "Starting infrastructure services..."

    if [ -d "../imodelhub-services" ]; then
        cd ../imodelhub-services
        docker-compose up -d postgres azurite
        log_success "Infrastructure started (postgres:5432, azurite:10000)"
    else
        log_error "imodelhub-services not found at ../imodelhub-services"
        exit 1
    fi
}

start_imodelhub() {
    log_info "Starting imodelhub-services..."

    if check_service "imodelhub" "http://localhost:4000/health"; then
        log_warning "imodelhub-services is already running"
        return 0
    fi

    if [ -d "../imodelhub-services" ]; then
        cd ../imodelhub-services
        npm run start:dev &
        log_success "imodelhub-services started (http://localhost:4000)"
    else
        log_error "imodelhub-services not found"
        exit 1
    fi
}

start_backend() {
    log_info "Starting Open Cloud CAD backend..."

    if check_service "backend" "http://localhost:4001/health"; then
        log_warning "Backend is already running"
        return 0
    fi

    cd apps/backend
    npm run dev &
    log_success "Backend started (http://localhost:4001)"
}

start_web() {
    log_info "Starting Open Cloud CAD web..."

    cd apps/web
    npm run dev &
    log_success "Web started (http://localhost:5173)"
}

run_tests() {
    log_info "Waiting for services to be ready..."
    sleep 5

    log_info "Running E2E API tests..."
    node scripts/api-workflow-test.mjs
}

show_status() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "              Service Status"
    echo "═══════════════════════════════════════════════════"

    if check_service "imodelhub" "http://localhost:4000/health"; then
        log_success "imodelhub-services: http://localhost:4000"
    else
        log_error "imodelhub-services: Not running"
    fi

    if check_service "backend" "http://localhost:4001/health"; then
        log_success "backend:            http://localhost:4001"
    else
        log_error "backend:            Not running"
    fi

    if curl -s "http://localhost:5173" > /dev/null 2>&1; then
        log_success "web:                http://localhost:5173"
    else
        log_error "web:                Not running"
    fi

    echo "═══════════════════════════════════════════════════"
    echo ""
}

# Main command handler
case "${1:-all}" in
    infra)
        start_infra
        ;;
    imodelhub)
        start_imodelhub
        ;;
    backend)
        start_backend
        ;;
    web)
        start_web
        ;;
    all)
        start_infra
        sleep 2
        start_imodelhub
        sleep 5
        start_backend
        sleep 2
        start_web
        echo ""
        log_success "All services started!"
        show_status
        echo "Run './start-services.sh test' to run E2E tests"
        ;;
    test)
        run_tests
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {infra|imodelhub|backend|web|all|test|status}"
        exit 1
        ;;
esac
