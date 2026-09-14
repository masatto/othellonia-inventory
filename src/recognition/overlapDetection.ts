import { hammingDistance } from "./imageHash";

/**
 * スクロール重複判定（仕様書11章）。
 *
 * 「同じ駒IDだから1体にまとめる」のではなく、以下を根拠に画像間の重複表示を判定する。
 *  - 前後の画像でセルの pHash がほぼ一致する
 *  - そのセルの画像内での相対位置（行）が、スクロール後にずれた位置として整合する
 *
 * 画像内で同一駒が複数セルに写っている場合は重複とみなさず、複数所持として扱う。
 */

export interface OverlapInputCell {
  imageIndex: number;
  row: number;
  col: number;
  pHash: string;
}

export interface OverlapResult {
  /** cellKey (`${imageIndex}:${row}:${col}`) -> 重複によりカウント対象外にするか */
  duplicateCellKeys: Set<string>;
}

const OVERLAP_HASH_DISTANCE_THRESHOLD = 6; // 64bit中の許容ハミング距離

export function cellKey(imageIndex: number, row: number, col: number): string {
  return `${imageIndex}:${row}:${col}`;
}

/**
 * 連続する画像ペアごとに、行位置がシフトした一致（スクロール重複）を検出する。
 * 同一画像内のセル同士は比較しない（＝複数所持は重複として扱わない）。
 */
export function detectScrollOverlap(cells: OverlapInputCell[]): OverlapResult {
  const duplicateCellKeys = new Set<string>();
  const imageIndices = [...new Set(cells.map((c) => c.imageIndex))].sort((a, b) => a - b);

  for (let i = 1; i < imageIndices.length; i++) {
    const prevImg = imageIndices[i - 1];
    const currImg = imageIndices[i];
    const prevCells = cells.filter((c) => c.imageIndex === prevImg);
    const currCells = cells.filter((c) => c.imageIndex === currImg);

    // 列ごとに前画像・現画像のセルをハッシュ比較し、一致するペアを探す。
    // 一致数が最大となる行シフト量を、その画像ペアのスクロール量とみなす。
    const maxRowShift = Math.max(...prevCells.map((c) => c.row), 0) + 1;
    let bestShift = 0;
    let bestMatches = 0;
    for (let shift = 0; shift <= maxRowShift; shift++) {
      let matches = 0;
      for (const curr of currCells) {
        const prevRow = curr.row + shift;
        const candidate = prevCells.find((p) => p.row === prevRow && p.col === curr.col);
        if (candidate && hammingDistance(candidate.pHash, curr.pHash) <= OVERLAP_HASH_DISTANCE_THRESHOLD) {
          matches++;
        }
      }
      if (matches > bestMatches) {
        bestMatches = matches;
        bestShift = shift;
      }
    }

    // 一定数以上一致した場合のみ「スクロール重複あり」と判定する（誤判定防止）
    const MIN_MATCHES_FOR_OVERLAP = 2;
    if (bestMatches >= MIN_MATCHES_FOR_OVERLAP) {
      for (const curr of currCells) {
        const prevRow = curr.row + bestShift;
        const candidate = prevCells.find((p) => p.row === prevRow && p.col === curr.col);
        if (candidate && hammingDistance(candidate.pHash, curr.pHash) <= OVERLAP_HASH_DISTANCE_THRESHOLD) {
          // 後の画像側を重複として除外し、先に検出済みの側を正とする
          duplicateCellKeys.add(cellKey(curr.imageIndex, curr.row, curr.col));
        }
      }
    }
  }

  return { duplicateCellKeys };
}
