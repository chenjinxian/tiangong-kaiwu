#!/bin/bash

# Open Cloud CAD - Health Check Script
# Run this before and after deployment to verify all services are healthy

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service endpoints
IMODELHUB_URL="http://localhost:4000"
BACKEND_URL="http://localhost:4001"
WEB_AGENT_URL="http://localhost:4002"
AZURITE_URL="http://localhost:10000"

# Counters
ERRORS=0
WARNINGS=0

echo "=========================================="
echo "Open Cloud CAD - Health Check"
echo "=========================================="
echo ""

# Helper functions
check_service() {
    local name=$1
    local url=$2
    local endpoint=$3

    echo -n "Checking $name... "
    if curl -s "$url$endpoint" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((ERRORS++))
        return 1
    fi
}

check_azurite() {
    echo -n "Checking Azurite... "
    if curl -s "$AZURITE_URL/?comp=list" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ WARNING (may need authentication)${NC}"
        ((WARNINGS++))
        return 1
    fi
}

# 1. Check core services
echo "1. Core Services"
echo "----------------"
check_service "imodelhub-services" "$IMODELHUB_URL" "/health"
check_service "backend" "$BACKEND_URL" "/health"
check_service "web-agent" "$WEB_AGENT_URL" "/health"
check_azurite
echo ""

# 2. Check webhook configuration
echo "2. Webhook Configuration"
echo "------------------------"
echo -n "Checking web-agent recent events... "
EVENTS=$(curl -s "$WEB_AGENT_URL/webhook/events/recent" 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
if [ -n "$EVENTS" ]; then
    echo -e "${GREEN}✓ OK${NC} (events received: $EVENTS)"
else
    echo -e "${YELLOW}⚠ WARNING${NC} (no events or service down)"
    ((WARNINGS++))
fi
echo ""

# 3. Check for orphaned iModels
echo "3. Orphaned iModels Check"
echo "-------------------------"
echo -n "Checking compensation job status... "
COMPENSATION_STATUS=$(curl -s -H "X-API-Key: internal-api-key-for-web-agent" "$IMODELHUB_URL/imodels/admin/compensation-status" 2>/dev/null | grep -o '"pendingRepairs":[0-9]*' | cut -d: -f2)
if [ -n "$COMPENSATION_STATUS" ]; then
    if [ "$COMPENSATION_STATUS" -eq 0 ]; then
        echo -e "${GREEN}✓ OK${NC} (no pending repairs)"
    else
        echo -e "${RED}✗ FAILED${NC} ($COMPENSATION_STATUS iModels need repair)"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}⚠ WARNING${NC} (cannot check compensation status)"
    ((WARNINGS++))
fi
echo ""

# 4. Check database connectivity (via imodelhub-services)
echo "4. Database Status"
echo "------------------"
echo -n "Checking database... "
DB_STATUS=$(curl -s "$IMODELHUB_URL/health" 2>/dev/null | grep -o '"database":{"status":"[^"]*"' | cut -d'"' -f5)
if [ "$DB_STATUS" = "up" ]; then
    echo -e "${GREEN}✓ OK${NC} (connected)"
else
    echo -e "${RED}✗ FAILED${NC} (database down)"
    ((ERRORS++))
fi
echo ""

# 5. Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}All critical checks passed, but there are $WARNINGS warnings.${NC}"
    exit 0
else
    echo -e "${RED}Health check failed with $ERRORS errors and $WARNINGS warnings.${NC}"
    echo ""
    echo "Common fixes:"
    echo "  - Ensure all services are running: npm run start:all"
    echo "  - Check logs: tail -f /tmp/web-agent.log"
    echo "  - Repair failed baselines: curl -X POST $IMODELHUB_URL/imodels/admin/repair-baselines -H 'X-API-Key: internal-api-key-for-web-agent'"
    exit 1
fi
