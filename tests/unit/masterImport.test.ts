import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMasterImportPreview, applyMasterImport } from "../../src/master/masterImport";
import { getAllMasterPiecesFromDb, clearAllData, resetDbForTests, getMeta } from "../../src/db/database";
import { MASTER_DATA_VERSION_KEY, MASTER_PIECE_COUNT_KEY } from "../../src/domain/types";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    game: "逆転オセロニア",
    masterVersion: "test-1",
    generatedAt: "2026-09-14T00:00:00.000Z",
    pieces: [
      {
        pieceId: "sd001",
        fullName: "［架空の異名］テストピース",
        baseName: "テストピース",
        epithet: "架空の異名",
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
      },
    ],
    ...overrides,
  };
}

describe("buildMasterImportPreview", () => {
  it("正常なJSONテキストからプレビューを生成する", () => {
    const preview = buildMasterImportPreview(JSON.stringify(validPayload()));
    expect(preview.ok).toBe(true);
    expect(preview.pieceCount).toBe(1);
    expect(preview.masterVersion).toBe("test-1");
  });

  it("BOM付きのテキストでも解析できる", () => {
    const bom = String.fromCharCode(0xfeff);
    const preview = buildMasterImportPreview(bom + JSON.stringify(validPayload()));
    expect(preview.ok).toBe(true);
  });

  it("Markdownコードフェンス付きのテキストからでも抽出して検証できる", () => {
    const preview = buildMasterImportPreview("```json\n" + JSON.stringify(validPayload()) + "\n```");
    expect(preview.ok).toBe(true);
  });

  it("不正なJSONはエラーを返す", () => {
    const preview = buildMasterImportPreview("{not valid json");
    expect(preview.ok).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
  });

  it("スキーマ不正な内容はエラー一覧を返し、pieceCountは0のままにする", () => {
    const preview = buildMasterImportPreview(JSON.stringify(validPayload({ game: "別のゲーム" })));
    expect(preview.ok).toBe(false);
    expect(preview.pieceCount).toBe(0);
  });
});

describe("applyMasterImport", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  afterEach(async () => {
    await clearAllData();
    resetDbForTests();
  });

  it("検証済みのファイルをIndexedDBへ反映し、metaも更新する", async () => {
    const preview = buildMasterImportPreview(JSON.stringify(validPayload()));
    expect(preview.ok).toBe(true);
    if (!preview.ok || !preview.data) throw new Error("preview should be ok");

    const outcome = await applyMasterImport(preview.data, "replace");
    expect(outcome.count).toBe(1);

    const pieces = await getAllMasterPiecesFromDb();
    expect(pieces).toHaveLength(1);
    expect(await getMeta(MASTER_DATA_VERSION_KEY)).toBe("test-1");
    expect(await getMeta(MASTER_PIECE_COUNT_KEY)).toBe("1");
  });
});
