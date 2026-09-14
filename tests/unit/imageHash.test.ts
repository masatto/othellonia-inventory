import { describe, expect, it } from "vitest";
import { aHash, dHash, pHash, hammingDistance, colorHistogram, histogramSimilarity, toGrayscale } from "../../src/recognition/imageHash";
import { makeImageData, solidColorImage } from "./testUtils";

describe("画像ハッシュ", () => {
  it("同一画像は距離0になる", () => {
    const img = makeImageData(32, 32, (x, y) => [(x * 7) % 256, (y * 13) % 256, ((x + y) * 5) % 256, 255]);
    const gray1 = toGrayscale(img);
    const gray2 = toGrayscale(img);
    expect(hammingDistance(pHash(gray1), pHash(gray2))).toBe(0);
    expect(hammingDistance(dHash(gray1), dHash(gray2))).toBe(0);
    expect(hammingDistance(aHash(gray1), aHash(gray2))).toBe(0);
  });

  it("大きく異なる画像はハミング距離が大きくなる", () => {
    const imgA = makeImageData(32, 32, (x, y) => [(x * 7) % 256, (y * 13) % 256, ((x + y) * 5) % 256, 255]);
    const imgB = makeImageData(32, 32, (x, y) => [255 - ((x * 7) % 256), 255 - ((y * 13) % 256), 255 - (((x + y) * 5) % 256), 255]);
    const dist = hammingDistance(pHash(toGrayscale(imgA)), pHash(toGrayscale(imgB)));
    expect(dist).toBeGreaterThan(10);
  });

  it("わずかなノイズを加えても近い値になる（頑健性）", () => {
    const base = makeImageData(32, 32, (x, y) => [(x * 7) % 256, (y * 13) % 256, ((x + y) * 5) % 256, 255]);
    const noisy = makeImageData(32, 32, (x, y) => {
      const n = (x * 3 + y * 2) % 5;
      return [((x * 7) % 256) + n, (y * 13) % 256, ((x + y) * 5) % 256, 255];
    });
    const dist = hammingDistance(pHash(toGrayscale(base)), pHash(toGrayscale(noisy)));
    expect(dist).toBeLessThan(10);
  });

  it("色ヒストグラムは同色画像で類似度1になる", () => {
    const a = colorHistogram(solidColorImage(8, 8, 200, 50, 50));
    const b = colorHistogram(solidColorImage(8, 8, 200, 50, 50));
    expect(histogramSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it("色ヒストグラムは全く異なる色で類似度が低くなる", () => {
    const a = colorHistogram(solidColorImage(8, 8, 255, 0, 0));
    const b = colorHistogram(solidColorImage(8, 8, 0, 0, 255));
    expect(histogramSimilarity(a, b)).toBeLessThan(0.5);
  });
});
