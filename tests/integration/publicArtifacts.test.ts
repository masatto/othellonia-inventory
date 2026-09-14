import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * セキュリティ・公開物テスト（仕様書23章）。
 * `npm run build:pages` 実行後の dist/ を対象に、生アイコン・スクリーンショット・
 * 秘密情報・ソースマップなどが混入していないことを確認する。
 * dist が存在しない場合（ビルド未実行）はスキップする。
 */

const DIST = "dist";
const distExists = existsSync(DIST);

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

describe.skipIf(!distExists)("公開物(dist)の安全性", () => {
  const files = distExists ? walk(DIST) : [];

  it("スクリーンショット由来のファイル名が含まれない", () => {
    const suspicious = files.filter((f) => /screenshot|user-data|scan-results/i.test(f));
    expect(suspicious).toEqual([]);
  });

  it(".env や秘密情報ファイルが含まれない", () => {
    const envFiles = files.filter((f) => /\.env(\..+)?$/.test(f));
    expect(envFiles).toEqual([]);
  });

  it("SQLiteファイルが含まれない", () => {
    const sqliteFiles = files.filter((f) => /\.sqlite3?$/.test(f));
    expect(sqliteFiles).toEqual([]);
  });

  it("JSソースマップが含まれない（秘密情報混入経路を減らすため）", () => {
    const mapFiles = files.filter((f) => f.endsWith(".map"));
    expect(mapFiles).toEqual([]);
  });

  it("許可対象ディレクトリ以外に画像ファイルがない", () => {
    const images = files.filter((f) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f));
    const disallowed = images.filter((f) => !f.startsWith(join(DIST, "icons") + "/"));
    expect(disallowed).toEqual([]);
  });

  it("Service Workerの生成物にAPIキーらしき文字列が含まれない", () => {
    const swPath = join(DIST, "sw.js");
    if (!existsSync(swPath)) return;
    const content = readFileSync(swPath, "utf-8");
    expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(content).not.toMatch(/AKIA[0-9A-Z]{16}/);
  });

  it("index.htmlの合計サイズが異常に大きくない（攻略サイトHTMLの丸ごとコピー混入がないことの簡易確認）", () => {
    const indexPath = join(DIST, "index.html");
    const size = statSync(indexPath).size;
    expect(size).toBeLessThan(50 * 1024);
  });
});
