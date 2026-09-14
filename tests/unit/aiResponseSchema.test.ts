import { describe, expect, it } from "vitest";
import { validateAiResponseSchema } from "../../src/enrichment/aiResponseSchema";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    game: "逆転オセロニア",
    checkedAt: "2026-09-14",
    pieces: [
      {
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
      },
    ],
    ...overrides,
  };
}

describe("validateAiResponseSchema", () => {
  it("正常なJSONを検証できる", () => {
    const result = validateAiResponseSchema(validPayload());
    expect(result.ok).toBe(true);
    expect(result.data?.pieces).toHaveLength(1);
  });

  it("schemaVersionが不正なら拒否する", () => {
    const result = validateAiResponseSchema(validPayload({ schemaVersion: 99 }));
    expect(result.ok).toBe(false);
  });

  it("gameが逆転オセロニアでなければ拒否する", () => {
    const result = validateAiResponseSchema(validPayload({ game: "別のゲーム" }));
    expect(result.ok).toBe(false);
  });

  it("piecesが配列でなければ拒否する", () => {
    const result = validateAiResponseSchema(validPayload({ pieces: "not-an-array" }));
    expect(result.ok).toBe(false);
  });

  it("attributeが許可値以外なら拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).attribute = "架空属性";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("evolutionTypeが許可値以外なら拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).evolutionType = "架空形態";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("checkedAtが日付として不正なら拒否する", () => {
    const result = validateAiResponseSchema(validPayload({ checkedAt: "不正な日付" }));
    expect(result.ok).toBe(false);
  });

  it("javascript:等の危険なURLを拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).sourceUrls = [{ url: "javascript:alert(1)", title: null }];
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("data:スキームのURLも拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).sourceUrls = [{ url: "data:text/html,<script>alert(1)</script>", title: null }];
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("異常に長い文字列を拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).fullName = "あ".repeat(10_000);
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("HTMLタグを含む文字列を拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).fullName = "<script>alert(1)</script>";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("スキル内のHTMLタグも拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as { skill: Record<string, unknown> }).skill.effect = "<img src=x onerror=alert(1)>";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("同じpieceIdが重複している場合は拒否する", () => {
    const payload = validPayload();
    (payload.pieces as unknown[]).push({ ...payload.pieces[0] });
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain("重複");
  });

  it("pieceIdが存在しない(空文字)場合は拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).pieceId = "";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("versionが省略されていても正常に検証できる", () => {
    const result = validateAiResponseSchema(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].version).toBeUndefined();
  });

  it("versionにバージョン表記の候補を指定できる", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).version = "季節限定";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].version).toBe("季節限定");
  });

  it("fullNameが登録名と完全一致しなくても拒否しない（名称の完全一致は要求しない）", () => {
    const payload = validPayload({});
    (payload.pieces[0] as Record<string, unknown>).fullName = "検索に使った適当な仮称";
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(true);
  });

  it("HP条件による分岐等、50文字を超えるskill.valueも許容する（実在のスキルで発生する）", () => {
    const payload = validPayload();
    const longValue =
      "HP85％以上：毎ターン1800雷撃。HP85％未満～35％以上：毎ターン1100雷撃＋1000回復。HP35％未満：毎ターン1400雷撃＋通常・特殊ダメージを80％に軽減。";
    (payload.pieces[0] as { skill: Record<string, unknown> }).skill.value = longValue;
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].skill?.value).toBe(longValue);
  });

  it("skill.valueが異常に長い(300文字超)場合は拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as { skill: Record<string, unknown> }).skill.value = "あ".repeat(301);
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("sourceUrls.urlがMarkdownリンク形式([url](url))でもリンク先を抽出して受理する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).sourceUrls = [
      { url: "[https://game8.jp/othellonia/312281](https://game8.jp/othellonia/312281)", title: "評価記事" },
    ];
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].sourceUrls?.[0].url).toBe("https://game8.jp/othellonia/312281");
  });

  it("Markdownリンクの括弧内がjavascript:等の危険なスキームなら拒否する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).sourceUrls = [
      { url: "[クリック](javascript:alert(1))", title: null },
    ];
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(false);
  });

  it("fullNameがnull(正式名称を特定できなかった)場合も受理する", () => {
    const payload = validPayload();
    (payload.pieces[0] as Record<string, unknown>).fullName = null;
    const result = validateAiResponseSchema(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].fullName).toBeNull();
  });
});
