import { describe, expect, it } from "vitest";
import { extractJsonText, normalizeSmartQuotes, parseExtractedJson } from "../../src/enrichment/jsonExtraction";

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

  it("チャットUIのスマート引用符（“ ”）で構造上の\"が崩れていても解析できる", () => {
    // ChatGPT等からコピーした際に " が “ ” へ自動変換されるケースを再現する
    const raw = "```json\n{“pieceId”: “sd001”, “fullName”: “［架空］アルファ”}\n```";
    const result = parseExtractedJson(raw);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ pieceId: "sd001", fullName: "［架空］アルファ" });
  });

  it("スマート引用符に正規化しても解析できない場合は元のエラーを返す", () => {
    const result = parseExtractedJson("{a: 1,}");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("normalizeSmartQuotes", () => {
  it("スマートダブルクォートを直線的な\"へ変換する", () => {
    expect(normalizeSmartQuotes("“abc”")).toBe('"abc"');
    expect(normalizeSmartQuotes("„abc‟")).toBe('"abc"');
  });

  it("スマートシングルクォートを直線的な'へ変換する", () => {
    expect(normalizeSmartQuotes("‘abc’")).toBe("'abc'");
    expect(normalizeSmartQuotes("‚abc‛")).toBe("'abc'");
  });

  it("スマート引用符が無ければ変更しない", () => {
    expect(normalizeSmartQuotes('{"a": 1}')).toBe('{"a": 1}');
  });
});
