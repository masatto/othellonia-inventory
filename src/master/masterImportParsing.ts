import { parseExtractedJson, type ParsedJsonResult } from "../enrichment/jsonExtraction";
import { MASTER_IMPORT_MAX_BYTES } from "./masterImportSchema";

const BOM = String.fromCharCode(0xfeff);

/**
 * ユーザーが選択したマスタJSONファイルのテキストを解析前に正規化する。
 * BOM除去 → (余分な空白・Markdownコードフェンス・スマート引用符の正規化は
 * 既存のjsonExtraction.tsのロジックを再利用する)。
 */
export function parseMasterImportJson(rawText: string, maxBytes: number = MASTER_IMPORT_MAX_BYTES): ParsedJsonResult {
  const withoutBom = rawText.startsWith(BOM) ? rawText.slice(BOM.length) : rawText;
  return parseExtractedJson(withoutBom, maxBytes);
}
