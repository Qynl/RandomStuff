import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    // The dev server is reached through a proxy with a generated host name in
    // hosted sandboxes; accept whatever Host header the proxy sends.
    allowedHosts: true
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true
  },
  test: {
    // Pure simulation and rules run in node; the engine and React shell tests
    // opt into jsdom with a per-file `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
