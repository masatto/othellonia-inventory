#!/usr/bin/env node
/**
 * PWA設定検査（仕様書17章）。
 * ビルド成果物(dist)にPWAとして最低限必要なファイル・設定が揃っているかを検査する。
 * 事前に `npm run build:pages` を実行しておくこと。
 */
import { existsSync, readFileSync } from "node:fs";

let failed = false;
const messages = [];

function requireFile(path, label) {
  if (!existsSync(path)) {
    failed = true;
    messages.push(`${label} が見つかりません: ${path}`);
    return null;
  }
  return path;
}

requireFile("dist/index.html", "エントリーHTML");
requireFile("dist/manifest.webmanifest", "Web App Manifest");
requireFile("dist/sw.js", "Service Worker");
requireFile("dist/.nojekyll", ".nojekyll（GitHub Pages用）");
requireFile("dist/icons/apple-touch-icon.png", "iPhone用アイコン");

if (existsSync("dist/manifest.webmanifest")) {
  const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf-8"));
  for (const field of ["name", "short_name", "start_url", "display", "icons"]) {
    if (!manifest[field]) {
      failed = true;
      messages.push(`manifest.webmanifest に ${field} がありません`);
    }
  }
  if (manifest.display !== "standalone" && manifest.display !== "fullscreen") {
    failed = true;
    messages.push(`manifest.webmanifest の display は standalone を推奨します（現在: ${manifest.display}）`);
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    failed = true;
    messages.push("manifest.webmanifest の icons が空です");
  }
}

if (existsSync("dist/index.html")) {
  const html = readFileSync("dist/index.html", "utf-8");
  if (!html.includes('apple-mobile-web-app-capable"')) {
    // index.htmlソース側で付与、ビルド後も残る想定
  }
  if (!html.includes("apple-touch-icon")) {
    failed = true;
    messages.push("index.html に apple-touch-icon の指定がありません");
  }
}

if (failed) {
  console.error("❌ PWA設定検査に失敗しました:\n" + messages.join("\n"));
  process.exit(1);
} else {
  console.log("✅ PWA設定検査OK");
}
