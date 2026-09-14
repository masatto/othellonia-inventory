import { test, expect, type Page } from "@playwright/test";
import { waitForAppReady } from "./testHelpers";

/**
 * 駒名候補検索（第1段階）のE2Eテスト。
 * マスタ未登録の仮登録駒を直接IndexedDBへ書き込んでから駒情報補完画面を開き、
 * 曖昧な名称に対してAIが返す候補確認JSONを貼り付けて、選択・分岐が正しく
 * 動作することを検証する。
 */
async function seedProvisionalPiece(page: Page, pieceId: string, provisionalName: string) {
  await waitForAppReady(page);
  await page.evaluate(
    ({ pieceId, provisionalName }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("othellonia-inventory");
        req.onsuccess = () => {
          const db = req.result;
          const now = new Date().toISOString();
          const tx = db.transaction(["ownedPieces", "localPieces"], "readwrite");
          tx.objectStore("ownedPieces").put({
            pieceId,
            quantity: 1,
            skillLevel: null,
            ownedStatus: "confirmed",
            recognitionConfidence: null,
            confirmedByUser: true,
            firstDetectedAt: now,
            lastDetectedAt: now,
            updatedAt: now,
            memo: "",
          });
          tx.objectStore("localPieces").put({
            pieceId,
            provisionalName,
            nameStatus: "provisional",
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { pieceId, provisionalName },
  );
  // 直接IndexedDBへ書き込んだ内容は、既にマウント済みのアプリの状態には
  // 反映されない（初回マウント時にしか読み込まないため）。reloadして
  // 最新のIndexedDBの内容から状態を組み直させる
  await page.reload();
  await waitForAppReady(page);
}

async function openEnrichmentAndSelect(page: Page, provisionalName: string) {
  await page.goto("/#/enrichment");
  await expect(page.getByRole("heading", { name: "駒情報補完" })).toBeVisible();
  const row = page.locator(".card", { hasText: provisionalName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: /駒名の候補を確認する/ }).click();
  await expect(page.getByRole("heading", { name: "駒名候補検索プロンプト" })).toBeVisible();
  await page.getByRole("button", { name: "ChatGPTの回答（JSON）を取り込む" }).click();
  await expect(page.getByRole("heading", { name: "駒名候補のJSON取込" })).toBeVisible();
}

async function submitNameSearchResponse(page: Page, response: unknown) {
  await page.locator("textarea").fill(JSON.stringify(response));
  await page.getByRole("button", { name: "検証する" }).click();
  await expect(page.getByRole("heading", { name: "駒名の候補確認" })).toBeVisible();
}

test.describe("駒名候補検索（第1段階）", () => {
  test("正式名称を入力した場合、一致(exact)として1件の候補が表示される", async ({ page }) => {
    const pieceId = "local-exact-test";
    await seedProvisionalPiece(page, pieceId, "［世界を問う者］ルシファー");
    await openEnrichmentAndSelect(page, "［世界を問う者］ルシファー");
    await submitNameSearchResponse(page, {
      schemaVersion: 1,
      game: "逆転オセロニア",
      checkedAt: "2026-09-14",
      pieces: [
        {
          pieceId,
          inputName: "［世界を問う者］ルシファー",
          matchStatus: "exact",
          candidates: [
            {
              fullName: "［世界を問う者］ルシファー",
              version: null,
              attribute: "魔",
              rarity: "S+",
              evolutionType: "闘化",
              sourceUrls: [{ url: "https://example.com/lucifer", title: "評価記事" }],
            },
          ],
        },
      ],
    });

    await expect(page.getByText("一致")).toBeVisible();
    const candidateLabel = page.locator("label", { hasText: "［世界を問う者］ルシファー" }).first();
    await candidateLabel.locator('input[type="radio"]').check();

    await page.getByRole("button", { name: /選択した1件の名称で性能調査用プロンプトを生成する/ }).click();
    await expect(page.getByRole("heading", { name: "AI調査用プロンプト" })).toBeVisible();
    await expect(page.getByText("［世界を問う者］ルシファー")).toBeVisible();
  });

  test("「ルシファー」のような名称だけの場合、進化・闘化違いの候補が複数表示され1件だけ選べる", async ({ page }) => {
    const pieceId = "local-ambiguous-test";
    await seedProvisionalPiece(page, pieceId, "ルシファー");
    await openEnrichmentAndSelect(page, "ルシファー");
    await submitNameSearchResponse(page, {
      schemaVersion: 1,
      game: "逆転オセロニア",
      checkedAt: "2026-09-14",
      pieces: [
        {
          pieceId,
          inputName: "ルシファー",
          matchStatus: "ambiguous",
          candidates: [
            { fullName: "［明けの明星］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "進化" },
            { fullName: "［喪亡せぬ輝き］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
            { fullName: "［世界を問う者］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
            { fullName: "［掴みし闘気］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          ],
        },
      ],
    });

    await expect(page.getByText("複数候補")).toBeVisible();
    for (const name of ["［明けの明星］ルシファー", "［喪亡せぬ輝き］ルシファー", "［世界を問う者］ルシファー", "［掴みし闘気］ルシファー"]) {
      await expect(page.getByText(name)).toBeVisible();
    }

    // 1件だけ選択して、他の候補は含まれないことを確認する
    await page.locator("label", { hasText: "［世界を問う者］ルシファー" }).first().locator('input[type="radio"]').check();
    await page.getByRole("button", { name: /選択した1件の名称で性能調査用プロンプトを生成する/ }).click();
    await expect(page.getByRole("heading", { name: "AI調査用プロンプト" })).toBeVisible();
    const promptText = await page.locator("pre").first().innerText();
    expect(promptText).toContain("［世界を問う者］ルシファー");
    expect(promptText).not.toContain("［明けの明星］ルシファー");
    expect(promptText).not.toContain("［喪亡せぬ輝き］ルシファー");
    expect(promptText).not.toContain("［掴みし闘気］ルシファー");
  });

  test("二つ名を少し間違えた入力でも、入力名と完全一致しない候補が表示される", async ({ page }) => {
    const pieceId = "local-typo-test";
    await seedProvisionalPiece(page, pieceId, "夜明けの明星ルシファー");
    await openEnrichmentAndSelect(page, "夜明けの明星ルシファー");
    await submitNameSearchResponse(page, {
      schemaVersion: 1,
      game: "逆転オセロニア",
      checkedAt: "2026-09-14",
      pieces: [
        {
          pieceId,
          inputName: "夜明けの明星ルシファー",
          matchStatus: "ambiguous",
          candidates: [
            { fullName: "［明けの明星］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "進化" },
            { fullName: "［喪亡せぬ輝き］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          ],
        },
      ],
    });

    // 入力名(夜明けの明星ルシファー)と文字列として完全一致しない候補も表示される
    await expect(page.getByText("［明けの明星］ルシファー")).toBeVisible();
    await expect(page.getByText("［喪亡せぬ輝き］ルシファー")).toBeVisible();
  });

  test("季節版が複数存在する場合、すべて別候補として表示される", async ({ page }) => {
    const pieceId = "local-season-test";
    await seedProvisionalPiece(page, pieceId, "ミャオ");
    await openEnrichmentAndSelect(page, "ミャオ");
    await submitNameSearchResponse(page, {
      schemaVersion: 1,
      game: "逆転オセロニア",
      checkedAt: "2026-09-14",
      pieces: [
        {
          pieceId,
          inputName: "ミャオ",
          matchStatus: "ambiguous",
          candidates: [
            { fullName: "［霊猫の愛娘］ミャオ", version: null, attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［浴衣の招き猫］ミャオ", version: "夏季限定", attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［聖夜の贈り物］ミャオ", version: "クリスマス限定", attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［異界からの来訪］ミャオ", version: "コラボ", attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          ],
        },
      ],
    });

    for (const name of ["［霊猫の愛娘］ミャオ", "［浴衣の招き猫］ミャオ", "［聖夜の贈り物］ミャオ", "［異界からの来訪］ミャオ"]) {
      await expect(page.getByText(name)).toBeVisible();
    }
    await expect(page.getByText("夏季限定")).toBeVisible();
    await expect(page.getByText("クリスマス限定")).toBeVisible();
    await expect(page.getByText("コラボ")).toBeVisible();
  });

  test("存在しない名称の場合、not_foundとして候補が表示されず選択もできない", async ({ page }) => {
    const pieceId = "local-notfound-test";
    await seedProvisionalPiece(page, pieceId, "存在しない駒名アアアアア");
    await openEnrichmentAndSelect(page, "存在しない駒名アアアアア");
    await submitNameSearchResponse(page, {
      schemaVersion: 1,
      game: "逆転オセロニア",
      checkedAt: "2026-09-14",
      pieces: [
        { pieceId, inputName: "存在しない駒名アアアアア", matchStatus: "not_found", candidates: [] },
      ],
    });

    await expect(page.getByText("見つかりません")).toBeVisible();
    await expect(page.getByText("候補を確認できませんでした")).toBeVisible();
    await expect(page.locator('input[type="radio"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /選択した0件の名称で性能調査用プロンプトを生成する/ })).toBeDisabled();
  });
});
