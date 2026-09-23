const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../../common/config/eslint/eslint.config.base");

module.exports = [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
  },
  ...eslintBaseConfig,
];
