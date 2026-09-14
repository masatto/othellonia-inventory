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

/** 駒マスター1件。GitHubリポジトリに公開してよい事実情報・特徴量のみを保持する。 */
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

export const MASTER_DATA_VERSION_KEY = "masterDataVersion";
export const APP_DATA_SCHEMA_VERSION = 1;
