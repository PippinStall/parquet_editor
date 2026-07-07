import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The project's single .env lives at the repo root (one level up from
// frontend/), shared with docker-compose and the backend's Settings — see
// ../.env.example. loadEnv reads it directly (with no VITE_ prefix
// filtering) so it can drive this file's own config, not just client code.
const rootDir = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const backendUrl = env.BACKEND_URL || "http://localhost";
  const backendPort = env.BACKEND_PORT || "8000";
  const frontendPort = Number(env.FRONTEND_PORT) || 5173;

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: frontendPort,
      proxy: {
        "/api": {
          target: `${backendUrl}:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
