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
    rules: {
      // Bare requestAnimationFrame/setTimeout silently break views in Obsidian popout
      // windows. This shipped as a warning once (PR #130) and went unnoticed in CI, so
      // it is an error here - the codebase is clean against it.
      "obsidianmd/prefer-window-timers": "error",
    },
  },
  {
    ignores: [
      "main.js",
      "dist/**",
      "node_modules/**",
      "**/*.test.ts",
      "vitest.config.mts",
      "testing/**",
      "tests/**",
    ],
  },
]);
