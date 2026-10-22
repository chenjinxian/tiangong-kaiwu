#!/bin/bash
# Editor 模块配置验证脚本

echo "=========================================="
echo "  Editor 模块配置验证"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 验证函数
verify_json() {
    local file=$1
    if python3 -m json.tool "$file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $file 格式正确"
        return 0
    else
        echo -e "${RED}✗${NC} $file 格式错误"
        return 1
    fi
}

check_version() {
    local file=$1
    local version=$(grep '"version"' "$file" | head -1 | cut -d'"' -f4)
    echo "  版本: $version"
}

# 验证 package.json
echo "1. 验证 Package.json 文件"
echo "----------------------------"
verify_json "frontend/package.json"
check_version "frontend/package.json"
verify_json "backend/package.json"
check_version "backend/package.json"
verify_json "common/package.json"
check_version "common/package.json"
echo ""

# 验证 tsconfig.json
echo "2. 验证 TSConfig 文件"
echo "----------------------------"
verify_json "frontend/tsconfig.json"
verify_json "backend/tsconfig.json"
verify_json "common/tsconfig.json"
echo ""

# 验证 rush-project.json
echo "3. 验证 Rush Project 配置"
echo "----------------------------"
verify_json "frontend/config/rush-project.json"
verify_json "backend/config/rush-project.json"
verify_json "common/config/rush-project.json"
echo ""

# 验证本地化文件
echo "4. 验证本地化文件"
echo "----------------------------"
verify_json "frontend/src/public/locales/en/Editor.json"
echo ""

# 检查关键文件存在性
echo "5. 检查关键源文件"
echo "----------------------------"
files=(
    "frontend/src/editor-frontend.ts"
    "frontend/src/EditTool.ts"
    "frontend/src/SolidModelingTools.ts"
    "frontend/src/SolidPrimitiveTools.ts"
    "frontend/src/ElementGeometryTool.ts"
    "frontend/src/TransformElementsTool.ts"
    "frontend/src/ModifyCurveTools.ts"
    "backend/src/editor-backend.ts"
    "backend/src/EditCommand.ts"
    "backend/src/EditBuiltInCommand.ts"
    "common/src/editor-common.ts"
    "common/src/EditorIpc.ts"
    "common/src/EditorBuiltInIpc.ts"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file (缺失)"
    fi
done
echo ""

# 检查工具注册
echo "6. 检查工具注册"
echo "----------------------------"
if grep -q "SolidModelingTools" "frontend/src/EditTool.ts"; then
    echo -e "${GREEN}✓${NC} SolidModelingTools 已注册"
else
    echo -e "${RED}✗${NC} SolidModelingTools 未注册"
fi

if grep -q "SolidPrimitiveTools" "frontend/src/EditTool.ts"; then
    echo -e "${GREEN}✓${NC} SolidPrimitiveTools 已注册"
else
    echo -e "${RED}✗${NC} SolidPrimitiveTools 未注册"
fi

echo ""
echo "=========================================="
echo "  验证完成"
echo "=========================================="
