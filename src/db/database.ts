import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  OwnedPiece,
  LearnedFeature,
  ScanHistoryRecord,
  AppMeta,
  GridCalibration,
  LocalPieceMetadata,
  LocalPieceRecord,
  PieceMaster,
} from "../domain/types";
import {
  ACTIVE_MASTER_SLOT_KEY,
  MASTER_DATA_VERSION_KEY,
  MASTER_GENERATED_AT_KEY,
  MASTER_IMPORTED_AT_KEY,
  MASTER_PIECE_COUNT_KEY,
  MASTER_SCHEMA_VERSION_KEY,
} from "../domain/types";

interface OthelloniaDB extends DBSchema {
  ownedPieces: {
    key: string; // pieceId
    value: OwnedPiece;
    indexes: { "by-status": string };
  };
  learnedFeatures: {
    key: string; // id
    value: LearnedFeature;
    indexes: { "by-piece": string };
  };
  scanHistory: {
    key: string; // scanId
    value: ScanHistoryRecord;
  };
  meta: {
    key: string;
    value: AppMeta;
  };
  gridCalibrations: {
    key: string; // `${screenWidth}x${screenHeight}`
    value: GridCalibration;
  };
  localPieceMetadata: {
    key: string; // pieceId
    value: LocalPieceMetadata;
  };
  localPieces: {
    key: string; // pieceId ("local-"接頭辞)
    value: LocalPieceRecord;
  };
  masterPiecesA: {
    key: string; // pieceId
    value: PieceMaster;
    indexes: { "by-baseName": string; "by-attribute": string };
  };
  masterPiecesB: {
    key: string; // pieceId
    value: PieceMaster;
    indexes: { "by-baseName": string; "by-attribute": string };
  };
}

const DB_NAME = "othellonia-inventory";
const DB_VERSION = 5;

export type MasterSlot = "A" | "B";

let dbPromise: Promise<IDBPDatabase<OthelloniaDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OthelloniaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OthelloniaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("ownedPieces")) {
          const store = db.createObjectStore("ownedPieces", { keyPath: "pieceId" });
          store.createIndex("by-status", "ownedStatus");
        }
        if (!db.objectStoreNames.contains("learnedFeatures")) {
          const store = db.createObjectStore("learnedFeatures", { keyPath: "id" });
          store.createIndex("by-piece", "pieceId");
        }
        if (!db.objectStoreNames.contains("scanHistory")) {
          db.createObjectStore("scanHistory", { keyPath: "scanId" });
        }
        if (!db.objectStoreNames.contains("gridCalibrations")) {
          db.createObjectStore("gridCalibrations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("localPieceMetadata")) {
          db.createObjectStore("localPieceMetadata", { keyPath: "pieceId" });
        }
        if (!db.objectStoreNames.contains("localPieces")) {
          db.createObjectStore("localPieces", { keyPath: "pieceId" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("masterPiecesA")) {
          const store = db.createObjectStore("masterPiecesA", { keyPath: "pieceId" });
          store.createIndex("by-baseName", "baseName");
          store.createIndex("by-attribute", "attribute");
        }
        if (!db.objectStoreNames.contains("masterPiecesB")) {
          const store = db.createObjectStore("masterPiecesB", { keyPath: "pieceId" });
          store.createIndex("by-baseName", "baseName");
          store.createIndex("by-attribute", "attribute");
        }
      },
    });
  }
  return dbPromise;
}

/** テスト等でDBインスタンスをリセットするために使用する */
export function resetDbForTests(): void {
  dbPromise = null;
}

export async function getAllOwnedPieces(): Promise<OwnedPiece[]> {
  const db = await getDb();
  return db.getAll("ownedPieces");
}

export async function putOwnedPiece(piece: OwnedPiece): Promise<void> {
  const db = await getDb();
  await db.put("ownedPieces", piece);
}

export async function deleteOwnedPiece(pieceId: string): Promise<void> {
  const db = await getDb();
  await db.delete("ownedPieces", pieceId);
}

export async function getOwnedPiece(pieceId: string): Promise<OwnedPiece | undefined> {
  const db = await getDb();
  return db.get("ownedPieces", pieceId);
}

export async function getAllLearnedFeatures(): Promise<LearnedFeature[]> {
  const db = await getDb();
  return db.getAll("learnedFeatures");
}

export async function addLearnedFeature(feature: LearnedFeature): Promise<void> {
  const db = await getDb();
  await db.put("learnedFeatures", feature);
}

export async function deleteLearnedFeaturesForPiece(pieceId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("learnedFeatures", "readwrite");
  const idx = tx.store.index("by-piece");
  for await (const cursor of idx.iterate(pieceId)) {
    await cursor.delete();
  }
  await tx.done;
}

export async function putScanHistory(record: ScanHistoryRecord): Promise<void> {
  const db = await getDb();
  await db.put("scanHistory", record);
}

export async function getAllScanHistory(): Promise<ScanHistoryRecord[]> {
  const db = await getDb();
  const all = await db.getAll("scanHistory");
  return all.sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : -1));
}

export async function getLatestScanHistory(): Promise<ScanHistoryRecord | undefined> {
  const all = await getAllScanHistory();
  return all[0];
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDb();
  const rec = await db.get("meta", key);
  return rec?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put("meta", { key, value });
}

export function gridCalibrationId(width: number, height: number): string {
  return `${width}x${height}`;
}

export async function getGridCalibration(width: number, height: number): Promise<GridCalibration | undefined> {
  const db = await getDb();
  return db.get("gridCalibrations", gridCalibrationId(width, height));
}

export async function saveGridCalibration(calibration: GridCalibration): Promise<void> {
  const db = await getDb();
  await db.put("gridCalibrations", calibration);
}

export async function getAllLocalPieceMetadata(): Promise<LocalPieceMetadata[]> {
  const db = await getDb();
  return db.getAll("localPieceMetadata");
}

export async function getLocalPieceMetadata(pieceId: string): Promise<LocalPieceMetadata | undefined> {
  const db = await getDb();
  return db.get("localPieceMetadata", pieceId);
}

export async function putLocalPieceMetadata(metadata: LocalPieceMetadata): Promise<void> {
  const db = await getDb();
  await db.put("localPieceMetadata", metadata);
}

export async function deleteLocalPieceMetadata(pieceId: string): Promise<void> {
  const db = await getDb();
  await db.delete("localPieceMetadata", pieceId);
}

export async function getAllLocalPieces(): Promise<LocalPieceRecord[]> {
  const db = await getDb();
  return db.getAll("localPieces");
}

export async function getLocalPiece(pieceId: string): Promise<LocalPieceRecord | undefined> {
  const db = await getDb();
  return db.get("localPieces", pieceId);
}

export async function putLocalPiece(record: LocalPieceRecord): Promise<void> {
  const db = await getDb();
  await db.put("localPieces", record);
}

export async function deleteLocalPiece(pieceId: string): Promise<void> {
  const db = await getDb();
  await db.delete("localPieces", pieceId);
}

// ─────────────────────────────────────────────────────────────
// マスタ(masterPiecesA/B) — ユーザーが端末へインポートしたJSONの保存先。
// 2つのスロットを用意し、metaの"activeMasterSlot"で現在有効な方を指す。
// 差し替え時は非アクティブなスロットへ全件書き込み→検証してから
// ポインタを切り替えるため、途中で失敗しても現在有効なマスタは残る。
// ─────────────────────────────────────────────────────────────

async function getActiveMasterSlot(): Promise<MasterSlot> {
  const value = await getMeta(ACTIVE_MASTER_SLOT_KEY);
  return value === "B" ? "B" : "A";
}

function masterStoreName(slot: MasterSlot): "masterPiecesA" | "masterPiecesB" {
  return slot === "A" ? "masterPiecesA" : "masterPiecesB";
}

function otherMasterSlot(slot: MasterSlot): MasterSlot {
  return slot === "A" ? "B" : "A";
}

export async function getAllMasterPiecesFromDb(): Promise<PieceMaster[]> {
  const db = await getDb();
  const slot = await getActiveMasterSlot();
  return db.getAll(masterStoreName(slot));
}

export async function getMasterPieceFromDb(pieceId: string): Promise<PieceMaster | undefined> {
  const db = await getDb();
  const slot = await getActiveMasterSlot();
  return db.get(masterStoreName(slot), pieceId);
}

export interface MasterSwapResult {
  count: number;
}

/**
 * 非アクティブなスロットへ全件書き込み、書き込み件数を検証してから
 * 有効スロットを切り替える。例外発生時（QuotaExceededError等）は
 * ポインタが切り替わらないため、現在有効なマスタがそのまま維持される。
 */
export async function swapMasterPieces(
  pieces: PieceMaster[],
  mode: "replace" | "merge",
): Promise<MasterSwapResult> {
  const db = await getDb();
  const currentSlot = await getActiveMasterSlot();
  const targetSlot = otherMasterSlot(currentSlot);
  const targetStoreName = masterStoreName(targetSlot);
  const sourceStoreName = masterStoreName(currentSlot);

  const tx = db.transaction([targetStoreName, sourceStoreName], "readwrite");
  const targetStore = tx.objectStore(targetStoreName);
  const baseline = mode === "merge" ? await tx.objectStore(sourceStoreName).getAll() : [];
  await targetStore.clear();

  const puts: Promise<unknown>[] = [];
  for (const piece of baseline) puts.push(targetStore.put(piece));
  for (const piece of pieces) puts.push(targetStore.put(piece));
  await Promise.all(puts);
  const writtenCount = await targetStore.count();
  await tx.done;

  const expectedMinCount = Math.max(baseline.length, pieces.length);
  if (writtenCount < expectedMinCount) {
    throw new Error(`マスタの書き込み件数が不足しています（期待${expectedMinCount}件以上 / 実際${writtenCount}件）`);
  }

  await setMeta(ACTIVE_MASTER_SLOT_KEY, targetSlot);
  return { count: writtenCount };
}

/** マスタのみを削除する（所持駒・補完データ・仮登録駒には触れない） */
export async function clearMasterPiecesOnly(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["masterPiecesA", "masterPiecesB", "meta"], "readwrite");
  const metaStore = tx.objectStore("meta");
  await Promise.all([
    tx.objectStore("masterPiecesA").clear(),
    tx.objectStore("masterPiecesB").clear(),
    metaStore.delete(ACTIVE_MASTER_SLOT_KEY),
    metaStore.delete(MASTER_DATA_VERSION_KEY),
    metaStore.delete(MASTER_GENERATED_AT_KEY),
    metaStore.delete(MASTER_PIECE_COUNT_KEY),
    metaStore.delete(MASTER_IMPORTED_AT_KEY),
    metaStore.delete(MASTER_SCHEMA_VERSION_KEY),
  ]);
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    [
      "ownedPieces",
      "learnedFeatures",
      "scanHistory",
      "meta",
      "localPieceMetadata",
      "localPieces",
      "masterPiecesA",
      "masterPiecesB",
    ],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("ownedPieces").clear(),
    tx.objectStore("learnedFeatures").clear(),
    tx.objectStore("scanHistory").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("localPieceMetadata").clear(),
    tx.objectStore("localPieces").clear(),
    tx.objectStore("masterPiecesA").clear(),
    tx.objectStore("masterPiecesB").clear(),
  ]);
  await tx.done;
}
