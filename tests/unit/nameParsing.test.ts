import { describe, expect, it } from "vitest";
import { parsePieceName } from "../../src/domain/nameParsing";

describe("parsePieceName", () => {
  it("異名付きの駒名を分離する", () => {
    const result = parsePieceName("［王家の護持］ジェンイー");
    expect(result.epithet).toBe("王家の護持");
    expect(result.baseName).toBe("ジェンイー");
    expect(result.fullName).toBe("［王家の護持］ジェンイー");
  });

  it("半角ブラケットにも対応する", () => {
    const result = parsePieceName("[破壊竜]アルイーナル");
    expect(result.epithet).toBe("破壊竜");
    expect(result.baseName).toBe("アルイーナル");
  });

  it("異名がない駒名はそのままbaseNameとする", () => {
    const result = parsePieceName("プロキオン");
    expect(result.epithet).toBeNull();
    expect(result.baseName).toBe("プロキオン");
  });

  it("前後の空白を取り除く", () => {
    const result = parsePieceName("  オオクニヌシ  ");
    expect(result.fullName).toBe("オオクニヌシ");
  });
});
