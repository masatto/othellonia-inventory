import { useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { createBackup, migrateBackup } from "../backup/backupSchema";
import { downloadTextFile } from "../backup/shareUtils";
import { putOwnedPiece, putLocalPieceMetadata, putLocalPiece } from "../db/database";

export function BackupPage() {
  const {
    ownedPieces,
    masterVersion,
    localMetadata,
    localPieces,
    refreshOwnedPieces,
    refreshLocalMetadata,
    refreshLocalPieces,
    resetAllData,
  } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);

  function handleExport() {
    const backup = createBackup(ownedPieces, masterVersion, localMetadata, localPieces);
    downloadTextFile(
      `othellonia-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setLastExportedAt(backup.exportedAt);
    setMessage("バックアップファイルを保存しました。");
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const {
        ownedPieces: restored,
        localPieceMetadata: restoredMetadata,
        localPieces: restoredLocalPieces,
        warnings,
      } = migrateBackup(raw);
      for (const piece of restored) {
        await putOwnedPiece(piece);
      }
      for (const metadata of restoredMetadata) {
        await putLocalPieceMetadata(metadata);
      }
      for (const record of restoredLocalPieces) {
        await putLocalPiece(record);
      }
      await refreshOwnedPieces();
      await refreshLocalMetadata();
      await refreshLocalPieces();
      setMessage(
        `復元しました（所持駒${restored.length}件 / 補完情報${restoredMetadata.length}件 / 仮登録駒${restoredLocalPieces.length}件）。${warnings.length > 0 ? "警告: " + warnings.join(" / ") : ""}`,
      );
    } catch (e) {
      setMessage(`復元に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteAll() {
    if (!confirm("端末内のすべての所持駒データ・認識履歴を削除します。よろしいですか？\n事前にバックアップを保存することを推奨します。")) {
      return;
    }
    await resetAllData();
    setMessage("すべてのデータを削除しました。");
  }

  return (
    <div className="screen">
      <h1>データのバックアップ・復元</h1>
      <p className="muted">
        バックアップにはユーザーの元スクリーンショットや攻略サイトの画像は含まれません。駒ID・名称・所持数・確認状態などの事実情報のみを保存します。
      </p>

      {message && (
        <div className="card" role="status">
          {message}
        </div>
      )}

      <div className="card">
        <h2>バックアップ</h2>
        <p className="muted">
          Safariのサイトデータ削除や機種変更、PWAの再インストールに備えて、定期的にバックアップを保存してください。
        </p>
        <button className="btn btn-primary btn-block" onClick={handleExport}>
          💾 JSONバックアップを保存
        </button>
        {lastExportedAt && <p className="muted">前回のエクスポート: {new Date(lastExportedAt).toLocaleString("ja-JP")}</p>}
        <p className="muted">
          対象件数: 所持駒 {ownedPieces.length} 件 / 補完情報 {localMetadata.length} 件 / 仮登録駒{" "}
          {localPieces.length} 件 / マスターバージョン: {masterVersion}
        </p>
      </div>

      <div className="card">
        <h2>復元</h2>
        <p className="muted">JSONバックアップファイルから所持駒データを復元します。現在のデータは上書き・マージされます。</p>
        <button className="btn btn-block" onClick={() => fileInputRef.current?.click()}>
          📂 バックアップファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <h2>全データ削除</h2>
        <p className="muted">端末内の所持駒データ・認識履歴・学習済み特徴量をすべて削除します。元に戻せません。</p>
        <button className="btn btn-danger btn-block" onClick={handleDeleteAll}>
          🗑 全データを削除する
        </button>
      </div>
    </div>
  );
}
