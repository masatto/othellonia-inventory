#!/usr/bin/env node
/**
 * 初期駒マスター・初期所持駒データを生成するシードスクリプト。
 *
 * このスクリプトはネットワークアクセスを一切行わない。
 * ユーザーが過去に目視確認した43種類＋過去申告4種類（画像未確認）の名称のみを
 * 既知データとして書き出す（仕様書21章）。属性・ランク・スキルなどの詳細事実は
 * このリポジトリ単体では確認できないため、確認できるまで "不明" として保持し、
 * 誤った事実を公開しないことを優先する。
 *
 * 攻略サイトから属性・ランク・スキル等の事実情報を取得して精緻化する場合は、
 * 別途 tools/master-builder/fetchFromSource.mjs （利用規約確認済みの環境でのみ実行）
 * を使う。画像そのものは取得・保存しない。
 *
 * 実行方法: node tools/master-builder/seedKnownPieces.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "public", "master");

/** [fullName, quantity, ownedStatus] */
const CONFIRMED_PIECES = [
  ["［霊猫の愛娘］ミャオ", 1],
  ["［天位議会刺客］エルシーア", 1],
  ["［魔を狩る者］ルキウス", 2],
  ["［生命と調和の神］ハルモニア", 1],
  ["［純真の女神］ココ", 2],
  ["［アイラブ武器］ヒルデブラント", 1],
  ["［邁進せし兎姫］ラニ", 1],
  ["［征魔の剣］ゼルエル", 1],
  ["［天使の降臨］アシュナリー", 1],
  ["［荒神］キムン・カムイ", 1],
  ["［戦闘狂］ラシュネー", 1],
  ["［魔道具コレクター］ジオ", 2],
  ["［大魔術師霊］サマンサ", 1],
  ["［大盗賊団首領］ズーイー", 1],
  ["［おひつじ座の皇子］シェラハ", 1],
  ["［終焉の響］マンドラゴラ", 1],
  ["［世界を問う者］ルシファー", 1],
  ["［魔虫の姫］エントマリー", 1],
  ["［地獄の王］サタン", 1],
  ["［呪いの音色］ヴィルニー", 1],
  ["［深遠の闇陽］タローマティ", 1],
  ["［妖刀の主］ヨシノ", 1],
  ["［死の癒し］アズリエル", 1],
  ["［破壊竜］アルイーナル", 1],
  ["［王家の護持］ジェンイー", 1],
  ["［奇跡の勇竜］グランティス", 1],
  ["［逆鱗一閃］ベルーガ", 1],
  ["［二重星の竜魔術士］デネヴ", 1],
  ["［希鋼竜］アムルガル", 1],
  ["プロキオン", 1],
  ["オオクニヌシ", 1],
  ["学園クローマ", 1],
  ["ロナジャスタ", 1],
  ["ヘパイストス", 1],
  ["学徒剣士・コギト", 1],
  ["ジークフリート", 1],
  ["ぬらりひょん", 1],
  ["マルバス", 1],
  ["モルモー", 1],
  ["ルービス", 1],
  ["牡丹", 1],
  ["アイリア", 1],
  ["フェリヤ", 1],
];

const DECLARED_ONLY_PIECES = ["天音", "遠夜", "ファビオ", "ハデス"];

const EPITHET_PATTERN = /^[［[](.+?)[］\]]\s*(.+)$/;

function parseName(rawName) {
  const fullName = rawName.trim();
  const match = fullName.match(EPITHET_PATTERN);
  if (match) {
    return { fullName, epithet: match[1].trim(), baseName: match[2].trim() };
  }
  return { fullName, epithet: null, baseName: fullName };
}

const MASTER_VERSION = "seed-2026.09.14";
const FEATURE_DATA_VERSION = 1;
const now = new Date().toISOString();

const masterPieces = [];
const ownedSeed = [];

let seq = 1;
function nextId() {
  return `sd${String(seq++).padStart(3, "0")}`;
}

for (const [rawName, quantity] of CONFIRMED_PIECES) {
  const { fullName, epithet, baseName } = parseName(rawName);
  const pieceId = nextId();
  masterPieces.push({
    pieceId,
    fullName,
    baseName,
    epithet,
    attribute: "不明",
    rarity: "不明",
    evolutionType: "不明",
    skillName: null,
    skillData: [],
    comboSkillName: null,
    comboSkillData: [],
    sourceUrl: null,
    sourceUpdatedAt: null,
    featureDataVersion: FEATURE_DATA_VERSION,
    masterVersion: MASTER_VERSION,
  });
  ownedSeed.push({
    pieceId,
    quantity,
    skillLevel: null,
    ownedStatus: "confirmed",
    recognitionConfidence: null,
    confirmedByUser: true,
    firstDetectedAt: now,
    lastDetectedAt: now,
    updatedAt: now,
    memo: "初期移行データ（過去のスクリーンショット目視確認に基づく）",
  });
}

for (const rawName of DECLARED_ONLY_PIECES) {
  const { fullName, epithet, baseName } = parseName(rawName);
  const pieceId = nextId();
  masterPieces.push({
    pieceId,
    fullName,
    baseName,
    epithet,
    attribute: "不明",
    rarity: "不明",
    evolutionType: "不明",
    skillName: null,
    skillData: [],
    comboSkillName: null,
    comboSkillData: [],
    sourceUrl: null,
    sourceUpdatedAt: null,
    featureDataVersion: FEATURE_DATA_VERSION,
    masterVersion: MASTER_VERSION,
  });
  ownedSeed.push({
    pieceId,
    quantity: 1,
    skillLevel: null,
    ownedStatus: "declared_only",
    recognitionConfidence: null,
    confirmedByUser: true,
    firstDetectedAt: now,
    lastDetectedAt: now,
    updatedAt: now,
    memo: "過去申告・画像未確認",
  });
}

mkdirSync(OUT_DIR, { recursive: true });

// 属性ごとに分割して配信する（仕様書10章「属性やランク単位で分割する」）。
// 現時点では事実確認ができておらず全件「不明」のため 1 ファイルになるが、
// tools/master-builder/fetchFromSource.mjs で属性が判明した駒から分割先が増える。
const byAttribute = new Map();
for (const piece of masterPieces) {
  const list = byAttribute.get(piece.attribute) ?? [];
  list.push(piece);
  byAttribute.set(piece.attribute, list);
}

const ATTRIBUTE_FILE_SLUG = { 神: "god", 魔: "demon", 竜: "dragon", 不明: "unknown" };

const files = [];
for (const [attribute, pieces] of byAttribute) {
  const slug = ATTRIBUTE_FILE_SLUG[attribute] ?? "unknown";
  const filename = `pieces-${slug}.json`;
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(pieces, null, 2) + "\n");
  files.push({ attribute, filename, count: pieces.length });
}

const manifest = {
  masterVersion: MASTER_VERSION,
  featureDataVersion: FEATURE_DATA_VERSION,
  generatedAt: now,
  totalPieces: masterPieces.length,
  files,
};
writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(OUT_DIR, "owned-seed.json"), JSON.stringify(ownedSeed, null, 2) + "\n");

console.log(`Wrote ${masterPieces.length} master pieces and ${ownedSeed.length} owned-seed records to ${OUT_DIR}`);
