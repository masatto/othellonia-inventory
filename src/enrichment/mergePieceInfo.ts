import type {
  ComboSkillStatus,
  EnrichmentAttribute,
  EnrichmentEvolutionType,
  LocalPieceMetadata,
  MergedPieceInfo,
  MissingField,
  PieceMaster,
  SkillDetail,
} from "../domain/types";

function normalizeAttribute(attribute: PieceMaster["attribute"]): EnrichmentAttribute | null {
  return attribute === "不明" ? null : attribute;
}

function normalizeEvolutionType(evolutionType: PieceMaster["evolutionType"]): EnrichmentEvolutionType | null {
  return evolutionType === "不明" ? null : evolutionType;
}

function normalizeRarity(rarity: PieceMaster["rarity"]): string | null {
  return rarity === "不明" ? null : rarity;
}

function masterSkillDetail(name: string | null, data: PieceMaster["skillData"]): SkillDetail | null {
  if (!name && data.length === 0) return null;
  const first = data[0];
  return {
    name: name ?? null,
    type: first?.skillType ?? null,
    condition: first?.condition ?? null,
    effect: first?.note ?? null,
    value: first?.multiplier ?? first?.turns ?? null,
  };
}

/**
 * 駒マスターの初期値と端末内補完データを統合する。
 * 優先順位: 端末内補完データ → 公開マスターの初期値 → 不明(null)
 * 公開マスター(public/master/*.json)そのものは書き換えない。
 */
export function mergePieceInfo(master: PieceMaster, local: LocalPieceMetadata | undefined): MergedPieceInfo {
  if (local) {
    return {
      pieceId: master.pieceId,
      fullName: master.fullName,
      attribute: local.attribute ?? normalizeAttribute(master.attribute),
      rarity: local.rarity ?? normalizeRarity(master.rarity),
      evolutionType: local.evolutionType ?? normalizeEvolutionType(master.evolutionType),
      skill: local.skill ?? masterSkillDetail(master.skillName, master.skillData),
      comboSkillStatus: local.comboSkillStatus,
      comboSkill: local.comboSkill ?? masterSkillDetail(master.comboSkillName, master.comboSkillData),
      sourceUrls: local.sourceUrls,
      checkedAt: local.checkedAt,
      verificationStatus: local.verificationStatus,
      hasLocalMetadata: true,
    };
  }

  const comboSkillStatus: ComboSkillStatus = master.comboSkillName ? "exists" : "unknown";
  return {
    pieceId: master.pieceId,
    fullName: master.fullName,
    attribute: normalizeAttribute(master.attribute),
    rarity: normalizeRarity(master.rarity),
    evolutionType: normalizeEvolutionType(master.evolutionType),
    skill: masterSkillDetail(master.skillName, master.skillData),
    comboSkillStatus,
    comboSkill: masterSkillDetail(master.comboSkillName, master.comboSkillData),
    sourceUrls: master.sourceUrl ? [{ url: master.sourceUrl, title: null }] : [],
    checkedAt: master.sourceUpdatedAt,
    verificationStatus: null,
    hasLocalMetadata: false,
  };
}

/** 不足している項目の一覧を返す（仕様書: いずれかが未登録なら「情報不足」） */
export function getMissingFields(info: MergedPieceInfo): MissingField[] {
  const missing: MissingField[] = [];
  if (!info.attribute) missing.push("attribute");
  if (!info.rarity) missing.push("rarity");
  if (!info.evolutionType) missing.push("evolutionType");
  if (!info.skill) missing.push("skill");
  // コンボスキルは「存在しないことを確認済み(none)」であれば不足とはみなさない
  if (info.comboSkillStatus === "unknown") missing.push("comboSkill");
  return missing;
}

export function isInfoMissing(info: MergedPieceInfo): boolean {
  return getMissingFields(info).length > 0;
}

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  attribute: "属性",
  rarity: "ランク",
  evolutionType: "形態",
  skill: "スキル",
  comboSkill: "コンボスキル",
};
