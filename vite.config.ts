import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/ollama": {
        target: "http://127.0.0.1:11434",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ""),
      },
      // Remote AI needs the loopback server's safety checks. Run `npm start`
      // on 3000 alongside the dev server when testing remote mode.
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        // The loopback server only accepts its own origin. The dev page is on
        // 5173, so rewrite the forwarded Origin to the server's origin.
        headers: { Origin: "http://127.0.0.1:3000" },
      },
    },
  },
  preview: {
    host: "127.0.0.1",
  },
});
