import { test, expect } from "@playwright/test";

const VALID_AI_RESPONSE = {
  schemaVersion: 1,
  game: "逆転オセロニア",
  checkedAt: "2026-09-14",
  pieces: [
    {
      pieceId: "sd001",
      fullName: "［霊猫の愛娘］ミャオ",
      attribute: "神",
      rarity: "S+",
      evolutionType: "進化",
      hp: null,
      attack: null,
      skill: {
        name: null,
        type: "攻撃力アップ",
        condition: "自分のデッキがすべて神駒",
        effect: "基本ATKを上昇",
        value: "1.4倍",
      },
      comboSkillStatus: "none",
      comboSkill: null,
      sourceUrls: [{ url: "https://example.com/source", title: "参照ページ名" }],
    },
  ],
};

const INVALID_AI_RESPONSE_HTML = {
  schemaVersion: 1,
  game: "逆転オセロニア",
  checkedAt: "2026-09-14",
  pieces: [
    {
      pieceId: "sd001",
      fullName: "<script>alert(1)</script>",
      attribute: "神",
      rarity: "S+",
      evolutionType: "進化",
    },
  ],
};

test.describe("駒情報補完機能", () => {
  test("情報不足一覧を開き、対象駒を選択してプロンプトを生成できる", async ({ page }) => {
    await page.goto("/#/enrichment");
    await expect(page.getByRole("heading", { name: "駒情報補完" })).toBeVisible();
    await expect(page.getByText("情報不足の駒")).toBeVisible();

    const targetRow = page.locator(".card", { hasText: "［霊猫の愛娘］ミャオ" }).first();
    await expect(targetRow).toBeVisible({ timeout: 10_000 });
    await targetRow.getByRole("checkbox").check();

    await page.getByRole("button", { name: /AI調査用プロンプトを生成/ }).click();
    await expect(page.getByRole("heading", { name: "AI調査用プロンプト" })).toBeVisible();
    await expect(page.getByText("sd001")).toBeVisible();
    await expect(page.getByText("ミャオ")).toBeVisible();
    // 画像やdata URLを含まない
    const promptText = await page.locator("pre").first().innerText();
    expect(promptText).not.toContain("data:image");
    expect(promptText).not.toContain("base64");
  });

  test("正常なJSONを貼り付けて差分確認し、承認後に反映される", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        externalRequests.push(req.url());
      }
    });

    await page.goto("/#/enrichment");
    await page.getByRole("button", { name: "JSONを貼り付ける／選択する" }).click();
    await expect(page.getByRole("heading", { name: "JSON取込" })).toBeVisible();

    await page.locator("textarea").fill(JSON.stringify(VALID_AI_RESPONSE));
    await page.getByRole("button", { name: "検証する" }).click();

    await expect(page.getByRole("heading", { name: "差分確認" })).toBeVisible();
    await expect(page.getByText("1.4倍")).toBeVisible();

    await page.getByRole("button", { name: /選択した\d+件を保存する/ }).click();

    // 所持駒一覧に属性等が反映される
    await page.goto("/#/inventory");
    const row = page.locator(".card", { hasText: "［霊猫の愛娘］ミャオ" }).first();
    await expect(row).toContainText("神");
    await expect(row).toContainText("S+");
    await expect(row).toContainText("進化");

    // AI相談データにスキル概要が表示される
    await page.goto("/#/consult");
    await page.getByRole("radio", { name: "自由入力" }).check();
    const preview = page.locator("pre").first();
    await expect(preview).toContainText("攻撃力アップ", { timeout: 10_000 });

    expect(externalRequests, `外部への通信が発生しました: ${externalRequests.join(", ")}`).toEqual([]);
  });

  test("不正なJSON(HTML混入)を貼り付けても反映されない", async ({ page }) => {
    await page.goto("/#/enrichment");
    await page.getByRole("button", { name: "JSONを貼り付ける／選択する" }).click();
    await page.locator("textarea").fill(JSON.stringify(INVALID_AI_RESPONSE_HTML));
    await page.getByRole("button", { name: "検証する" }).click();

    await expect(page.getByText("検証エラー")).toBeVisible();
    await expect(page.getByRole("heading", { name: "差分確認" })).not.toBeVisible();
  });

  test("ページ再読み込み後も補完情報がIndexedDBに残る", async ({ page }) => {
    await page.goto("/#/enrichment");
    await page.getByRole("button", { name: "JSONを貼り付ける／選択する" }).click();
    await page.locator("textarea").fill(JSON.stringify(VALID_AI_RESPONSE));
    await page.getByRole("button", { name: "検証する" }).click();
    await page.getByRole("button", { name: /選択した\d+件を保存する/ }).click();

    // 保存完了メッセージが表示されるまで待ち、IndexedDBへの書き込みが
    // 完了したことを確認してからページを再読み込みする
    // (クリックはハンドラの非同期処理の完了を待たないため、確認なしに
    //  reloadすると書き込み途中でページが破棄されるレースが起こりうる)
    await expect(page.getByText("件の補完情報を保存しました")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await page.goto("/#/inventory");
    const row = page.locator(".card", { hasText: "［霊猫の愛娘］ミャオ" }).first();
    await expect(row).toContainText("神", { timeout: 10_000 });
  });
});
