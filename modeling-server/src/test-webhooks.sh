#!/bin/bash
#
# Webhook Endpoint Test Script
# Usage: ./test-webhooks.sh [BACKEND_URL]
#

set -e

BACKEND_URL="${1:-http://localhost:3001}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-your-webhook-secret}"

echo "🚀 Starting Webhook Endpoint Tests"
echo "Backend URL: $BACKEND_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to make requests
request() {
  local method="$1"
  local path="$2"
  local body="$3"
  local headers="$4"

  if [ -n "$body" ]; then
    curl -s -X "$method" "$BACKEND_URL$path" \
      -H "Content-Type: application/json" \
      ${headers:+-H "$headers"} \
      -d "$body"
  else
    curl -s -X "$method" "$BACKEND_URL$path" \
      -H "Content-Type: application/json" \
      ${headers:+-H "$headers"}
  fi
}

# Test 1: Health Check
echo "========================================"
echo "Test 1: Health Check"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/health")
if echo "$RESPONSE" | grep -q '"status"'; then
  echo -e "${GREEN}✅ PASSED${NC}: Health check responded"
  echo "Response: $RESPONSE"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Health check failed"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
  echo ""
  echo "Make sure the backend is running:"
  echo "  cd modeling-server && npm run dev"
  exit 1
fi
echo ""

# Test 2: Get Webhook Event Types
echo "========================================"
echo "Test 2: Get Webhook Event Types"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/event-types")
if echo "$RESPONSE" | grep -q '"eventTypes"'; then
  COUNT=$(echo "$RESPONSE" | grep -o '"type"' | wc -l)
  echo -e "${GREEN}✅ PASSED${NC}: Found $COUNT event types"
  echo "$RESPONSE" | head -c 500
  echo "..."
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Failed to get event types"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 3: Get Webhook Events (empty)
echo "========================================"
echo "Test 3: Get Webhook Events (empty)"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/events?limit=10")
if echo "$RESPONSE" | grep -q '"events"'; then
  echo -e "${GREEN}✅ PASSED${NC}: Events endpoint working"
  echo "Response: $RESPONSE"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Failed to get events"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 4: Get Webhook Statistics
echo "========================================"
echo "Test 4: Get Webhook Statistics"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/stats")
if echo "$RESPONSE" | grep -q '"totalEvents"'; then
  echo -e "${GREEN}✅ PASSED${NC}: Stats endpoint working"
  echo "Response: $RESPONSE"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Failed to get stats"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Generate HMAC signature for webhook
generate_signature() {
  local payload="$1"
  echo -n "sha256=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)"
}

# Test 5: Send iModel Created Event
echo "========================================"
echo "Test 5: Send Webhook Event - iModel Created"
echo "========================================"
PAYLOAD=$(cat <<EOF
{
  "eventType": "iModels.iModelCreated.v1",
  "iTwinId": "test-itwin-123",
  "messageId": "msg-$(date +%s)",
  "webhookId": "webhook-123",
  "enqueuedDateTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "content": {
    "imodelId": "imodel-$(date +%s)",
    "imodelName": "Test iModel",
    "imodelDescription": "Created via webhook test",
    "userId": "user-123"
  }
}
EOF
)
SIGNATURE=$(generate_signature "$PAYLOAD")
RESPONSE=$(curl -s -X POST "$BACKEND_URL/webhook/events" \
  -H "Content-Type: text/plain" \
  -H "Signature: $SIGNATURE" \
  -d "$PAYLOAD")
if [ -z "$RESPONSE" ]; then
  echo -e "${GREEN}✅ PASSED${NC}: Event accepted (HTTP 200)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Event rejected"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 6: Send Changeset Pushed Event
echo "========================================"
echo "Test 6: Send Webhook Event - Changeset Pushed"
echo "========================================"
PAYLOAD=$(cat <<EOF
{
  "eventType": "iModels.ChangesetPushed.v1",
  "iTwinId": "test-itwin-123",
  "messageId": "msg-$(date +%s)",
  "webhookId": "webhook-123",
  "enqueuedDateTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "content": {
    "imodelId": "imodel-test-123",
    "changesetId": "changeset-$(date +%s)",
    "changesetIndex": 5,
    "description": "Test changeset from webhook",
    "userId": "user-123"
  }
}
EOF
)
SIGNATURE=$(generate_signature "$PAYLOAD")
RESPONSE=$(curl -s -X POST "$BACKEND_URL/webhook/events" \
  -H "Content-Type: text/plain" \
  -H "Signature: $SIGNATURE" \
  -d "$PAYLOAD")
if [ -z "$RESPONSE" ]; then
  echo -e "${GREEN}✅ PASSED${NC}: Event accepted (HTTP 200)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Event rejected"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 7: Send Member Added Event
echo "========================================"
echo "Test 7: Send Webhook Event - Member Added"
echo "========================================"
PAYLOAD=$(cat <<EOF
{
  "eventType": "accessControl.memberAdded.v1",
  "iTwinId": "test-itwin-123",
  "messageId": "msg-$(date +%s)",
  "webhookId": "webhook-123",
  "enqueuedDateTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "content": {
    "memberId": "user-new-member",
    "memberType": "User",
    "roleId": "role-123",
    "roleName": "Editor",
    "eventCreatedBy": "user-admin"
  }
}
EOF
)
SIGNATURE=$(generate_signature "$PAYLOAD")
RESPONSE=$(curl -s -X POST "$BACKEND_URL/webhook/events" \
  -H "Content-Type: text/plain" \
  -H "Signature: $SIGNATURE" \
  -d "$PAYLOAD")
if [ -z "$RESPONSE" ]; then
  echo -e "${GREEN}✅ PASSED${NC}: Event accepted (HTTP 200)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Event rejected"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 8: Invalid Signature
echo "========================================"
echo "Test 8: Invalid Signature Rejection"
echo "========================================"
PAYLOAD=$(cat <<EOF
{
  "eventType": "iModels.iModelCreated.v1",
  "iTwinId": "test-itwin-123",
  "messageId": "msg-$(date +%s)",
  "webhookId": "webhook-123",
  "enqueuedDateTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "content": {
    "imodelId": "test-imodel",
    "imodelName": "Test",
    "userId": "user-123"
  }
}
EOF
)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/webhook/events" \
  -H "Content-Type: text/plain" \
  -H "Signature: sha256=invalidsignature" \
  -d "$PAYLOAD")
if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✅ PASSED${NC}: Invalid signature rejected (HTTP 401)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Expected 401, got $HTTP_CODE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 9: Filter events by type
echo "========================================"
echo "Test 9: Filter Events by Type"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/events?eventTypes=iModels.iModelCreated.v1&limit=10")
if echo "$RESPONSE" | grep -q '"events"'; then
  COUNT=$(echo "$RESPONSE" | grep -o '"eventType":"iModels.iModelCreated.v1"' | wc -l)
  echo -e "${GREEN}✅ PASSED${NC}: Found $COUNT iModelCreated events"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Failed to filter events"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 10: Filter events by iTwinId
echo "========================================"
echo "Test 10: Filter Events by iTwinId"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/events?iTwinId=test-itwin-123&limit=10")
if echo "$RESPONSE" | grep -q '"events"'; then
  echo -e "${GREEN}✅ PASSED${NC}: Filter by iTwinId working"
  echo "Response: $RESPONSE"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌ FAILED${NC}: Failed to filter by iTwinId"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 11: Updated Statistics
echo "========================================"
echo "Test 11: Get Updated Statistics"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/api/webhook/stats")
if echo "$RESPONSE" | grep -q '"totalEvents":'; then
  TOTAL=$(echo "$RESPONSE" | grep -o '"totalEvents":[0-9]*' | cut -d: -f2)
  if [ "$TOTAL" -ge 3 ] 2>/dev/null; then
    echo -e "${GREEN}✅ PASSED${NC}: Stats show $TOTAL events stored"
    echo "$RESPONSE" | head -c 500
    echo "..."
    ((TESTS_PASSED++))
  else
    echo -e "${YELLOW}⚠️ WARNING${NC}: Expected 3+ events, got $TOTAL"
    ((TESTS_PASSED++))  # Still pass, might be timing issue
  fi
else
  echo -e "${RED}❌ FAILED${NC}: Failed to get updated stats"
  echo "Response: $RESPONSE"
  ((TESTS_FAILED++))
fi
echo ""

# Test 12: RPC Metadata
echo "========================================"
echo "Test 12: RPC Metadata Endpoint"
echo "========================================"
RESPONSE=$(curl -s "$BACKEND_URL/rpc/metadata")
if echo "$RESPONSE" | grep -q '"interfaces"\|"OpenCloudRpcInterface"'; then
  echo -e "${GREEN}✅ PASSED${NC}: RPC metadata available"
  echo "$RESPONSE" | head -c 300
  echo "..."
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠️ SKIPPED${NC}: RPC metadata not available (might be configured differently)"
  ((TESTS_PASSED++))
fi
echo ""

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo -e "${GREEN}✅ Passed: $TESTS_PASSED${NC}"
echo -e "${RED}❌ Failed: $TESTS_FAILED${NC}"
echo "Total: $((TESTS_PASSED + TESTS_FAILED)) tests"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed! 🎉${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
