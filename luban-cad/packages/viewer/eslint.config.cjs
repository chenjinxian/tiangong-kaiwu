const iTwinPlugin = require("@itwin/eslint-plugin");
// 注：web-viewer 的同款配置指向 ../../../common/config/eslint/...（luban-cad 下无此
// 目录，属复制 apps/web 路径时丢了 itwinjs-core 段——packages 下三个包同病）。
// 此处对齐 apps/web 的实际可用路径。
const eslintBaseConfig = require("../../../itwinjs-core/common/config/eslint/eslint.config.base");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  ...eslintBaseConfig,
  {
    // 测试文件的 vi.mock 工厂按模块导出名原样镜像（PascalCase 命名空间），
    // 与 naming-convention 的 camelCase 属性约束天然冲突——豁免测试文件。
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/naming-convention": "off",
    },
  },
];
