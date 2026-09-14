/// <reference lib="webworker" />
import { extractFeatures } from "../recognition/imageHash";
import { computeCellRects, defaultGridConfigFor, isCellEmpty, type GridConfig } from "../recognition/gridDetection";

/**
 * 画像の重い処理（グリッド切り出し・特徴量計算）をUIスレッドから切り離すためのWorker。
 * 画像は端末内のOffscreenCanvasでのみ処理し、どこにも送信しない。
 */

export interface ProcessImageRequest {
  type: "processImage";
  imageIndex: number;
  bitmap: ImageBitmap;
  gridConfig: GridConfig;
}

export interface ProcessedCell {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pHash: string;
  dHash: string;
  aHash: string;
  colorHistogram: number[];
  thumbWidth: number;
  thumbHeight: number;
  thumbData: Uint8ClampedArray;
  partial: boolean;
}

export interface ImageProcessedResponse {
  type: "imageProcessed";
  imageIndex: number;
  imageWidth: number;
  imageHeight: number;
  cells: ProcessedCell[];
}

export interface ProgressResponse {
  type: "progress";
  imageIndex: number;
  processedCells: number;
  totalCells: number;
}

export interface ErrorResponse {
  type: "error";
  imageIndex: number;
  message: string;
}

type WorkerRequest = ProcessImageRequest;
type WorkerResponse = ImageProcessedResponse | ProgressResponse | ErrorResponse;

const THUMB_SIZE = 64;

function postResponse(msg: WorkerResponse, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "processImage") {
    try {
      processImage(msg);
    } catch (err) {
      postResponse({
        type: "error",
        imageIndex: msg.imageIndex,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

function processImage(msg: ProcessImageRequest) {
  const { bitmap, imageIndex, gridConfig } = msg;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas context を取得できませんでした");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const rects = computeCellRects(gridConfig ?? defaultGridConfigFor(canvas.width, canvas.height), canvas.width, canvas.height);
  const cells: ProcessedCell[] = [];
  const thumbCanvas = new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE);
  const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

  for (const rect of rects) {
    const rx = Math.max(0, Math.round(rect.x));
    const ry = Math.max(0, Math.round(rect.y));
    const rw = Math.min(canvas.width - rx, Math.round(rect.width));
    const rh = Math.min(canvas.height - ry, Math.round(rect.height));
    if (rw <= 0 || rh <= 0) continue;

    const imageData = ctx.getImageData(rx, ry, rw, rh);

    // 空セル（背景のみ、駒が存在しない）は認識対象から除外する
    if (!rect.partial && isCellEmpty(imageData)) {
      postResponse({ type: "progress", imageIndex, processedCells: cells.length, totalCells: rects.length });
      continue;
    }

    const features = extractFeatures(imageData);

    thumbCtx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    thumbCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, THUMB_SIZE, THUMB_SIZE);
    const thumbData = thumbCtx.getImageData(0, 0, THUMB_SIZE, THUMB_SIZE);

    cells.push({
      index: rect.index,
      row: rect.row,
      col: rect.col,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      pHash: features.pHash,
      dHash: features.dHash,
      aHash: features.aHash,
      colorHistogram: features.colorHistogram,
      thumbWidth: THUMB_SIZE,
      thumbHeight: THUMB_SIZE,
      thumbData: new Uint8ClampedArray(thumbData.data),
      partial: rect.partial,
    });

    postResponse({ type: "progress", imageIndex, processedCells: cells.length, totalCells: rects.length });
  }

  postResponse(
    { type: "imageProcessed", imageIndex, imageWidth: canvas.width, imageHeight: canvas.height, cells },
    cells.map((c) => c.thumbData.buffer),
  );
}
