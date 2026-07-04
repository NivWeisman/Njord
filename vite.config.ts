/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite serves/bundles the app; Vitest reuses this config for unit tests.
// Engine and state tests are pure TypeScript, so they run in the fast
// "node" environment — no DOM emulation needed.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
