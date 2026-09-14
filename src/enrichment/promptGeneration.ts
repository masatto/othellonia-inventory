import type { MergedPieceInfo } from "../domain/types";

export const MAX_PIECES_PER_BATCH = 20;

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
      return `- pieceId: ${p.pieceId}\n  fullName: ${p.fullName}\n${existing}`;
    })
    .join("\n");

  return `以下の「逆転オセロニア」の駒について、現在確認できる公開情報をWeb検索してください。

画像検索や画像解析は行わず、駒名を使ったテキスト検索だけで調査してください。

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
