import { expect, type Page } from "@playwright/test";

/**
 * IndexedDBからの初回読み込み（getDb()のオープンとAppDataProviderの初期化）が
 * 完了し、実際の画面が描画されるまで待つ。
 * マスタは公開リポジトリに含まれず未インポートの状態でも起動できるため、
 * 特定の駒データ（旧「ジェンイー」等）には依存せず、ローディングゲートが
 * 外れて実際の見出しが描画されたことだけを確認する。
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.goto("/#/inventory");
  await expect(page.getByRole("heading", { name: "所持駒一覧" })).toBeVisible({ timeout: 10_000 });
}

export interface SeedMasterPiece {
  pieceId: string;
  fullName: string;
  baseName: string;
  epithet: string | null;
}

/**
 * マスタ(masterPiecesA、デフォルトの有効スロット)と所持駒(ownedPieces)を
 * 直接IndexedDBへ書き込む。アプリの状態は初回マウント時にしかIndexedDBを
 * 読み込まないため、書き込み後は必ずreloadしてから使うこと。
 */
export async function seedMasterAndOwnedPiece(page: Page, piece: SeedMasterPiece): Promise<void> {
  await waitForAppReady(page);
  await page.evaluate((p) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("othellonia-inventory");
      req.onsuccess = () => {
        const db = req.result;
        const now = new Date().toISOString();
        const tx = db.transaction(["masterPiecesA", "ownedPieces"], "readwrite");
        tx.objectStore("masterPiecesA").put({
          pieceId: p.pieceId,
          fullName: p.fullName,
          baseName: p.baseName,
          epithet: p.epithet,
          attribute: "不明",
          rarity: "不明",
          evolutionType: "不明",
          skillName: null,
          skillData: [],
          comboSkillName: null,
          comboSkillData: [],
          sourceUrl: null,
          sourceUpdatedAt: null,
          featureDataVersion: 1,
          masterVersion: "test-1",
        });
        tx.objectStore("ownedPieces").put({
          pieceId: p.pieceId,
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
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, piece);
  await page.reload();
  await waitForAppReady(page);
}
