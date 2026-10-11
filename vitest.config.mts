import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(".") } },
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    environment: "node",
    testTimeout: 20000,
  },
});
