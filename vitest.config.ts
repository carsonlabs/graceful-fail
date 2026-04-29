import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
      // Resolve workspace packages to their TS source during dev/test so we
      // never have to rebuild between iterations. Published packages still
      // resolve via package.json.exports → dist/.
      "@selfheal/core": path.resolve(templateRoot, "packages/core/src/index.ts"),
      "@selfheal/sdk": path.resolve(templateRoot, "packages/sdk/src/index.ts"),
      "@selfheal/mcp-server": path.resolve(templateRoot, "packages/mcp-server/src/index.ts"),
      "@selfheal/api": path.resolve(templateRoot, "packages/api/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "packages/**/test/**/*.test.ts",
    ],
  },
});
