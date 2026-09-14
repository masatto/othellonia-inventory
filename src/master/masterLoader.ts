import type { PieceMaster } from "../domain/types";
import { getAllMasterPiecesFromDb } from "../db/database";

/**
 * マスタ駒データは公開リポジトリ・GitHub Pagesには含まれない。
 * ユーザーが端末へインポートしたJSONをIndexedDB(masterPiecesA/B)へ保存したものを
 * ここで読み出す（HTTP fetchは行わない）。インポートされていない場合は空配列を返し、
 * アプリはマスタ0件でも正常に起動できる。
 */
export async function loadMasterPieces(): Promise<PieceMaster[]> {
  return getAllMasterPiecesFromDb();
}

export function searchPiecesByName(pieces: PieceMaster[], query: string): PieceMaster[] {
  const q = query.trim().toLowerCase();
  if (!q) return pieces;
  return pieces.filter(
    (p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.baseName.toLowerCase().includes(q) ||
      (p.epithet?.toLowerCase().includes(q) ?? false),
  );
}
