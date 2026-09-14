import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addLearnedFeature,
  clearAllData,
  clearMasterPiecesOnly,
  deleteLocalPiece,
  deleteLocalPieceMetadata,
  deleteOwnedPiece,
  getAllLearnedFeatures,
  getAllLocalPieceMetadata,
  getAllLocalPieces,
  getAllMasterPiecesFromDb,
  getAllOwnedPieces,
  getLocalPiece,
  getLocalPieceMetadata,
  getMasterPieceFromDb,
  getMeta,
  putLocalPiece,
  putLocalPieceMetadata,
  putOwnedPiece,
  resetDbForTests,
  setMeta,
  swapMasterPieces,
} from "../../src/db/database";
import type { LocalPieceMetadata, LocalPieceRecord, OwnedPiece, PieceMaster } from "../../src/domain/types";

function makeMaster(pieceId: string, fullName = `駒${pieceId}`): PieceMaster {
  return {
    pieceId,
    fullName,
    baseName: fullName,
    epithet: null,
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
  };
}

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
    await putLocalPiece(makeLocalPiece("local-abc"));
    await clearAllData();
    expect(await getAllOwnedPieces()).toHaveLength(0);
    expect(await getAllLearnedFeatures()).toHaveLength(0);
    expect(await getAllLocalPieceMetadata()).toHaveLength(0);
    expect(await getAllLocalPieces()).toHaveLength(0);
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

  it("仮登録駒(localPieces)を保存・取得・削除できる", async () => {
    await putLocalPiece(makeLocalPiece("local-abc"));
    expect(await getLocalPiece("local-abc")).toMatchObject({ pieceId: "local-abc", nameStatus: "provisional" });
    expect(await getAllLocalPieces()).toHaveLength(1);

    await deleteLocalPiece("local-abc");
    expect(await getLocalPiece("local-abc")).toBeUndefined();
  });

  describe("マスタ(masterPiecesA/B)の安全な差し替え", () => {
    it("マスタ未登録でも0件として取得でき、エラーにならない", async () => {
      expect(await getAllMasterPiecesFromDb()).toEqual([]);
      expect(await getMasterPieceFromDb("sd001")).toBeUndefined();
    });

    it("replaceモードでマスタを登録・取得できる", async () => {
      const result = await swapMasterPieces([makeMaster("sd001"), makeMaster("sd002")], "replace");
      expect(result.count).toBe(2);
      expect(await getAllMasterPiecesFromDb()).toHaveLength(2);
      expect(await getMasterPieceFromDb("sd001")).toMatchObject({ pieceId: "sd001" });
    });

    it("replaceモードでは新しいマスタに含まれない駒が削除される", async () => {
      await swapMasterPieces([makeMaster("sd001"), makeMaster("sd002")], "replace");
      await swapMasterPieces([makeMaster("sd003")], "replace");
      const all = await getAllMasterPiecesFromDb();
      expect(all.map((p) => p.pieceId)).toEqual(["sd003"]);
    });

    it("mergeモードでは既存の駒を残しつつ、同一pieceIdは更新・新規は追加する", async () => {
      await swapMasterPieces([makeMaster("sd001", "旧名称"), makeMaster("sd002")], "replace");
      await swapMasterPieces([makeMaster("sd001", "新名称"), makeMaster("sd003")], "merge");
      const all = await getAllMasterPiecesFromDb();
      const byId = new Map(all.map((p) => [p.pieceId, p]));
      expect(all).toHaveLength(3);
      expect(byId.get("sd001")?.fullName).toBe("新名称");
      expect(byId.get("sd002")).toBeDefined();
      expect(byId.get("sd003")).toBeDefined();
    });

    it("書き込み件数が不足する場合は例外を投げ、有効なマスタが維持される（ロールバック不要な設計）", async () => {
      await swapMasterPieces([makeMaster("sd001")], "replace");
      expect(await getAllMasterPiecesFromDb()).toHaveLength(1);

      // 同一pieceIdが重複した入力（putで上書きされ、書き込み件数が指定件数を下回る）
      const duplicated = [makeMaster("sd002"), makeMaster("sd002")];
      await expect(swapMasterPieces(duplicated, "replace")).rejects.toThrow();

      // 失敗後も、直前に有効だったマスタ(sd001)がそのまま維持されている
      const current = await getAllMasterPiecesFromDb();
      expect(current).toHaveLength(1);
      expect(current[0].pieceId).toBe("sd001");
    });

    it("マスタだけを削除でき、所持駒等の他のデータには影響しない", async () => {
      await putOwnedPiece(makeOwned("sd001"));
      await swapMasterPieces([makeMaster("sd001")], "replace");
      await clearMasterPiecesOnly();
      expect(await getAllMasterPiecesFromDb()).toHaveLength(0);
      expect(await getAllOwnedPieces()).toHaveLength(1);
    });

    it("約8000件のマスタを一括インポートできる", async () => {
      const pieces = Array.from({ length: 8000 }, (_, i) => makeMaster(`sd${String(i).padStart(5, "0")}`));
      const result = await swapMasterPieces(pieces, "replace");
      expect(result.count).toBe(8000);
      expect(await getAllMasterPiecesFromDb()).toHaveLength(8000);
    }, 30_000);
  });
});

function makeLocalMetadata(pieceId: string): LocalPieceMetadata {
  return {
    schemaVersion: 1,
    pieceId,
    fullName: "［架空の異名］テストピース",
    version: null,
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

function makeLocalPiece(pieceId: string): LocalPieceRecord {
  return {
    pieceId,
    provisionalName: "多分ジェンイーっぽい駒",
    nameStatus: "provisional",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
