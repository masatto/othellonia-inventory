#!/usr/bin/env node
/**
 * 公開禁止ファイル検査（仕様書8章・17章）。
 * 攻略サイトなどから取得した生アイコンが、Git管理下やビルド成果物(dist)に
 * 混入していないかを検査する。独自に作成したUI画像のみを許可対象とする。
 */
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

// 許可対象ディレクトリ（独自に作成したUI素材・PWAアイコンのみ）
const ALLOWED_PREFIXES = ["public/icons/", "dist/icons/"];

const FORBIDDEN_DIR_PATTERNS = [
  "raw-icons",
  "downloaded-icons",
  "screenshots",
  "user-data",
  "scan-results",
  /^tmp\//,
  /^temp\//,
];

// 1画像あたりの上限（独自アイコンは数枚程度のはずなので、多数の画像が
// 混入した場合は大量アイコン混入の疑いとして検査を失敗させる）
const MAX_ALLOWED_IMAGES = 30;

function listTrackedFiles() {
  try {
    return execSync("git ls-files", { encoding: "utf-8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function listDistFiles() {
  if (!existsSync("dist")) return [];
  const out = execSync("find dist -type f", { encoding: "utf-8" });
  return out.split("\n").filter(Boolean);
}

function isImage(path) {
  return IMAGE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
}

function isAllowed(path) {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

let failed = false;
const messages = [];

const trackedFiles = listTrackedFiles();

for (const pattern of FORBIDDEN_DIR_PATTERNS) {
  const hit = trackedFiles.find((f) =>
    typeof pattern === "string" ? f.includes(`${pattern}/`) || f.startsWith(`${pattern}/`) : pattern.test(f),
  );
  if (hit) {
    failed = true;
    messages.push(`禁止ディレクトリと一致するファイルがGit管理下にあります: ${hit}`);
  }
}

const allFiles = [...new Set([...trackedFiles, ...listDistFiles()])];
const images = allFiles.filter(isImage);
const disallowedImages = images.filter((f) => !isAllowed(f));

if (disallowedImages.length > 0) {
  failed = true;
  messages.push(
    `許可されていない場所に画像ファイルがあります（許可: ${ALLOWED_PREFIXES.join(", ")}）:\n` +
      disallowedImages.map((f) => `  - ${f}`).join("\n"),
  );
}

if (images.length > MAX_ALLOWED_IMAGES) {
  failed = true;
  messages.push(`画像ファイル数が上限(${MAX_ALLOWED_IMAGES})を超えています（${images.length}件）。大量アイコン混入の可能性があります。`);
}

// distにHTML化された攻略サイトのコピーが含まれていないか（簡易チェック）
for (const f of listDistFiles()) {
  if (f.endsWith(".html") && f !== "dist/index.html") {
    const size = statSync(f).size;
    if (size > 200 * 1024) {
      messages.push(`警告: 想定外の大きなHTMLファイルがあります: ${f} (${size} bytes)`);
    }
  }
}

if (failed) {
  console.error("❌ 公開禁止ファイル検査に失敗しました:\n" + messages.join("\n"));
  process.exit(1);
} else {
  console.log(`✅ 公開禁止ファイル検査OK（画像 ${images.length}件、すべて許可対象ディレクトリ内）`);
}
