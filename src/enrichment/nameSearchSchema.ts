import { z } from "zod";
import { NAME_MAX, dateStringSchema, safeString, sourceUrlSchema } from "./aiResponseSchema";

/**
 * 駒名候補検索(第1段階)のAI回答スキーマ。
 * 「ルシファー」等の曖昧な仮称・略称から、進化・闘化・季節版・コラボ版などの
 * 候補を1件に絞らず列挙してもらうためのもの。この段階では性能情報(スキール・
 * HP・攻撃力等)は扱わない。ユーザーが候補を1件選んでから、選んだ正式名称で
 * 改めて性能調査(第2段階・既存のaiResponseSchema)を行う。
 */

const safeStringNullable = (max: number) => safeString(max).nullable();

export const nameCandidateSchema = z.object({
  // 二つ名を含む正式名称。候補を区別する主キーとして必須
  fullName: safeString(NAME_MAX, 1),
  // 季節限定・コラボ版等のバージョン表記（判別できない場合はnull）
  version: safeStringNullable(50).optional(),
  // 属性・ランク・進化形態は候補を区別するための参考情報。この段階では確定させない
  attribute: z.enum(["神", "魔", "竜"]).nullable().optional(),
  rarity: safeStringNullable(20).optional(),
  evolutionType: z.enum(["初期", "進化", "闘化", "神化", "真化", "覚醒"]).nullable().optional(),
  sourceUrls: z.array(sourceUrlSchema).max(10).optional(),
});

export const matchStatusSchema = z.enum(["exact", "ambiguous", "not_found"]);

export const nameSearchPieceSchema = z.object({
  // アプリが送った値をそのまま返すことを期待するが、検証自体はしない
  // （呼び出し側が常に自身のpieceId一覧を基準に結果を突き合わせるため、
  //  AIが誤って書き換えても駒の同一性には影響しない）
  pieceId: safeString(100, 1),
  inputName: safeStringNullable(NAME_MAX).optional(),
  matchStatus: matchStatusSchema,
  candidates: z.array(nameCandidateSchema).max(30).optional(),
});

export const nameSearchResponseSchema = z.object({
  schemaVersion: z.literal(1),
  game: z.literal("逆転オセロニア"),
  checkedAt: dateStringSchema,
  pieces: z.array(nameSearchPieceSchema).min(1, "piecesが空です").max(50, "piecesが多すぎます"),
});

export type NameCandidate = z.infer<typeof nameCandidateSchema>;
export type MatchStatus = z.infer<typeof matchStatusSchema>;
export type NameSearchPiece = z.infer<typeof nameSearchPieceSchema>;
export type NameSearchResponse = z.infer<typeof nameSearchResponseSchema>;

export type NameSearchValidationResult =
  | { ok: true; errors: []; data: NameSearchResponse }
  | { ok: false; errors: string[]; data?: undefined };

export function validateNameSearchResponse(data: unknown): NameSearchValidationResult {
  const result = nameSearchResponseSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, errors: [], data: result.data };
}
