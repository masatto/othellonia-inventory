import { describe, expect, it } from "vitest";
import {
  computeCellRects,
  defaultGridConfigFor,
  estimatePeriod,
  estimatePhase,
  detectSustainedEdgeOnset,
  isCellEmpty,
  type GridConfig,
} from "../../src/recognition/gridDetection";

describe("defaultGridConfigFor", () => {
  it("列数は常に4を基本とする（5x5へフォールバックしない）", () => {
    const config = defaultGridConfigFor(1290, 2796);
    expect(config.columns).toBe(4);
  });

  it("参照解像度と異なる画像サイズでも比率でスケーリングされる", () => {
    const ref = defaultGridConfigFor(1290, 2796);
    const scaled = defaultGridConfigFor(645, 1398); // 半分のサイズ
    expect(scaled.gridTop).toBeCloseTo(ref.gridTop / 2, 0);
    expect(scaled.rowPitch).toBeCloseTo(ref.rowPitch / 2, 0);
    expect(scaled.colCenters[0]).toBeCloseTo(ref.colCenters[0] / 2, 0);
  });
});

describe("computeCellRects", () => {
  const config: GridConfig = {
    columns: 4,
    gridTop: 608,
    rowPitch: 252,
    colCenters: [169, 469, 769, 1069],
    cellSize: 205,
    navBarTop: 2468,
  };

  it("完全に見えている行は正方形のセルとして生成する", () => {
    const rects = computeCellRects(config, 1290, 2796);
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects.filter((r) => !r.partial)) {
      expect(r.width).toBe(r.height);
      expect(r.width).toBe(config.cellSize);
    }
  });

  it("navBarTopを超える行は生成しない（下部メニューを除外する）", () => {
    const rects = computeCellRects(config, 1290, 2796);
    for (const r of rects) {
      expect(r.y).toBeLessThan(config.navBarTop);
    }
  });

  it("画面端で一部だけ表示された行はpartialとして識別し、正方形ではないセルを返す", () => {
    // 7行目のセルが縦方向に60%だけ見えている状況を作る
    const row7Top = config.gridTop + config.rowPitch * 7 + config.rowPitch / 2 - config.cellSize / 2;
    const navBarTop = row7Top + config.cellSize * 0.6;
    const partialConfig: GridConfig = { ...config, navBarTop };
    const rects = computeCellRects(partialConfig, 1290, 2796);
    const lastRowIndex = Math.max(...rects.map((r) => r.row));
    expect(lastRowIndex).toBe(7);
    const lastRowCells = rects.filter((r) => r.row === lastRowIndex);
    expect(lastRowCells.every((c) => c.partial)).toBe(true);
    expect(lastRowCells.every((c) => c.height < config.cellSize)).toBe(true);
    const earlierRowCells = rects.filter((r) => r.row === 0);
    expect(earlierRowCells.every((c) => !c.partial)).toBe(true);
    expect(earlierRowCells.every((c) => c.height === config.cellSize)).toBe(true);
  });

  it("固定5x5分割へフォールバックしない（列数が設定通りになる）", () => {
    const rects = computeCellRects(config, 1290, 2796);
    const cols = new Set(rects.map((r) => r.col));
    expect(cols.size).toBeLessThanOrEqual(4);
    expect([...cols].every((c) => c < 4)).toBe(true);
  });
});

describe("estimatePeriod / estimatePhase", () => {
  it("周期的な合成信号から周期を検出できる", () => {
    const period = 252;
    const n = 2000;
    const signal = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // 周期的なパルス列 + ノイズ
      const phase = i % period;
      signal[i] = (phase < 20 ? 100 : 5) + (i % 7);
    }
    const detected = estimatePeriod(signal, 150, 350);
    expect(Math.abs(detected - period)).toBeLessThanOrEqual(3);
  });

  it("位相（オフセット）も検出できる", () => {
    const period = 100;
    const trueOffset = 37;
    const n = 1000;
    const signal = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      signal[i] = (i - trueOffset) % period === 0 ? 50 : 1;
    }
    const offset = estimatePhase(signal, period, 0, period);
    expect(Math.abs(offset - trueOffset)).toBeLessThanOrEqual(2);
  });
});

describe("detectSustainedEdgeOnset", () => {
  it("静かな区間から持続的に強くなる位置を検出する（単発ピークには反応しない）", () => {
    const n = 1000;
    const signal = new Float64Array(n).fill(50);
    // 単発の強いピーク（ノイズ）
    signal[300] = 50000;
    // y=600から持続的に強い区間（ナビゲーションバーを模す）
    for (let y = 600; y < 900; y++) signal[y] = 20000 + (y % 5) * 100;
    const onset = detectSustainedEdgeOnset(signal, 0, n);
    expect(onset).not.toBeNull();
    expect(onset!).toBeGreaterThanOrEqual(595);
    expect(onset!).toBeLessThanOrEqual(605);
  });
});

describe("isCellEmpty", () => {
  it("均一な背景セルを空と判定する", () => {
    const width = 50,
      height = 50;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 40;
      data[i * 4 + 1] = 35;
      data[i * 4 + 2] = 25;
      data[i * 4 + 3] = 255;
    }
    expect(isCellEmpty({ data, width, height })).toBe(true);
  });

  it("模様のあるセル（駒アイコン相当）は空と判定しない", () => {
    const width = 50,
      height = 50;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = (x * 5) % 256;
        data[i + 1] = (y * 7) % 256;
        data[i + 2] = ((x + y) * 3) % 256;
        data[i + 3] = 255;
      }
    }
    expect(isCellEmpty({ data, width, height })).toBe(false);
  });
});
