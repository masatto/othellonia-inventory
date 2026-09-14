import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addLearnedFeature,
  clearAllData,
  deleteLocalPieceMetadata,
  deleteOwnedPiece,
  getAllLearnedFeatures,
  getAllLocalPieceMetadata,
  getAllOwnedPieces,
  getLocalPieceMetadata,
  getMeta,
  putLocalPieceMetadata,
  putOwnedPiece,
  resetDbForTests,
  setMeta,
} from "../../src/db/database";
import type { LocalPieceMetadata, OwnedPiece } from "../../src/domain/types";

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
    await putLocalPieceMetadata(makeLocalMetadata("sd001"));
    await clearAllData();
    expect(await getAllOwnedPieces()).toHaveLength(0);
    expect(await getAllLearnedFeatures()).toHaveLength(0);
    expect(await getAllLocalPieceMetadata()).toHaveLength(0);
  });

  it("駒情報補完データを保存・取得・削除できる", async () => {
    await putLocalPieceMetadata(makeLocalMetadata("sd001"));
    expect(await getLocalPieceMetadata("sd001")).toMatchObject({ pieceId: "sd001", attribute: "竜" });
    expect(await getAllLocalPieceMetadata()).toHaveLength(1);

    await deleteLocalPieceMetadata("sd001");
    expect(await getLocalPieceMetadata("sd001")).toBeUndefined();
  });

  it("同じpieceIdで保存すると上書きされる", async () => {
    await putLocalPieceMetadata(makeLocalMetadata("sd001"));
    await putLocalPieceMetadata({ ...makeLocalMetadata("sd001"), rarity: "S" });
    const all = await getAllLocalPieceMetadata();
    expect(all).toHaveLength(1);
    expect(all[0].rarity).toBe("S");
  });
});

function makeLocalMetadata(pieceId: string): LocalPieceMetadata {
  return {
    schemaVersion: 1,
    pieceId,
    fullName: "［架空の異名］テストピース",
    attribute: "竜",
    rarity: "S+",
    evolutionType: "進化",
    hp: null,
    attack: null,
    skill: { name: null, type: "攻撃力アップ", condition: null, effect: null, value: "1.5倍" },
    comboSkillStatus: "none",
    comboSkill: null,
    sourceUrls: [],
    checkedAt: "2026-09-14",
    importedAt: new Date().toISOString(),
    verificationStatus: "user_confirmed",
  };
}
