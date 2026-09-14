import type { MergedPieceInfo } from "../domain/types";

/**
 * 1回のプロンプトで調査対象にする駒の件数。プロンプトは駒ごとにWeb検索を
 * 要求する内容のため、件数が多いとChatGPT側の検索・JSON生成が重くなり、
 * 応答が固まる/時間がかかる原因になる。実用上のバランスを取ってこの値にしている。
 */
export const MAX_PIECES_PER_BATCH = 5;

export interface PromptTargetPiece {
  pieceId: string;
  fullName: string;
  /** 再調査の場合、現在保存されている情報（変更有無の確認に使う） */
  existing?: MergedPieceInfo | null;
}

const JSON_SCHEMA_EXAMPLE = `{
  "schemaVersion": 1,
  "game": "逆転オセロニア",
  "checkedAt": "2026-09-14",
  "pieces": [
    {
      "pieceId": "sd025",
      "fullName": "［王家の護持］ジェンイー",
      "version": null,
      "attribute": "竜",
      "rarity": "S+",
      "evolutionType": "進化",
      "hp": null,
      "attack": null,
      "skill": {
        "name": null,
        "type": "攻撃力アップ",
        "condition": "確認できた条件",
        "effect": "確認できた効果",
        "value": "確認できた数値"
      },
      "comboSkillStatus": "exists",
      "comboSkill": {
        "name": null,
        "type": "攻撃力アップ",
        "condition": "確認できた条件",
        "effect": "確認できた効果",
        "value": "確認できた数値"
      },
      "sourceUrls": [
        { "url": "https://example.com/source", "title": "参照ページ名" }
      ]
    }
  ]
}`;

function existingInfoBlock(piece: PromptTargetPiece): string {
  if (!piece.existing || !piece.existing.hasLocalMetadata) return "";
  const lines: string[] = [];
  if (piece.existing.skill?.value != null) lines.push(`  スキル倍率等: ${piece.existing.skill.value}`);
  if (piece.existing.attribute) lines.push(`  属性: ${piece.existing.attribute}`);
  if (piece.existing.rarity) lines.push(`  ランク: ${piece.existing.rarity}`);
  if (piece.existing.version) lines.push(`  バージョン: ${piece.existing.version}`);
  if (piece.existing.checkedAt) lines.push(`  確認日: ${piece.existing.checkedAt}`);
  if (lines.length === 0) return "";
  return `  現在保存されている情報:\n${lines.join("\n")}\n  現在も同じ内容か確認し、変更があれば新しい値を返してください。\n`;
}

/**
 * 選択された駒だけを対象にAI調査用プロンプトを生成する。
 * 画像・特徴量・所持駒全件は一切含めない。
 */
export function buildInvestigationPrompt(pieces: PromptTargetPiece[]): string {
  const targetLines = pieces
    .map((p) => {
      const existing = existingInfoBlock(p);
      const provisionalNote = p.existing?.isUserRegistered
        ? "  ※fullNameはユーザーが入力した検索用の仮称です。正式名称ではない可能性があります。\n"
        : "";
      return `- pieceId: ${p.pieceId}\n  fullName: ${p.fullName}\n${provisionalNote}${existing}`;
    })
    .join("\n");

  return `以下の「逆転オセロニア」の駒について、現在確認できる公開情報をWeb検索してください。

画像検索や画像解析は行わず、駒名を使ったテキスト検索だけで調査してください。

対象駒のfullNameは、検索の手がかりとして登録している名称です。表記ゆれ・略称・
ユーザー入力の仮称である可能性があり、完全に正確とは限りません。
fullNameと完全一致しなくてもかまわないので、pieceIdの駒として最も可能性が高いものを
調査し、正しいと考えられる正式名称をfullNameに、二つ名部分を含む表記のまま返してください。
季節限定・コラボ版等のバージョンが判明した場合はversionに記載してください
（判別できない場合はnull）。

同名の別駒、進化前、進化、闘化、季節版、コラボ版を混同しないでください。
不明な情報は推測せずnullにしてください。
参照したURLと確認日を必ず含めてください。
攻略記事の説明文を長く転載せず、事実情報を簡潔に構造化してください。

対象駒：

${targetLines}
次のJSON形式だけを出力してください（このスキーマ・キー名に厳密に従ってください）：

\`\`\`json
${JSON_SCHEMA_EXAMPLE}
\`\`\`
`;
}

/** 1回あたりの調査対象が多すぎる場合に分割する（トークン消費抑制のため） */
export function splitIntoBatches<T>(items: T[], batchSize = MAX_PIECES_PER_BATCH): T[][] {
  if (batchSize <= 0) throw new Error("batchSize must be positive");
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

export function estimatePromptLength(prompt: string): number {
  return prompt.length;
}
