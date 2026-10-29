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
];
