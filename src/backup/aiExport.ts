import type { OwnedPiece, PieceMaster } from "../domain/types";

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
  /** 相談対象に絞り込む所持駒（未指定なら全件） */
  targetPieceIds: string[] | null;
}

export interface ConsultEntry {
  pieceId: string;
  fullName: string;
  epithet: string | null;
  attribute: string;
  evolutionType: string;
  rarity: string;
  quantity: number;
  skillLevel: number | null;
  skillSummary: string | null;
  comboSkillSummary: string | null;
  memo: string;
}

function summarizeSkill(name: string | null): string | null {
  return name;
}

export function buildConsultEntries(
  owned: OwnedPiece[],
  masterById: Map<string, PieceMaster>,
  targetPieceIds: string[] | null,
): ConsultEntry[] {
  const filtered = targetPieceIds
    ? owned.filter((o) => targetPieceIds.includes(o.pieceId))
    : owned.filter((o) => o.ownedStatus !== "unknown");

  const entries: ConsultEntry[] = [];
  for (const o of filtered) {
    const master = masterById.get(o.pieceId);
    if (!master) continue;
    entries.push({
      pieceId: o.pieceId,
      fullName: master.fullName,
      epithet: master.epithet,
      attribute: master.attribute,
      evolutionType: master.evolutionType,
      rarity: master.rarity,
      quantity: o.quantity,
      skillLevel: o.skillLevel,
      skillSummary: summarizeSkill(master.skillName),
      comboSkillSummary: summarizeSkill(master.comboSkillName),
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
    if (e.memo) lines.push(`  メモ: ${e.memo}`);
    lines.push("");
  }
  return lines.join("\n");
}
