import type { EnrichmentEvolutionType, LocalPieceMetadata, MergedPieceInfo, SkillDetail } from "../domain/types";
import { parsePieceName } from "../domain/nameParsing";
import type { AiPiece } from "./aiResponseSchema";
import { checkPieceIdentities, hasMostlyNullFields, hasNoSources, type IdentityCheckStatus } from "./pieceIdentityCheck";

export interface FieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

/**
 * 名称候補。駒の同一性はpieceIdで管理するため、名称の一致は要求しない。
 * 現在の名称（マスタの正式名称、または仮登録駒の検索用の仮称）と、
 * AI調査結果から得られた候補（正式名称・二つ名・バージョン・進化形態）を
 * 並べて表示し、採用するかどうかは必ずユーザーが個別に確認・選択する。
 */
export interface NameCandidate {
  /** 現在の名称（検索用の仮称の場合を含む） */
  currentFullName: string;
  proposedFullName: string;
  proposedEpithet: string | null;
  proposedBaseName: string;
  proposedVersion: string | null;
  proposedEvolutionType: EnrichmentEvolutionType | null;
  /** 現在の名称・バージョンと候補が異なるか */
  changed: boolean;
}

export interface PieceDiff {
  pieceId: string;
  registeredFullName: string;
  identityStatus: IdentityCheckStatus;
  nameCandidate: NameCandidate;
  fields: FieldDiff[];
  hasAnyChange: boolean;
  /** 出典なし・大半null等、一括反映の対象から外すべき場合true（名称の違いは含まない） */
  bulkEligible: boolean;
  reasonsExcludedFromBulk: string[];
  /** 名称候補の採用前に保持していたバージョン表記（未採用の場合に引き継ぐため） */
  existingVersion: string | null;
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
  const existingVersion = existing.version ?? null;

  const proposedVersion = aiPiece.version ?? null;
  const parsedProposed = parsePieceName(aiPiece.fullName);
  const nameCandidate: NameCandidate = {
    currentFullName: registeredFullName,
    proposedFullName: aiPiece.fullName,
    proposedEpithet: parsedProposed.epithet,
    proposedBaseName: parsedProposed.baseName,
    proposedVersion,
    proposedEvolutionType: aiPiece.evolutionType ?? null,
    changed: aiPiece.fullName !== registeredFullName || proposedVersion !== existingVersion,
  };

  const fields: FieldDiff[] = [
    fieldDiff("attribute", "属性", existing.attribute ?? "不明", aiPiece.attribute ?? "不明"),
    fieldDiff("rarity", "ランク", existing.rarity ?? "不明", aiPiece.rarity ?? "不明"),
    fieldDiff("evolutionType", "形態", existing.evolutionType ?? "不明", aiPiece.evolutionType ?? "不明"),
    fieldDiff("skill", "スキル", skillLabel(existing.skill), skillLabel(aiPiece.skill)),
    fieldDiff("comboSkill", "コンボスキル", skillLabel(existing.comboSkill), skillLabel(aiPiece.comboSkill)),
    fieldDiff("sourceUrls", "参照元", sourceLabel(existing.sourceUrls), sourceLabel(aiPiece.sourceUrls)),
  ];

  // 名称は完全一致を要求しない。同一性はpieceIdでのみ判定するため、
  // 名称の違いは一括反映の除外理由にしない（採用は個別のユーザー確認に委ねる）。
  const reasonsExcludedFromBulk: string[] = [];
  if (checked.status === "unknown_piece_id") reasonsExcludedFromBulk.push("端末内に存在しないpieceIdです");
  if (hasNoSources(aiPiece)) reasonsExcludedFromBulk.push("参照元が存在しません");
  if (hasMostlyNullFields(aiPiece)) reasonsExcludedFromBulk.push("必須情報の大半がnullです");

  return {
    pieceId: aiPiece.pieceId,
    registeredFullName,
    identityStatus: checked.status,
    nameCandidate,
    fields,
    hasAnyChange: fields.some((f) => f.changed) || nameCandidate.changed,
    bulkEligible: reasonsExcludedFromBulk.length === 0,
    reasonsExcludedFromBulk,
    existingVersion,
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
      version: null,
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
      isUserRegistered: false,
    };
    return buildPieceDiff(fallback, p, knownPieces);
  });
}

/**
 * 承認されたAI回答から、保存用のLocalPieceMetadataを構築する。
 * 正式名称・バージョンの採用(acceptName)は名称候補の確定であり、
 * 他のフィールドの承認とは別にユーザーが明示的に選んだ場合のみtrueになる。
 * falseの場合は現在の名称（検索用の仮称を含む）をそのまま引き継ぐ。
 */
export function buildLocalMetadataFromAiPiece(diff: PieceDiff, checkedAt: string, acceptName: boolean): LocalPieceMetadata {
  return {
    schemaVersion: 1,
    pieceId: diff.pieceId,
    fullName: acceptName ? diff.nameCandidate.proposedFullName : diff.registeredFullName,
    version: acceptName ? diff.nameCandidate.proposedVersion : diff.existingVersion,
    attribute: diff.aiPiece.attribute,
    rarity: diff.aiPiece.rarity,
    evolutionType: diff.aiPiece.evolutionType,
    hp: diff.aiPiece.hp ?? null,
    attack: diff.aiPiece.attack ?? null,
    skill: diff.aiPiece.skill ?? null,
    comboSkillStatus: diff.aiPiece.comboSkillStatus ?? "unknown",
    comboSkill: diff.aiPiece.comboSkill ?? null,
    sourceUrls: diff.aiPiece.sourceUrls ?? [],
    checkedAt,
    importedAt: new Date().toISOString(),
    verificationStatus: "user_confirmed",
  };
}
