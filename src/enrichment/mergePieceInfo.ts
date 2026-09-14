import type {
  ComboSkillStatus,
  EnrichmentAttribute,
  EnrichmentEvolutionType,
  LocalPieceMetadata,
  LocalPieceRecord,
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
 * 優先順位: 端末内補完データ → インポート済みマスタの初期値 → 不明(null)
 * インポート済みマスタ(IndexedDB: masterPiecesA/B)そのものは書き換えない。
 */
export function mergePieceInfo(master: PieceMaster, local: LocalPieceMetadata | undefined): MergedPieceInfo {
  if (local) {
    return {
      pieceId: master.pieceId,
      // 正式名称の確定はユーザー確認後にのみ行われるため、ここではローカルの
      // 保存値をそのまま採用してよい（未確認のAI候補は別途diff表示で扱う）
      fullName: local.fullName,
      version: local.version,
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
      isUserRegistered: false,
    };
  }

  const comboSkillStatus: ComboSkillStatus = master.comboSkillName ? "exists" : "unknown";
  return {
    pieceId: master.pieceId,
    fullName: master.fullName,
    version: null,
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
    isUserRegistered: false,
  };
}

/**
 * マスタ未登録の仮登録駒(LocalPieceRecord)の表示用ビューを組み立てる。
 * 駒の同一性はpieceId(record.pieceId)で管理し、名称は検索用の仮称として扱う。
 */
export function mergeProvisionalPieceInfo(
  record: LocalPieceRecord,
  local: LocalPieceMetadata | undefined,
): MergedPieceInfo {
  const provisionalFullName = record.provisionalName ?? "（名称未確認の駒）";
  if (local) {
    return {
      pieceId: record.pieceId,
      fullName: local.fullName,
      version: local.version,
      attribute: local.attribute,
      rarity: local.rarity,
      evolutionType: local.evolutionType,
      skill: local.skill,
      comboSkillStatus: local.comboSkillStatus,
      comboSkill: local.comboSkill,
      sourceUrls: local.sourceUrls,
      checkedAt: local.checkedAt,
      verificationStatus: local.verificationStatus,
      hasLocalMetadata: true,
      isUserRegistered: true,
    };
  }
  return {
    pieceId: record.pieceId,
    fullName: provisionalFullName,
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
    isUserRegistered: true,
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
