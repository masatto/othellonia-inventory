import { test, expect } from "@playwright/test";

function makeMasterFile(pieces: unknown[], masterVersion = "test-import-1") {
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
    masterVersion: "test-import-1",
  };
}

const TWO_PIECE_MASTER = makeMasterFile([
  makePiece("m001", "［テスト］アルファ", "アルファ", "テスト"),
  makePiece("m002", "［テスト］ベータ", "ベータ", "テスト"),
]);

function fileFromJson(name: string, data: unknown) {
  return { name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) };
}

test.describe("設定画面（マスタのインポート・削除・ストレージ）", () => {
  test("マスタJSONを選択するとプレビューが表示され、インポートを実行すると反映される", async ({ page }) => {
    await page.goto("/#/settings");
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
    await expect(page.getByText("この端末内で処理され")).toBeVisible();
    await expect(page.getByText("マスタが未登録です")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", TWO_PIECE_MASTER));

    await expect(page.getByRole("heading", { name: "プレビュー" })).toBeVisible();
    await expect(page.getByText("件数: 2 件")).toBeVisible();
    await expect(page.getByText("マスタバージョン: test-import-1")).toBeVisible();

    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();
    await expect(page.getByText("登録件数: 2 件")).toBeVisible();
  });

  test("不正なマスタJSON(許可されていない属性)は検証エラーが表示され、インポートできない", async ({ page }) => {
    await page.goto("/#/settings");
    const invalid = makeMasterFile([{ ...makePiece("m001", "テスト", "テスト", null), attribute: "架空属性" }]);
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("invalid.json", invalid));

    await expect(page.getByText(/検証エラー/)).toBeVisible();
    await expect(page.getByRole("button", { name: "インポートを実行する" })).toHaveCount(0);
  });

  test("マスタだけを削除しても所持駒は削除されず「マスタ未解決」として残る", async ({ page }) => {
    await page.goto("/#/settings");
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", TWO_PIECE_MASTER));
    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();

    await page.goto("/#/inventory");
    await page.getByRole("button", { name: "＋ 駒を手動追加" }).click();
    await page.getByPlaceholder("追加する駒名を検索").fill("アルファ");
    await page.getByRole("button", { name: /アルファ/ }).click();
    await expect(page.locator(".card", { hasText: "アルファ" })).toBeVisible();

    await page.goto("/#/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "🗑 マスタだけを削除する" }).click();
    await expect(page.getByText("マスタを削除しました。")).toBeVisible();
    await expect(page.getByText("登録件数: 0 件")).toBeVisible();

    await page.goto("/#/inventory");
    await expect(page.getByText("マスタ未解決の駒")).toBeVisible();
    await expect(page.getByText(/所持数 1/)).toBeVisible();
  });

  test("マスタ未解決の駒は名前で検索して再関連付けできる", async ({ page }) => {
    await page.goto("/#/settings");
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", TWO_PIECE_MASTER));
    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();

    await page.goto("/#/inventory");
    await page.getByRole("button", { name: "＋ 駒を手動追加" }).click();
    await page.getByPlaceholder("追加する駒名を検索").fill("ベータ");
    await page.getByRole("button", { name: /ベータ/ }).click();

    // マスタの更新でpieceIdが変わり、旧pieceId(m002)が新マスタに存在しないケースを再現する
    // （同じ駒が新しいpieceId "m099" として登録し直された想定）
    const replacementMaster = makeMasterFile([
      makePiece("m001", "［テスト］アルファ", "アルファ", "テスト"),
      makePiece("m099", "［テスト］ベータ", "ベータ", "テスト"),
    ]);

    await page.goto("/#/settings");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "🗑 マスタだけを削除する" }).click();
    await expect(page.getByText("マスタを削除しました。")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master2.json", replacementMaster));
    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();

    await page.goto("/#/inventory");
    await expect(page.getByText("マスタ未解決の駒")).toBeVisible();
    await page.getByRole("button", { name: "名前で検索して再関連付け" }).click();
    await page.getByPlaceholder("正しい駒名を検索").fill("ベータ");
    await page.getByRole("button", { name: /ベータ/ }).click();

    await expect(page.getByText("マスタ未解決の駒")).toHaveCount(0);
    await expect(page.locator(".card", { hasText: "ベータ" })).toBeVisible();
  });

  test("マスタインポート後はオフラインでも検索できる", async ({ page, context }) => {
    await page.goto("/#/settings");
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", TWO_PIECE_MASTER));
    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();

    await context.setOffline(true);
    try {
      await page.goto("/#/inventory");
      await page.getByRole("button", { name: "＋ 駒を手動追加" }).click();
      await page.getByPlaceholder("追加する駒名を検索").fill("ベータ");
      await expect(page.getByRole("button", { name: /ベータ/ })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("ストレージ容量不足(QuotaExceededError)が発生した場合、エラーメッセージが表示され既存マスタが維持される", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master.json", TWO_PIECE_MASTER));
    await page.getByRole("button", { name: "インポートを実行する" }).click();
    await expect(page.getByText(/登録件数: 2件/)).toBeVisible();

    // put()がQuotaExceededErrorを送出するよう一時的に差し替えてシミュレートする
    await page.evaluate(() => {
      const proto = IDBObjectStore.prototype;
      (window as unknown as { __originalPut: typeof proto.put }).__originalPut = proto.put;
      proto.put = function put() {
        throw new DOMException("simulated quota exceeded", "QuotaExceededError");
      };
    });

    const anotherMaster = makeMasterFile([makePiece("m003", "［テスト］ガンマ", "ガンマ", "テスト")], "test-import-2");
    await page.locator('input[type="file"]').setInputFiles(fileFromJson("master2.json", anotherMaster));
    await page.getByRole("button", { name: "インポートを実行する" }).click();

    await expect(page.getByText(/ストレージ.*容量が不足している/)).toBeVisible();
    // 既存のマスタ(2件)が維持されている
    await expect(page.getByText("登録件数: 2 件")).toBeVisible();

    await page.evaluate(() => {
      IDBObjectStore.prototype.put = (window as unknown as { __originalPut: typeof IDBObjectStore.prototype.put })
        .__originalPut;
    });
  });
});
