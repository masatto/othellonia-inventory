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
  clearAllData,
  deleteOwnedPiece as dbDeleteOwnedPiece,
  getAllLocalPieceMetadata,
  getAllLocalPieces,
  getAllOwnedPieces,
  getLatestScanHistory,
  getMeta,
  putLocalPiece,
  putLocalPieceMetadata,
  putOwnedPiece,
  setMeta,
} from "../db/database";
import { fetchAllPieceMaster, fetchManifest, fetchOwnedSeed } from "../master/masterLoader";
import { MASTER_DATA_VERSION_KEY } from "../domain/types";
import { mergePieceInfo, mergeProvisionalPieceInfo } from "../enrichment/mergePieceInfo";

interface AppDataContextValue {
  loading: boolean;
  error: string | null;
  masterPieces: PieceMaster[];
  masterById: Map<string, PieceMaster>;
  ownedPieces: OwnedPiece[];
  ownedById: Map<string, OwnedPiece>;
  latestScan: ScanHistoryRecord | null;
  masterVersion: string;
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
  upsertOwnedPiece: (piece: OwnedPiece) => Promise<void>;
  deleteOwnedPiece: (pieceId: string) => Promise<void>;
  upsertLocalMetadata: (metadata: LocalPieceMetadata) => Promise<void>;
  upsertLocalPiece: (record: LocalPieceRecord) => Promise<void>;
  resetAllData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masterPieces, setMasterPieces] = useState<PieceMaster[]>([]);
  const [ownedPieces, setOwnedPieces] = useState<OwnedPiece[]>([]);
  const [latestScan, setLatestScan] = useState<ScanHistoryRecord | null>(null);
  const [masterVersion, setMasterVersion] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const manifest = await fetchManifest();
        const pieces = await fetchAllPieceMaster();
        if (cancelled) return;
        setMasterPieces(pieces);
        setMasterVersion(manifest.masterVersion);

        const storedVersion = await getMeta(MASTER_DATA_VERSION_KEY);
        let owned = await getAllOwnedPieces();
        if (owned.length === 0 && storedVersion === undefined) {
          // 初回起動時のみ、既知の初期データ（仕様書21章）を投入する
          const seed = await fetchOwnedSeed();
          const now = new Date().toISOString();
          for (const s of seed) {
            await putOwnedPiece({
              pieceId: s.pieceId,
              quantity: s.quantity,
              skillLevel: null,
              ownedStatus: s.ownedStatus as OwnedPiece["ownedStatus"],
              recognitionConfidence: null,
              confirmedByUser: true,
              firstDetectedAt: now,
              lastDetectedAt: now,
              updatedAt: now,
              memo: s.memo,
            });
          }
          owned = await getAllOwnedPieces();
        }
        await setMeta(MASTER_DATA_VERSION_KEY, manifest.masterVersion);
        if (cancelled) return;
        setOwnedPieces(owned);
        setLatestScan((await getLatestScanHistory()) ?? null);
        setLocalMetadata(await getAllLocalPieceMetadata());
        setLocalPieces(await getAllLocalPieces());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const resetAllData = useCallback(async () => {
    await clearAllData();
    setOwnedPieces([]);
    setLatestScan(null);
    setLocalMetadata([]);
    setLocalPieces([]);
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
    masterVersion,
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
    upsertOwnedPiece,
    deleteOwnedPiece,
    upsertLocalMetadata,
    upsertLocalPiece,
    resetAllData,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
