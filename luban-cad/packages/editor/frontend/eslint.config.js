const iTwinPlugin = require("@itwin/eslint-plugin");
// 2026-10-22 收编 luban-cad：原配置指向 rush 工作区的 ../../common/config/eslint/
// eslint.config.base（pnpm workspace 不可达）——改为自包含（对齐 viewer-next 形态）。

module.exports = [
  {
    files: ["**/*.ts"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
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
