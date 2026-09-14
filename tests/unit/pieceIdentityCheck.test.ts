import { describe, expect, it } from "vitest";
import { checkPieceIdentities, hasMostlyNullFields, hasNoSources } from "../../src/enrichment/pieceIdentityCheck";
import type { AiPiece } from "../../src/enrichment/aiResponseSchema";

function piece(overrides: Partial<AiPiece> = {}): AiPiece {
  return {
    pieceId: "sd001",
    fullName: "［架空の異名］テストピース",
    attribute: "竜",
    rarity: "S+",
    evolutionType: "進化",
    skill: { name: null, type: "攻撃力アップ", condition: null, effect: null, value: "1.5倍" },
    comboSkillStatus: "none",
    comboSkill: null,
    sourceUrls: [{ url: "https://example.com", title: null }],
    ...overrides,
  };
}

describe("checkPieceIdentities", () => {
  it("pieceIdが存在し名称が一致すればokになる", () => {
    const known = new Map([["sd001", "［架空の異名］テストピース"]]);
    const [result] = checkPieceIdentities([piece()], known);
    expect(result.status).toBe("ok");
  });

  it("端末内に存在しないpieceIdを検出する", () => {
    const known = new Map([["sd999", "別の駒"]]);
    const [result] = checkPieceIdentities([piece()], known);
    expect(result.status).toBe("unknown_piece_id");
  });

  it("fullNameが一致しない場合、名称不一致として検出する", () => {
    const known = new Map([["sd001", "［別の異名］テストピース"]]);
    const [result] = checkPieceIdentities([piece()], known);
    expect(result.status).toBe("name_mismatch");
    expect(result.registeredFullName).toBe("［別の異名］テストピース");
  });

  it("異名だけ違う場合も名称不一致として検出する", () => {
    const known = new Map([["sd001", "テストピース"]]);
    const [result] = checkPieceIdentities([piece({ fullName: "［架空の異名］テストピース" })], known);
    expect(result.status).toBe("name_mismatch");
  });
});

describe("hasMostlyNullFields / hasNoSources", () => {
  it("必須情報の大半がnullならtrueを返す", () => {
    const p = piece({ attribute: null, rarity: null, evolutionType: null, skill: null });
    expect(hasMostlyNullFields(p)).toBe(true);
  });

  it("十分な情報があればfalseを返す", () => {
    expect(hasMostlyNullFields(piece())).toBe(false);
  });

  it("出典が無い場合を検出する", () => {
    expect(hasNoSources(piece({ sourceUrls: [] }))).toBe(true);
    expect(hasNoSources(piece())).toBe(false);
  });
});
