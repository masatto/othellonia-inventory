import { describe, expect, it } from "vitest";
import { cellSimilarity, findSiblingDuplicate, judgeConfidence, rankCandidates } from "../../src/recognition/matching";
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

describe("findSiblingDuplicate（同一スキャン内の被り検出）", () => {
  const identical: CellFeatures = {
    pHash: "ffffffffffffffff",
    dHash: "ffffffffffffffff",
    aHash: "ffffffffffffffff",
    colorHistogram: [1, 0, 0, 0],
  };
  const different: CellFeatures = {
    pHash: "0000000000000000",
    dHash: "0000000000000000",
    aHash: "0000000000000000",
    colorHistogram: [0, 1, 0, 0],
  };

  it("完全に同一の特徴量を持つ確定済みマスがあれば類似度1で一致する", () => {
    expect(cellSimilarity(identical, identical)).toBeCloseTo(1, 5);
    const match = findSiblingDuplicate(identical, [{ cellIndex: 0, pieceId: "local-abc", cell: identical }]);
    expect(match).not.toBeNull();
    expect(match?.pieceId).toBe("local-abc");
    expect(match?.score).toBeCloseTo(1, 5);
  });

  it("明らかに異なる特徴量のマスは被りとして提案しない", () => {
    const match = findSiblingDuplicate(identical, [{ cellIndex: 0, pieceId: "local-abc", cell: different }]);
    expect(match).toBeNull();
  });

  it("確定済みのマスが無い場合はnullを返す", () => {
    expect(findSiblingDuplicate(identical, [])).toBeNull();
  });

  it("複数の確定済みマスがある場合、最も類似度が高いものを返す", () => {
    const slightlyDifferent: CellFeatures = { ...identical, colorHistogram: [0.9, 0.1, 0, 0] };
    const match = findSiblingDuplicate(identical, [
      { cellIndex: 0, pieceId: "local-close", cell: slightlyDifferent },
      { cellIndex: 1, pieceId: "local-exact", cell: identical },
    ]);
    expect(match?.pieceId).toBe("local-exact");
  });
});
