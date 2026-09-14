#!/usr/bin/env node
/**
 * 秘密情報検査（仕様書8章・17章）。
 * Git管理下のファイル・ビルド成果物(dist)に、APIキーらしき文字列や.envが
 * 含まれていないかを簡易検査する。完全な検出は保証しないため、必ず人間の
 * レビューと併用すること。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SECRET_PATTERNS = [
  { name: "OpenAI APIキー", pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "Anthropic APIキー", pattern: /sk-ant-[a-zA-Z0-9-]{20,}/ },
  { name: "AWSアクセスキー", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "Google APIキー", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "GitHub Personal Access Token", pattern: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "秘密鍵ヘッダー", pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const SKIP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ico"];
const SKIP_FILES = new Set(["scripts/check-secrets.mjs", "package-lock.json"]);

function listTrackedFiles() {
  try {
    return execSync("git ls-files", { encoding: "utf-8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function listDistFiles() {
  if (!existsSync("dist")) return [];
  return execSync("find dist -type f", { encoding: "utf-8" }).split("\n").filter(Boolean);
}

let failed = false;
const messages = [];

const trackedFiles = listTrackedFiles();

// .env系ファイルがコミットされていないか
const envFiles = trackedFiles.filter((f) => /(^|\/)\.env(\..+)?$/.test(f));
if (envFiles.length > 0) {
  failed = true;
  messages.push(`.env系ファイルがGit管理下にあります: ${envFiles.join(", ")}`);
}

// 駒情報補完機能: AIから返された実データ・取込用JSON・個人用の補完済み駒マスターが
// 誤ってコミットされていないか（すべて端末内IndexedDBにのみ保存する設計のため）
const ENRICHMENT_DATA_PATTERNS = [
  /(^|\/)ai-response.*\.json$/i,
  /(^|\/)enrichment-import.*\.json$/i,
  /(^|\/)local-metadata.*\.json$/i,
  /\.enrichment\.json$/i,
  /(^|\/)ai-consult-history.*\.json$/i,
];
const enrichmentFiles = trackedFiles.filter((f) => ENRICHMENT_DATA_PATTERNS.some((p) => p.test(f)));
if (enrichmentFiles.length > 0) {
  failed = true;
  messages.push(`AI補完データ・個人用データらしきファイルがGit管理下にあります: ${enrichmentFiles.join(", ")}`);
}

const filesToScan = [...new Set([...trackedFiles, ...listDistFiles()])].filter(
  (f) => !SKIP_FILES.has(f) && !SKIP_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)),
);

for (const file of filesToScan) {
  if (!existsSync(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf-8");
  } catch {
    continue; // バイナリなど読めないファイルはスキップ
  }
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      failed = true;
      messages.push(`${name} らしき文字列が見つかりました: ${file}`);
    }
  }
}

if (failed) {
  console.error("❌ 秘密情報検査に失敗しました:\n" + messages.join("\n"));
  process.exit(1);
} else {
  console.log(`✅ 秘密情報検査OK（${filesToScan.length}ファイルを検査）`);
}
