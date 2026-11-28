import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/*.png",
        "dictionary/en-zh.json",
        "dictionary/ECDICT-LICENSE.txt",
      ],
      manifest: {
        name: "Foxnest",
        short_name: "Foxnest",
        description: "本地优先的 RSS 阅读器，支持话题归集、划词笔记与离线翻译。",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f7f7f5",
        theme_color: "#b4532a",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,png,svg,wasm,txt}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "foxnest-images",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    // Tauri bundles the whole frontendDist. The APK is only useful on the
    // deployed PWA/site, so strip it from app builds to avoid a 32MB penalty.
    ...(mode === "app"
      ? [
          {
            name: "exclude-downloads-from-app",
            closeBundle() {
              rmSync(fileURLToPath(new URL("./dist/downloads", import.meta.url)), {
                recursive: true,
                force: true,
              });
            },
          },
        ]
      : []),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    proxy: {
      "/functions/v1/app": "http://127.0.0.1:8000",
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
