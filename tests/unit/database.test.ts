import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addLearnedFeature,
  clearAllData,
  deleteOwnedPiece,
  getAllLearnedFeatures,
  getAllOwnedPieces,
  getMeta,
  putOwnedPiece,
  resetDbForTests,
  setMeta,
} from "../../src/db/database";
import type { OwnedPiece } from "../../src/domain/types";

function makeOwned(pieceId: string): OwnedPiece {
  const now = new Date().toISOString();
  return {
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
  };
}

describe("IndexedDBデータ層", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  afterEach(async () => {
    await clearAllData();
    resetDbForTests();
  });

  it("所持駒を保存・取得・削除できる", async () => {
    await putOwnedPiece(makeOwned("sd001"));
    let all = await getAllOwnedPieces();
    expect(all).toHaveLength(1);

    await deleteOwnedPiece("sd001");
    all = await getAllOwnedPieces();
    expect(all).toHaveLength(0);
  });

  it("学習済み特徴量を保存・取得できる", async () => {
    await addLearnedFeature({
      id: "f1",
      pieceId: "sd001",
      pHash: "aa",
      dHash: "bb",
      aHash: "cc",
      colorHistogram: [1, 0],
      createdAt: new Date().toISOString(),
    });
    const all = await getAllLearnedFeatures();
    expect(all).toHaveLength(1);
    expect(all[0].pieceId).toBe("sd001");
  });

  it("metaキーバリューを保存・取得できる", async () => {
    await setMeta("masterDataVersion", "seed-1");
    expect(await getMeta("masterDataVersion")).toBe("seed-1");
  });

  it("clearAllDataで全ストアが空になる", async () => {
    await putOwnedPiece(makeOwned("sd001"));
    await addLearnedFeature({
      id: "f1",
      pieceId: "sd001",
      pHash: "aa",
      dHash: "bb",
      aHash: "cc",
      colorHistogram: [1, 0],
      createdAt: new Date().toISOString(),
    });
    await clearAllData();
    expect(await getAllOwnedPieces()).toHaveLength(0);
    expect(await getAllLearnedFeatures()).toHaveLength(0);
  });
});
