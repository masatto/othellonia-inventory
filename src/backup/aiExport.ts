import type { MergedPieceInfo, OwnedPiece } from "../domain/types";
import { getMissingFields } from "../enrichment/mergePieceInfo";

export type ConsultGoal =
  | "手持ちでデッキを組みたい"
  | "神単を改善したい"
  | "魔デッキを改善したい"
  | "速竜を組みたい"
  | "育成優先順位を知りたい"
  | "交換すべき駒を知りたい"
  | "ガチャを引くべきか相談したい"
  | "特定イベント用デッキを組みたい"
  | "新しく入手した駒を評価してほしい"
  | "自由入力";

export interface ConsultRequest {
  goal: ConsultGoal;
  freeText: string;
  /** 相談対象に絞り込む所持駒（未指定なら過去申告のみを除く全件） */
  targetPieceIds: string[] | null;
}

export interface ConsultEntry {
  pieceId: string;
  fullName: string;
  attribute: string;
  evolutionType: string;
  rarity: string;
  quantity: number;
  skillLevel: number | null;
  skillSummary: string | null;
  comboSkillSummary: string | null;
  checkedAt: string | null;
  ownedStatus: string;
  /** 属性・形態・スキル等が未補完の場合true */
  isIncomplete: boolean;
  memo: string;
}

function summarizeSkillDetail(skill: MergedPieceInfo["skill"]): string | null {
  if (!skill) return null;
  const parts = [skill.type, skill.condition, skill.effect, skill.value != null ? String(skill.value) : null].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" / ") : skill.name;
}

/**
 * 過去申告のみ(declared_only)の駒は、確認済みの所持駒と混同しないよう
 * AI相談の初期選択から除外する（仕様書）。targetPieceIdsを明示した場合はそちらを優先する。
 */
export function buildConsultEntries(
  owned: OwnedPiece[],
  mergedInfoById: Map<string, MergedPieceInfo>,
  targetPieceIds: string[] | null,
): ConsultEntry[] {
  const filtered = targetPieceIds
    ? owned.filter((o) => targetPieceIds.includes(o.pieceId))
    : owned.filter((o) => o.ownedStatus !== "unknown" && o.ownedStatus !== "declared_only");

  const entries: ConsultEntry[] = [];
  for (const o of filtered) {
    const info = mergedInfoById.get(o.pieceId);
    if (!info) continue;
    entries.push({
      pieceId: o.pieceId,
      fullName: info.fullName,
      attribute: info.attribute ?? "不明",
      evolutionType: info.evolutionType ?? "不明",
      rarity: info.rarity ?? "不明",
      quantity: o.quantity,
      skillLevel: o.skillLevel,
      skillSummary: summarizeSkillDetail(info.skill),
      comboSkillSummary: info.comboSkillStatus === "none" ? "なし" : summarizeSkillDetail(info.comboSkill),
      checkedAt: info.checkedAt,
      ownedStatus: o.ownedStatus,
      isIncomplete: getMissingFields(info).length > 0,
      memo: o.memo,
    });
  }
  return entries;
}

export interface ConsultDocument {
  goal: string;
  freeText: string;
  generatedAt: string;
  pieceCount: number;
  entries: ConsultEntry[];
}

export function buildConsultDocument(request: ConsultRequest, entries: ConsultEntry[]): ConsultDocument {
  return {
    goal: request.goal,
    freeText: request.freeText,
    generatedAt: new Date().toISOString(),
    pieceCount: entries.length,
    entries,
  };
}

export function consultDocumentToJson(doc: ConsultDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function consultDocumentToMarkdown(doc: ConsultDocument): string {
  const lines: string[] = [];
  lines.push("# オセロニア相談データ");
  lines.push("");
  lines.push(`更新日時: ${doc.generatedAt}`);
  lines.push(`相談目的: ${doc.goal}${doc.freeText ? " / " + doc.freeText : ""}`);
  lines.push("");
  lines.push("## 所持駒");
  lines.push("");
  for (const e of doc.entries) {
    lines.push(`- pieceId: ${e.pieceId}`);
    lines.push(`  名称: ${e.fullName}`);
    lines.push(`  属性: ${e.attribute}`);
    lines.push(`  ランク: ${e.rarity}`);
    lines.push(`  形態: ${e.evolutionType}`);
    lines.push(`  所持数: ${e.quantity}`);
    lines.push(`  スキルレベル: ${e.skillLevel ?? "不明"}`);
    if (e.skillSummary) lines.push(`  スキル概要: ${e.skillSummary}`);
    if (e.comboSkillSummary) lines.push(`  コンボスキル概要: ${e.comboSkillSummary}`);
    lines.push(`  情報確認日: ${e.checkedAt ?? "未確認"}`);
    lines.push(`  確認状態: ${e.ownedStatus}`);
    if (e.isIncomplete) lines.push(`  属性・形態・スキル情報は未補完`);
    if (e.memo) lines.push(`  メモ: ${e.memo}`);
    lines.push("");
  }
  return lines.join("\n");
}
