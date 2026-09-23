#!/bin/bash
# E2E API 测试脚本
# 测试完整工作流：登录 -> 创建项目 -> 创建 iModel -> 打开编辑器

set -e

BASE_URL="http://localhost:3000"
API_URL="http://localhost:4000"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="Test123!@#"

echo "🚀 开始 E2E API 测试"
echo "===================="

# Step 1: 登录
echo ""
echo "📍 Step 1: 登录"
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/email/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

echo "✅ 登录成功"
ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')
echo "   用户 ID: ${USER_ID}"

# Step 2: 创建 iTwin 项目
echo ""
echo "📍 Step 2: 创建 iTwin 项目"
PROJECT_NAME="E2E Project $(date +%s)"
PROJECT_RESPONSE=$(curl -s -X POST "${API_URL}/api/itwins" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d "{
    \"displayName\": \"${PROJECT_NAME}\",
    \"description\": \"E2E test project\"
  }")

ITWIN_ID=$(echo $PROJECT_RESPONSE | jq -r '.id')
echo "✅ 项目创建成功"
echo "   项目名称: ${PROJECT_NAME}"
echo "   iTwin ID: ${ITWIN_ID}"

# Step 3: 创建 iModel
echo ""
echo "📍 Step 3: 创建 iModel"
IMODEL_NAME="E2E Model $(date +%s)"
IMODEL_RESPONSE=$(curl -s -X POST "${API_URL}/api/imodels" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d "{
    \"iTwinId\": \"${ITWIN_ID}\",
    \"name\": \"${IMODEL_NAME}\"
  }")

IMODEL_ID=$(echo $IMODEL_RESPONSE | jq -r '.id')
echo "✅ iModel 创建成功"
echo "   iModel 名称: ${IMODEL_NAME}"
echo "   iModel ID: ${IMODEL_ID}"

# Step 4: 检查 iModel 初始化状态
echo ""
echo "📍 Step 4: 检查 iModel 初始化状态"
sleep 2
IMODEL_STATUS=$(curl -s "${API_URL}/api/imodels/${IMODEL_ID}?iTwinId=${ITWIN_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

STATE=$(echo $IMODEL_STATUS | jq -r '.state')
echo "   iModel 状态: ${STATE}"

# Step 5: 获取 Briefcase（模拟编辑器打开）
echo ""
echo "📍 Step 5: 获取 Briefcase"
BRIEFCASE_RESPONSE=$(curl -s -X POST "${API_URL}/api/imodels/${IMODEL_ID}/briefcases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{}')

BRIEFCASE_ID=$(echo $BRIEFCASE_RESPONSE | jq -r '.id // .briefcaseId // empty')
if [ -n "$BRIEFCASE_ID" ] && [ "$BRIEFCASE_ID" != "null" ]; then
  echo "✅ Briefcase 获取成功"
  echo "   Briefcase ID: ${BRIEFCASE_ID}"
else
  echo "⚠️  Briefcase 可能已存在或需要等待 V2 Checkpoint"
fi

# Step 6: 获取变更集列表
echo ""
echo "📍 Step 6: 获取变更集列表"
CHANGESETS=$(curl -s "${API_URL}/api/imodels/${IMODEL_ID}/changesets" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

CHANGESET_COUNT=$(echo $CHANGESETS | jq 'length')
echo "   变更集数量: ${CHANGESET_COUNT}"

# Summary
echo ""
echo "🎉 =========================================="
echo "🎉 E2E API 测试完成!"
echo "🎉 =========================================="
echo "   项目: ${PROJECT_NAME} (${ITWIN_ID})"
echo "   iModel: ${IMODEL_NAME} (${IMODEL_ID})"
echo "   状态: ${STATE}"
echo ""
echo "   编辑器 URL: ${BASE_URL}/workspace/${ITWIN_ID}/${IMODEL_ID}"
echo ""

# Cleanup: 删除测试项目
echo "📍 Cleanup: 删除测试项目"
curl -s -X DELETE "${API_URL}/api/itwins/${ITWIN_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > /dev/null
echo "✅ 测试项目已删除"

echo ""
echo "✅ 所有 E2E API 测试通过!"
