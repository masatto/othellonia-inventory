import { describe, expect, it } from "vitest";
import { createBackup, migrateBackup } from "../../src/backup/backupSchema";
import type { OwnedPiece } from "../../src/domain/types";

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
});
