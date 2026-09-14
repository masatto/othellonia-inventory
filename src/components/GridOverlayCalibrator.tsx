import { useEffect, useMemo, useRef, useState } from "react";
import { toGrayscale } from "../recognition/imageHash";
import {
  anchorsToGridConfig,
  computeCellRects,
  defaultGridConfigFor,
  detectGridAnchors,
  type GridConfig,
} from "../recognition/gridDetection";
import { calibrationToGridConfig } from "../recognition/gridCalibration";
import { getGridCalibration } from "../db/database";

const PREVIEW_WIDTH = 340;

export interface GridOverlayCalibratorProps {
  file: File;
  initialConfig: GridConfig | null;
  onConfirm: (config: GridConfig, imageWidth: number, imageHeight: number) => void;
}

/**
 * 認識開始前に切り出し枠のオーバーレイを表示し、
 * ユーザーが開始位置・行間隔・列位置を微調整できるようにする画面（仕様書10章）。
 */
export function GridOverlayCalibrator({ file, initialConfig, onConfirm }: GridOverlayCalibratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [config, setConfig] = useState<GridConfig | null>(initialConfig);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bitmap = await createImageBitmap(file);
      if (cancelled) return;
      setImageBitmap(bitmap);
      if (initialConfig) return;
      const saved = await getGridCalibration(bitmap.width, bitmap.height);
      if (cancelled) return;
      if (saved) {
        setConfig(calibrationToGridConfig(saved));
      } else {
        await runAutoDetect(bitmap);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  async function runAutoDetect(bitmap: ImageBitmap) {
    setAutoDetecting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = toGrayscale(imageData);
      try {
        const anchors = detectGridAnchors(gray);
        setConfig(anchorsToGridConfig(anchors));
      } catch {
        setConfig(defaultGridConfigFor(bitmap.width, bitmap.height));
      }
    } finally {
      setAutoDetecting(false);
    }
  }

  const scale = imageBitmap ? PREVIEW_WIDTH / imageBitmap.width : 1;
  const previewHeight = imageBitmap ? Math.round(imageBitmap.height * scale) : 0;

  const cellRects = useMemo(() => {
    if (!config || !imageBitmap) return [];
    return computeCellRects(config, imageBitmap.width, imageBitmap.height);
  }, [config, imageBitmap]);

  useEffect(() => {
    if (!imageBitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = previewHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(imageBitmap, 0, 0, PREVIEW_WIDTH, previewHeight);
    ctx.lineWidth = 2;
    for (const rect of cellRects) {
      ctx.strokeStyle = rect.partial ? "orange" : "lime";
      ctx.strokeRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
    }
    if (config) {
      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.moveTo(0, config.navBarTop * scale);
      ctx.lineTo(PREVIEW_WIDTH, config.navBarTop * scale);
      ctx.stroke();
    }
  }, [cellRects, imageBitmap, previewHeight, scale, config]);

  function updateField(field: keyof GridConfig, value: number) {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateColCenter(index: number, value: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      const colCenters = [...prev.colCenters];
      colCenters[index] = value;
      return { ...prev, colCenters };
    });
  }

  if (!imageBitmap || !config) {
    return (
      <div className="card">
        <p className="muted">{autoDetecting ? "グリッドを自動検出中..." : "画像を読み込んでいます..."}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>切り出し枠の確認・調整</h2>
      <p className="muted">
        緑色の枠が駒アイコンとして認識される範囲です。ずれている場合は下の数値を調整してください（同じ画面サイズの端末では次回から保存した値が使われます）。
      </p>
      <canvas
        ref={canvasRef}
        style={{ width: PREVIEW_WIDTH, height: previewHeight, border: "1px solid var(--border)", borderRadius: 8 }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <label>
          開始位置（Y座標）
          <input
            type="number"
            value={Math.round(config.gridTop)}
            onChange={(e) => updateField("gridTop", Number(e.target.value))}
          />
        </label>
        <label>
          行間隔
          <input
            type="number"
            value={Math.round(config.rowPitch)}
            onChange={(e) => updateField("rowPitch", Number(e.target.value))}
          />
        </label>
        <label>
          切り出しサイズ（正方形の一辺）
          <input
            type="number"
            value={Math.round(config.cellSize)}
            onChange={(e) => updateField("cellSize", Number(e.target.value))}
          />
        </label>
        <label>
          下部メニュー上端（これ以降は除外）
          <input
            type="number"
            value={Math.round(config.navBarTop)}
            onChange={(e) => updateField("navBarTop", Number(e.target.value))}
          />
        </label>
        <div className="grid-2">
          {config.colCenters.map((c, i) => (
            <label key={i}>
              列{i + 1}中心X
              <input type="number" value={Math.round(c)} onChange={(e) => updateColCenter(i, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </div>

      <button
        className="btn"
        style={{ marginTop: 12 }}
        onClick={() => imageBitmap && runAutoDetect(imageBitmap)}
        disabled={autoDetecting}
      >
        自動検出をやり直す
      </button>
      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 8 }}
        onClick={() => onConfirm(config, imageBitmap.width, imageBitmap.height)}
      >
        この設定で認識開始
      </button>
    </div>
  );
}
