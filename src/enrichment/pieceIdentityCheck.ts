import type { AiPiece } from "./aiResponseSchema";

export type IdentityCheckStatus = "ok" | "unknown_piece_id" | "name_mismatch";

export interface IdentityCheckedPiece {
  status: IdentityCheckStatus;
  piece: AiPiece;
  /** 端末内に登録されている正式名称（pieceIdが見つかった場合） */
  registeredFullName: string | null;
}

/**
 * AIが返したpieceIdが端末内に存在するか、fullNameが完全一致するかを検査する。
 * 「進化と闘化を混同」「同名の別バージョン」等を誤って自動反映しないための
 * 最終防衛ライン（仕様書「名称不一致」）。
 */
export function checkPieceIdentities(pieces: AiPiece[], knownPieces: Map<string, string>): IdentityCheckedPiece[] {
  return pieces.map((piece) => {
    const registeredFullName = knownPieces.get(piece.pieceId) ?? null;
    if (registeredFullName === null) {
      return { status: "unknown_piece_id", piece, registeredFullName: null };
    }
    if (registeredFullName !== piece.fullName) {
      return { status: "name_mismatch", piece, registeredFullName };
    }
    return { status: "ok", piece, registeredFullName };
  });
}

/** 必須情報の大半がnullかどうか（一括反映から除外する判断に使う） */
export function hasMostlyNullFields(piece: AiPiece): boolean {
  const fields = [piece.attribute, piece.rarity, piece.evolutionType, piece.skill ?? null];
  const nullCount = fields.filter((f) => f === null || f === undefined).length;
  return nullCount >= 3;
}

/** 出典が1件も無いかどうか */
export function hasNoSources(piece: AiPiece): boolean {
  return !piece.sourceUrls || piece.sourceUrls.length === 0;
}
