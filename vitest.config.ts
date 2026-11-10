import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      // `server-only` baca grešku izvan Next.js servera; u testovima ga prazno zamijenimo.
      { find: "server-only", replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
    ],
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
