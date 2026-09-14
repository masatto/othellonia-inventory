import { hammingDistance, histogramSimilarity } from "./imageHash";
import type { LearnedFeature } from "../domain/types";
import type { CellFeatures } from "./imageHash";

export interface ScoredCandidate {
  pieceId: string;
  score: number; // 0-1, 高いほど類似
}

/** 2つの特徴量セット間の類似度(0-1、1が完全一致)。学習済みデータとの照合・
 * 同一スキャン内の他マスとの照合の両方で共通して使う。 */
export function cellSimilarity(a: CellFeatures, b: CellFeatures): number {
  const pHashDist = hammingDistance(a.pHash, b.pHash);
  const dHashDist = hammingDistance(a.dHash, b.dHash);
  const aHashDist = hammingDistance(a.aHash, b.aHash);
  // ハッシュは64bit想定なので距離を0-1の類似度に変換する
  const hashSim = 1 - (pHashDist * 0.5 + dHashDist * 0.3 + aHashDist * 0.2) / 64;
  const colorSim = histogramSimilarity(a.colorHistogram, b.colorHistogram);
  return hashSim * 0.75 + colorSim * 0.25;
}

/**
 * 端末内で確認済みの学習済み特徴量（他の駒の攻略サイト画像は一切使わない）と
 * 検出セルの特徴量を比較し、候補をスコア順に返す。
 */
export function rankCandidates(cell: CellFeatures, learned: LearnedFeature[]): ScoredCandidate[] {
  const scoresByPiece = new Map<string, number[]>();
  for (const feature of learned) {
    const score = cellSimilarity(cell, feature);
    const arr = scoresByPiece.get(feature.pieceId) ?? [];
    arr.push(score);
    scoresByPiece.set(feature.pieceId, arr);
  }

  const candidates: ScoredCandidate[] = [];
  for (const [pieceId, scores] of scoresByPiece) {
    // 同じ駒に複数の学習済みサンプルがある場合は最良スコアを採用する
    candidates.push({ pieceId, score: Math.max(...scores) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export interface ResolvedSiblingCell {
  cellIndex: number;
  pieceId: string;
  cell: CellFeatures;
}

export interface SiblingDuplicateMatch {
  pieceId: string;
  score: number;
  sourceCellIndex: number;
}

/**
 * 被り（同一スキャン内の重複）判定専用の類似度。学習済みデータとの照合に使う
 * cellSimilarity とは別の重み付けを使う。実機検証で、同じ駒アイコンでも
 * 「NEW」等の新規取得バッジが片方だけに乗っているとdHash/aHashが局所的な
 * 差分に敏感に反応し、類似度が想定より下がってしまうことが分かったため。
 * DCTの低周波成分だけを見るpHashと、画像全体の色分布を見る色ヒストグラムは
 * 隅の小さなバッジ程度では大きく変化しないため、この2つだけで判定する。
 */
function siblingSimilarity(a: CellFeatures, b: CellFeatures): number {
  const pHashDist = hammingDistance(a.pHash, b.pHash);
  const hashSim = 1 - pHashDist / 64;
  const colorSim = histogramSimilarity(a.colorHistogram, b.colorHistogram);
  return hashSim * 0.5 + colorSim * 0.5;
}

/** 同一スキャン内で確定済みの他マスと近い場合に「被り」候補として提案する閾値 */
export const SIBLING_DUPLICATE_MIN_SCORE = 0.85;

/**
 * 同一スクリーンショット内に同じ駒が複数写っている「被り」を検出する。
 * 学習済みデータベース（過去に確認・保存した駒）とは独立に、今回のスキャンで
 * 既に駒が確定した他のマスとだけ比較する。同じ駒であれば元画像がほぼ同一の
 * ため、名前を入力しなくても高い類似度で一致させられる。この提案はユーザーが
 * ボタンを押して初めて反映される（自動確定ではない）ため、閾値は学習済み
 * データとの自動確定判定より緩めに設定している。
 */
export function findSiblingDuplicate(
  cell: CellFeatures,
  resolvedSiblings: ResolvedSiblingCell[],
): SiblingDuplicateMatch | null {
  let best: SiblingDuplicateMatch | null = null;
  for (const sibling of resolvedSiblings) {
    const score = siblingSimilarity(cell, sibling.cell);
    if (score >= SIBLING_DUPLICATE_MIN_SCORE && (!best || score > best.score)) {
      best = { pieceId: sibling.pieceId, score, sourceCellIndex: sibling.cellIndex };
    }
  }
  return best;
}

export interface ConfidenceResult {
  confidence: number;
  reviewStatus: "auto_confirmed" | "needs_review" | "unmatched";
}

const AUTO_CONFIRM_MIN_SCORE = 0.93;
const AUTO_CONFIRM_MIN_GAP = 0.06;
const NEEDS_REVIEW_MIN_SCORE = 0.75;

/**
 * 1位スコアと2位との差から信頼度を判定する（仕様書10章7項）。
 * 「誤った駒の自動登録をしない」ことを最優先し、僅差の場合は要確認に回す。
 */
export function judgeConfidence(candidates: ScoredCandidate[]): ConfidenceResult {
  if (candidates.length === 0) {
    return { confidence: 0, reviewStatus: "unmatched" };
  }
  const top1 = candidates[0].score;
  const top2 = candidates[1]?.score ?? 0;
  const gap = top1 - top2;

  if (top1 < NEEDS_REVIEW_MIN_SCORE) {
    return { confidence: top1, reviewStatus: "unmatched" };
  }
  if (top1 >= AUTO_CONFIRM_MIN_SCORE && gap >= AUTO_CONFIRM_MIN_GAP) {
    return { confidence: top1, reviewStatus: "auto_confirmed" };
  }
  return { confidence: top1, reviewStatus: "needs_review" };
}
