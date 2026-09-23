const iTwinPlugin = require("@itwin/eslint-plugin");
const eslintBaseConfig = require("../../../common/config/eslint/eslint.config.base");
const tsParser = require("@typescript-eslint/parser");

// Main source files (excluding tests and configs)
const mainConfig = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts", "*.config.ts"],
  ...iTwinPlugin.configs.iTwinjsRecommendedConfig,
};

// Test files - use TypeScript parser but without type-aware linting
const testConfig = {
  files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts", "*.config.ts"],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: {
        jsx: true,
      },
      // Disable type-aware linting for tests
      project: null,
      projectService: false,
    },
  },
  plugins: {
    "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    "react-hooks": require("eslint-plugin-react-hooks"),
  },
  rules: {
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-floating-promises": "off",
    "@typescript-eslint/no-deprecated": "off",
    "@typescript-eslint/no-unnecessary-type-assertion": "off",
    "@typescript-eslint/no-confusing-void-expression": "off",
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "react-hooks/rules-of-hooks": "off",
    "no-console": "off",
  },
};

module.exports = [
  mainConfig,
  ...eslintBaseConfig,
  testConfig,
];
