const iTwinPlugin = require("@itwin/eslint-plugin");
// 注：原路径 ../../../common/config/eslint/...（luban-cad 下无此目录，属复制 apps/web
// 路径时丢了 itwinjs-core 段——packages 下多包同病，viewer/eslint.config.cjs
// 头注已登记同款修复）。此处对齐 viewer 的实际可用路径（M6b-T1 门禁修复）。
const eslintBaseConfig = require("../../../itwinjs-core/common/config/eslint/eslint.config.base");

module.exports = [
  {
    files: ["**/*.ts"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  ...eslintBaseConfig,
  {
    // tsconfig.json 排除了 *.test.ts（构建产物纯净），而 iTwinjsRecommendedConfig
    // 把 parserOptions.project 钉在它上面——测试文件会报 "not found in project"。
    // 测试改用仅含类型信息的 tsconfig.lint.json（纳入全量 src，不参与构建）。
    files: ["**/*.test.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.lint.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
];
