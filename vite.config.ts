import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
  preview: {
    port: 3000,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".up.railway.app",
      "cubecanvas.com",
      "monitor.cubecanvas.com",
      "cubecanvas-monitor-production.up.railway.app",
    ],
  },
});
