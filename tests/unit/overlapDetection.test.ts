import { describe, expect, it } from "vitest";
import { detectScrollOverlap, type OverlapInputCell } from "../../src/recognition/overlapDetection";

describe("detectScrollOverlap", () => {
  it("スクロールで重複した行を検出する", () => {
    // 画像0: row0,1,2 / 画像1: row1,2(画像0と重複),3(新規) というスクロールを模す
    const cells: OverlapInputCell[] = [
      { imageIndex: 0, row: 0, col: 0, pHash: "aaaaaaaa" },
      { imageIndex: 0, row: 1, col: 0, pHash: "bbbbbbbb" },
      { imageIndex: 0, row: 2, col: 0, pHash: "cccccccc" },
      { imageIndex: 1, row: 0, col: 0, pHash: "bbbbbbbb" }, // 画像0のrow1と同一表示
      { imageIndex: 1, row: 1, col: 0, pHash: "cccccccc" }, // 画像0のrow2と同一表示
      { imageIndex: 1, row: 2, col: 0, pHash: "11111111" }, // 新規
    ];
    const result = detectScrollOverlap(cells);
    expect(result.duplicateCellKeys.has("1:0:0")).toBe(true);
    expect(result.duplicateCellKeys.has("1:1:0")).toBe(true);
    expect(result.duplicateCellKeys.has("1:2:0")).toBe(false);
  });

  it("同一画像内の複数一致は重複とみなさない（複数所持として保持する）", () => {
    const cells: OverlapInputCell[] = [
      { imageIndex: 0, row: 0, col: 0, pHash: "x" },
      { imageIndex: 0, row: 0, col: 1, pHash: "x" },
      { imageIndex: 0, row: 0, col: 2, pHash: "x" },
    ];
    const result = detectScrollOverlap(cells);
    expect(result.duplicateCellKeys.size).toBe(0);
  });

  it("重複が偶然一致程度（1件のみ）の場合は重複と判定しない", () => {
    const cells: OverlapInputCell[] = [
      { imageIndex: 0, row: 0, col: 0, pHash: "aaaaaaaa" },
      { imageIndex: 0, row: 1, col: 0, pHash: "bbbbbbbb" },
      { imageIndex: 1, row: 0, col: 0, pHash: "22222222" },
      { imageIndex: 1, row: 1, col: 0, pHash: "bbbbbbbb" }, // 1件だけ一致
    ];
    const result = detectScrollOverlap(cells);
    expect(result.duplicateCellKeys.size).toBe(0);
  });
});
