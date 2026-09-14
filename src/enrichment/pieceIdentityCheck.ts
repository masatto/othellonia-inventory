import type { AiPiece } from "./aiResponseSchema";

export type IdentityCheckStatus = "ok" | "unknown_piece_id";

export interface IdentityCheckedPiece {
  status: IdentityCheckStatus;
  piece: AiPiece;
  /** 端末内に登録されている現在の名称（検索用の仮称の場合を含む。pieceIdが見つかった場合） */
  registeredFullName: string | null;
}

/**
 * 駒の同一性は名称ではなく、アプリ内部で管理する一意なpieceIdでのみ判定する。
 * AIが返したfullNameが現在の登録名（マスタの正式名称、または仮登録駒の仮称）と
 * 完全一致するかどうかは同一性の判定に使わない（表記ゆれ・仮称からの正式化が
 * 起こりうるため）。pieceId自体が端末内のどの駒にも対応しない場合のみ
 * "unknown_piece_id"として要確認とする。名称候補としての比較は別途
 * buildPieceDiffのnameCandidateで行い、必ずユーザー確認を経て反映する。
 */
export function checkPieceIdentities(pieces: AiPiece[], knownPieces: Map<string, string>): IdentityCheckedPiece[] {
  return pieces.map((piece) => {
    const registeredFullName = knownPieces.get(piece.pieceId) ?? null;
    if (registeredFullName === null) {
      return { status: "unknown_piece_id", piece, registeredFullName: null };
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
