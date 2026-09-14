import { describe, expect, it } from "vitest";
import { buildConsultDocument, buildConsultEntries, consultDocumentToMarkdown } from "../../src/backup/aiExport";
import type { MergedPieceInfo, OwnedPiece } from "../../src/domain/types";

const mergedInfo: MergedPieceInfo = {
  pieceId: "sd025",
  fullName: "［王家の護持］ジェンイー",
  attribute: "竜",
  rarity: "S+",
  evolutionType: "進化",
  skill: { name: null, type: "攻撃力上昇・貫通", condition: null, effect: null, value: null },
  comboSkillStatus: "exists",
  comboSkill: { name: null, type: "盤面条件付き攻撃力上昇", condition: null, effect: null, value: null },
  sourceUrls: [{ url: "https://example.com/piece/25", title: null }],
  checkedAt: "2026-09-01",
  verificationStatus: "user_confirmed",
  hasLocalMetadata: true,
};

const declaredOnlyInfo: MergedPieceInfo = {
  pieceId: "sd999",
  fullName: "［過去申告］未確認駒",
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
};

const owned: OwnedPiece = {
  pieceId: "sd025",
  quantity: 1,
  skillLevel: 10,
  ownedStatus: "confirmed",
  recognitionConfidence: null,
  confirmedByUser: true,
  firstDetectedAt: "2026-01-01T00:00:00.000Z",
  lastDetectedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  memo: "",
};

const declaredOnlyOwned: OwnedPiece = {
  pieceId: "sd999",
  quantity: 1,
  skillLevel: null,
  ownedStatus: "declared_only",
  recognitionConfidence: null,
  confirmedByUser: true,
  firstDetectedAt: "2026-01-01T00:00:00.000Z",
  lastDetectedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  memo: "",
};

const mergedById = new Map([
  ["sd025", mergedInfo],
  ["sd999", declaredOnlyInfo],
]);

describe("AI相談用データ生成", () => {
  it("所持駒からConsultEntryを構築する", () => {
    const entries = buildConsultEntries([owned], mergedById, null);
    expect(entries).toHaveLength(1);
    expect(entries[0].fullName).toBe("［王家の護持］ジェンイー");
    expect(entries[0].attribute).toBe("竜");
    expect(entries[0].skillSummary).toContain("攻撃力上昇・貫通");
    expect(entries[0].checkedAt).toBe("2026-09-01");
    expect(entries[0].isIncomplete).toBe(false);
  });

  it("targetPieceIdsで絞り込める", () => {
    const entries = buildConsultEntries([owned], mergedById, ["other"]);
    expect(entries).toHaveLength(0);
  });

  it("過去申告のみの駒はデフォルト(targetPieceIds未指定)では除外される", () => {
    const entries = buildConsultEntries([owned, declaredOnlyOwned], mergedById, null);
    expect(entries.map((e) => e.pieceId)).toEqual(["sd025"]);
  });

  it("targetPieceIdsで明示すれば過去申告のみの駒も含められる", () => {
    const entries = buildConsultEntries([owned, declaredOnlyOwned], mergedById, ["sd999"]);
    expect(entries.map((e) => e.pieceId)).toEqual(["sd999"]);
  });

  it("未補完の駒はisIncompleteがtrueになる", () => {
    const entries = buildConsultEntries([declaredOnlyOwned], mergedById, ["sd999"]);
    expect(entries[0].isIncomplete).toBe(true);
  });

  it("画像・マスター全件・内部ログを含まないMarkdownを生成する", () => {
    const entries = buildConsultEntries([owned], mergedById, null);
    const doc = buildConsultDocument({ goal: "速竜を組みたい", freeText: "", targetPieceIds: null }, entries);
    const markdown = consultDocumentToMarkdown(doc);
    expect(markdown).toContain("# オセロニア相談データ");
    expect(markdown).toContain("速竜を組みたい");
    expect(markdown).toContain("ジェンイー");
    expect(markdown).not.toContain("data:image");
    expect(markdown).not.toContain("base64");
  });

  it("未補完の駒には「属性・形態・スキル情報は未補完」を表示する", () => {
    const entries = buildConsultEntries([declaredOnlyOwned], mergedById, ["sd999"]);
    const doc = buildConsultDocument({ goal: "自由入力", freeText: "", targetPieceIds: ["sd999"] }, entries);
    const markdown = consultDocumentToMarkdown(doc);
    expect(markdown).toContain("属性・形態・スキル情報は未補完");
  });
});
