import { z } from "zod";
import { safeString, skillDetailSchema, sourceUrlSchema } from "./aiResponseSchema";

/**
 * バックアップ復元時に端末内補完データ(LocalPieceMetadata)を検証するスキーマ。
 * AIから直接受け取るデータではないが、不正なバックアップファイルによる
 * データ破壊・スクリプト混入を防ぐため、同様に厳格に検証する。
 */
export const localPieceMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  pieceId: safeString(100, 1),
  fullName: safeString(200, 1),
  attribute: z.enum(["神", "魔", "竜"]).nullable(),
  rarity: safeString(20).nullable(),
  evolutionType: z.enum(["初期", "進化", "闘化", "神化", "真化", "覚醒"]).nullable(),
  hp: z.number().finite().min(0).max(999_999).nullable(),
  attack: z.number().finite().min(0).max(999_999).nullable(),
  skill: skillDetailSchema,
  comboSkillStatus: z.enum(["unknown", "exists", "none"]),
  comboSkill: skillDetailSchema,
  sourceUrls: z.array(sourceUrlSchema).max(10),
  checkedAt: z.string().nullable(),
  importedAt: z.string(),
  verificationStatus: z.enum(["user_confirmed", "needs_review"]),
});

export type ValidatedLocalPieceMetadata = z.infer<typeof localPieceMetadataSchema>;
