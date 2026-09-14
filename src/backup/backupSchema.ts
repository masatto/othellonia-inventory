import type { LocalPieceMetadata, LocalPieceRecord, OwnedPiece, PieceMaster } from "../domain/types";
import { APP_DATA_SCHEMA_VERSION } from "../domain/types";
import { localPieceMetadataSchema, localPieceRecordSchema } from "../enrichment/localMetadataSchema";
import { masterPieceImportSchema } from "../master/masterImportSchema";

/**
 * 所持駒バックアップ形式。
 * 攻略サイトの生アイコン・ユーザーの元スクリーンショット・画像特徴量は含めない
 * （仕様書13章）。含めるのは駒ID・所持数・形態・スキルレベル・確認状態・メモ、
 * 端末内で補完した駒情報(localPieceMetadata)、マスタ未登録駒の仮登録記録
 * (localPieces)、そして「完全バックアップ」の場合のみインポート済みマスタ
 * (masterPieces)。仮登録駒の学習用特徴量(learnedFeatures)は含めない。
 *
 * 「ユーザーデータのみ」のエクスポートではmasterPiecesを省略し、
 * 「完全バックアップ」の場合のみ含める（createBackupの引数で切り替える）。
 */
export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  masterVersionAtExport: string;
  ownedPieces: OwnedPiece[];
  /** v2で追加。旧バックアップには存在しない場合がある */
  localPieceMetadata: LocalPieceMetadata[];
  /** v3で追加。旧バックアップには存在しない場合がある */
  localPieces: LocalPieceRecord[];
  /** v4で追加。「完全バックアップ」の場合のみ含む（ユーザーデータのみの場合は省略） */
  masterPieces?: PieceMaster[];
}

export function createBackup(
  ownedPieces: OwnedPiece[],
  masterVersion: string,
  localPieceMetadata: LocalPieceMetadata[] = [],
  localPieces: LocalPieceRecord[] = [],
  masterPieces?: PieceMaster[],
): BackupFile {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    masterVersionAtExport: masterVersion,
    ownedPieces,
    localPieceMetadata,
    localPieces,
    ...(masterPieces ? { masterPieces } : {}),
  };
}

export interface MigrationResult {
  ownedPieces: OwnedPiece[];
  localPieceMetadata: LocalPieceMetadata[];
  localPieces: LocalPieceRecord[];
  /** 「完全バックアップ」に含まれていた場合のみ非空配列になる */
  masterPieces: PieceMaster[];
  /** 復元されたバックアップ自体のマスタバージョン・作成日時（masterPieces復元時のラベル付けに使う） */
  masterVersionAtExport: string;
  exportedAt: string;
  warnings: string[];
}

/**
 * 旧バージョンのバックアップを現行スキーマへ移行する。
 * 未知のバージョンはそのまま読み込みつつ警告を返す（データを破壊しない）。
 * 不正な補完データ(localPieceMetadata)・仮登録データ(localPieces)は個別に
 * 検証し、壊れている項目だけを読み飛ばす（バックアップ全体を破棄しない）。
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

  // v2 -> v3: localPiecesが存在しない旧バックアップでも復元できるようにする
  const rawLocalPieces = Array.isArray(obj.localPieces) ? obj.localPieces : [];
  const localPieces: LocalPieceRecord[] = [];
  for (const entry of rawLocalPieces) {
    const result = localPieceRecordSchema.safeParse(entry);
    if (result.success) {
      localPieces.push(result.data);
    } else {
      const pieceId =
        typeof entry === "object" && entry !== null && "pieceId" in entry ? String((entry as { pieceId: unknown }).pieceId) : "不明";
      warnings.push(`仮登録駒データの一部が不正なため読み込みをスキップしました（pieceId: ${pieceId}）`);
    }
  }

  // v3 -> v4: masterPiecesは「完全バックアップ」の場合のみ存在する
  const rawMasterPieces = Array.isArray(obj.masterPieces) ? obj.masterPieces : [];
  const masterPieces: PieceMaster[] = [];
  for (const entry of rawMasterPieces) {
    const result = masterPieceImportSchema.safeParse(entry);
    if (result.success) {
      masterPieces.push(result.data);
    } else {
      const pieceId =
        typeof entry === "object" && entry !== null && "pieceId" in entry ? String((entry as { pieceId: unknown }).pieceId) : "不明";
      warnings.push(`マスタデータの一部が不正なため読み込みをスキップしました（pieceId: ${pieceId}）`);
    }
  }

  const masterVersionAtExport = typeof obj.masterVersionAtExport === "string" ? obj.masterVersionAtExport : "restored";
  const exportedAt = typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString();

  return { ownedPieces, localPieceMetadata, localPieces, masterPieces, masterVersionAtExport, exportedAt, warnings };
}
