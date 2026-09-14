/**
 * 軽量画像特徴量（pHash / dHash / aHash / 色ヒストグラム）
 *
 * OpenCV.js相当のSIFT/ORB総当たりをiPhone上で常時実行すると重いため、
 * まず軽量ハッシュで候補を絞り込む多段階照合の第一段として使う。
 * 入力はブラウザのCanvas 2D APIで取得した ImageData のみに依存し、
 * Node(テスト)でもDOMに依存しない形で計算できるようにしている。
 */

export interface GrayscaleImage {
  width: number;
  height: number;
  data: Float64Array; // 0-255 のグレースケール値
}

export function toGrayscale(imageData: ImageData): GrayscaleImage {
  const { width, height, data } = imageData;
  const out = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { width, height, data: out };
}

function resizeNearest(img: GrayscaleImage, w: number, h: number): GrayscaleImage {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const srcY = Math.min(img.height - 1, Math.floor((y * img.height) / h));
    for (let x = 0; x < w; x++) {
      const srcX = Math.min(img.width - 1, Math.floor((x * img.width) / w));
      out[y * w + x] = img.data[srcY * img.width + srcX];
    }
  }
  return { width: w, height: h, data: out };
}

/** average hash: 平均より明るいビットを1にする 64bit */
export function aHash(img: GrayscaleImage): string {
  const small = resizeNearest(img, 8, 8);
  let sum = 0;
  for (let i = 0; i < small.data.length; i++) sum += small.data[i];
  const avg = sum / small.data.length;
  let bits = "";
  for (let i = 0; i < small.data.length; i++) {
    bits += small.data[i] >= avg ? "1" : "0";
  }
  return bitsToHex(bits);
}

/** difference hash: 隣接ピクセルとの明暗差 64bit */
export function dHash(img: GrayscaleImage): string {
  const small = resizeNearest(img, 9, 8);
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = small.data[y * 9 + x];
      const right = small.data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }
  return bitsToHex(bits);
}

/** perceptual hash: DCTの低周波成分の符号から算出する 64bit */
export function pHash(img: GrayscaleImage): string {
  const size = 32;
  const small = resizeNearest(img, size, size);
  const dct = dct2d(small.data, size);
  // 低周波成分（左上8x8、直流成分[0][0]は除く）を使う
  const coeffs: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (x === 0 && y === 0) continue;
      coeffs.push(dct[y * size + x]);
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let bits = "";
  for (const c of coeffs) bits += c >= median ? "1" : "0";
  return bitsToHex(bits);
}

function dct2d(data: Float64Array, size: number): Float64Array {
  // 1次元DCT-IIを行・列に適用する素朴な実装（32x32なので実用上十分な速度）
  const tmp = new Float64Array(size * size);
  const out = new Float64Array(size * size);
  const cosTable: number[][] = [];
  for (let u = 0; u < size; u++) {
    cosTable[u] = [];
    for (let x = 0; x < size; x++) {
      cosTable[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size));
    }
  }
  // 行方向
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let x = 0; x < size; x++) sum += data[y * size + x] * cosTable[u][x];
      tmp[y * size + u] = sum * (u === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size));
    }
  }
  // 列方向
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let y = 0; y < size; y++) sum += tmp[y * size + u] * cosTable[v][y];
      out[v * size + u] = sum * (v === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size));
    }
  }
  return out;
}

function bitsToHex(bits: string): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  }
  return hex;
}

function hexToBits(hex: string): string {
  let bits = "";
  for (const ch of hex) {
    bits += parseInt(ch, 16).toString(2).padStart(4, "0");
  }
  return bits;
}

/** 2つのハッシュ間のハミング距離 */
export function hammingDistance(hexA: string, hexB: string): number {
  const a = hexToBits(hexA);
  const b = hexToBits(hexB);
  const len = Math.max(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    if ((a[i] ?? "0") !== (b[i] ?? "0")) dist++;
  }
  return dist;
}

/** 正規化した色ヒストグラム（RGB各4binで計64bin） */
export function colorHistogram(imageData: ImageData, bins = 4): number[] {
  const { data } = imageData;
  const hist = new Array(bins * bins * bins).fill(0);
  const step = 256 / bins;
  const pixelCount = data.length / 4;
  for (let i = 0; i < pixelCount; i++) {
    const r = Math.min(bins - 1, Math.floor(data[i * 4] / step));
    const g = Math.min(bins - 1, Math.floor(data[i * 4 + 1] / step));
    const b = Math.min(bins - 1, Math.floor(data[i * 4 + 2] / step));
    hist[r * bins * bins + g * bins + b]++;
  }
  return hist.map((v) => v / pixelCount);
}

/** ヒストグラム間のコサイン類似度 (0-1、1が完全一致) */
export function histogramSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface CellFeatures {
  pHash: string;
  dHash: string;
  aHash: string;
  colorHistogram: number[];
}

export function extractFeatures(imageData: ImageData): CellFeatures {
  const gray = toGrayscale(imageData);
  return {
    pHash: pHash(gray),
    dHash: dHash(gray),
    aHash: aHash(gray),
    colorHistogram: colorHistogram(imageData),
  };
}
