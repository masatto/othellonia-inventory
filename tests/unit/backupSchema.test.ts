import { describe, expect, it } from "vitest";
import { createBackup, migrateBackup } from "../../src/backup/backupSchema";
import type { LocalPieceMetadata, OwnedPiece } from "../../src/domain/types";

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
});
