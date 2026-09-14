/**
 * 駒名候補検索(第1段階)用のプロンプト生成。
 * 「ルシファー」のような仮称・略称から、進化・闘化・季節版・コラボ版などの
 * 候補を1件に絞らず列挙してもらう。性能情報は扱わない（第2段階で別途調査する）。
 */

export interface NameSearchTargetPiece {
  pieceId: string;
  /** ユーザーが入力した仮称・略称（検索の手がかり） */
  inputName: string;
}

const JSON_SCHEMA_EXAMPLE = `{
  "schemaVersion": 1,
  "game": "逆転オセロニア",
  "checkedAt": "2026-09-14",
  "pieces": [
    {
      "pieceId": "local-xxxxxxxx",
      "inputName": "ルシファー",
      "matchStatus": "ambiguous",
      "candidates": [
        {
          "fullName": "［明けの明星］ルシファー",
          "version": null,
          "attribute": "魔",
          "rarity": "S+",
          "evolutionType": "進化",
          "sourceUrls": [{ "url": "https://example.com/source", "title": "参照ページ名" }]
        },
        {
          "fullName": "［喪亡せぬ輝き］ルシファー",
          "version": null,
          "attribute": "魔",
          "rarity": "S+",
          "evolutionType": "闘化",
          "sourceUrls": [{ "url": "https://example.com/source2", "title": "参照ページ名2" }]
        }
      ]
    }
  ]
}`;

/**
 * 選択された駒（仮称）だけを対象に、名称候補検索用プロンプトを生成する。
 * 画像・特徴量・所持駒全件は一切含めない。性能情報の調査は依頼しない。
 */
export function buildNameSearchPrompt(pieces: NameSearchTargetPiece[]): string {
  const targetLines = pieces.map((p) => `- pieceId: ${p.pieceId}\n  入力された名称: ${p.inputName}`).join("\n");

  return `以下の「逆転オセロニア」の駒について、名称から該当する駒を特定するための調査を行ってください。
この段階ではスキル・HP・攻撃力等の性能情報は調査しないでください（性能調査は次の段階で別途行います）。

ユーザーが入力した名称は、略称・愛称・不完全な名称、あるいは二つ名の記憶違いの可能性があります。
同じ基本名の駒には、進化前、進化、闘化（複数存在する場合がある）、季節限定版、コラボ版など、
複数の異なる駒が存在することがあります。これらを1件に絞り込まず、確認できたすべての候補を
列挙してください。入力名と完全に一致しない候補も、可能性があれば含めてください。

各駒について、以下の方針で候補を整理してください：
- 該当する駒が1件だけで、他の形態と混同する余地が無い場合はmatchStatusを"exact"にし、
  candidatesにその1件だけを入れてください
- 複数の形態・バージョンが存在する、または区別できない場合はmatchStatusを"ambiguous"にし、
  確認できた候補をすべてcandidatesに列挙してください（件数が多くても省略しないでください）
- 該当する駒を全く確認できない場合はmatchStatusを"not_found"にし、candidatesは空にしてください
- candidatesの各項目には、二つ名を含む正式名称(fullName)を必ず記載してください
- 属性・ランク・進化形態は、候補を区別するための参考情報として分かる範囲で記載してください
  （不明な場合はnull。この段階で確定させる必要はありません）
- 参照したURLを含めてください
- pieceIdは対象駒として示した値をそのまま返してください（変更しないでください）

対象駒：

${targetLines}
次のJSON形式だけを出力してください（このスキーマ・キー名に厳密に従ってください）：

\`\`\`json
${JSON_SCHEMA_EXAMPLE}
\`\`\`
`;
}
