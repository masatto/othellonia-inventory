import { describe, expect, it } from "vitest";
import { computeCellRects, DEFAULT_GRID_CONFIG } from "../../src/recognition/gridDetection";

describe("computeCellRects", () => {
  it("設定した行×列の数だけセルを生成する", () => {
    const rects = computeCellRects(DEFAULT_GRID_CONFIG, 1000, 2000);
    expect(rects).toHaveLength(DEFAULT_GRID_CONFIG.rows * DEFAULT_GRID_CONFIG.columns);
  });

  it("セルが画像範囲内に収まる", () => {
    const rects = computeCellRects(DEFAULT_GRID_CONFIG, 1000, 2000);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(1000 + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(2000 + 1);
    }
  });

  it("行・列のインデックスが一意になる", () => {
    const rects = computeCellRects(DEFAULT_GRID_CONFIG, 1000, 2000);
    const keys = new Set(rects.map((r) => `${r.row}:${r.col}`));
    expect(keys.size).toBe(rects.length);
  });
});
