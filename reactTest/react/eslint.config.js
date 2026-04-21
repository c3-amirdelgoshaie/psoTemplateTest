/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

// eslint.config.cjs
const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const a11y = require("eslint-plugin-jsx-a11y");
const imp = require("eslint-plugin-import");
const reactRefresh = require("eslint-plugin-react-refresh");

module.exports = [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**", "assets/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 }
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { typescript: { project: "./tsconfig.json", alwaysTryTypes: true } }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": a11y,
      import: imp,
      "react-refresh": reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
      ...imp.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "import/no-unresolved": "off",
      "import/extensions": "off",
      "import/no-absolute-path": "off",
      "import/no-mutable-exports": "off",
      "import/prefer-default-export": "off",
      quotes: "off",
      "no-console": "error",
      semi: ["error", "always"],
      "react/react-in-jsx-scope": "off",
      "react-refresh/only-export-components": "warn"
    }
  }
];
