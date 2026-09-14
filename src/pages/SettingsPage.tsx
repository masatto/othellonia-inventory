import { useEffect, useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { buildMasterImportPreview, type MasterImportMode, type MasterImportPreview } from "../master/masterImport";
import { downloadTextFile } from "../backup/shareUtils";

interface StorageEstimateState {
  usage: number;
  quota: number;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "未取得";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function describeImportError(e: unknown): string {
  if (e instanceof DOMException && e.name === "QuotaExceededError") {
    return "端末のストレージ容量が不足しているため、マスタを保存できませんでした。不要なデータを削除するか、より件数の少ないファイルをお試しください。既存のマスタは変更されていません。";
  }
  return `インポートに失敗しました: ${e instanceof Error ? e.message : String(e)}`;
}

const SAMPLE_MASTER_JSON = {
  schemaVersion: 1,
  game: "逆転オセロニア",
  masterVersion: "sample-1",
  generatedAt: "2026-09-14T00:00:00.000Z",
  pieces: [
    {
      pieceId: "example-001",
      fullName: "［異名例］サンプル駒",
      baseName: "サンプル駒",
      epithet: "異名例",
      attribute: "神",
      rarity: "S+",
      evolutionType: "進化",
      skillName: null,
      skillData: [],
      comboSkillName: null,
      comboSkillData: [],
      sourceUrl: null,
      sourceUpdatedAt: null,
      featureDataVersion: 1,
      masterVersion: "sample-1",
    },
  ],
};

export function SettingsPage() {
  const { masterMeta, importMaster, clearMasterOnly } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<MasterImportPreview | null>(null);
  const [mode, setMode] = useState<MasterImportMode>("replace");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [storageSupported, setStorageSupported] = useState(true);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof navigator === "undefined" || !("storage" in navigator)) {
        setStorageSupported(false);
        return;
      }
      try {
        if (navigator.storage.persisted) {
          setPersisted(await navigator.storage.persisted());
        }
        if (navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          setStorageEstimate({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
        }
      } catch {
        setStorageSupported(false);
      }
    })();
  }, []);

  async function handleFileSelect(file: File) {
    setMessage(null);
    setErrorMessage(null);
    const text = await file.text();
    setPreview(buildMasterImportPreview(text));
  }

  async function handleConfirmImport() {
    if (!preview?.ok || !preview.data || importing) return;
    setImporting(true);
    setErrorMessage(null);
    try {
      const outcome = await importMaster(preview.data, mode);
      setMessage(
        `マスタを${mode === "replace" ? "差し替え" : "統合"}しました（登録件数: ${outcome.count}件 / バージョン: ${outcome.masterVersion}）。`,
      );
      setPreview(null);
    } catch (e) {
      setErrorMessage(describeImportError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteMasterOnly() {
    if (masterMeta.pieceCount === 0) {
      alert("削除するマスタがありません。");
      return;
    }
    if (
      !confirm(
        `マスタ${masterMeta.pieceCount}件を削除します。所持駒・個人メモ・補完データ・仮登録駒は削除されません。よろしいですか？`,
      )
    ) {
      return;
    }
    await clearMasterOnly();
    setMessage("マスタを削除しました。");
  }

  async function handleRequestPersist() {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      setMessage("この端末・ブラウザは永続化リクエストに対応していません。");
      return;
    }
    const granted = await navigator.storage.persist();
    setPersisted(granted);
    setMessage(granted ? "ストレージの永続化が許可されました。" : "永続化は許可されませんでした。定期的なバックアップを推奨します。");
  }

  function handleDownloadSample() {
    downloadTextFile("othellonia-master-sample.json", JSON.stringify(SAMPLE_MASTER_JSON, null, 2), "application/json");
  }

  return (
    <div className="screen">
      <h1>設定</h1>

      <div className="card" role="status">
        <p>選択したファイルはこの端末内で処理され、外部には送信されません。</p>
      </div>

      {message && (
        <div className="card" role="status">
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="card" style={{ borderColor: "var(--danger)" }} role="alert">
          {errorMessage}
        </div>
      )}

      <div className="card">
        <h2>現在のマスタ情報</h2>
        <p className="muted">登録件数: {masterMeta.pieceCount} 件</p>
        <p className="muted">マスタバージョン: {masterMeta.masterVersion ?? "未インポート"}</p>
        <p className="muted">生成日時: {formatDateTime(masterMeta.generatedAt)}</p>
        <p className="muted">インポート日時: {formatDateTime(masterMeta.importedAt)}</p>
        {masterMeta.pieceCount === 0 && (
          <p style={{ color: "var(--warning)" }}>
            マスタが未登録です。駒の名称・属性・スキル等が「不明」のまま表示されます。下記からマスタJSONを読み込んでください。
          </p>
        )}
      </div>

      <div className="card">
        <h2>マスタファイルを読み込む</h2>
        <p className="muted">
          お手元のJSONファイルを選択してください。件数・バージョン・エラー内容を確認してからインポートを実行します。
          ファイルを選択しただけでは、現在のマスタは変更されません。
        </p>
        <button className="btn btn-block" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          📂 マスタファイルを選択
        </button>
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={handleDownloadSample}>
          💾 サンプルJSONをダウンロード
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />

        {preview && !preview.ok && (
          <div className="card" style={{ borderColor: "var(--danger)", marginTop: 8 }}>
            <h3>検証エラー（{preview.errors.length}件）</h3>
            <p className="muted">1件でも重大なエラーがある場合、インポートは中止されます。不正な駒だけを無視することはありません。</p>
            <ul>
              {preview.errors.slice(0, 50).map((err, i) => (
                <li key={i} className="muted">
                  {err.index !== null ? `${err.index}番目` : "(全体)"}
                  {err.pieceId ? ` / pieceId: ${err.pieceId}` : ""} / {err.field}: {err.message}
                </li>
              ))}
            </ul>
            {preview.errors.length > 50 && <p className="muted">他{preview.errors.length - 50}件のエラーがあります。</p>}
          </div>
        )}

        {preview?.ok && (
          <div className="card" style={{ marginTop: 8 }}>
            <h3>プレビュー</h3>
            <p className="muted">件数: {preview.pieceCount} 件</p>
            <p className="muted">マスタバージョン: {preview.masterVersion}</p>
            <p className="muted">生成日時: {formatDateTime(preview.generatedAt)}</p>
            <p className="muted">schemaVersion: {preview.schemaVersion}</p>

            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                差し替え（replace）
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" name="import-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
                統合（merge）
              </label>
            </div>
            <p className="muted">
              {mode === "replace"
                ? "全件マスタだけを差し替えます。所持駒・個人の補正情報は維持されます。"
                : "同一pieceIdは更新し、新規の駒は追加します（既存の駒は削除されません）。"}
            </p>

            <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={handleConfirmImport} disabled={importing}>
              {importing ? "インポート中…" : "インポートを実行する"}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <h2>マスタだけを削除</h2>
        <p className="muted">
          マスタ（{masterMeta.pieceCount}件）だけを削除します。所持駒・所持数・個人メモ・補完データ・仮登録駒は削除されません。
        </p>
        <button className="btn btn-danger btn-block" onClick={handleDeleteMasterOnly}>
          🗑 マスタだけを削除する
        </button>
      </div>

      <div className="card">
        <h2>ストレージ使用量</h2>
        {!storageSupported && <p className="muted">この端末・ブラウザではストレージ情報を取得できません。</p>}
        {storageSupported && (
          <>
            <p className="muted">
              永続化: {persisted === null ? "確認中…" : persisted ? "許可されています" : "許可されていません"}
            </p>
            {storageEstimate && (
              <p className="muted">
                使用量: {formatBytes(storageEstimate.usage)} / 上限目安: {formatBytes(storageEstimate.quota)}
              </p>
            )}
            {persisted === false && (
              <p style={{ color: "var(--warning)" }}>
                永続化が許可されていない場合、端末の空き容量が少ない時にデータが自動的に削除されることがあります。
                永続化をリクエストするか、定期的にバックアップを保存してください。
              </p>
            )}
            <button className="btn btn-block" onClick={handleRequestPersist}>
              ストレージの永続化をリクエストする
            </button>
          </>
        )}
      </div>
    </div>
  );
}
