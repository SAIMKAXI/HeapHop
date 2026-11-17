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
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "extension/dist/**"]),
]);

export default eslintConfig;
