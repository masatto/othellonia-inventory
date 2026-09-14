import { test, expect, type Page } from "@playwright/test";
import { waitForAppReady } from "./testHelpers";

/**
 * 実際の画像認識パイプラインを経由せず、認識結果(scanHistory)を直接IndexedDBへ
 * 書き込んでレビュー画面を再現する。マスタ未登録駒の仮登録は「認識結果が既にある」
 * 状態から始まるフローであり、画像取り込み自体は別のテスト(basicFlow等)で検証済み。
 */
function pendingScanRecord(cellIndex: number) {
  return {
    scanId: `test-scan-${cellIndex}`,
    images: [{ imageIndex: 0, imageHash: "hash1", width: 100, height: 100, capturedAt: null }],
    scannedAt: new Date().toISOString(),
    detectedCellCount: 1,
    results: [
      {
        cell: {
          cellIndex,
          row: 0,
          col: 0,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          pHash: "0000000000000000",
          dHash: "0000000000000000",
          aHash: "0000000000000000",
          colorHistogram: [1, 0, 0, 0],
          thumbnailDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          partial: false,
        },
        candidates: [],
        confidence: 0,
        reviewStatus: "unmatched",
        isOverlapDuplicate: false,
        assignedPieceId: null,
        quantity: 1,
      },
    ],
    overlapInformation: { totalOverlapCells: 0 },
    reviewStatus: "pending",
  };
}

async function seedPendingScan(page: Page, cellIndex: number) {
  // IndexedDBのストア作成(getDb初回オープン)がこの時点で完了していることを保証するため、
  // 実際の画面が描画される（ローディングゲートが外れる）まで待つ
  await waitForAppReady(page);
  await page.evaluate((record) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("othellonia-inventory");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scanHistory", "readwrite");
        tx.objectStore("scanHistory").put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, pendingScanRecord(cellIndex));
  await page.goto("/#/review");
  await expect(page.getByRole("heading", { name: "認識結果" })).toBeVisible();
}

test.describe("マスタ未登録駒の仮登録", () => {
  test("仮の名称を入力して新しい駒として仮登録できる", async ({ page }) => {
    await seedPendingScan(page, 0);

    await page.getByRole("button", { name: "名前で検索" }).click();
    await page.getByPlaceholder("仮の名称を入力（後でAI調査により正式名称に更新できます）").fill("多分ジェンイーっぽい駒");
    await page.getByRole("button", { name: "＋ 新しい駒として仮登録" }).click();

    await expect(page.getByText("多分ジェンイーっぽい駒")).toBeVisible();
    await expect(page.getByText("確定済み")).toBeVisible();

    await page.getByRole("button", { name: "所持駒として保存" }).click();
    await expect(page).toHaveURL(/#\/inventory/);
    const row = page.locator(".card", { hasText: "多分ジェンイーっぽい駒" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("仮登録駒");
    await expect(row).toContainText("情報未補完");
  });

  test("名称不明のまま不明駒として保存できる", async ({ page }) => {
    await seedPendingScan(page, 1);

    await page.getByRole("button", { name: "名前で検索" }).click();
    await page.getByRole("button", { name: "名称不明のまま「不明駒」として保存" }).click();

    await expect(page.getByText("（名称未確認の駒）")).toBeVisible();
    await expect(page.getByText("確定済み")).toBeVisible();
  });

  test("仮の名称を入力しないまま仮登録しようとするとアラートが表示される", async ({ page }) => {
    await seedPendingScan(page, 2);

    await page.getByRole("button", { name: "名前で検索" }).click();
    let alertShown = false;
    page.once("dialog", async (dialog) => {
      alertShown = true;
      await dialog.accept();
    });
    await page.getByRole("button", { name: "＋ 新しい駒として仮登録" }).click();
    await expect.poll(() => alertShown).toBe(true);
    // 保留のまま（未確定）で、仮登録は行われない
    await expect(page.getByText("未確定")).toBeVisible();
  });
});
