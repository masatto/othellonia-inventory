#!/usr/bin/env node
/**
 * 個人用マスタJSON（アプリの「設定」画面からインポートできる形式）を
 * 生成するサンプルスクリプト。
 *
 * このスクリプトはネットワークアクセスを一切行わない。
 * ユーザーが過去に目視確認した43種類＋過去申告4種類（画像未確認）の名称のみを
 * 既知データとして書き出す。属性・ランク・スキルなどの詳細事実はこのリポジトリ
 * 単体では確認できないため、確認できるまで "不明" として保持し、誤った事実を
 * 出力しないことを優先する。
 *
 * 出力先は public/ 配下ではなく、このディレクトリ内のGit管理外フォルダ
 * (tools/master-builder/output/) にする。生成したファイルはリポジトリへ
 * コミットせず、アプリの「設定」画面からユーザー自身の端末へインポートして使う
 * （マスタデータを公開リポジトリ・GitHub Pagesへ含めない方針のため）。
 *
 * 実行方法: node tools/master-builder/seedKnownPieces.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "output");

/** [fullName, quantity] （quantityは参考情報。所持駒として使う場合はバックアップ画面から別途登録する） */
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

const MASTER_VERSION = `personal-${new Date().toISOString().slice(0, 10)}`;
const FEATURE_DATA_VERSION = 1;
const now = new Date().toISOString();

const pieces = [];
let seq = 1;
function nextId() {
  return `sd${String(seq++).padStart(3, "0")}`;
}

for (const [rawName] of [...CONFIRMED_PIECES, ...DECLARED_ONLY_PIECES.map((n) => [n])]) {
  const { fullName, epithet, baseName } = parseName(rawName);
  pieces.push({
    pieceId: nextId(),
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
}

const masterFile = {
  schemaVersion: 1,
  game: "逆転オセロニア",
  masterVersion: MASTER_VERSION,
  generatedAt: now,
  pieces,
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "master-known-pieces.json");
writeFileSync(outPath, JSON.stringify(masterFile, null, 2) + "\n");

console.log(`Wrote ${pieces.length} pieces to ${outPath}`);
console.log("このファイルはコミットせず、アプリの「設定」画面からインポートしてください。");
