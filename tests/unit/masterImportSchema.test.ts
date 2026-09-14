import { describe, expect, it } from "vitest";
import { validateMasterImportFile } from "../../src/master/masterImportSchema";
import type { PieceMaster } from "../../src/domain/types";

function makePiece(overrides: Partial<PieceMaster> = {}): PieceMaster {
  return {
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
    ...overrides,
  };
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    game: "逆転オセロニア",
    masterVersion: "test-1",
    generatedAt: "2026-09-14T00:00:00.000Z",
    pieces: [makePiece()],
    ...overrides,
  };
}

describe("validateMasterImportFile", () => {
  it("正常なマスタJSONを検証できる", () => {
    const result = validateMasterImportFile(basePayload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces).toHaveLength(1);
  });

  it("対応していないschemaVersionは拒否する", () => {
    const result = validateMasterImportFile(basePayload({ schemaVersion: 99 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field).toBe("schemaVersion");
      expect(result.errors[0].message).toContain("対応していない");
    }
  });

  it("gameが逆転オセロニアでなければ拒否する", () => {
    const result = validateMasterImportFile(basePayload({ game: "別のゲーム" }));
    expect(result.ok).toBe(false);
  });

  it("piecesが配列でなければ拒否する", () => {
    const result = validateMasterImportFile(basePayload({ pieces: "not-an-array" }));
    expect(result.ok).toBe(false);
  });

  it("pieceIdが存在しない場合は拒否し、インデックスとフィールド名を報告する", () => {
    const payload = basePayload();
    delete (payload.pieces[0] as Record<string, unknown>).pieceId;
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].index).toBe(0);
      expect(result.errors[0].field).toBe("pieceId");
    }
  });

  it("fullNameが存在しない場合は拒否する", () => {
    const payload = basePayload();
    delete (payload.pieces[0] as Record<string, unknown>).fullName;
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("属性が許可値以外の場合は拒否する", () => {
    const payload = basePayload();
    (payload.pieces[0] as Record<string, unknown>).attribute = "架空属性";
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("進化形態が許可値以外の場合は拒否する", () => {
    const payload = basePayload();
    (payload.pieces[0] as Record<string, unknown>).evolutionType = "架空形態";
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("sourceUrlがhttp/https以外の場合は拒否する", () => {
    const payload = basePayload();
    (payload.pieces[0] as Record<string, unknown>).sourceUrl = "javascript:alert(1)";
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("HTMLタグを含む文字列は拒否する", () => {
    const payload = basePayload();
    (payload.pieces[0] as Record<string, unknown>).fullName = "<script>alert(1)</script>";
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("重複pieceIdを検出し、インデックスとpieceIdを報告する", () => {
    const payload = basePayload({ pieces: [makePiece(), makePiece()] });
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].index).toBe(1);
      expect(result.errors[0].pieceId).toBe("sd001");
      expect(result.errors[0].field).toBe("pieceId");
    }
  });

  it("スキルデータのmultiplier/turnsが数値でない場合は拒否する", () => {
    const payload = basePayload();
    (payload.pieces[0] as Record<string, unknown>).skillData = [
      { skillType: "攻撃力アップ", condition: null, multiplier: "1.5倍", turns: null },
    ];
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });

  it("1件でも重大なエラーがある場合、有効な駒だけを黙って抽出することはなく全体を拒否する", () => {
    const payload = basePayload({ pieces: [makePiece({ pieceId: "sd001" }), { pieceId: "sd002" }] });
    const result = validateMasterImportFile(payload);
    expect(result.ok).toBe(false);
  });
});
