/**
 * ユーザーが仮登録する駒に発行する内部pieceId。
 * 公開マスターのpieceId（例: "sd001"）と衝突しないよう常に"local-"を付与する。
 * 駒の同一性はこのIDのみで判定し、名称の一致では判定しない。
 */
export function generateLocalPieceId(): string {
  return `local-${crypto.randomUUID()}`;
}

export function isLocalPieceId(pieceId: string): boolean {
  return pieceId.startsWith("local-");
}
