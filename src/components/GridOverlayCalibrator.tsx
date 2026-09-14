import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { loadDownscaledBitmap } from "../recognition/imageLoading";

const PREVIEW_WIDTH = 340;

export interface GridOverlayCalibratorProps {
  file: File;
  initialConfig: GridConfig | null;
  onConfirm: (config: GridConfig, imageWidth: number, imageHeight: number) => void;
}

/**
 * +/-ボタンと数値入力を組み合わせたフィールド。
 * iPhone Safariのcontrolled input(type="number")では、編集中に毎回
 * 親のstate値でvalueを上書きすると「先頭に0が残る」「入力が確定しない」
 * といった不具合が起きやすいため、編集中はローカルの文字列stateのみを
 * 信頼し、フォーカスが外れた時にだけ正規化・確定する。
 */
function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const focused = useRef(false);
  const inputId = useId();

  useEffect(() => {
    if (!focused.current) setText(String(Math.round(value)));
  }, [value]);

  function commit(next: number) {
    onChange(next);
  }

  function step_(delta: number) {
    const next = Math.round(value) + delta;
    setText(String(next));
    commit(next);
  }

  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <button
          type="button"
          className="btn"
          style={{ minWidth: 44, padding: "8px 0" }}
          onClick={() => step_(-step)}
          aria-label={`${label}を減らす`}
        >
          −
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="-?[0-9]*"
          value={text}
          onFocus={(e) => {
            focused.current = true;
            e.target.select();
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // 数字と先頭のマイナス記号だけを許可する（先頭0の連続入力は許すが、確定時に正規化する）
            if (!/^-?[0-9]*$/.test(raw)) return;
            setText(raw);
            const parsed = Number(raw);
            if (raw !== "" && raw !== "-" && Number.isFinite(parsed)) {
              commit(parsed);
            }
          }}
          onBlur={() => {
            focused.current = false;
            const parsed = Number(text);
            const normalized = Number.isFinite(parsed) && text !== "" ? Math.round(parsed) : Math.round(value);
            setText(String(normalized));
            commit(normalized);
          }}
          style={{ textAlign: "center", flex: 1 }}
        />
        <button
          type="button"
          className="btn"
          style={{ minWidth: 44, padding: "8px 0" }}
          onClick={() => step_(step)}
          aria-label={`${label}を増やす`}
        >
          ＋
        </button>
      </div>
    </div>
  );
}

/**
 * 認識開始前に切り出し枠のオーバーレイを表示し、
 * ユーザーが開始位置・行間隔・列位置を微調整できるようにする画面（仕様書10章）。
 *
 * 実際の認識処理(pipeline.ts)と同じ縮小済み画像を使ってプレビュー・自動検出を行う。
 * ここで元画像をそのまま(縮小せず)扱うと、iPhone Safariでのメモリ負荷が大きくなり
 * 予期せずページが終了する場合があるうえ、キャリブレーションした座標が実際の
 * 認識時（縮小後の画像）とズレてしまうため、必ず loadDownscaledBitmap を使う。
 */
export function GridOverlayCalibrator({ file, initialConfig, onConfirm }: GridOverlayCalibratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [config, setConfig] = useState<GridConfig | null>(initialConfig);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bitmap = await loadDownscaledBitmap(file);
        if (cancelled) {
          bitmap.close();
          return;
        }
        setImageBitmap(bitmap);
        if (initialConfig) return;
        const saved = await getGridCalibration(bitmap.width, bitmap.height);
        if (cancelled) return;
        if (saved) {
          setConfig(calibrationToGridConfig(saved));
        } else {
          await runAutoDetect(bitmap);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
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

  function updateField(field: "gridTop" | "rowPitch" | "cellSize" | "navBarTop", value: number) {
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

  if (loadError) {
    return (
      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <p>画像の読み込みに失敗しました: {loadError}</p>
      </div>
    );
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
        緑色の枠が駒アイコンとして認識される範囲です。ずれている場合は下の＋／−ボタンか数値入力で調整してください（同じ画面サイズの端末では次回から保存した値が使われます）。
      </p>
      <canvas
        ref={canvasRef}
        style={{ width: PREVIEW_WIDTH, height: previewHeight, border: "1px solid var(--border)", borderRadius: 8 }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <NumberField label="開始位置（Y座標）" value={config.gridTop} step={5} onChange={(v) => updateField("gridTop", v)} />
        <NumberField label="行間隔" value={config.rowPitch} step={2} onChange={(v) => updateField("rowPitch", v)} />
        <NumberField
          label="切り出しサイズ（正方形の一辺）"
          value={config.cellSize}
          step={5}
          onChange={(v) => updateField("cellSize", v)}
        />
        <NumberField
          label="下部メニュー上端（これ以降は除外）"
          value={config.navBarTop}
          step={5}
          onChange={(v) => updateField("navBarTop", v)}
        />
        <div className="grid-2">
          {config.colCenters.map((c, i) => (
            <NumberField key={i} label={`列${i + 1}中心X`} value={c} step={5} onChange={(v) => updateColCenter(i, v)} />
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
