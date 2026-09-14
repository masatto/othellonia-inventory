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

/**
 * 同一スクリーンショット内に同じ駒が複数写っている「被り」を再現する。
 * 2マスとも全く同じ画像特徴量（pHash/dHash/aHash/色ヒストグラム）を持たせることで、
 * 実際に同じ駒アイコンが複数回切り出された状態を模している。
 */
function pendingScanRecordDuplicates(cellIndices: number[]) {
  return {
    scanId: `test-scan-dup-${cellIndices.join("-")}`,
    images: [{ imageIndex: 0, imageHash: "hash1", width: 100, height: 100, capturedAt: null }],
    scannedAt: new Date().toISOString(),
    detectedCellCount: cellIndices.length,
    results: cellIndices.map((cellIndex) => ({
      cell: {
        cellIndex,
        row: 0,
        col: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        pHash: "ffffffffffffffff",
        dHash: "ffffffffffffffff",
        aHash: "ffffffffffffffff",
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
    })),
    overlapInformation: { totalOverlapCells: 0 },
    reviewStatus: "pending",
  };
}

async function seedPendingScanDuplicates(page: Page, cellIndices: number[]) {
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
  }, pendingScanRecordDuplicates(cellIndices));
  await page.goto("/#/review");
  await expect(page.getByRole("heading", { name: "認識結果" })).toBeVisible();
}

test.describe("マスタ未登録駒の仮登録", () => {
  test("仮の名称を入力して新しい駒として仮登録できる", async ({ page }) => {
    await seedPendingScan(page, 0);

    await page.getByRole("button", { name: "名前で検索" }).click();
    await page.getByPlaceholder("仮の名称を入力（うろ覚え・特徴の説明でも可）").fill("多分ジェンイーっぽい駒");
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

test.describe("同一スクリーンショット内の被りキャラ検出", () => {
  test("1体目を仮登録すると、同じ画像の2体目に「同じ駒として登録する」提案が出て名前を入力せず一致できる", async ({
    page,
  }) => {
    await seedPendingScanDuplicates(page, [30, 31]);

    // 1体目（1枚目のカード）を仮登録する
    const cards = page.locator(".card").filter({ hasText: "未確定" });
    await cards.first().getByRole("button", { name: "名前で検索" }).click();
    await page.getByPlaceholder("仮の名称を入力（うろ覚え・特徴の説明でも可）").fill("闇のドラゴンっぽい駒");
    await page.getByRole("button", { name: "＋ 新しい駒として仮登録" }).click();

    // 2体目には、名前を入力しなくても被り候補の提案が表示される
    await expect(page.getByText(/同じ画像内の「闇のドラゴンっぽい駒」と非常によく似ています/)).toBeVisible();
    await page.getByRole("button", { name: "同じ駒として登録する" }).click();

    await expect(page.getByText("未確定")).toHaveCount(0);

    await page.getByRole("button", { name: "所持駒として保存" }).click();
    await expect(page).toHaveURL(/#\/inventory/);
    const row = page.locator(".card", { hasText: "闇のドラゴンっぽい駒" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("所持数 2");
  });
});
