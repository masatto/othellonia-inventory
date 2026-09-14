import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LocalPieceMetadata, MergedPieceInfo, OwnedPiece, PieceMaster, ScanHistoryRecord } from "../domain/types";
import {
  clearAllData,
  deleteOwnedPiece as dbDeleteOwnedPiece,
  getAllLocalPieceMetadata,
  getAllOwnedPieces,
  getLatestScanHistory,
  getMeta,
  putLocalPieceMetadata,
  putOwnedPiece,
  setMeta,
} from "../db/database";
import { fetchAllPieceMaster, fetchManifest, fetchOwnedSeed } from "../master/masterLoader";
import { MASTER_DATA_VERSION_KEY } from "../domain/types";
import { mergePieceInfo } from "../enrichment/mergePieceInfo";

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
  mergedInfoById: Map<string, MergedPieceInfo>;
  refreshOwnedPieces: () => Promise<void>;
  refreshLatestScan: () => Promise<void>;
  refreshLocalMetadata: () => Promise<void>;
  upsertOwnedPiece: (piece: OwnedPiece) => Promise<void>;
  deleteOwnedPiece: (pieceId: string) => Promise<void>;
  upsertLocalMetadata: (metadata: LocalPieceMetadata) => Promise<void>;
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

  const refreshOwnedPieces = useCallback(async () => {
    setOwnedPieces(await getAllOwnedPieces());
  }, []);

  const refreshLatestScan = useCallback(async () => {
    setLatestScan((await getLatestScanHistory()) ?? null);
  }, []);

  const refreshLocalMetadata = useCallback(async () => {
    setLocalMetadata(await getAllLocalPieceMetadata());
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

  const resetAllData = useCallback(async () => {
    await clearAllData();
    setOwnedPieces([]);
    setLatestScan(null);
    setLocalMetadata([]);
  }, []);

  const masterById = useMemo(() => new Map(masterPieces.map((p) => [p.pieceId, p])), [masterPieces]);
  const ownedById = useMemo(() => new Map(ownedPieces.map((p) => [p.pieceId, p])), [ownedPieces]);
  const localMetadataById = useMemo(() => new Map(localMetadata.map((m) => [m.pieceId, m])), [localMetadata]);
  const mergedInfoById = useMemo(() => {
    const map = new Map<string, MergedPieceInfo>();
    for (const master of masterPieces) {
      map.set(master.pieceId, mergePieceInfo(master, localMetadataById.get(master.pieceId)));
    }
    return map;
  }, [masterPieces, localMetadataById]);
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
    mergedInfoById,
    refreshOwnedPieces,
    refreshLatestScan,
    refreshLocalMetadata,
    upsertOwnedPiece,
    deleteOwnedPiece,
    upsertLocalMetadata,
    resetAllData,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
