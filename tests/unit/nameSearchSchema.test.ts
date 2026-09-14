import { describe, expect, it } from "vitest";
import { validateNameSearchResponse } from "../../src/enrichment/nameSearchSchema";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    game: "逆転オセロニア",
    checkedAt: "2026-09-14",
    pieces: [
      {
        pieceId: "local-abc123",
        inputName: "ルシファー",
        matchStatus: "ambiguous",
        candidates: [
          { fullName: "［明けの明星］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "進化" },
          { fullName: "［喪亡せぬ輝き］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          { fullName: "［世界を問う者］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          { fullName: "［掴みし闘気］ルシファー", version: null, attribute: "魔", rarity: "S+", evolutionType: "闘化" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("validateNameSearchResponse", () => {
  it("正常なambiguous回答(4候補)を検証できる", () => {
    const result = validateNameSearchResponse(basePayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pieces[0].matchStatus).toBe("ambiguous");
      expect(result.data.pieces[0].candidates).toHaveLength(4);
    }
  });

  it("正式名称が完全に一致する場合のexact回答を検証できる（候補1件）", () => {
    const payload = basePayload({
      pieces: [
        {
          pieceId: "local-exact",
          inputName: "［世界を問う者］ルシファー",
          matchStatus: "exact",
          candidates: [
            {
              fullName: "［世界を問う者］ルシファー",
              version: null,
              attribute: "魔",
              rarity: "S+",
              evolutionType: "闘化",
              sourceUrls: [{ url: "https://example.com/lucifer", title: "評価記事" }],
            },
          ],
        },
      ],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pieces[0].matchStatus).toBe("exact");
      expect(result.data.pieces[0].candidates).toHaveLength(1);
    }
  });

  it("季節版・コラボ版を含む多数の候補も省略せず検証できる", () => {
    const payload = basePayload({
      pieces: [
        {
          pieceId: "local-season",
          inputName: "ミャオ",
          matchStatus: "ambiguous",
          candidates: [
            { fullName: "［霊猫の愛娘］ミャオ", version: null, attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［浴衣の招き猫］ミャオ", version: "夏季限定", attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［聖夜の贈り物］ミャオ", version: "クリスマス限定", attribute: "神", rarity: "S+", evolutionType: "進化" },
            { fullName: "［異界からの来訪］ミャオ", version: "コラボ", attribute: "魔", rarity: "S+", evolutionType: "闘化" },
          ],
        },
      ],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].candidates).toHaveLength(4);
  });

  it("該当なし(not_found)の場合、candidatesが空でも検証できる", () => {
    const payload = basePayload({
      pieces: [{ pieceId: "local-none", inputName: "存在しない駒名アアアアア", matchStatus: "not_found", candidates: [] }],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pieces[0].matchStatus).toBe("not_found");
      expect(result.data.pieces[0].candidates).toHaveLength(0);
    }
  });

  it("candidatesを省略しても検証できる(optionalのため)", () => {
    const payload = basePayload({
      pieces: [{ pieceId: "local-none", inputName: "存在しない駒名", matchStatus: "not_found" }],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(true);
  });

  it("matchStatusが許可値以外なら拒否する", () => {
    const payload = basePayload({
      pieces: [{ pieceId: "local-x", inputName: "x", matchStatus: "maybe", candidates: [] }],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(false);
  });

  it("候補のfullNameにHTMLタグが含まれる場合は拒否する", () => {
    const payload = basePayload({
      pieces: [
        {
          pieceId: "local-x",
          inputName: "x",
          matchStatus: "ambiguous",
          candidates: [{ fullName: "<script>alert(1)</script>", version: null }],
        },
      ],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(false);
  });

  it("候補のsourceUrlsがMarkdownリンク形式でもリンク先を抽出して受理する", () => {
    const payload = basePayload({
      pieces: [
        {
          pieceId: "local-x",
          inputName: "x",
          matchStatus: "exact",
          candidates: [
            {
              fullName: "テストピース",
              version: null,
              sourceUrls: [{ url: "[https://example.com/a](https://example.com/a)", title: "参照" }],
            },
          ],
        },
      ],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pieces[0].candidates?.[0].sourceUrls?.[0].url).toBe("https://example.com/a");
  });

  it("javascript:等の危険なスキームのURLは拒否する", () => {
    const payload = basePayload({
      pieces: [
        {
          pieceId: "local-x",
          inputName: "x",
          matchStatus: "exact",
          candidates: [{ fullName: "テストピース", sourceUrls: [{ url: "javascript:alert(1)", title: null }] }],
        },
      ],
    });
    const result = validateNameSearchResponse(payload);
    expect(result.ok).toBe(false);
  });

  it("piecesが空の場合は拒否する", () => {
    const result = validateNameSearchResponse(basePayload({ pieces: [] }));
    expect(result.ok).toBe(false);
  });

  it("schemaVersion/gameが不正な場合は拒否する", () => {
    expect(validateNameSearchResponse(basePayload({ schemaVersion: 2 })).ok).toBe(false);
    expect(validateNameSearchResponse(basePayload({ game: "別のゲーム" })).ok).toBe(false);
  });
});
