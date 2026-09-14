import type { LocalPieceMetadata, MergedPieceInfo, SkillDetail } from "../domain/types";
import type { AiPiece } from "./aiResponseSchema";
import { checkPieceIdentities, hasMostlyNullFields, hasNoSources, type IdentityCheckStatus } from "./pieceIdentityCheck";

export interface FieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export interface PieceDiff {
  pieceId: string;
  registeredFullName: string;
  aiFullName: string;
  identityStatus: IdentityCheckStatus;
  fields: FieldDiff[];
  hasAnyChange: boolean;
  /** 名称不一致・出典なし・大半null等、一括反映の対象から外すべき場合true */
  bulkEligible: boolean;
  reasonsExcludedFromBulk: string[];
  /** 保存時に使う元データ */
  aiPiece: AiPiece;
}

function skillLabel(skill: SkillDetail | null | undefined): string {
  if (!skill) return "不明";
  const parts = [skill.type, skill.condition, skill.effect, skill.value != null ? String(skill.value) : null].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" / ") : "不明";
}

function sourceLabel(urls: { url: string }[] | undefined): string {
  if (!urls || urls.length === 0) return "未登録";
  return urls.map((u) => u.url).join(", ");
}

function fieldDiff(field: string, label: string, before: string, after: string): FieldDiff {
  return { field, label, before, after, changed: before !== after };
}

/**
 * 1駒分の差分を計算する。保存前に必ずこの差分を提示し、
 * ユーザーが承認した駒だけを反映できるようにする。
 */
export function buildPieceDiff(
  existing: MergedPieceInfo,
  aiPiece: AiPiece,
  knownPieces: Map<string, string>,
): PieceDiff {
  const [checked] = checkPieceIdentities([aiPiece], knownPieces);
  const registeredFullName = checked.registeredFullName ?? existing.fullName;

  const fields: FieldDiff[] = [
    fieldDiff("attribute", "属性", existing.attribute ?? "不明", aiPiece.attribute ?? "不明"),
    fieldDiff("rarity", "ランク", existing.rarity ?? "不明", aiPiece.rarity ?? "不明"),
    fieldDiff("evolutionType", "形態", existing.evolutionType ?? "不明", aiPiece.evolutionType ?? "不明"),
    fieldDiff("skill", "スキル", skillLabel(existing.skill), skillLabel(aiPiece.skill)),
    fieldDiff("comboSkill", "コンボスキル", skillLabel(existing.comboSkill), skillLabel(aiPiece.comboSkill)),
    fieldDiff("sourceUrls", "参照元", sourceLabel(existing.sourceUrls), sourceLabel(aiPiece.sourceUrls)),
  ];

  const reasonsExcludedFromBulk: string[] = [];
  if (checked.status === "name_mismatch") reasonsExcludedFromBulk.push("名称が完全一致しません");
  if (checked.status === "unknown_piece_id") reasonsExcludedFromBulk.push("端末内に存在しないpieceIdです");
  if (hasNoSources(aiPiece)) reasonsExcludedFromBulk.push("参照元が存在しません");
  if (hasMostlyNullFields(aiPiece)) reasonsExcludedFromBulk.push("必須情報の大半がnullです");

  return {
    pieceId: aiPiece.pieceId,
    registeredFullName,
    aiFullName: aiPiece.fullName,
    identityStatus: checked.status,
    fields,
    hasAnyChange: fields.some((f) => f.changed),
    bulkEligible: reasonsExcludedFromBulk.length === 0,
    reasonsExcludedFromBulk,
    aiPiece,
  };
}

export function buildAllPieceDiffs(
  aiPieces: AiPiece[],
  existingByPieceId: Map<string, MergedPieceInfo>,
  knownPieces: Map<string, string>,
): PieceDiff[] {
  return aiPieces.map((p) => {
    const existing = existingByPieceId.get(p.pieceId);
    const fallback: MergedPieceInfo = existing ?? {
      pieceId: p.pieceId,
      fullName: knownPieces.get(p.pieceId) ?? p.fullName,
      attribute: null,
      rarity: null,
      evolutionType: null,
      skill: null,
      comboSkillStatus: "unknown",
      comboSkill: null,
      sourceUrls: [],
      checkedAt: null,
      verificationStatus: null,
      hasLocalMetadata: false,
    };
    return buildPieceDiff(fallback, p, knownPieces);
  });
}

/** 承認されたAI回答から、保存用のLocalPieceMetadataを構築する */
export function buildLocalMetadataFromAiPiece(aiPiece: AiPiece, checkedAt: string): LocalPieceMetadata {
  return {
    schemaVersion: 1,
    pieceId: aiPiece.pieceId,
    fullName: aiPiece.fullName,
    attribute: aiPiece.attribute,
    rarity: aiPiece.rarity,
    evolutionType: aiPiece.evolutionType,
    hp: aiPiece.hp ?? null,
    attack: aiPiece.attack ?? null,
    skill: aiPiece.skill ?? null,
    comboSkillStatus: aiPiece.comboSkillStatus ?? "unknown",
    comboSkill: aiPiece.comboSkill ?? null,
    sourceUrls: aiPiece.sourceUrls ?? [],
    checkedAt,
    importedAt: new Date().toISOString(),
    verificationStatus: "user_confirmed",
  };
}
