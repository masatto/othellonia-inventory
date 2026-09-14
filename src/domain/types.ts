/**
 * ドメイン型定義
 * 仕様書セクション12「データ保存」に対応する最小限のフィールドを定義する。
 */

export type Attribute = "神" | "魔" | "竜" | "不明";

export type Rarity =
  | "N"
  | "R"
  | "SR"
  | "S"
  | "S+"
  | "UR"
  | "LR"
  | "不明";

/** 進化・闘化などの形態 */
export type EvolutionType =
  | "初期"
  | "進化"
  | "闘化"
  | "神化"
  | "真化"
  | "覚醒"
  | "不明";

/** スキル効果を構造化して保持する（説明文の丸ごと転載を避けるため） */
export interface SkillEffect {
  skillType: string;
  condition: string | null;
  multiplier: number | null;
  turns: number | null;
  note?: string;
}

/**
 * 駒マスター1件。
 * 公開リポジトリ(Git/GitHub Pages)には含めず、ユーザーが端末へインポートした
 * JSONファイルの内容をIndexedDBへ保存したものを指す（詳細はsrc/master/を参照）。
 */
export interface PieceMaster {
  pieceId: string;
  fullName: string;
  baseName: string;
  epithet: string | null;
  attribute: Attribute;
  rarity: Rarity;
  evolutionType: EvolutionType;
  skillName: string | null;
  skillData: SkillEffect[];
  comboSkillName: string | null;
  comboSkillData: SkillEffect[];
  /** 出典ページ（攻略サイトの個別ページへのリンク。画像は直接埋め込まない） */
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  featureDataVersion: number;
  masterVersion: string;
}

export type OwnedStatus = "confirmed" | "needs_review" | "unknown" | "declared_only";

/** 所持駒レコード（IndexedDB: ownedPieces） */
export interface OwnedPiece {
  pieceId: string;
  quantity: number;
  skillLevel: number | null;
  ownedStatus: OwnedStatus;
  recognitionConfidence: number | null;
  confirmedByUser: boolean;
  firstDetectedAt: string;
  lastDetectedAt: string;
  updatedAt: string;
  memo: string;
}

/** 端末内で学習した確認済みアイコン特徴量（IndexedDB: learnedFeatures） */
export interface LearnedFeature {
  id: string;
  pieceId: string;
  pHash: string;
  dHash: string;
  aHash: string;
  colorHistogram: number[];
  createdAt: string;
  /** ユーザーが後で見返す/削除するための切り出しサムネイル（端末内のみ、任意） */
  thumbnailDataUrl?: string;
}

export interface DetectedCell {
  cellIndex: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pHash: string;
  dHash: string;
  aHash: string;
  colorHistogram: number[];
  thumbnailDataUrl: string;
  /** 下部ナビゲーション等で行の一部しか写っていないセル（識別に使えるほど写っていない） */
  partial: boolean;
}

/** 画面解像度ごとに端末内へ保存するグリッド調整値（仕様: 同じ画面サイズ用に保存） */
export interface GridCalibration {
  /** `${screenWidth}x${screenHeight}` 形式のキー */
  id: string;
  screenWidth: number;
  screenHeight: number;
  columns: number;
  /** 1行目セル中心のY座標（px） */
  gridTop: number;
  /** 行間隔（px） */
  rowPitch: number;
  /** 各列の中心X座標（px） */
  colCenters: number[];
  /** 正方形切り出しの一辺の長さ（px） */
  cellSize: number;
  /** 下部ナビゲーションの上端Y座標（px）。これ以降は認識対象から除外する */
  navBarTop: number;
  updatedAt: string;
}

export interface RecognitionCandidate {
  pieceId: string;
  score: number;
  source: "learned" | "unmatched";
}

export type ReviewStatus = "auto_confirmed" | "needs_review" | "unmatched" | "user_confirmed" | "excluded";

export interface RecognitionResult {
  cell: DetectedCell;
  candidates: RecognitionCandidate[];
  confidence: number;
  reviewStatus: ReviewStatus;
  /** スクロール重複によりこのセルは所持数へ計上しない場合 true */
  isOverlapDuplicate: boolean;
  assignedPieceId: string | null;
  quantity: number;
}

export interface ScanImageInfo {
  imageIndex: number;
  imageHash: string;
  width: number;
  height: number;
  capturedAt: string | null;
}

/** 認識履歴（IndexedDB: scanHistory） */
export interface ScanHistoryRecord {
  scanId: string;
  images: ScanImageInfo[];
  scannedAt: string;
  detectedCellCount: number;
  results: RecognitionResult[];
  overlapInformation: {
    totalOverlapCells: number;
  };
  reviewStatus: "pending" | "completed";
}

export interface AppMeta {
  key: string;
  value: string;
}

/** インポート済みマスタの`masterVersion`文字列を保存するmetaキー */
export const MASTER_DATA_VERSION_KEY = "masterDataVersion";
/** 現在有効なマスタの格納スロット("A"|"B")を保存するmetaキー（安全な差し替えに使用） */
export const ACTIVE_MASTER_SLOT_KEY = "activeMasterSlot";
/** インポート済みマスタの`generatedAt`文字列を保存するmetaキー */
export const MASTER_GENERATED_AT_KEY = "masterGeneratedAt";
/** インポート済みマスタの件数を保存するmetaキー */
export const MASTER_PIECE_COUNT_KEY = "masterPieceCount";
/** マスタをインポートした日時(ISO8601)を保存するmetaキー */
export const MASTER_IMPORTED_AT_KEY = "masterImportedAt";
/** インポート時に使用したマスタファイル自体のschemaVersionを保存するmetaキー */
export const MASTER_SCHEMA_VERSION_KEY = "masterSchemaVersionUsed";

/**
 * バックアップJSONのスキーマバージョン。
 * v2で端末内補完データ(localPieceMetadata)を追加、
 * v3でマスタ未登録駒の仮登録データ(localPieces)を追加、
 * v4でインポート済みマスタ(masterPieces)を「完全バックアップ」に任意で含められるようにした。
 */
export const APP_DATA_SCHEMA_VERSION = 4;

// ─────────────────────────────────────────────────────────────
// 駒情報補完（AI調査プロンプト生成・JSON取込）
// ─────────────────────────────────────────────────────────────

/** 補完データにおける属性（"不明"という文字列ではなくnullで未確認を表す） */
export type EnrichmentAttribute = "神" | "魔" | "竜";

/** 補完データにおける形態（"不明"という文字列ではなくnullで未確認を表す） */
export type EnrichmentEvolutionType = "初期" | "進化" | "闘化" | "神化" | "真化" | "覚醒";

/** コンボスキルの確認状態。「未登録」と「存在しないことを確認済み」を区別する */
export type ComboSkillStatus = "unknown" | "exists" | "none";

export type VerificationStatus = "user_confirmed" | "needs_review";

/** スキル効果を簡潔な事実情報として保持する（攻略記事の説明文をそのまま保存しない） */
export interface SkillDetail {
  name: string | null;
  type: string | null;
  condition: string | null;
  effect: string | null;
  value: string | number | null;
}

export interface SourceUrlEntry {
  url: string;
  title: string | null;
}

/**
 * 端末内で保持する駒情報補完データ（IndexedDB: localPieceMetadata）。
 * ユーザーが端末へインポートしたマスタ(IndexedDB: masterPiecesA/B)とは別の、
 * ユーザーがAI調査結果を取り込んで作る個人用データ。GitHubへは送信しない。
 */
export interface LocalPieceMetadata {
  schemaVersion: 1;
  pieceId: string;
  fullName: string;
  /** 季節限定・コラボ版等のバージョン表記（AI調査結果の候補。未確認ならnull） */
  version: string | null;

  attribute: EnrichmentAttribute | null;
  rarity: string | null;
  evolutionType: EnrichmentEvolutionType | null;

  hp: number | null;
  attack: number | null;

  skill: SkillDetail | null;

  comboSkillStatus: ComboSkillStatus;
  comboSkill: SkillDetail | null;

  sourceUrls: SourceUrlEntry[];

  checkedAt: string | null;
  importedAt: string;
  verificationStatus: VerificationStatus;
}

/** 不足判定の対象フィールド */
export type MissingField = "attribute" | "rarity" | "evolutionType" | "skill" | "comboSkill";

/**
 * 駒マスターの初期値と端末内補完データを統合した表示用ビュー。
 * 優先順位: 端末内補完データ → 公開マスターの初期値 → 不明(null)
 */
export interface MergedPieceInfo {
  pieceId: string;
  fullName: string;
  version: string | null;
  attribute: EnrichmentAttribute | null;
  rarity: string | null;
  evolutionType: EnrichmentEvolutionType | null;
  skill: SkillDetail | null;
  comboSkillStatus: ComboSkillStatus;
  comboSkill: SkillDetail | null;
  sourceUrls: SourceUrlEntry[];
  checkedAt: string | null;
  verificationStatus: VerificationStatus | null;
  /** 端末内補完データが存在するか（一度も調査していない場合false） */
  hasLocalMetadata: boolean;
  /** 公開マスターに存在しない、ユーザーが仮登録した駒かどうか */
  isUserRegistered: boolean;
}

// ─────────────────────────────────────────────────────────────
// マスタ未登録駒の仮登録（画像取込レビュー画面から新規登録）
// ─────────────────────────────────────────────────────────────

/**
 * "provisional"=ユーザーが仮の名称を入力した。
 * "unknown"=名称不明のまま保存した（廃止済みの経路。検索の手がかりが無くAI調査で
 * 特定できないため、現在のUIからは新規作成できない。過去に保存された既存データの
 * 読み込み・バックアップ復元との後方互換のためだけに型として残している）。
 */
export type LocalPieceNameStatus = "provisional" | "unknown";

/**
 * マスタに存在しない駒をユーザーが仮登録した記録（IndexedDB: localPieces）。
 * インポート済みマスタ(IndexedDB: masterPiecesA/B)とは別に、内部で発行した
 * 一意なpieceIdで管理する。駒の同一性は常にこのpieceIdで判定し、名称の一致では判定しない。
 */
export interface LocalPieceRecord {
  pieceId: string;
  /** ユーザーが検索の手がかりとして入力した仮の名称（過去の"unknown"データの場合のみnull） */
  provisionalName: string | null;
  nameStatus: LocalPieceNameStatus;
  createdAt: string;
  updatedAt: string;
}
