import { describe, expect, it } from "vitest";
import { buildPieceDiff, buildLocalMetadataFromAiPiece } from "../../src/enrichment/diff";
import type { AiPiece } from "../../src/enrichment/aiResponseSchema";
import type { MergedPieceInfo } from "../../src/domain/types";

const emptyExisting: MergedPieceInfo = {
  pieceId: "sd001",
  fullName: "［架空の異名］テストピース",
  version: null,
  attribute: null,
  rarity: null,
  evolutionType: null,
  skill: null,
  comboSkillStatus: "unknown",
  comboSkill: null,
  sourceUrls: [],
  checkedAt: null,
  verificationStatus: null,
  hasLocalMetadata: false,
  isUserRegistered: false,
};

function aiPiece(overrides: Partial<AiPiece> = {}): AiPiece {
  return {
    pieceId: "sd001",
    fullName: "［架空の異名］テストピース",
    attribute: "竜",
    rarity: "S+",
    evolutionType: "進化",
    skill: { name: null, type: "攻撃力アップ", condition: "常時", effect: "基本ATK上昇", value: "1.5倍" },
    comboSkillStatus: "exists",
    comboSkill: { name: null, type: "防御力アップ", condition: null, effect: null, value: null },
    sourceUrls: [{ url: "https://example.com/piece", title: "出典" }],
    ...overrides,
  };
}

describe("buildPieceDiff", () => {
  const known = new Map([["sd001", "［架空の異名］テストピース"]]);

  it("不明から確定値への差分を生成する", () => {
    const diff = buildPieceDiff(emptyExisting, aiPiece(), known);
    expect(diff.hasAnyChange).toBe(true);
    const attrDiff = diff.fields.find((f) => f.field === "attribute")!;
    expect(attrDiff.before).toBe("不明");
    expect(attrDiff.after).toBe("竜");
    expect(attrDiff.changed).toBe(true);
    expect(diff.bulkEligible).toBe(true);
  });

  it("名称が完全一致しなくても、pieceIdが一致すれば一括反映の対象になりうる（同一性は名称で判定しない）", () => {
    const knownDifferent = new Map([["sd001", "［別の異名］テストピース"]]);
    const diff = buildPieceDiff(emptyExisting, aiPiece(), knownDifferent);
    expect(diff.identityStatus).toBe("ok");
    expect(diff.bulkEligible).toBe(true);
  });

  it("名称候補は現在の名称と異なる場合changedになるが、自動では反映されない", () => {
    const knownDifferent = new Map([["sd001", "［別の異名］テストピース"]]);
    const diff = buildPieceDiff(emptyExisting, aiPiece(), knownDifferent);
    expect(diff.nameCandidate.currentFullName).toBe("［別の異名］テストピース");
    expect(diff.nameCandidate.proposedFullName).toBe("［架空の異名］テストピース");
    expect(diff.nameCandidate.proposedEpithet).toBe("架空の異名");
    expect(diff.nameCandidate.changed).toBe(true);
  });

  it("端末内に存在しないpieceIdは一括反映の対象から除外される", () => {
    const emptyKnown = new Map<string, string>();
    const diff = buildPieceDiff(emptyExisting, aiPiece(), emptyKnown);
    expect(diff.identityStatus).toBe("unknown_piece_id");
    expect(diff.bulkEligible).toBe(false);
  });

  it("出典が無い場合は一括反映の対象から除外される", () => {
    const diff = buildPieceDiff(emptyExisting, aiPiece({ sourceUrls: [] }), known);
    expect(diff.bulkEligible).toBe(false);
  });

  it("変更が無ければhasAnyChangeはfalseになる", () => {
    const existing: MergedPieceInfo = {
      ...emptyExisting,
      attribute: "竜",
      rarity: "S+",
      evolutionType: "進化",
      skill: { name: null, type: "攻撃力アップ", condition: "常時", effect: "基本ATK上昇", value: "1.5倍" },
      comboSkillStatus: "exists",
      comboSkill: { name: null, type: "防御力アップ", condition: null, effect: null, value: null },
      sourceUrls: [{ url: "https://example.com/piece", title: "出典" }],
      hasLocalMetadata: true,
    };
    const diff = buildPieceDiff(existing, aiPiece(), known);
    expect(diff.hasAnyChange).toBe(false);
  });
});

describe("buildLocalMetadataFromAiPiece", () => {
  const known = new Map([["sd001", "［架空の異名］テストピース"]]);

  it("承認されたAI回答からLocalPieceMetadataを構築する", () => {
    const diff = buildPieceDiff(emptyExisting, aiPiece(), known);
    const metadata = buildLocalMetadataFromAiPiece(diff, "2026-09-14", false);
    expect(metadata.pieceId).toBe("sd001");
    expect(metadata.attribute).toBe("竜");
    expect(metadata.verificationStatus).toBe("user_confirmed");
    expect(metadata.checkedAt).toBe("2026-09-14");
    expect(metadata.schemaVersion).toBe(1);
  });

  it("acceptNameがfalseの場合、名称・バージョンは現在の値を引き継ぐ", () => {
    const knownDifferent = new Map([["sd001", "［別の異名］テストピース"]]);
    const diff = buildPieceDiff(emptyExisting, aiPiece({ version: "季節限定" }), knownDifferent);
    const metadata = buildLocalMetadataFromAiPiece(diff, "2026-09-14", false);
    expect(metadata.fullName).toBe("［別の異名］テストピース");
    expect(metadata.version).toBeNull();
  });

  it("acceptNameがtrueの場合、AI提案の名称・バージョンを採用する", () => {
    const knownDifferent = new Map([["sd001", "［別の異名］テストピース"]]);
    const diff = buildPieceDiff(emptyExisting, aiPiece({ version: "季節限定" }), knownDifferent);
    const metadata = buildLocalMetadataFromAiPiece(diff, "2026-09-14", true);
    expect(metadata.fullName).toBe("［架空の異名］テストピース");
    expect(metadata.version).toBe("季節限定");
  });
});
