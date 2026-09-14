import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runRecognitionPipeline, type PipelineProgress } from "../recognition/pipeline";
import { computeFullImageHash } from "../recognition/fullImageHash";
import { getAllLearnedFeatures, getAllScanHistory } from "../db/database";
import { usePendingScan } from "../state/PendingScanContext";
import { hammingDistance } from "../recognition/imageHash";

interface SelectedImage {
  file: File;
  previewUrl: string;
  hash: string | null;
  isDuplicateOfPrevious: boolean;
}

export function ImportPage() {
  const navigate = useNavigate();
  const { setPendingScan } = usePendingScan();
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      images.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileSelect(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const previousHistory = await getAllScanHistory();
    const previousHashes = previousHistory.flatMap((h) => h.images.map((i) => i.imageHash));

    const next: SelectedImage[] = [];
    for (const file of files) {
      let hash: string | null = null;
      let isDuplicate = false;
      try {
        hash = await computeFullImageHash(file);
        isDuplicate = previousHashes.some((h) => hammingDistance(h, hash!) <= 4);
      } catch {
        hash = null;
      }
      next.push({ file, previewUrl: URL.createObjectURL(file), hash, isDuplicateOfPrevious: isDuplicate });
    }
    setImages((prev) => [...prev, ...next]);
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[idx].previewUrl);
      copy.splice(idx, 1);
      return copy;
    });
  }

  async function startRecognition() {
    if (images.length === 0) return;
    setProcessing(true);
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const learnedFeatures = await getAllLearnedFeatures();
      const output = await runRecognitionPipeline({
        images: images.map((img, idx) => ({ imageIndex: idx, file: img.file })),
        learnedFeatures,
        signal: controller.signal,
        onProgress: setProgress,
      });

      if (output.cancelled) {
        setProcessing(false);
        return;
      }

      const scanId = `scan_${Date.now()}`;
      setPendingScan({
        scanId,
        createdAt: new Date().toISOString(),
        results: output.results,
        overlapDuplicateCount: output.overlapDuplicateCount,
        imageHashes: images.map((i) => i.hash ?? ""),
      });
      navigate("/review");
    } catch (e) {
      alert(`認識中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessing(false);
      abortRef.current = null;
    }
  }

  function cancelRecognition() {
    abortRef.current?.abort();
  }

  return (
    <div className="screen">
      <h1>画像取り込み</h1>
      <p className="tag tag-success">この画面で選ぶ画像は端末外へ送信されません（すべて端末内で処理）</p>

      <div className="card">
        <label className="btn btn-primary btn-block" style={{ marginBottom: 0 }}>
          写真ライブラリから選択（複数可）
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={processing}
          />
        </label>
      </div>

      {images.length > 0 && (
        <div className="card">
          <h2>選択した画像（{images.length}件）</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {images.map((img, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <img src={img.previewUrl} alt="" className="piece-thumb" style={{ width: 72, height: 72 }} />
                {img.isDuplicateOfPrevious && (
                  <span
                    className="tag tag-warning"
                    style={{ position: "absolute", bottom: -6, left: 0, fontSize: 10 }}
                  >
                    再登録?
                  </span>
                )}
                {!processing && (
                  <button
                    className="btn"
                    onClick={() => removeImage(idx)}
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      minHeight: 24,
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: "50%",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {images.some((i) => i.isDuplicateOfPrevious) && (
            <p className="muted" style={{ color: "var(--warning)" }}>
              過去に取り込んだ画像と似ています。同じスクリーンショットを重複して登録しようとしていないか確認してください。
            </p>
          )}
        </div>
      )}

      {processing && (
        <div className="card">
          <h2>処理状況</h2>
          <p className="muted">
            {progress
              ? `画像 ${progress.imageIndex + 1}/${progress.totalImages} - ${stageLabel(progress.stage)}`
              : "準備中..."}
          </p>
          <button className="btn btn-danger btn-block" onClick={cancelRecognition}>
            キャンセル
          </button>
        </div>
      )}

      {!processing && (
        <button className="btn btn-primary btn-block" disabled={images.length === 0} onClick={startRecognition}>
          認識開始
        </button>
      )}
    </div>
  );
}

function stageLabel(stage: PipelineProgress["stage"]): string {
  switch (stage) {
    case "loading":
      return "画像読み込み中";
    case "detecting":
      return "駒アイコン検出中";
    case "matching":
      return "候補照合中";
    case "done":
      return "完了";
  }
}
