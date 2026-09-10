import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "vitest.config.mts"],
        },
      },
    },
  },
  {
    ignores: [
      "main.js",
      "dist/**",
      "node_modules/**",
      "**/*.test.ts",
      "vitest.config.mts",
    ],
  },
]);
