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

const SMART_QUOTE_PATTERN = /[“”„‟‘’‚‛]/g;
const SMART_QUOTE_MAP: Record<string, string> = {
  "“": '"', // “
  "”": '"', // ”
  "„": '"', // „
  "‟": '"', // ‟
  "‘": "'", // ‘
  "’": "'", // ’
  "‚": "'", // ‚
  "‛": "'", // ‛
};

/**
 * ChatGPT等のチャットUIからコピーすると、スマート引用符（丸みを帯びた引用符）に
 * 自動変換され、JSON構造上の"がすべて崩れることがある。パース失敗時のみ
 * 復元を試みるフォールバックとして使う。
 */
export function normalizeSmartQuotes(text: string): string {
  return text.replace(SMART_QUOTE_PATTERN, (ch) => SMART_QUOTE_MAP[ch] ?? ch);
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
  } catch (firstError) {
    // スマート引用符が原因の可能性があるため、正規化して再試行する
    const normalized = normalizeSmartQuotes(extracted);
    if (normalized !== extracted) {
      try {
        const data = JSON.parse(normalized);
        return { ok: true, data };
      } catch {
        // 正規化しても解析できない場合は元のエラーを返す
      }
    }
    return {
      ok: false,
      error: `JSONの解析に失敗しました: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
    };
  }
}
