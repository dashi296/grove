import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@grove/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
});
