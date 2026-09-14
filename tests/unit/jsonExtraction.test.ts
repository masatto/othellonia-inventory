import { describe, expect, it } from "vitest";
import { extractJsonText, parseExtractedJson } from "../../src/enrichment/jsonExtraction";

describe("extractJsonText", () => {
  it("```json コードブロックからJSONを抽出する", () => {
    const raw = 'ご確認ください。\n```json\n{"a": 1}\n```\nよろしくお願いします。';
    expect(extractJsonText(raw)).toBe('{"a": 1}');
  });

  it("素の```コードブロックでもJSONらしければ抽出する", () => {
    const raw = '```\n{"a": 1}\n```';
    expect(extractJsonText(raw)).toBe('{"a": 1}');
  });

  it("コードブロックが無い場合は最初の{から最後の}までを抽出する", () => {
    const raw = '説明文です。{"a": 1} 以上です。';
    expect(extractJsonText(raw)).toBe('{"a": 1}');
  });

  it("JSONが全く見つからない場合はnullを返す", () => {
    expect(extractJsonText("JSONはありません")).toBeNull();
  });

  it("コードブロック外の文章は無視される", () => {
    const raw = "これは重要な情報です{直接は使えないもの}\n```json\n{\"a\": 2}\n```\nおまけの文章{さらに}";
    expect(extractJsonText(raw)).toBe('{"a": 2}');
  });
});

describe("parseExtractedJson", () => {
  it("正常なJSONをパースする", () => {
    const result = parseExtractedJson('```json\n{"a": 1}\n```');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ a: 1 });
  });

  it("不正なJSONはエラーになる", () => {
    const result = parseExtractedJson("{a: 1,}");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("サイズ上限を超えるJSONは拒否する", () => {
    const huge = `{"a": "${"x".repeat(400_000)}"}`;
    const result = parseExtractedJson(huge, 300_000);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("サイズ");
  });
});
