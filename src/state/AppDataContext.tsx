import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  LocalPieceMetadata,
  LocalPieceRecord,
  MergedPieceInfo,
  OwnedPiece,
  PieceMaster,
  ScanHistoryRecord,
} from "../domain/types";
import {
  MASTER_DATA_VERSION_KEY,
  MASTER_GENERATED_AT_KEY,
  MASTER_IMPORTED_AT_KEY,
  MASTER_PIECE_COUNT_KEY,
  MASTER_SCHEMA_VERSION_KEY,
} from "../domain/types";
import {
  clearAllData,
  clearMasterPiecesOnly,
  deleteOwnedPiece as dbDeleteOwnedPiece,
  getAllLocalPieceMetadata,
  getAllLocalPieces,
  getAllMasterPiecesFromDb,
  getAllOwnedPieces,
  getLatestScanHistory,
  getMeta,
  putLocalPiece,
  putLocalPieceMetadata,
  putOwnedPiece,
} from "../db/database";
import { applyMasterImport, type MasterImportMode, type MasterImportOutcome } from "../master/masterImport";
import type { MasterImportFile } from "../master/masterImportSchema";
import { mergePieceInfo, mergeProvisionalPieceInfo } from "../enrichment/mergePieceInfo";

export interface MasterMeta {
  masterVersion: string | null;
  generatedAt: string | null;
  pieceCount: number;
  importedAt: string | null;
  schemaVersion: number | null;
}

interface AppDataContextValue {
  loading: boolean;
  error: string | null;
  masterPieces: PieceMaster[];
  masterById: Map<string, PieceMaster>;
  ownedPieces: OwnedPiece[];
  ownedById: Map<string, OwnedPiece>;
  latestScan: ScanHistoryRecord | null;
  /** インポート済みマスタの`masterVersion`文字列（未インポートなら空文字）。バックアップの記録用に維持している */
  masterVersion: string;
  masterMeta: MasterMeta;
  needsReviewCount: number;
  localMetadata: LocalPieceMetadata[];
  localMetadataById: Map<string, LocalPieceMetadata>;
  localPieces: LocalPieceRecord[];
  localPieceById: Map<string, LocalPieceRecord>;
  mergedInfoById: Map<string, MergedPieceInfo>;
  refreshOwnedPieces: () => Promise<void>;
  refreshLatestScan: () => Promise<void>;
  refreshLocalMetadata: () => Promise<void>;
  refreshLocalPieces: () => Promise<void>;
  refreshMasterPieces: () => Promise<void>;
  upsertOwnedPiece: (piece: OwnedPiece) => Promise<void>;
  deleteOwnedPiece: (pieceId: string) => Promise<void>;
  upsertLocalMetadata: (metadata: LocalPieceMetadata) => Promise<void>;
  upsertLocalPiece: (record: LocalPieceRecord) => Promise<void>;
  importMaster: (file: MasterImportFile, mode: MasterImportMode) => Promise<MasterImportOutcome>;
  clearMasterOnly: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const EMPTY_MASTER_META: MasterMeta = {
  masterVersion: null,
  generatedAt: null,
  pieceCount: 0,
  importedAt: null,
  schemaVersion: null,
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masterPieces, setMasterPieces] = useState<PieceMaster[]>([]);
  const [ownedPieces, setOwnedPieces] = useState<OwnedPiece[]>([]);
  const [latestScan, setLatestScan] = useState<ScanHistoryRecord | null>(null);
  const [masterMeta, setMasterMeta] = useState<MasterMeta>(EMPTY_MASTER_META);
  const [localMetadata, setLocalMetadata] = useState<LocalPieceMetadata[]>([]);
  const [localPieces, setLocalPieces] = useState<LocalPieceRecord[]>([]);

  const refreshOwnedPieces = useCallback(async () => {
    setOwnedPieces(await getAllOwnedPieces());
  }, []);

  const refreshLatestScan = useCallback(async () => {
    setLatestScan((await getLatestScanHistory()) ?? null);
  }, []);

  const refreshLocalMetadata = useCallback(async () => {
    setLocalMetadata(await getAllLocalPieceMetadata());
  }, []);

  const refreshLocalPieces = useCallback(async () => {
    setLocalPieces(await getAllLocalPieces());
  }, []);

  const refreshMasterPieces = useCallback(async () => {
    setMasterPieces(await getAllMasterPiecesFromDb());
  }, []);

  const loadMasterMeta = useCallback(async (): Promise<MasterMeta> => {
    const [masterVersion, generatedAt, pieceCountRaw, importedAt, schemaVersionRaw] = await Promise.all([
      getMeta(MASTER_DATA_VERSION_KEY),
      getMeta(MASTER_GENERATED_AT_KEY),
      getMeta(MASTER_PIECE_COUNT_KEY),
      getMeta(MASTER_IMPORTED_AT_KEY),
      getMeta(MASTER_SCHEMA_VERSION_KEY),
    ]);
    return {
      masterVersion: masterVersion ?? null,
      generatedAt: generatedAt ?? null,
      pieceCount: pieceCountRaw ? Number(pieceCountRaw) : 0,
      importedAt: importedAt ?? null,
      schemaVersion: schemaVersionRaw ? Number(schemaVersionRaw) : null,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // マスタは公開リポジトリ・GitHub Pagesには含まれず、ユーザーが端末へ
        // インポートしたものをIndexedDBから読み出す。未インポートでも0件として
        // 正常に起動できる（ネットワークfetchは行わない）
        const [pieces, owned, scan, metadata, localPiecesData, meta] = await Promise.all([
          getAllMasterPiecesFromDb(),
          getAllOwnedPieces(),
          getLatestScanHistory(),
          getAllLocalPieceMetadata(),
          getAllLocalPieces(),
          loadMasterMeta(),
        ]);
        if (cancelled) return;
        setMasterPieces(pieces);
        setOwnedPieces(owned);
        setLatestScan(scan ?? null);
        setLocalMetadata(metadata);
        setLocalPieces(localPiecesData);
        setMasterMeta(meta);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMasterMeta]);

  const upsertOwnedPiece = useCallback(async (piece: OwnedPiece) => {
    await putOwnedPiece(piece);
    setOwnedPieces((prev) => {
      const next = prev.filter((p) => p.pieceId !== piece.pieceId);
      next.push(piece);
      return next;
    });
  }, []);

  const deleteOwnedPiece = useCallback(async (pieceId: string) => {
    await dbDeleteOwnedPiece(pieceId);
    setOwnedPieces((prev) => prev.filter((p) => p.pieceId !== pieceId));
  }, []);

  const upsertLocalMetadata = useCallback(async (metadata: LocalPieceMetadata) => {
    await putLocalPieceMetadata(metadata);
    setLocalMetadata((prev) => {
      const next = prev.filter((m) => m.pieceId !== metadata.pieceId);
      next.push(metadata);
      return next;
    });
  }, []);

  const upsertLocalPiece = useCallback(async (record: LocalPieceRecord) => {
    await putLocalPiece(record);
    setLocalPieces((prev) => {
      const next = prev.filter((p) => p.pieceId !== record.pieceId);
      next.push(record);
      return next;
    });
  }, []);

  const importMaster = useCallback(
    async (file: MasterImportFile, mode: MasterImportMode): Promise<MasterImportOutcome> => {
      const outcome = await applyMasterImport(file, mode);
      const [pieces, meta] = await Promise.all([getAllMasterPiecesFromDb(), loadMasterMeta()]);
      setMasterPieces(pieces);
      setMasterMeta(meta);
      return outcome;
    },
    [loadMasterMeta],
  );

  const clearMasterOnly = useCallback(async () => {
    await clearMasterPiecesOnly();
    setMasterPieces([]);
    setMasterMeta(EMPTY_MASTER_META);
  }, []);

  const resetAllData = useCallback(async () => {
    await clearAllData();
    setOwnedPieces([]);
    setLatestScan(null);
    setLocalMetadata([]);
    setLocalPieces([]);
    setMasterPieces([]);
    setMasterMeta(EMPTY_MASTER_META);
  }, []);

  const masterById = useMemo(() => new Map(masterPieces.map((p) => [p.pieceId, p])), [masterPieces]);
  const ownedById = useMemo(() => new Map(ownedPieces.map((p) => [p.pieceId, p])), [ownedPieces]);
  const localMetadataById = useMemo(() => new Map(localMetadata.map((m) => [m.pieceId, m])), [localMetadata]);
  const localPieceById = useMemo(() => new Map(localPieces.map((p) => [p.pieceId, p])), [localPieces]);
  const mergedInfoById = useMemo(() => {
    const map = new Map<string, MergedPieceInfo>();
    for (const master of masterPieces) {
      map.set(master.pieceId, mergePieceInfo(master, localMetadataById.get(master.pieceId)));
    }
    for (const record of localPieces) {
      map.set(record.pieceId, mergeProvisionalPieceInfo(record, localMetadataById.get(record.pieceId)));
    }
    return map;
  }, [masterPieces, localPieces, localMetadataById]);
  const needsReviewCount = useMemo(
    () => ownedPieces.filter((p) => p.ownedStatus === "needs_review").length,
    [ownedPieces],
  );

  const value: AppDataContextValue = {
    loading,
    error,
    masterPieces,
    masterById,
    ownedPieces,
    ownedById,
    latestScan,
    masterVersion: masterMeta.masterVersion ?? "",
    masterMeta,
    needsReviewCount,
    localMetadata,
    localMetadataById,
    localPieces,
    localPieceById,
    mergedInfoById,
    refreshOwnedPieces,
    refreshLatestScan,
    refreshLocalMetadata,
    refreshLocalPieces,
    refreshMasterPieces,
    upsertOwnedPiece,
    deleteOwnedPiece,
    upsertLocalMetadata,
    upsertLocalPiece,
    importMaster,
    clearMasterOnly,
    resetAllData,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
