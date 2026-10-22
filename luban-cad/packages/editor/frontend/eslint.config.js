const iTwinPlugin = require("@itwin/eslint-plugin");
// 2026-10-22 收编 luban-cad：原配置指向 rush 工作区的 ../../common/config/eslint/
// eslint.config.base（pnpm workspace 不可达）——改为自包含（对齐 viewer-next 形态）。

module.exports = [
  {
    files: ["**/*.ts"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  {
    // 上游携带面豁免：src/ 顶层 15 个上游文件（SketchTools/SolidModelingTools/
    // SolidPrimitiveTools/TransformElementsTool 等）在走已被上游标 deprecated 的
    // 旧 API（saveChanges/AngleDescription 等 48 处）及上游防御性 `!` 断言风格
    // （no-non-null-assertion，类型面 load-bearing，重写属行为风险）——收编时
    // 逐点改写不经济，在此对「上游携带面」显式豁免；第一方新增代码
    // （src/luban/**，鲁班自研工具区）不受豁免、受全规则约束（ignores 排除在
    // 豁免面之外）。后续上游弃用 API 的迁移随第一方演进节奏做，不在 lint
    // 门禁里硬卡。
    files: ["src/**/*.ts"],
    ignores: ["src/luban/**/*.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // src/luban/ 随迁测试文件的 vi.mock 工厂按模块导出名原样镜像（PascalCase
    // 命名空间），与 naming-convention 的 camelCase 属性约束天然冲突——豁免。
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/naming-convention": "off",
    },
  },
];
