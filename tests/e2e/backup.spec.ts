import { test, expect } from "@playwright/test";
import { waitForAppReady } from "./testHelpers";

function makeMasterFile(pieces: unknown[], masterVersion = "backup-test-1") {
  return {
    schemaVersion: 1,
    game: "逆転オセロニア",
    masterVersion,
    generatedAt: "2026-09-14T00:00:00.000Z",
    pieces,
  };
}

function makePiece(pieceId: string, fullName: string, baseName: string, epithet: string | null) {
  return {
    pieceId,
    fullName,
    baseName,
    epithet,
    attribute: "神",
    rarity: "S+",
    evolutionType: "進化",
    skillName: null,
    skillData: [],
    comboSkillName: null,
    comboSkillData: [],
    sourceUrl: null,
    sourceUpdatedAt: null,
    featureDataVersion: 1,
    masterVersion: "backup-test-1",
  };
}

const TWO_PIECE_MASTER = makeMasterFile([
  makePiece("bk001", "［テスト］ガンマ", "ガンマ", "テスト"),
  makePiece("bk002", "［テスト］デルタ", "デルタ", "テスト"),
]);

function fileFromJson(name: string, data: unknown) {
  return { name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) };
}

async function importMasterViaSettings(page: import("@playwright/test").Page, master: unknown) {
  await page.goto("/#/settings");
  await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", master));
  await page.getByRole("button", { name: "インポートを実行する" }).click();
  await expect(page.getByText(/登録件数: 2件/)).toBeVisible();
}

test.describe("バックアップ・復元", () => {
  test("ユーザーデータのみのバックアップにはマスタを含めず、復元できる", async ({ page }) => {
    await waitForAppReady(page);
    await importMasterViaSettings(page, TWO_PIECE_MASTER);

    // 所持駒を1件追加してユーザーデータを作る
    await page.goto("/#/inventory");
    await page.getByRole("button", { name: "＋ 駒を手動追加" }).click();
    await page.getByPlaceholder("追加する駒名を検索").fill("ガンマ");
    await page.getByRole("button", { name: /ガンマ/ }).click();
    await expect(page.locator(".card", { hasText: "ガンマ" })).toBeVisible();

    await page.goto("/#/backup");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "💾 ユーザーデータのみエクスポート" }).click(),
    ]);
    await expect(page.getByText("ユーザーデータのみのバックアップを保存しました。")).toBeVisible();

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    if (stream) {
      for await (const chunk of stream) chunks.push(chunk as Buffer);
    }
    const backup = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    expect(backup.masterPieces).toBeUndefined();
    expect(backup.ownedPieces).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain("masterPieces");

    // 復元: ユーザーデータのみのバックアップなので、マスタには触れず所持駒だけ戻る
    await page.locator('input[type="file"]').setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.concat(chunks),
    });
    await expect(page.getByText(/復元しました（所持駒1件/)).toBeVisible();
  });

  test("完全バックアップにはマスタを含め、マスタ削除後の復元でマスタが復元される", async ({ page }) => {
    await waitForAppReady(page);
    await importMasterViaSettings(page, TWO_PIECE_MASTER);

    await page.goto("/#/backup");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "🗄 完全バックアップを作成（マスタを含む）" }).click(),
    ]);
    await expect(page.getByText("完全バックアップ（マスタを含む）を保存しました。")).toBeVisible();

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    if (stream) {
      for await (const chunk of stream) chunks.push(chunk as Buffer);
    }
    const backup = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    expect(backup.masterPieces).toHaveLength(2);

    // マスタだけを削除してから、完全バックアップで復元する
    await page.goto("/#/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "🗑 マスタだけを削除する" }).click();
    await expect(page.getByText("マスタを削除しました。")).toBeVisible();
    await expect(page.getByText("登録件数: 0 件")).toBeVisible();

    await page.goto("/#/backup");
    await page.locator('input[type="file"]').setInputFiles({
      name: "restore-full.json",
      mimeType: "application/json",
      buffer: Buffer.concat(chunks),
    });
    await expect(page.getByText(/マスタ2件/)).toBeVisible();

    await page.goto("/#/settings");
    await expect(page.getByText("登録件数: 2 件")).toBeVisible();
  });
});
