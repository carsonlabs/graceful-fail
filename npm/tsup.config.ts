import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    entry: ["src/langchain.ts"],
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    external: ["@langchain/core"],
  },
]);
