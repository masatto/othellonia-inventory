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
  version: safeString(50).nullable().optional().transform((v) => v ?? null),
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

/**
 * バックアップ復元時にマスタ未登録駒の仮登録データ(LocalPieceRecord)を検証する
 * スキーマ。学習済み特徴量(learnedFeatures)自体はバックアップに含めないため、
 * ここではID・仮称・状態のみを検証する。
 */
export const localPieceRecordSchema = z.object({
  pieceId: safeString(100, 1),
  provisionalName: safeString(200).nullable(),
  nameStatus: z.enum(["provisional", "unknown"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ValidatedLocalPieceRecord = z.infer<typeof localPieceRecordSchema>;
