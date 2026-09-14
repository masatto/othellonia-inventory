import { describe, expect, it } from "vitest";
import { buildInvestigationPrompt, splitIntoBatches, MAX_PIECES_PER_BATCH } from "../../src/enrichment/promptGeneration";

describe("buildInvestigationPrompt", () => {
  it("選択した駒だけがプロンプトに含まれる", () => {
    const prompt = buildInvestigationPrompt([
      { pieceId: "sd001", fullName: "［架空］アルファ" },
      { pieceId: "sd002", fullName: "［架空］ベータ" },
    ]);
    expect(prompt).toContain("sd001");
    expect(prompt).toContain("アルファ");
    expect(prompt).toContain("sd002");
    expect(prompt).toContain("ベータ");
  });

  it("画像・特徴量・所持数などの情報を含めない", () => {
    const prompt = buildInvestigationPrompt([{ pieceId: "sd001", fullName: "［架空］アルファ" }]);
    expect(prompt).not.toContain("data:image");
    expect(prompt).not.toContain("base64");
    expect(prompt).not.toContain("pHash");
    expect(prompt).not.toContain("所持数");
  });

  it("画像検索を行わずテキスト検索のみで調査するよう明記する", () => {
    const prompt = buildInvestigationPrompt([{ pieceId: "sd001", fullName: "［架空］アルファ" }]);
    expect(prompt).toContain("画像検索や画像解析は行わず");
  });

  it("期待するJSONスキーマ・出力例を含める", () => {
    const prompt = buildInvestigationPrompt([{ pieceId: "sd001", fullName: "［架空］アルファ" }]);
    expect(prompt).toContain("schemaVersion");
    expect(prompt).toContain("comboSkillStatus");
    expect(prompt).toContain("sourceUrls");
  });

  it("再調査の場合、現在保存されている情報を含める", () => {
    const prompt = buildInvestigationPrompt([
      {
        pieceId: "sd001",
        fullName: "［架空］アルファ",
        existing: {
          pieceId: "sd001",
          fullName: "［架空］アルファ",
          attribute: "竜",
          rarity: "S+",
          evolutionType: "進化",
          skill: { name: null, type: "攻撃力アップ", condition: null, effect: null, value: "1.8倍" },
          comboSkillStatus: "none",
          comboSkill: null,
          sourceUrls: [],
          checkedAt: "2026-09-01",
          verificationStatus: "user_confirmed",
          hasLocalMetadata: true,
        },
      },
    ]);
    expect(prompt).toContain("現在保存されている情報");
    expect(prompt).toContain("1.8倍");
    expect(prompt).toContain("2026-09-01");
  });
});

describe("splitIntoBatches", () => {
  it("20件ごとに分割する", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const batches = splitIntoBatches(items, MAX_PIECES_PER_BATCH);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(20);
    expect(batches[1]).toHaveLength(20);
    expect(batches[2]).toHaveLength(5);
  });

  it("20件以下なら1バッチにまとまる", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const batches = splitIntoBatches(items, MAX_PIECES_PER_BATCH);
    expect(batches).toHaveLength(1);
  });
});
