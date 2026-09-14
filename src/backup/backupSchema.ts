import type { LocalPieceMetadata, OwnedPiece } from "../domain/types";
import { APP_DATA_SCHEMA_VERSION } from "../domain/types";
import { localPieceMetadataSchema } from "../enrichment/localMetadataSchema";

/**
 * 所持駒バックアップ形式。
 * 攻略サイトの生アイコン・ユーザーの元スクリーンショット・画像特徴量は含めない
 * （仕様書13章）。含めるのは駒ID・所持数・形態・スキルレベル・確認状態・メモと、
 * 端末内で補完した駒情報(localPieceMetadata)のみ。
 */
export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  masterVersionAtExport: string;
  ownedPieces: OwnedPiece[];
  /** v2で追加。旧バックアップには存在しない場合がある */
  localPieceMetadata: LocalPieceMetadata[];
}

export function createBackup(
  ownedPieces: OwnedPiece[],
  masterVersion: string,
  localPieceMetadata: LocalPieceMetadata[] = [],
): BackupFile {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    masterVersionAtExport: masterVersion,
    ownedPieces,
    localPieceMetadata,
  };
}

export interface MigrationResult {
  ownedPieces: OwnedPiece[];
  localPieceMetadata: LocalPieceMetadata[];
  warnings: string[];
}

/**
 * 旧バージョンのバックアップを現行スキーマへ移行する。
 * 未知のバージョンはそのまま読み込みつつ警告を返す（データを破壊しない）。
 * 不正な補完データ(localPieceMetadata)は個別に検証し、壊れている項目だけを
 * 読み飛ばす（バックアップ全体を破棄しない）。
 */
export function migrateBackup(raw: unknown): MigrationResult {
  const warnings: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    throw new Error("バックアップファイルの形式が不正です");
  }
  const obj = raw as Record<string, unknown>;
  const schemaVersion = typeof obj.schemaVersion === "number" ? obj.schemaVersion : 0;
  let ownedPieces = Array.isArray(obj.ownedPieces) ? (obj.ownedPieces as OwnedPiece[]) : [];

  if (schemaVersion === 0) {
    warnings.push("スキーマバージョンが不明なバックアップです。可能な範囲で読み込みます。");
  }
  if (schemaVersion > APP_DATA_SCHEMA_VERSION) {
    warnings.push("現在のアプリより新しいバックアップです。一部データが読み込めない場合があります。");
  }

  // v0 -> v1: skillLevel/memo が存在しない場合の補完
  ownedPieces = ownedPieces.map((p) => ({
    pieceId: p.pieceId,
    quantity: typeof p.quantity === "number" ? p.quantity : 1,
    skillLevel: p.skillLevel ?? null,
    ownedStatus: p.ownedStatus ?? "confirmed",
    recognitionConfidence: p.recognitionConfidence ?? null,
    confirmedByUser: p.confirmedByUser ?? true,
    firstDetectedAt: p.firstDetectedAt ?? new Date().toISOString(),
    lastDetectedAt: p.lastDetectedAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    memo: p.memo ?? "",
  }));

  // v1 -> v2: localPieceMetadataが存在しない旧バックアップでも復元できるようにする
  const rawLocalMetadata = Array.isArray(obj.localPieceMetadata) ? obj.localPieceMetadata : [];
  const localPieceMetadata: LocalPieceMetadata[] = [];
  for (const entry of rawLocalMetadata) {
    const result = localPieceMetadataSchema.safeParse(entry);
    if (result.success) {
      localPieceMetadata.push(result.data);
    } else {
      const pieceId =
        typeof entry === "object" && entry !== null && "pieceId" in entry ? String((entry as { pieceId: unknown }).pieceId) : "不明";
      warnings.push(`補完データの一部が不正なため読み込みをスキップしました（pieceId: ${pieceId}）`);
    }
  }

  return { ownedPieces, localPieceMetadata, warnings };
}
