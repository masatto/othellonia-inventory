import { describe, expect, it } from "vitest";
import { buildConsultDocument, buildConsultEntries, consultDocumentToMarkdown } from "../../src/backup/aiExport";
import type { OwnedPiece, PieceMaster } from "../../src/domain/types";

const master: PieceMaster = {
  pieceId: "sd025",
  fullName: "［王家の護持］ジェンイー",
  baseName: "ジェンイー",
  epithet: "王家の護持",
  attribute: "竜",
  rarity: "S+",
  evolutionType: "進化",
  skillName: "攻撃力上昇・貫通",
  skillData: [],
  comboSkillName: "盤面条件付き攻撃力上昇",
  comboSkillData: [],
  sourceUrl: "https://example.com/piece/25",
  sourceUpdatedAt: null,
  featureDataVersion: 1,
  masterVersion: "seed-1",
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

describe("AI相談用データ生成", () => {
  it("所持駒からConsultEntryを構築する", () => {
    const entries = buildConsultEntries([owned], new Map([["sd025", master]]), null);
    expect(entries).toHaveLength(1);
    expect(entries[0].fullName).toBe("［王家の護持］ジェンイー");
    expect(entries[0].attribute).toBe("竜");
  });

  it("targetPieceIdsで絞り込める", () => {
    const entries = buildConsultEntries([owned], new Map([["sd025", master]]), ["other"]);
    expect(entries).toHaveLength(0);
  });

  it("画像・マスター全件・内部ログを含まないMarkdownを生成する", () => {
    const entries = buildConsultEntries([owned], new Map([["sd025", master]]), null);
    const doc = buildConsultDocument({ goal: "速竜を組みたい", freeText: "", targetPieceIds: null }, entries);
    const markdown = consultDocumentToMarkdown(doc);
    expect(markdown).toContain("# オセロニア相談データ");
    expect(markdown).toContain("速竜を組みたい");
    expect(markdown).toContain("ジェンイー");
    expect(markdown).not.toContain("data:image");
    expect(markdown).not.toContain("base64");
  });
});
