import { z } from "zod";

/**
 * AIが返すJSONの厳格なスキーマ定義。
 * HTML/スクリプトの混入や異常に長い文字列、危険なURLスキームを拒否する。
 */

const SAFE_STRING_MAX = 300;
const NAME_MAX = 200;

export const noHtml = (value: string) => !/<[^>]*>/.test(value);

export const safeString = (max: number, min = 0) =>
  z
    .string()
    .min(min, min > 0 ? "文字列が空です" : undefined)
    .max(max, `文字列が長すぎます（上限${max}文字）`)
    .refine(noHtml, "HTMLタグを含む文字列は許可されません");

const safeStringNullable = (max: number) => safeString(max).nullable();

export const skillDetailSchema = z
  .object({
    name: safeStringNullable(NAME_MAX),
    type: safeStringNullable(50),
    condition: safeStringNullable(SAFE_STRING_MAX),
    effect: safeStringNullable(SAFE_STRING_MAX),
    // HP条件による分岐等、実際のスキルには単純な倍率表記に収まらないものがあるため
    // condition/effectと同じ上限にする（長文の攻略記事をそのまま転記させる意図ではない）
    value: z.union([safeString(SAFE_STRING_MAX), z.number().finite(), z.null()]),
  })
  .nullable();

/**
 * ChatGPTの回答がプレーンなURLではなく "[url](url)" 形式のMarkdownリンクとして
 * 返ってくることがある。その場合はリンク先(括弧内)を実際のURLとして扱う
 * （表示テキスト部分の内容に関わらず、括弧内がhttp/httpsであることを検証する）。
 */
function extractMarkdownLinkUrl(value: string): string {
  const match = value.match(/^\[([^[\]]*)\]\(([^()]+)\)$/);
  if (match && /^https?:\/\//i.test(match[2])) {
    return match[2];
  }
  return value;
}

export const sourceUrlSchema = z.object({
  url: z.preprocess(
    (v) => (typeof v === "string" ? extractMarkdownLinkUrl(v) : v),
    z
      .string()
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "URLはhttp/httpsのみ許可されます")
      .refine(noHtml, "HTMLタグを含む文字列は許可されません"),
  ),
  title: safeStringNullable(NAME_MAX),
});

const dateStringSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "checkedAtは有効な日付ではありません");

export const aiPieceSchema = z.object({
  pieceId: safeString(100, 1),
  // 検索に使った名称と異なる正式名称が判明した場合はこちらに正しい名称を返す
  // （完全一致は要求しない。ユーザーが差分画面で確認し、承認した場合のみ反映される）。
  // 仮登録駒等で正式名称を特定できなかった場合はnullを許容する（現在の名称を維持する）
  fullName: safeString(NAME_MAX, 1).nullable(),
  // 季節限定・コラボ版等のバージョン表記の候補（判別できない場合はnull）
  version: safeStringNullable(50).optional(),
  attribute: z.enum(["神", "魔", "竜"]).nullable(),
  rarity: safeStringNullable(20),
  evolutionType: z.enum(["初期", "進化", "闘化", "神化", "真化", "覚醒"]).nullable(),
  hp: z.number().finite().min(0).max(999_999).nullable().optional(),
  attack: z.number().finite().min(0).max(999_999).nullable().optional(),
  skill: skillDetailSchema.optional(),
  comboSkillStatus: z.enum(["unknown", "exists", "none"]).optional(),
  comboSkill: skillDetailSchema.optional(),
  sourceUrls: z.array(sourceUrlSchema).max(10).optional(),
});

export const aiResponseSchema = z.object({
  schemaVersion: z.literal(1),
  game: z.literal("逆転オセロニア"),
  checkedAt: dateStringSchema,
  pieces: z.array(aiPieceSchema).min(1, "piecesが空です").max(50, "piecesが多すぎます"),
});

export type AiPiece = z.infer<typeof aiPieceSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;

export type SchemaValidationResult = { ok: true; errors: []; data: AiResponse } | { ok: false; errors: string[]; data?: undefined };

/** Zodスキーマによる構造検証（重複pieceIdの検査も含む） */
export function validateAiResponseSchema(data: unknown): SchemaValidationResult {
  const result = aiResponseSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const piece of result.data.pieces) {
    if (seen.has(piece.pieceId)) duplicates.add(piece.pieceId);
    seen.add(piece.pieceId);
  }
  if (duplicates.size > 0) {
    return { ok: false, errors: [`pieceIdが重複しています: ${[...duplicates].join(", ")}`] };
  }

  return { ok: true, errors: [], data: result.data };
}
