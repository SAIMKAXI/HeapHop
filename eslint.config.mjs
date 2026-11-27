import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Arrows are positioned from src/layout coordinates,
  // never by measuring the screen.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "getBoundingClientRect",
          message: "Do not measure the DOM to position things. Coordinates come from src/layout.",
        },
      ],
    },
  },

  {
    // Converts the mouse position to canvas coordinates. It does not place nodes or arrows.
    files: ["src/ui/canvas/use-viewport.ts"],
    rules: { "no-restricted-properties": "off" },
  },
  {
    // Components in src/ui also run in the VS Code webview, which has no Next.js router,
    // so they link with plain <a> elements. The site is static, so nothing is lost.
    files: ["src/ui/**/*.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  globalIgnores([
    ".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts",
    // The VS Code extension builds into these; its own sources are linted with the rest.
    "vscode-extension/dist/**", "vscode-extension/media/webview/**", "vscode-extension/node_modules/**",
  ]),
]);

export default eslintConfig;
