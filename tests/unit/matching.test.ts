import { describe, expect, it } from "vitest";
import { judgeConfidence, rankCandidates } from "../../src/recognition/matching";
import type { LearnedFeature } from "../../src/domain/types";
import type { CellFeatures } from "../../src/recognition/imageHash";

function feature(pieceId: string, pHash: string, colorHistogram: number[] = [1, 0, 0, 0]): LearnedFeature {
  return {
    id: `${pieceId}-1`,
    pieceId,
    pHash,
    dHash: pHash,
    aHash: pHash,
    colorHistogram,
    createdAt: new Date().toISOString(),
  };
}

describe("rankCandidates / judgeConfidence", () => {
  it("完全一致する学習済み特徴量を最上位候補として返す", () => {
    const cell: CellFeatures = { pHash: "ff00ff00ff00ff00", dHash: "ff00ff00ff00ff00", aHash: "ff00ff00ff00ff00", colorHistogram: [1, 0, 0, 0] };
    const learned = [feature("p1", "ff00ff00ff00ff00"), feature("p2", "0000000000000000")];
    const ranked = rankCandidates(cell, learned);
    expect(ranked[0].pieceId).toBe("p1");
    expect(ranked[0].score).toBeCloseTo(1, 5);
  });

  it("学習済み特徴量が無ければ候補は空になる", () => {
    const cell: CellFeatures = { pHash: "ff00ff00ff00ff00", dHash: "ff00ff00ff00ff00", aHash: "ff00ff00ff00ff00", colorHistogram: [1, 0, 0, 0] };
    const ranked = rankCandidates(cell, []);
    expect(ranked).toHaveLength(0);
    expect(judgeConfidence(ranked).reviewStatus).toBe("unmatched");
  });

  it("1位と僅差の候補がある場合は要確認になる（誤確定防止優先）", () => {
    const result = judgeConfidence([
      { pieceId: "p1", score: 0.95 },
      { pieceId: "p2", score: 0.93 },
    ]);
    expect(result.reviewStatus).toBe("needs_review");
  });

  it("1位が高スコアかつ2位と十分な差がある場合は自動確定する", () => {
    const result = judgeConfidence([
      { pieceId: "p1", score: 0.97 },
      { pieceId: "p2", score: 0.5 },
    ]);
    expect(result.reviewStatus).toBe("auto_confirmed");
  });

  it("スコアが低い場合は不明とする", () => {
    const result = judgeConfidence([{ pieceId: "p1", score: 0.4 }]);
    expect(result.reviewStatus).toBe("unmatched");
  });
});
