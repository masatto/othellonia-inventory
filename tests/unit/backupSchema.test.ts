import { describe, expect, it } from "vitest";
import { createBackup, migrateBackup } from "../../src/backup/backupSchema";
import type { LocalPieceMetadata, LocalPieceRecord, OwnedPiece, PieceMaster } from "../../src/domain/types";

const sampleMaster: PieceMaster = {
  pieceId: "sd001",
  fullName: "［架空の異名］テストピース",
  baseName: "テストピース",
  epithet: "架空の異名",
  attribute: "竜",
  rarity: "S+",
  evolutionType: "進化",
  skillName: null,
  skillData: [],
  comboSkillName: null,
  comboSkillData: [],
  sourceUrl: null,
  sourceUpdatedAt: null,
  featureDataVersion: 1,
  masterVersion: "test-1",
};

const samplePiece: OwnedPiece = {
  pieceId: "sd001",
  quantity: 2,
  skillLevel: 5,
  ownedStatus: "confirmed",
  recognitionConfidence: 0.98,
  confirmedByUser: true,
  firstDetectedAt: "2026-01-01T00:00:00.000Z",
  lastDetectedAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  memo: "テスト",
};

const sampleMetadata: LocalPieceMetadata = {
  schemaVersion: 1,
  pieceId: "sd001",
  fullName: "［架空の異名］テストピース",
  version: null,
  attribute: "竜",
  rarity: "S+",
  evolutionType: "進化",
  hp: null,
  attack: null,
  skill: { name: null, type: "攻撃力アップ", condition: "常時", effect: "基本ATK上昇", value: "1.5倍" },
  comboSkillStatus: "none",
  comboSkill: null,
  sourceUrls: [{ url: "https://example.com/piece", title: "テスト出典" }],
  checkedAt: "2026-09-14",
  importedAt: "2026-09-14T00:00:00.000Z",
  verificationStatus: "user_confirmed",
};

describe("backupSchema", () => {
  it("バックアップを作成し、そのまま復元できる", () => {
    const backup = createBackup([samplePiece], "seed-1");
    const json = JSON.parse(JSON.stringify(backup));
    const { ownedPieces, warnings } = migrateBackup(json);
    expect(ownedPieces).toHaveLength(1);
    expect(ownedPieces[0].pieceId).toBe("sd001");
    expect(ownedPieces[0].quantity).toBe(2);
    expect(warnings).toHaveLength(0);
  });

  it("スキーマバージョンが無い旧形式でも読み込み、警告を返す", () => {
    const { ownedPieces, warnings } = migrateBackup({
      ownedPieces: [{ pieceId: "sd002", quantity: 1 }],
    });
    expect(ownedPieces).toHaveLength(1);
    expect(ownedPieces[0].ownedStatus).toBe("confirmed");
    expect(ownedPieces[0].memo).toBe("");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("不正な形式はエラーを投げる", () => {
    expect(() => migrateBackup(null)).toThrow();
    expect(() => migrateBackup("invalid")).toThrow();
  });

  it("ownedPiecesが無い場合は空配列として扱う", () => {
    const { ownedPieces } = migrateBackup({ schemaVersion: 1 });
    expect(ownedPieces).toEqual([]);
  });

  it("localPieceMetadataが無い旧バックアップでも復元できる（v1->v2マイグレーション）", () => {
    const { localPieceMetadata, warnings } = migrateBackup({
      schemaVersion: 1,
      ownedPieces: [samplePiece],
    });
    expect(localPieceMetadata).toEqual([]);
    expect(warnings.length).toBe(0);
  });

  it("補完情報を含むバックアップを作成し、そのまま往復復元できる（sourceUrls/checkedAtも含む）", () => {
    const backup = createBackup([samplePiece], "seed-1", [sampleMetadata]);
    const json = JSON.parse(JSON.stringify(backup));
    const { localPieceMetadata, warnings } = migrateBackup(json);
    expect(localPieceMetadata).toHaveLength(1);
    expect(localPieceMetadata[0].pieceId).toBe("sd001");
    expect(localPieceMetadata[0].attribute).toBe("竜");
    expect(localPieceMetadata[0].sourceUrls).toEqual([{ url: "https://example.com/piece", title: "テスト出典" }]);
    expect(localPieceMetadata[0].checkedAt).toBe("2026-09-14");
    expect(warnings).toHaveLength(0);
  });

  it("不正な補完データ(HTMLタグ混入)は復元前に拒否し、警告付きでスキップする", () => {
    const corrupted = { ...sampleMetadata, fullName: "<script>alert(1)</script>" };
    const backup = createBackup([samplePiece], "seed-1", [corrupted]);
    const json = JSON.parse(JSON.stringify(backup));
    const { localPieceMetadata, warnings } = migrateBackup(json);
    expect(localPieceMetadata).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("生アイコンやサムネイルに相当するフィールドを含まない", () => {
    const backup = createBackup([samplePiece], "seed-1", [sampleMetadata]);
    const json = JSON.stringify(backup);
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("thumbnailDataUrl");
  });

  it("localPiecesが無い旧バックアップでも復元できる（v2->v3マイグレーション）", () => {
    const { localPieces, warnings } = migrateBackup({
      schemaVersion: 2,
      ownedPieces: [samplePiece],
    });
    expect(localPieces).toEqual([]);
    expect(warnings.length).toBe(0);
  });

  it("仮登録駒(localPieces)を含むバックアップを作成し、そのまま往復復元できる", () => {
    const sampleLocalPiece: LocalPieceRecord = {
      pieceId: "local-abc123",
      provisionalName: "多分ジェンイーっぽい駒",
      nameStatus: "provisional",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    };
    const backup = createBackup([samplePiece], "seed-1", [sampleMetadata], [sampleLocalPiece]);
    const json = JSON.parse(JSON.stringify(backup));
    const { localPieces, warnings } = migrateBackup(json);
    expect(localPieces).toHaveLength(1);
    expect(localPieces[0].pieceId).toBe("local-abc123");
    expect(localPieces[0].provisionalName).toBe("多分ジェンイーっぽい駒");
    expect(warnings).toHaveLength(0);
  });

  it("不正な仮登録駒データ(HTMLタグ混入)は復元前に拒否し、警告付きでスキップする", () => {
    const corrupted = {
      pieceId: "local-xyz",
      provisionalName: "<script>alert(1)</script>",
      nameStatus: "provisional",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    };
    const backup = createBackup([samplePiece], "seed-1", [], [corrupted as unknown as LocalPieceRecord]);
    const json = JSON.parse(JSON.stringify(backup));
    const { localPieces, warnings } = migrateBackup(json);
    expect(localPieces).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("ユーザーデータのみのエクスポートにはmasterPiecesを含めない", () => {
    const backup = createBackup([samplePiece], "seed-1", [sampleMetadata], []);
    expect(backup.masterPieces).toBeUndefined();
    expect(JSON.stringify(backup)).not.toContain("masterPieces");
  });

  it("完全バックアップ(マスタを含む)を作成し、そのまま往復復元できる", () => {
    const backup = createBackup([samplePiece], "seed-1", [sampleMetadata], [], [sampleMaster]);
    expect(backup.masterPieces).toHaveLength(1);
    const json = JSON.parse(JSON.stringify(backup));
    const { masterPieces, masterVersionAtExport, exportedAt, warnings } = migrateBackup(json);
    expect(masterPieces).toHaveLength(1);
    expect(masterPieces[0].pieceId).toBe("sd001");
    expect(masterVersionAtExport).toBe("seed-1");
    expect(exportedAt).toBe(backup.exportedAt);
    expect(warnings).toHaveLength(0);
  });

  it("masterPiecesが無い旧バックアップでも復元でき、空配列になる（v3->v4マイグレーション）", () => {
    const { masterPieces, warnings } = migrateBackup({ schemaVersion: 3, ownedPieces: [samplePiece] });
    expect(masterPieces).toEqual([]);
    expect(warnings.length).toBe(0);
  });

  it("不正なマスタデータ(HTMLタグ混入)は復元前に拒否し、警告付きでスキップする", () => {
    const corrupted = { ...sampleMaster, fullName: "<script>alert(1)</script>" };
    const backup = createBackup([samplePiece], "seed-1", [], [], [corrupted]);
    const json = JSON.parse(JSON.stringify(backup));
    const { masterPieces, warnings } = migrateBackup(json);
    expect(masterPieces).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
