import type { PieceMaster } from "../domain/types";

export interface MasterManifest {
  masterVersion: string;
  featureDataVersion: number;
  generatedAt: string;
  totalPieces: number;
  files: { attribute: string; filename: string; count: number }[];
}

/** GitHub Pagesのサブパスでも正しく解決できるよう import.meta.env.BASE_URL を使う */
function masterUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}master/${path}`.replace(/\/{2,}/g, "/").replace(":/", "://");
}

let manifestCache: MasterManifest | null = null;
let piecesCache: PieceMaster[] | null = null;

export async function fetchManifest(): Promise<MasterManifest> {
  if (manifestCache) return manifestCache;
  const res = await fetch(masterUrl("manifest.json"));
  if (!res.ok) throw new Error(`マスターマニフェストの取得に失敗しました: ${res.status}`);
  manifestCache = await res.json();
  return manifestCache!;
}

/** 全属性の駒マスターを読み込む（属性ごとの遅延読み込みが必要な規模になったら分割呼び出しに変更する） */
export async function fetchAllPieceMaster(): Promise<PieceMaster[]> {
  if (piecesCache) return piecesCache;
  const manifest = await fetchManifest();
  const chunks = await Promise.all(
    manifest.files.map(async (f) => {
      const res = await fetch(masterUrl(f.filename));
      if (!res.ok) throw new Error(`マスターデータの取得に失敗しました: ${f.filename}`);
      return (await res.json()) as PieceMaster[];
    }),
  );
  piecesCache = chunks.flat();
  return piecesCache;
}

export async function fetchOwnedSeed(): Promise<
  { pieceId: string; quantity: number; ownedStatus: string; memo: string }[]
> {
  const res = await fetch(masterUrl("owned-seed.json"));
  if (!res.ok) return [];
  return res.json();
}

export function clearMasterCache(): void {
  manifestCache = null;
  piecesCache = null;
}

export function findPieceById(pieces: PieceMaster[], pieceId: string): PieceMaster | undefined {
  return pieces.find((p) => p.pieceId === pieceId);
}

export function searchPiecesByName(pieces: PieceMaster[], query: string): PieceMaster[] {
  const q = query.trim().toLowerCase();
  if (!q) return pieces;
  return pieces.filter(
    (p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.baseName.toLowerCase().includes(q) ||
      (p.epithet?.toLowerCase().includes(q) ?? false),
  );
}
