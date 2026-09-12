import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Unit tests import server modules directly; the server-only guard
      // is a Next.js bundler concern, not a unit-test concern.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
  },
});
