import type { DetectedCell, LearnedFeature, RecognitionResult } from "../domain/types";
import { defaultGridConfigFor, type GridConfig } from "./gridDetection";
import { judgeConfidence, rankCandidates } from "./matching";
import { cellKey, detectScrollOverlap, type OverlapInputCell } from "./overlapDetection";
import type { ImageProcessedResponse, ProcessedCell } from "../workers/recognitionWorker";

/** iPhone Safariのメモリ制限を考慮し、長辺をこの値までに縮小してから処理する */
const MAX_IMAGE_DIMENSION = 1600;

export interface PipelineImageInput {
  imageIndex: number;
  file: File;
}

export interface PipelineProgress {
  imageIndex: number;
  totalImages: number;
  stage: "loading" | "detecting" | "matching" | "done";
}

export interface PipelineOutput {
  results: RecognitionResult[];
  overlapDuplicateCount: number;
  cancelled: boolean;
}

export interface RunPipelineOptions {
  images: PipelineImageInput[];
  gridConfig?: GridConfig;
  learnedFeatures: LearnedFeature[];
  onProgress?: (p: PipelineProgress) => void;
  signal?: AbortSignal;
}

async function loadDownscaledBitmap(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: "medium",
  });
  bitmap.close();
  return resized;
}

function processedCellToDetectedCell(imageIndex: number, cell: ProcessedCell): DetectedCell {
  const canvas = document.createElement("canvas");
  canvas.width = cell.thumbWidth;
  canvas.height = cell.thumbHeight;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(cell.thumbData), cell.thumbWidth, cell.thumbHeight);
  ctx.putImageData(imageData, 0, 0);
  return {
    cellIndex: imageIndex * 1000 + cell.index,
    row: cell.row,
    col: cell.col,
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
    pHash: cell.pHash,
    dHash: cell.dHash,
    aHash: cell.aHash,
    colorHistogram: cell.colorHistogram,
    thumbnailDataUrl: canvas.toDataURL("image/png"),
    partial: cell.partial,
  };
}

function runOneImage(
  worker: Worker,
  imageIndex: number,
  bitmap: ImageBitmap,
  gridConfig: GridConfig,
): Promise<ImageProcessedResponse> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === "imageProcessed" && data.imageIndex === imageIndex) {
        worker.removeEventListener("message", handleMessage);
        resolve(data as ImageProcessedResponse);
      } else if (data.type === "error" && data.imageIndex === imageIndex) {
        worker.removeEventListener("message", handleMessage);
        reject(new Error(data.message));
      }
    };
    worker.addEventListener("message", handleMessage);
    worker.postMessage({ type: "processImage", imageIndex, bitmap, gridConfig }, [bitmap]);
  });
}

/**
 * 複数スクリーンショットを取り込み、グリッド検出 → 特徴量抽出 → 候補照合 →
 * スクロール重複除外までを行う。認識モデル自体は端末内で学習した特徴量のみを使い、
 * 外部への画像送信は一切行わない。
 */
export async function runRecognitionPipeline(options: RunPipelineOptions): Promise<PipelineOutput> {
  const { images, learnedFeatures, onProgress, signal } = options;
  const worker = new Worker(new URL("../workers/recognitionWorker.ts", import.meta.url), { type: "module" });

  try {
    const allProcessed: { imageIndex: number; cells: ProcessedCell[] }[] = [];

    for (const img of images) {
      if (signal?.aborted) return { results: [], overlapDuplicateCount: 0, cancelled: true };
      onProgress?.({ imageIndex: img.imageIndex, totalImages: images.length, stage: "loading" });
      const bitmap = await loadDownscaledBitmap(img.file);
      if (signal?.aborted) {
        bitmap.close();
        return { results: [], overlapDuplicateCount: 0, cancelled: true };
      }
      onProgress?.({ imageIndex: img.imageIndex, totalImages: images.length, stage: "detecting" });
      // gridConfigが指定されない場合は、この画像サイズに合わせた比率ベースの既定値を使う
      // （固定5x5等へはフォールバックしない）
      const gridConfig = options.gridConfig ?? defaultGridConfigFor(bitmap.width, bitmap.height);
      const processed = await runOneImage(worker, img.imageIndex, bitmap, gridConfig);
      allProcessed.push({ imageIndex: img.imageIndex, cells: processed.cells });
    }

    onProgress?.({ imageIndex: images.length - 1, totalImages: images.length, stage: "matching" });

    // スクロール重複判定は画像をまたいだセル同士の比較で行う
    const overlapInputCells: OverlapInputCell[] = allProcessed.flatMap((p) =>
      p.cells.map((c) => ({ imageIndex: p.imageIndex, row: c.row, col: c.col, pHash: c.pHash })),
    );
    const overlap = detectScrollOverlap(overlapInputCells);

    const results: RecognitionResult[] = [];
    for (const p of allProcessed) {
      for (const cell of p.cells) {
        const detectedCell = processedCellToDetectedCell(p.imageIndex, cell);
        const isOverlap = overlap.duplicateCellKeys.has(cellKey(p.imageIndex, cell.row, cell.col));
        const candidates = rankCandidates(cell, learnedFeatures);
        const judged = judgeConfidence(candidates);
        // 画面端で一部だけ表示されたセルは、識別に十分な情報がないため自動確定しない
        const reviewStatus = cell.partial && judged.reviewStatus === "auto_confirmed" ? "needs_review" : judged.reviewStatus;
        results.push({
          cell: detectedCell,
          candidates: candidates.slice(0, 5).map((c) => ({ pieceId: c.pieceId, score: c.score, source: "learned" })),
          confidence: judged.confidence,
          reviewStatus,
          isOverlapDuplicate: isOverlap,
          assignedPieceId: reviewStatus === "auto_confirmed" ? candidates[0].pieceId : null,
          quantity: 1,
        });
      }
    }

    onProgress?.({ imageIndex: images.length - 1, totalImages: images.length, stage: "done" });

    return {
      results,
      overlapDuplicateCount: overlap.duplicateCellKeys.size,
      cancelled: false,
    };
  } finally {
    worker.terminate();
  }
}
