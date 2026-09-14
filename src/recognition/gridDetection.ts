/**
 * 所持駒一覧スクリーンショットのグリッド検出。
 *
 * オセロニアのUIレイアウトは配信元の環境で確認できないため、完全な自動検出だけに
 * 依存せず「輝度の周期性から妥当な初期値を推定し、ユーザーが確認・微調整できる」
 * 半自動方式を採る（仕様書10章の多段階照合の前段）。
 */

export interface GridConfig {
  /** グリッド開始位置（画像に対する比率 0-1） */
  marginLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  columns: number;
  rows: number;
  /** セル間の余白（セル幅に対する比率） */
  cellGapRatio: number;
}

export const DEFAULT_GRID_CONFIG: GridConfig = {
  marginLeft: 0.02,
  marginTop: 0.18,
  marginRight: 0.02,
  marginBottom: 0.06,
  columns: 5,
  rows: 5,
  cellGapRatio: 0.04,
};

export interface CellRect {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 画像の行方向の輝度分散プロファイルから、アイコンが並ぶ「行」の周期を推定する。
 * 明確な周期が見つからない場合は既定の列数を採用する（完全自動化はしない）。
 */
export function estimateRowCount(rowVariance: number[], minRows = 3, maxRows = 8): number {
  if (rowVariance.length === 0) return DEFAULT_GRID_CONFIG.rows;
  let bestRows = DEFAULT_GRID_CONFIG.rows;
  let bestScore = -Infinity;
  for (let rows = minRows; rows <= maxRows; rows++) {
    const period = rowVariance.length / rows;
    if (period < 2) continue;
    // 周期位置の輝度分散の谷（セル境界）が揃っているほどスコアが高いとみなす
    let score = 0;
    for (let r = 1; r < rows; r++) {
      const idx = Math.round(r * period);
      const window = rowVariance.slice(Math.max(0, idx - 1), idx + 2);
      const localMin = Math.min(...window);
      score -= localMin;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
    }
  }
  return bestRows;
}

export function computeCellRects(config: GridConfig, imageWidth: number, imageHeight: number): CellRect[] {
  const gridLeft = imageWidth * config.marginLeft;
  const gridTop = imageHeight * config.marginTop;
  const gridWidth = imageWidth * (1 - config.marginLeft - config.marginRight);
  const gridHeight = imageHeight * (1 - config.marginTop - config.marginBottom);

  const cellOuterWidth = gridWidth / config.columns;
  const cellOuterHeight = gridHeight / config.rows;
  const gapX = cellOuterWidth * config.cellGapRatio;
  const gapY = cellOuterHeight * config.cellGapRatio;

  const cells: CellRect[] = [];
  let index = 0;
  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.columns; col++) {
      const x = gridLeft + col * cellOuterWidth + gapX / 2;
      const y = gridTop + row * cellOuterHeight + gapY / 2;
      const width = cellOuterWidth - gapX;
      const height = cellOuterHeight - gapY;
      cells.push({ index, row, col, x, y, width, height });
      index++;
    }
  }
  return cells;
}

/** 行ごとの平均輝度分散を計算する（グレースケールデータに対して行う） */
export function computeRowVariance(gray: Float64Array, width: number, height: number): number[] {
  const result: number[] = [];
  for (let y = 0; y < height; y++) {
    let mean = 0;
    for (let x = 0; x < width; x++) mean += gray[y * width + x];
    mean /= width;
    let variance = 0;
    for (let x = 0; x < width; x++) {
      const d = gray[y * width + x] - mean;
      variance += d * d;
    }
    result.push(variance / width);
  }
  return result;
}
