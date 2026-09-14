/**
 * ChatGPTの回答からJSON部分だけを安全に取り出す。
 * ```json ... ``` のコードブロックがあれば最優先で使い、無ければ
 * 最初の "{" から対応する最後の "}" までを抽出する（前後の説明文は無視する）。
 */
export function extractJsonText(raw: string): string | null {
  const fencedJson = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) return fencedJson[1].trim();

  const fencedAny = raw.match(/```\s*([\s\S]*?)```/);
  if (fencedAny) {
    const candidate = fencedAny[1].trim();
    if (looksLikeJson(candidate)) return candidate;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

function looksLikeJson(text: string): boolean {
  return text.startsWith("{") || text.startsWith("[");
}

export interface ParsedJsonResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** 抽出したテキストをJSONとしてパースする。サイズ上限も検査する。 */
export function parseExtractedJson(raw: string, maxBytes = 300_000): ParsedJsonResult {
  const extracted = extractJsonText(raw);
  if (!extracted) {
    return { ok: false, error: "JSON部分が見つかりませんでした" };
  }
  const byteLength = new TextEncoder().encode(extracted).length;
  if (byteLength > maxBytes) {
    return { ok: false, error: `JSONサイズが上限(${maxBytes}バイト)を超えています` };
  }
  try {
    const data = JSON.parse(extracted);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `JSONの解析に失敗しました: ${e instanceof Error ? e.message : String(e)}` };
  }
}
