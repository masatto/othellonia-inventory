import { defineConfig } from "@playwright/test";

const PORT = 4173;

// 実機Safari(WebKit)ではなく、この開発環境にプリインストールされているChromiumで
// iPhone相当のビューポート・タッチ操作をエミュレートする。
// (`devices["iPhone SE"]` 等のプリセットはWebKitを前提とするため使わない)
const IPHONE_VIEWPORTS = {
  "iPhone SE": { width: 375, height: 667 },
  "iPhone 15": { width: 393, height: 852 },
  "iPhone 15 Pro Max": { width: 430, height: 932 },
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
      args: process.env.PLAYWRIGHT_NO_SANDBOX ? ["--no-sandbox"] : [],
    },
  },
  projects: Object.entries(IPHONE_VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: { viewport },
  })),
});
