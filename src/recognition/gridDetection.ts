/**
 * 所持駒一覧スクリーンショットのグリッド検出。
 *
 * 実機スクリーンショット(1290x2796, iPhone 15/16 Pro Max相当)を用いて
 * 実測したところ、オセロニアの所持駒一覧は次の構造になっている。
 *
 *  - 列数は4列（5列ではない）
 *  - 上部の「絞込み」フィルターバー下端から、駒アイコンが一定間隔(行ピッチ)で並ぶ
 *  - 行ピッチ・列間隔は画面内で一定（周期的）であり、キャラクターの絵柄によらない
 *  - 下部ナビゲーション（駒箱/ショップ/ホーム/ガチャ/メニュー）の上端で打ち切られる
 *  - 所持数が4の倍数でない場合、最終行の一部の列が空セルになる
 *  - スクロール位置によっては、最終行がナビゲーションバーに一部だけ隠れる
 *    （＝そのセルは駒の判定に十分な情報を持たない「partial」セルになる）
 *
 * このモジュールは、上記構造を前提に
 *   1) 画面から行ピッチ・列位置・上下端を推定する自動検出
 *   2) 画面サイズ単位でユーザーが微調整・保存できるキャリブレーション値
 * の両方をサポートする（自動検出はあくまで初期値であり、固定5x5等へは
 * フォールバックしない）。
 */

export interface GridConfig {
  columns: number;
  /** 1行目セル中心のY座標（px） */
  gridTop: number;
  /** 行間隔（px） */
  rowPitch: number;
  /** 各列の中心X座標（px） */
  colCenters: number[];
  /** 正方形切り出しの一辺の長さ（px） */
  cellSize: number;
  /** 下部ナビゲーション等、これ以降を認識対象外にするY座標（px） */
  navBarTop: number;
}

/**
 * 実機実測に基づくデフォルト値（画像サイズに対する比率で保持し、
 * 解像度が異なる端末でも概ね近い位置から探索を始められるようにする）。
 * iPhone 15/16 Pro Max (1290x2796) での実測値:
 *   columns=4, gridTop=608px, rowPitch=252px, navBarTop=2468px,
 *   colCenters=[169,469,769,1069]px, cellSize=205px
 */
const REFERENCE_WIDTH = 1290;
const REFERENCE_HEIGHT = 2796;
const REFERENCE_CONFIG: GridConfig = {
  columns: 4,
  gridTop: 608,
  rowPitch: 252,
  colCenters: [169, 469, 769, 1069],
  cellSize: 205,
  navBarTop: 2468,
};

/** 画像サイズに合わせて比率スケーリングした初期値を作る（列数は常に4を基本とする） */
export function defaultGridConfigFor(imageWidth: number, imageHeight: number): GridConfig {
  const sx = imageWidth / REFERENCE_WIDTH;
  const sy = imageHeight / REFERENCE_HEIGHT;
  return {
    columns: REFERENCE_CONFIG.columns,
    gridTop: REFERENCE_CONFIG.gridTop * sy,
    rowPitch: REFERENCE_CONFIG.rowPitch * sy,
    colCenters: REFERENCE_CONFIG.colCenters.map((c) => c * sx),
    cellSize: REFERENCE_CONFIG.cellSize * Math.min(sx, sy),
    navBarTop: REFERENCE_CONFIG.navBarTop * sy,
  };
}

/** 後方互換のためのエイリアス（列数4の比率ベース既定値） */
export const DEFAULT_GRID_CONFIG = REFERENCE_CONFIG;

export interface CellRect {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 下部ナビ等により行の一部しか写っていない（識別には使えない可能性が高い） */
  partial: boolean;
}

const MIN_PARTIAL_VISIBLE_RATIO = 0.35;

/**
 * グリッド設定から、実際に切り出すセルの矩形一覧を計算する。
 * 空セル判定は画素値を見る必要があるためここでは行わず（isCellEmptyを別途使う）、
 * navBarTop を超える行は打ち切り、ぎりぎり収まる最終行は partial として返す。
 */
export function computeCellRects(config: GridConfig, imageWidth: number, imageHeight: number): CellRect[] {
  const { columns, gridTop, rowPitch, colCenters, cellSize, navBarTop } = config;
  const effectiveBottom = Math.min(navBarTop, imageHeight);

  const cells: CellRect[] = [];
  let index = 0;
  let row = 0;
  while (true) {
    const rowBandTop = gridTop + rowPitch * row;
    if (rowBandTop >= effectiveBottom) break;

    const cy = rowBandTop + rowPitch / 2;
    const cellTop = cy - cellSize / 2;
    if (cellTop >= effectiveBottom) break;

    // セル本体（正方形想定）のうち、実際に画面内で見えている高さの割合。
    // 下部ナビ等に大きくかかる行は「識別に使える情報が無い」として打ち切る。
    const visibleCellBottom = Math.min(cellTop + cellSize, effectiveBottom);
    const visibleRatio = (visibleCellBottom - cellTop) / cellSize;
    if (visibleRatio < MIN_PARTIAL_VISIBLE_RATIO) break;
    const partial = visibleRatio < 0.98;
    const height = partial ? visibleCellBottom - cellTop : cellSize;

    for (let col = 0; col < columns; col++) {
      const cx = colCenters[col] ?? colCenters[colCenters.length - 1];
      const x = cx - cellSize / 2;
      const y = cellTop;
      if (x < 0 || y < 0 || x + cellSize > imageWidth) continue;
      cells.push({ index, row, col, x, y, width: cellSize, height, partial });
      index++;
    }
    row++;
  }
  return cells;
}

export interface GrayscaleSignal {
  width: number;
  height: number;
  data: Float64Array;
}

/** 行方向のグラデーション強度（縦方向の輝度差の総和）を計算する。UI境界線の検出に使う。 */
export function computeRowGradient(gray: GrayscaleSignal): Float64Array {
  const { width, height, data } = gray;
  const result = new Float64Array(height);
  for (let y = 1; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += Math.abs(data[y * width + x] - data[(y - 1) * width + x]);
    }
    result[y] = sum;
  }
  return result;
}

/** 列方向のグラデーション強度（横方向の輝度差の総和）を計算する。 */
export function computeColGradient(gray: GrayscaleSignal, yStart: number, yEnd: number): Float64Array {
  const { width, height, data } = gray;
  const y0 = Math.max(0, Math.floor(yStart));
  const y1 = Math.min(height, Math.ceil(yEnd));
  const result = new Float64Array(width);
  for (let x = 1; x < width; x++) {
    let sum = 0;
    for (let y = y0; y < y1; y++) {
      sum += Math.abs(data[y * width + x] - data[y * width + x - 1]);
    }
    result[x] = sum;
  }
  return result;
}

/**
 * 信号の自己相関から周期を推定する（行ピッチ・列ピッチの検出に使う）。
 * キャラクター絵柄由来のノイズに埋もれないよう、単純な極大値探索ではなく
 * 自己相関のピークを使う（仕様書10章: 周期性からの推定）。
 */
export function estimatePeriod(signal: ArrayLike<number>, minPeriod: number, maxPeriod: number): number {
  const n = signal.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= n;
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i++) centered[i] = signal[i] - mean;

  let bestLag = minPeriod;
  let bestScore = -Infinity;
  for (let lag = minPeriod; lag <= maxPeriod && lag < n; lag++) {
    let s = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) s += centered[i] * centered[i + lag];
    s /= count;
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  return bestLag;
}

/** 与えられた周期に対し、信号のピークと最も揃う位相（オフセット）を探す */
export function estimatePhase(signal: ArrayLike<number>, period: number, searchStart: number, searchEnd: number): number {
  const n = signal.length;
  let bestOffset = searchStart;
  let bestScore = -Infinity;
  for (let offset = searchStart; offset < searchStart + period && offset < searchEnd; offset++) {
    let s = 0;
    let count = 0;
    for (let i = offset; i < n; i += period) {
      s += signal[i];
      count++;
    }
    if (count === 0) continue;
    s /= count;
    if (s > bestScore) {
      bestScore = s;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/**
 * 下部ナビゲーション等の上端を検出する。単純な最大値ではなく、
 * 「静かな区間から急激にグラデーションが上がり、それが持続する」最初の位置を探す
 * （ナビゲーションバー内のアイコン装飾による単発の強いピークに惑わされないため）。
 */
export function detectSustainedEdgeOnset(
  rowGradient: ArrayLike<number>,
  searchStart: number,
  searchEnd: number,
  sustainWindow = 30,
): number | null {
  // しきい値は探索区間の中央値ベースで動的に決める
  const values: number[] = [];
  for (let y = searchStart; y < searchEnd; y++) values.push(rowGradient[y]);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const threshold = Math.max(median * 6, 2000);

  for (let y = searchStart; y < searchEnd - sustainWindow; y++) {
    if (rowGradient[y] < threshold) continue;
    let sustainedCount = 0;
    for (let d = 0; d < sustainWindow; d++) {
      if (rowGradient[y + d] >= threshold * 0.3) sustainedCount++;
    }
    if (sustainedCount >= sustainWindow * 0.6) {
      return y;
    }
  }
  return null;
}

export interface DetectedAnchors {
  gridTop: number;
  rowPitch: number;
  navBarTop: number;
  colCenters: number[];
  cellSize: number;
  columns: number;
}

/**
 * 画像から自動的にグリッド構造を推定する。既定値(defaultGridConfigFor)を
 * 探索の起点としつつ、実画像の周期性・エッジから調整する。
 */
export function detectGridAnchors(gray: GrayscaleSignal, columns = 4): DetectedAnchors {
  const { width, height } = gray;
  const base = defaultGridConfigFor(width, height);

  const rowGradient = computeRowGradient(gray);

  // 行ピッチ: グリッドが存在しうる範囲(上位10%〜下位10%を除く)で自己相関を取る
  const topSearch = Math.floor(height * 0.15);
  const bottomSearch = Math.floor(height * 0.95);
  const rowSegment = rowGradient.slice(topSearch, bottomSearch);
  const minPeriod = Math.floor(base.rowPitch * 0.6);
  const maxPeriod = Math.floor(base.rowPitch * 1.5);
  const rowPitch = estimatePeriod(rowSegment, minPeriod, maxPeriod);

  // 上端(フィルターバー下端): 上位40%の範囲でrowPitch周期に最も揃う位相を探す
  const gridTop = estimatePhase(rowGradient, rowPitch, Math.floor(height * 0.15), Math.floor(height * 0.4));

  // 下部ナビゲーション上端: 下位25%の範囲で「持続する強いエッジ」の開始位置を探す
  const navSearchStart = Math.floor(height * 0.75);
  const navBarTop = detectSustainedEdgeOnset(rowGradient, navSearchStart, height) ?? base.navBarTop;

  // 列中心: グリッド領域内で列方向の自己相関を取り、周期と位相を推定する
  const colGradient = computeColGradient(gray, gridTop, Math.min(navBarTop, height));
  const colMinPeriod = Math.floor((base.colCenters[1] - base.colCenters[0]) * 0.7);
  const colMaxPeriod = Math.floor((base.colCenters[1] - base.colCenters[0]) * 1.4);
  const colPitch = estimatePeriod(colGradient, colMinPeriod, colMaxPeriod);
  const colPhase = estimatePhase(colGradient, colPitch, 0, Math.floor(width * 0.3));
  const halfDiameter = colPitch * 0.42;
  const colCenters: number[] = [];
  for (let c = 0; c < columns; c++) {
    colCenters.push(colPhase + halfDiameter + colPitch * c);
  }

  const cellSize = Math.min(rowPitch, colPitch) * 0.82;

  return { gridTop, rowPitch, navBarTop, colCenters, cellSize, columns };
}

export function anchorsToGridConfig(anchors: DetectedAnchors): GridConfig {
  return {
    columns: anchors.columns,
    gridTop: anchors.gridTop,
    rowPitch: anchors.rowPitch,
    colCenters: anchors.colCenters,
    cellSize: anchors.cellSize,
    navBarTop: anchors.navBarTop,
  };
}

/** セル内の画素値のばらつきから、空セル（背景のみ）かどうかを判定する */
export function isCellEmpty(imageData: { data: ArrayLike<number>; width: number; height: number }, threshold = 30): boolean {
  const { data, width, height } = imageData;
  const n = width * height;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const gray = (r + g + b) / 3;
    sum += gray;
    sumSq += gray * gray;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return Math.sqrt(Math.max(0, variance)) < threshold;
}
