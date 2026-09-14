import { describe, expect, it } from "vitest";
import { buildNameSearchPrompt } from "../../src/enrichment/nameSearchPromptGeneration";

describe("buildNameSearchPrompt", () => {
  it("選択した駒の仮称だけがプロンプトに含まれる", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).toContain("local-abc123");
    expect(prompt).toContain("ルシファー");
  });

  it("性能情報(スキル・HP・攻撃力)を調査しないよう明記する", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).toContain("性能情報は調査しないでください");
  });

  it("候補を1件に絞らず列挙するよう明記する", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).toContain("1件に絞り込まず");
    expect(prompt).toContain("進化前、進化、闘化");
    expect(prompt).toContain("季節限定版、コラボ版");
  });

  it("pieceIdを変更せず返すよう明記する", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).toContain("変更しないでください");
  });

  it("matchStatus(exact/ambiguous/not_found)のJSONスキーマ例を含める", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).toContain("matchStatus");
    expect(prompt).toContain("candidates");
    expect(prompt).toContain("schemaVersion");
  });

  it("画像・特徴量・所持数などの情報を含めない", () => {
    const prompt = buildNameSearchPrompt([{ pieceId: "local-abc123", inputName: "ルシファー" }]);
    expect(prompt).not.toContain("data:image");
    expect(prompt).not.toContain("base64");
    expect(prompt).not.toContain("pHash");
    expect(prompt).not.toContain("所持数");
  });
});
