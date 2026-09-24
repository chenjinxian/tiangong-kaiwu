#!/bin/bash
#
# LubanCAD - Setup Verification Script
#
# Verifies all components are properly configured for iModel creation testing.
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  LubanCAD - Setup Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Helper functions
check_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "  ${YELLOW}!${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

# ============================================
# 1. Directory Structure
# ============================================
echo -e "${YELLOW}1. Directory Structure${NC}"

if [ -d "apps/web" ]; then
    check_pass "Frontend app exists"
else
    check_fail "Frontend app missing (apps/web)"
fi

if [ -d "../webhook-agent" ]; then
    check_pass "Web-agent app exists"
else
    check_fail "Web-agent app missing (../webhook-agent)"
fi

IMODELHUB_DIR="${IMODELHUB_DIR:-$(cd "$(dirname "$0")/../../.." && pwd)/imodelhub-services}"
if [ -d "$IMODELHUB_DIR" ]; then
    check_pass "imodelhub-services found"
else
    check_fail "imodelhub-services not found (sibling repo; override with IMODELHUB_DIR env var)"
fi

echo ""

# ============================================
# 2. Service Health Checks
# ============================================
echo -e "${YELLOW}2. Service Health Checks${NC}"

# Azurite
if curl -s http://127.0.0.1:10000/devstoreaccount1?comp=list > /dev/null 2>&1; then
    check_pass "Azurite is running (port 10000)"
else
    check_fail "Azurite not responding (port 10000)"
    echo "    Start with: azurite-blob --blobHost 127.0.0.1 --blobPort 10000"
fi

# imodelhub-services
if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    check_pass "imodelhub-services is running (port 4000)"
else
    check_fail "imodelhub-services not responding (port 4000)"
    echo "    Start with: cd ../imodelhub-services && npm run start:dev"
fi

# webhook-agent
if curl -s http://localhost:4002/health > /dev/null 2>&1; then
    check_pass "webhook-agent is running (port 4002)"
else
    check_fail "webhook-agent not responding (port 4002)"
    echo "    Start with: cd ../webhook-agent && npm run dev"
fi

echo ""

# ============================================
# 3. Webhook Configuration
# ============================================
echo -e "${YELLOW}3. Webhook Configuration${NC}"

# Check webhook-agent .env
if [ -f "../webhook-agent/.env" ]; then
    WEBHOOK_SECRET=$(grep "WEBHOOK_SECRET" ../webhook-agent/.env | cut -d= -f2 || echo "")
    if [ -n "$WEBHOOK_SECRET" ]; then
        check_pass "webhook-agent WEBHOOK_SECRET configured"
    else
        check_warn "webhook-agent WEBHOOK_SECRET not set in .env"
    fi
else
    check_warn "webhook-agent .env file not found"
fi

# Check database webhook subscription (if psql available)
if command -v psql > /dev/null 2>&1; then
    if psql -d imodelhub -c "SELECT id FROM webhook_subscriptions WHERE active = true LIMIT 1" > /dev/null 2>&1; then
        COUNT=$(psql -d imodelhub -t -c "SELECT COUNT(*) FROM webhook_subscriptions WHERE active = true" 2>/dev/null | xargs)
        if [ "$COUNT" -gt 0 ]; then
            check_pass "Database has $COUNT active webhook subscription(s)"

            # Show details
            echo ""
            echo "    Active subscriptions:"
            psql -d imodelhub -c "SELECT scope, scope_id, callback_url, event_types FROM webhook_subscriptions WHERE active = true" 2>/dev/null | sed 's/^/    /'
        else
            check_fail "No active webhook subscriptions in database"
            echo "    Run: psql -d imodelhub -f \$IMODELHUB_DIR/scripts/setup-webhook-for-testing.sql"
        fi
    else
        check_warn "Could not query database (may need to configure connection)"
    fi
else
    check_warn "psql not available, skipping database check"
fi

echo ""

# ============================================
# 4. iTwin Availability
# ============================================
echo -e "${YELLOW}4. iTwin Availability${NC}"

if command -v psql > /dev/null 2>&1; then
    ITWIN_COUNT=$(psql -d imodelhub -t -c "SELECT COUNT(*) FROM itwins" 2>/dev/null | xargs)
    if [ "$ITWIN_COUNT" -gt 0 ] 2>/dev/null; then
        check_pass "Database has $ITWIN_COUNT iTwin(s)"

        echo ""
        echo "    Available iTwins:"
        psql -d imodelhub -c "SELECT id, display_name FROM itwins LIMIT 5" 2>/dev/null | sed 's/^/    /'
    else
        check_warn "No iTwins found in database"
        echo "    Create one first or check database connection"
    fi
else
    check_warn "psql not available, skipping iTwin check"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}========================================${NC}"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}  All checks passed! Ready for testing.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}  $WARNINGS warning(s) - may still work${NC}"
else
    echo -e "${RED}  $ERRORS error(s), $WARNINGS warning(s) - fix before testing${NC}"
fi
echo -e "${BLUE}========================================${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${YELLOW}Quick fixes:${NC}"
    echo "  1. Start Azurite:     azurite-blob --blobHost 127.0.0.1 --blobPort 10000"
    echo "  2. Start services:    ./scripts/start-dev-services.sh"
    echo "  3. Setup webhook:     psql -d imodelhub -f ../imodelhub-services/scripts/setup-webhook-for-testing.sql"
    echo ""
fi

exit $ERRORS
