import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pagesはプロジェクトのサブパス (https://<user>.github.io/othellonia-inventory/) で
// 配信されるため、base をリポジトリ名に合わせる。ローカル開発時は "/" のままにする。
const base = process.env.GITHUB_PAGES === "true" ? "/othellonia-inventory/" : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icons/source.svg"],
      manifest: {
        id: "/othellonia-inventory/",
        name: "オセロニア所持駒管理",
        short_name: "所持駒管理",
        description: "オセロニアの所持駒をスクリーンショットから認識・管理するPWA",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#14141c",
        theme_color: "#5b5bd6",
        orientation: "portrait",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: {
        // 攻略サイトの生アイコンは扱わないため対象外。アプリ本体・Wasm・最小限のマスター
        // メタデータ/特徴量のみをキャッシュする。
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/master\/.*\.json$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "master-data-cache" },
          },
          {
            urlPattern: /\/icons\/.*\.png$/,
            handler: "CacheFirst",
            options: { cacheName: "app-icons-cache" },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  worker: {
    format: "es",
  },
  build: {
    sourcemap: false,
  },
});
