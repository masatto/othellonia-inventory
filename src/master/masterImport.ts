import {
  MASTER_DATA_VERSION_KEY,
  MASTER_GENERATED_AT_KEY,
  MASTER_IMPORTED_AT_KEY,
  MASTER_PIECE_COUNT_KEY,
  MASTER_SCHEMA_VERSION_KEY,
} from "../domain/types";
import { setMeta, swapMasterPieces } from "../db/database";
import { parseMasterImportJson } from "./masterImportParsing";
import { validateMasterImportFile, type MasterImportError, type MasterImportFile } from "./masterImportSchema";

/**
 * マスタJSONインポートのオーケストレーション。
 * ファイル選択後の「正規化→解析→検証→プレビュー→確認→インポート実行」の
 * 各段階を、UI(SettingsPage)から呼び出しやすい形でまとめたもの。
 * 外部サーバーへは一切送信しない（すべて端末内で完結する）。
 */

export interface MasterImportPreview {
  ok: boolean;
  pieceCount: number;
  masterVersion: string | null;
  generatedAt: string | null;
  schemaVersion: number | null;
  errors: MasterImportError[];
  /** 検証成功時のみ設定。そのままapplyMasterImportへ渡す */
  data?: MasterImportFile;
}

/** ファイルのテキストから、インポート前に確認するプレビューを作る（まだ何も保存しない） */
export function buildMasterImportPreview(rawText: string): MasterImportPreview {
  const parsed = parseMasterImportJson(rawText);
  if (!parsed.ok) {
    return {
      ok: false,
      pieceCount: 0,
      masterVersion: null,
      generatedAt: null,
      schemaVersion: null,
      errors: [{ index: null, pieceId: null, field: "(JSON)", message: parsed.error ?? "JSONの解析に失敗しました" }],
    };
  }

  const validated = validateMasterImportFile(parsed.data);
  if (!validated.ok) {
    return {
      ok: false,
      pieceCount: 0,
      masterVersion: null,
      generatedAt: null,
      schemaVersion: null,
      errors: validated.errors,
    };
  }

  return {
    ok: true,
    pieceCount: validated.data.pieces.length,
    masterVersion: validated.data.masterVersion,
    generatedAt: validated.data.generatedAt,
    schemaVersion: validated.data.schemaVersion,
    errors: [],
    data: validated.data,
  };
}

export type MasterImportMode = "replace" | "merge";

export interface MasterImportOutcome {
  count: number;
  masterVersion: string;
  generatedAt: string;
  schemaVersion: number;
}

/**
 * 検証済みのマスタファイルを実際にIndexedDBへ反映する。
 * 安全な差し替え(swapMasterPieces)が失敗した場合（QuotaExceededError等）は
 * 例外がそのまま呼び出し側へ伝播し、現在有効なマスタは変更されない。
 */
export async function applyMasterImport(file: MasterImportFile, mode: MasterImportMode): Promise<MasterImportOutcome> {
  const result = await swapMasterPieces(file.pieces, mode);
  const importedAt = new Date().toISOString();
  await setMeta(MASTER_DATA_VERSION_KEY, file.masterVersion);
  await setMeta(MASTER_GENERATED_AT_KEY, file.generatedAt);
  await setMeta(MASTER_PIECE_COUNT_KEY, String(result.count));
  await setMeta(MASTER_IMPORTED_AT_KEY, importedAt);
  await setMeta(MASTER_SCHEMA_VERSION_KEY, String(file.schemaVersion));
  return {
    count: result.count,
    masterVersion: file.masterVersion,
    generatedAt: file.generatedAt,
    schemaVersion: file.schemaVersion,
  };
}
