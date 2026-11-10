/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createApiMiddleware, DEFAULT_FALLBACK_MODELS, DEFAULT_MODEL } from "./server/geminiExtract.ts";

/** Mounts the Gemini proxy on both `vite` (dev) and `vite preview`, keeping the key server-side. */
function policyAutopsyApi(apiKey: string | undefined, model: string, fallbackModels: string[]): Plugin {
  const middleware = createApiMiddleware({ apiKey, model, fallbackModels });
  return {
    name: "policy-autopsy-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbackRaw = env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODELS;
  const fallbackModels = fallbackRaw === undefined ? DEFAULT_FALLBACK_MODELS : fallbackRaw.split(",").map((m) => m.trim()).filter(Boolean);
  return {
    plugins: [react(), tailwindcss(), policyAutopsyApi(apiKey, model, fallbackModels)],
    // pdf.js + pdf-lib are large by nature; the app is served locally, so one big chunk is fine.
    build: { chunkSizeWarningLimit: 1600 },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    },
  };
});
