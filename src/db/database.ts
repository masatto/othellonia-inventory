import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  OwnedPiece,
  LearnedFeature,
  ScanHistoryRecord,
  AppMeta,
  GridCalibration,
  LocalPieceMetadata,
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
}

const DB_NAME = "othellonia-inventory";
const DB_VERSION = 3;

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
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
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

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ["ownedPieces", "learnedFeatures", "scanHistory", "meta", "localPieceMetadata"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("ownedPieces").clear(),
    tx.objectStore("learnedFeatures").clear(),
    tx.objectStore("scanHistory").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("localPieceMetadata").clear(),
  ]);
  await tx.done;
}
