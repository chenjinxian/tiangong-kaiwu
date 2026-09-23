#!/bin/bash
#
# Open Cloud CAD - Development Services Startup Script
#
# This script starts all required services for iModel creation testing.
# Run from the open-cloud-cad directory.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Open Cloud CAD - Dev Services Startup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/web-agent" ]; then
    echo -e "${RED}Error: Please run this script from the open-cloud-cad directory${NC}"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a service
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -n "Waiting for $name..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e " ${GREEN}OK${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    echo -e " ${RED}FAILED${NC}"
    return 1
}

# ============================================
# Step 1: Check prerequisites
# ============================================
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check Azurite
if ! command -v azurite &> /dev/null; then
    echo -e "${RED}Azurite not found. Install with: npm install -g azurite${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Azurite installed"

# Check if PostgreSQL is running
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}  ! PostgreSQL may not be running. Start it with: docker-compose up postgres -d${NC}"
else
    echo -e "  ${GREEN}✓${NC} PostgreSQL is running"
fi

echo ""

# ============================================
# Step 2: Start Azurite (if not running)
# ============================================
echo -e "${YELLOW}Step 2: Starting Azurite...${NC}"

if check_port 10000; then
    echo -e "  ${GREEN}✓${NC} Azurite already running on port 10000"
else
    echo "  Starting Azurite blob service..."
    azurite-blob --blobHost 127.0.0.1 --blobPort 10000 --silent &
    AZURITE_PID=$!
    sleep 2
    if check_port 10000; then
        echo -e "  ${GREEN}✓${NC} Azurite started (PID: $AZURITE_PID)"
    else
        echo -e "  ${RED}✗${NC} Failed to start Azurite"
        exit 1
    fi
fi

echo ""

# ============================================
# Step 3: Check imodelhub-services
# ============================================
echo -e "${YELLOW}Step 3: Checking imodelhub-services...${NC}"

IMODELHUB_DIR="/Users/xunzhang/Documents/GitHub/imodelhub-services"
if [ ! -d "$IMODELHUB_DIR" ]; then
    echo -e "${RED}Error: imodelhub-services not found at $IMODELHUB_DIR${NC}"
    exit 1
fi

if check_port 4000; then
    echo -e "  ${GREEN}✓${NC} imodelhub-services already running on port 4000"
else
    echo -e "  ${YELLOW}!${NC} imodelhub-services not running"
    echo "  Start it manually:"
    echo "    cd $IMODELHUB_DIR"
    echo "    npm run start:dev"
    echo ""
    echo -e "  ${YELLOW}Waiting for imodelhub-services to start...${NC}"
    if ! wait_for_service "imodelhub-services" "http://localhost:4000/health" 60; then
        echo -e "${RED}imodelhub-services failed to start${NC}"
        exit 1
    fi
fi

echo ""

# ============================================
# Step 4: Start web-agent
# ============================================
echo -e "${YELLOW}Step 4: Starting web-agent...${NC}"

if check_port 4002; then
    echo -e "  ${GREEN}✓${NC} web-agent already running on port 4002"
else
    echo "  Building web-agent..."
    cd apps/web-agent

    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo -e "  ${YELLOW}!${NC} Creating default .env file"
        cat > .env << 'EOF'
# Webhook secret (must match database)
WEBHOOK_SECRET=test-webhook-secret-12345

# Server port
PORT=4002

# Forward to backend (optional)
BACKEND_URL=http://localhost:4001

# Azurite Blob Storage
BLOB_STORAGE_URL=http://127.0.0.1:10000/devstoreaccount1
BLOB_ACCOUNT_NAME=devstoreaccount1
BLOB_ACCOUNT_KEY=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
BLOB_CONTAINER_NAME=imodel-baselines

# iModelHub Services API
IMODELHUB_API_URL=http://localhost:4000
IMODELHUB_API_KEY=

# Debug
DEBUG=true
EOF
    fi

    echo "  Starting web-agent..."
    npm run dev &
    WEB_AGENT_PID=$!
    cd ../..

    if wait_for_service "web-agent" "http://localhost:4002/health" 30; then
        echo -e "  ${GREEN}✓${NC} web-agent started (PID: $WEB_AGENT_PID)"
    else
        echo -e "  ${RED}✗${NC} web-agent failed to start"
        exit 1
    fi
fi

echo ""

# ============================================
# Step 5: Start frontend
# ============================================
echo -e "${YELLOW}Step 5: Starting frontend...${NC}"

if check_port 3000; then
    echo -e "  ${GREEN}✓${NC} Frontend already running on port 3000"
else
    echo "  Starting frontend dev server..."
    cd apps/web
    npm run dev &
    FRONTEND_PID=$!
    cd ../..

    if wait_for_service "frontend" "http://localhost:3000" 60; then
        echo -e "  ${GREEN}✓${NC} Frontend started (PID: $FRONTEND_PID)"
    else
        echo -e "  ${YELLOW}!${NC} Frontend may still be starting (check manually)"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services are running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services:"
echo "  - Azurite Blob Storage: http://127.0.0.1:10000"
echo "  - imodelhub-services:   http://localhost:4000"
echo "  - web-agent:            http://localhost:4002"
echo "  - Frontend:             http://localhost:3000"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Login and navigate to an iTwin"
echo "  3. Click 'Create iModel' to test the workflow"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop this script (services will keep running)${NC}"

# Keep script running to show services are active
wait
