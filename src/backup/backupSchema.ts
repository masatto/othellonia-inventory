import type { OwnedPiece } from "../domain/types";
import { APP_DATA_SCHEMA_VERSION } from "../domain/types";

/**
 * 所持駒バックアップ形式。
 * 攻略サイトの生アイコン・ユーザーの元スクリーンショット・画像特徴量は含めない
 * （仕様書13章）。含めるのは駒ID・所持数・形態・スキルレベル・確認状態・メモ等のみ。
 */
export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  masterVersionAtExport: string;
  ownedPieces: OwnedPiece[];
}

export function createBackup(ownedPieces: OwnedPiece[], masterVersion: string): BackupFile {
  return {
    schemaVersion: APP_DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    masterVersionAtExport: masterVersion,
    ownedPieces,
  };
}

export interface MigrationResult {
  ownedPieces: OwnedPiece[];
  warnings: string[];
}

/**
 * 旧バージョンのバックアップを現行スキーマへ移行する。
 * 未知のバージョンはそのまま読み込みつつ警告を返す（データを破壊しない）。
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

  return { ownedPieces, warnings };
}
