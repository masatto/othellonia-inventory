import { hammingDistance, histogramSimilarity } from "./imageHash";
import type { LearnedFeature } from "../domain/types";
import type { CellFeatures } from "./imageHash";

export interface ScoredCandidate {
  pieceId: string;
  score: number; // 0-1, 高いほど類似
}

/**
 * 端末内で確認済みの学習済み特徴量（他の駒の攻略サイト画像は一切使わない）と
 * 検出セルの特徴量を比較し、候補をスコア順に返す。
 */
export function rankCandidates(cell: CellFeatures, learned: LearnedFeature[]): ScoredCandidate[] {
  const scoresByPiece = new Map<string, number[]>();
  for (const feature of learned) {
    const pHashDist = hammingDistance(cell.pHash, feature.pHash);
    const dHashDist = hammingDistance(cell.dHash, feature.dHash);
    const aHashDist = hammingDistance(cell.aHash, feature.aHash);
    // ハッシュは64bit想定なので距離を0-1の類似度に変換する
    const hashSim = 1 - (pHashDist * 0.5 + dHashDist * 0.3 + aHashDist * 0.2) / 64;
    const colorSim = histogramSimilarity(cell.colorHistogram, feature.colorHistogram);
    const score = hashSim * 0.75 + colorSim * 0.25;
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
