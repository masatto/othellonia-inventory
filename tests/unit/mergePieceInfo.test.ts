import { describe, expect, it } from "vitest";
import { getMissingFields, isInfoMissing, mergePieceInfo, mergeProvisionalPieceInfo } from "../../src/enrichment/mergePieceInfo";
import type { LocalPieceMetadata, LocalPieceRecord, PieceMaster } from "../../src/domain/types";

const master: PieceMaster = {
  pieceId: "sd001",
  fullName: "［架空の異名］テストピース",
  baseName: "テストピース",
  epithet: "架空の異名",
  attribute: "不明",
  rarity: "不明",
  evolutionType: "不明",
  skillName: null,
  skillData: [],
  comboSkillName: null,
  comboSkillData: [],
  sourceUrl: null,
  sourceUpdatedAt: null,
  featureDataVersion: 1,
  masterVersion: "seed-1",
};

describe("mergePieceInfo", () => {
  it("補完データが無い場合はマスターの初期値を使い、不明はnullになる", () => {
    const merged = mergePieceInfo(master, undefined);
    expect(merged.attribute).toBeNull();
    expect(merged.rarity).toBeNull();
    expect(merged.evolutionType).toBeNull();
    expect(merged.skill).toBeNull();
    expect(merged.comboSkillStatus).toBe("unknown");
    expect(merged.hasLocalMetadata).toBe(false);
  });

  it("補完データがある場合は補完データを優先する", () => {
    const local: LocalPieceMetadata = {
      schemaVersion: 1,
      pieceId: "sd001",
      fullName: master.fullName,
      version: null,
      attribute: "竜",
      rarity: "S+",
      evolutionType: "進化",
      hp: null,
      attack: null,
      skill: { name: null, type: "攻撃力アップ", condition: "常時", effect: "基本ATK上昇", value: "1.5倍" },
      comboSkillStatus: "none",
      comboSkill: null,
      sourceUrls: [{ url: "https://example.com/piece", title: "テスト出典" }],
      checkedAt: "2026-09-14",
      importedAt: "2026-09-14T00:00:00.000Z",
      verificationStatus: "user_confirmed",
    };
    const merged = mergePieceInfo(master, local);
    expect(merged.attribute).toBe("竜");
    expect(merged.rarity).toBe("S+");
    expect(merged.evolutionType).toBe("進化");
    expect(merged.skill?.value).toBe("1.5倍");
    expect(merged.comboSkillStatus).toBe("none");
    expect(merged.hasLocalMetadata).toBe(true);
  });

  it("マスターに値がある場合はそれを使う（補完データが無い時）", () => {
    const masterWithData: PieceMaster = {
      ...master,
      attribute: "神",
      rarity: "S",
      evolutionType: "闘化",
      comboSkillName: "コンボ効果",
    };
    const merged = mergePieceInfo(masterWithData, undefined);
    expect(merged.attribute).toBe("神");
    expect(merged.rarity).toBe("S");
    expect(merged.evolutionType).toBe("闘化");
    expect(merged.comboSkillStatus).toBe("exists");
    expect(merged.isUserRegistered).toBe(false);
  });
});

describe("mergeProvisionalPieceInfo", () => {
  const record: LocalPieceRecord = {
    pieceId: "local-abc123",
    provisionalName: "多分ジェンイーっぽい駒",
    nameStatus: "provisional",
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };

  it("補完データが無い場合、仮称を名称として使い情報はすべて不明になる", () => {
    const merged = mergeProvisionalPieceInfo(record, undefined);
    expect(merged.pieceId).toBe("local-abc123");
    expect(merged.fullName).toBe("多分ジェンイーっぽい駒");
    expect(merged.isUserRegistered).toBe(true);
    expect(merged.hasLocalMetadata).toBe(false);
    expect(isInfoMissing(merged)).toBe(true);
  });

  it("不明駒として保存した場合、プレースホルダー名称になる", () => {
    const unknownRecord: LocalPieceRecord = { ...record, provisionalName: null, nameStatus: "unknown" };
    const merged = mergeProvisionalPieceInfo(unknownRecord, undefined);
    expect(merged.fullName).toBe("（名称未確認の駒）");
  });

  it("AI調査で承認済みの補完データがある場合、それを優先する", () => {
    const local: LocalPieceMetadata = {
      schemaVersion: 1,
      pieceId: "local-abc123",
      fullName: "［王家の護持］ジェンイー",
      version: null,
      attribute: "竜",
      rarity: "S+",
      evolutionType: "進化",
      hp: null,
      attack: null,
      skill: null,
      comboSkillStatus: "unknown",
      comboSkill: null,
      sourceUrls: [],
      checkedAt: "2026-09-14",
      importedAt: "2026-09-14T00:00:00.000Z",
      verificationStatus: "user_confirmed",
    };
    const merged = mergeProvisionalPieceInfo(record, local);
    expect(merged.fullName).toBe("［王家の護持］ジェンイー");
    expect(merged.attribute).toBe("竜");
    expect(merged.hasLocalMetadata).toBe(true);
    expect(merged.isUserRegistered).toBe(true);
  });
});

describe("getMissingFields / isInfoMissing", () => {
  it("全項目が不明なら全フィールドが不足している", () => {
    const merged = mergePieceInfo(master, undefined);
    const missing = getMissingFields(merged);
    expect(missing).toEqual(["attribute", "rarity", "evolutionType", "skill", "comboSkill"]);
    expect(isInfoMissing(merged)).toBe(true);
  });

  it("コンボスキルが「存在しないことを確認済み(none)」なら不足とみなさない", () => {
    const local: LocalPieceMetadata = {
      schemaVersion: 1,
      pieceId: "sd001",
      fullName: master.fullName,
      version: null,
      attribute: "竜",
      rarity: "S+",
      evolutionType: "進化",
      hp: null,
      attack: null,
      skill: { name: null, type: "攻撃力アップ", condition: null, effect: null, value: null },
      comboSkillStatus: "none",
      comboSkill: null,
      sourceUrls: [],
      checkedAt: "2026-09-14",
      importedAt: "2026-09-14T00:00:00.000Z",
      verificationStatus: "user_confirmed",
    };
    const merged = mergePieceInfo(master, local);
    expect(getMissingFields(merged)).toEqual([]);
    expect(isInfoMissing(merged)).toBe(false);
  });

  it("コンボスキルがunknownのままなら不足として扱う", () => {
    const local: LocalPieceMetadata = {
      schemaVersion: 1,
      pieceId: "sd001",
      fullName: master.fullName,
      version: null,
      attribute: "竜",
      rarity: "S+",
      evolutionType: "進化",
      hp: null,
      attack: null,
      skill: { name: null, type: "攻撃力アップ", condition: null, effect: null, value: null },
      comboSkillStatus: "unknown",
      comboSkill: null,
      sourceUrls: [],
      checkedAt: "2026-09-14",
      importedAt: "2026-09-14T00:00:00.000Z",
      verificationStatus: "user_confirmed",
    };
    const merged = mergePieceInfo(master, local);
    expect(getMissingFields(merged)).toEqual(["comboSkill"]);
  });
});
