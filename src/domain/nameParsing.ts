/**
 * 「［異名］基本名」形式の駒名を異名と基本名に分離する。
 * 例: "［王家の護持］ジェンイー" -> epithet: "王家の護持", baseName: "ジェンイー"
 * 異名がない場合（"プロキオン" など）は epithet: null。
 */
export interface ParsedName {
  fullName: string;
  epithet: string | null;
  baseName: string;
}

const EPITHET_PATTERN = /^[［[](.+?)[］\]]\s*(.+)$/;

export function parsePieceName(rawName: string): ParsedName {
  const fullName = rawName.trim();
  const match = fullName.match(EPITHET_PATTERN);
  if (match) {
    return {
      fullName,
      epithet: match[1].trim(),
      baseName: match[2].trim(),
    };
  }
  return { fullName, epithet: null, baseName: fullName };
}
