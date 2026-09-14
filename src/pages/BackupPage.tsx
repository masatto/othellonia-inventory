import { useRef, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { createBackup, migrateBackup } from "../backup/backupSchema";
import { downloadTextFile } from "../backup/shareUtils";
import { putOwnedPiece, putLocalPieceMetadata, putLocalPiece } from "../db/database";

export function BackupPage() {
  const {
    ownedPieces,
    masterPieces,
    masterVersion,
    localMetadata,
    localPieces,
    refreshOwnedPieces,
    refreshLocalMetadata,
    refreshLocalPieces,
    importMaster,
    resetAllData,
  } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);

  function exportBackup(includeMaster: boolean) {
    const backup = createBackup(
      ownedPieces,
      masterVersion,
      localMetadata,
      localPieces,
      includeMaster ? masterPieces : undefined,
    );
    const suffix = includeMaster ? "full" : "user-data";
    downloadTextFile(
      `othellonia-inventory-backup-${suffix}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setLastExportedAt(backup.exportedAt);
    setMessage(includeMaster ? "完全バックアップ（マスタを含む）を保存しました。" : "ユーザーデータのみのバックアップを保存しました。");
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const {
        ownedPieces: restored,
        localPieceMetadata: restoredMetadata,
        localPieces: restoredLocalPieces,
        masterPieces: restoredMaster,
        masterVersionAtExport,
        exportedAt,
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

      let masterMessage = "";
      if (restoredMaster.length > 0) {
        // 完全バックアップにマスタが含まれていた場合のみ、安全な差し替え(swap)経由で復元する。
        // 失敗した場合(容量不足等)は例外が伝播し、現在有効なマスタは変更されない。
        const outcome = await importMaster(
          {
            schemaVersion: 1,
            game: "逆転オセロニア",
            masterVersion: masterVersionAtExport,
            generatedAt: exportedAt,
            pieces: restoredMaster,
          },
          "replace",
        );
        masterMessage = ` / マスタ${outcome.count}件`;
      }

      setMessage(
        `復元しました（所持駒${restored.length}件 / 補完情報${restoredMetadata.length}件 / 仮登録駒${restoredLocalPieces.length}件${masterMessage}）。${warnings.length > 0 ? "警告: " + warnings.join(" / ") : ""}`,
      );
    } catch (e) {
      setMessage(`復元に失敗しました: ${e instanceof Error ? e.message : String(e)}（既存のデータは変更されていません）`);
    }
  }

  async function handleDeleteAll() {
    if (!confirm("端末内のすべてのデータ（所持駒・認識履歴・マスタ・補完データを含む）を削除します。よろしいですか？\n事前にバックアップを保存することを推奨します。")) {
      return;
    }
    await resetAllData();
    setMessage("すべてのデータを削除しました。");
  }

  return (
    <div className="screen">
      <h1>データのバックアップ・復元</h1>
      <p className="muted">
        バックアップにはユーザーの元スクリーンショットや攻略サイトの画像は含まれません。選択したファイルの内容はこの端末内で処理され、外部には送信されません。
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
        <button className="btn btn-primary btn-block" onClick={() => exportBackup(false)}>
          💾 ユーザーデータのみエクスポート
        </button>
        <p className="muted" style={{ marginTop: 4 }}>
          所持駒・個人メモ・補完データ・仮登録駒のみ（インポート済みマスタは含みません）。
        </p>
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => exportBackup(true)}>
          🗄 完全バックアップを作成（マスタを含む）
        </button>
        <p className="muted" style={{ marginTop: 4 }}>
          上記に加え、インポート済みマスタ（{masterPieces.length}件）も含みます。ファイルサイズが大きくなります。
        </p>
        {lastExportedAt && <p className="muted">前回のエクスポート: {new Date(lastExportedAt).toLocaleString("ja-JP")}</p>}
        <p className="muted">
          対象件数: 所持駒 {ownedPieces.length} 件 / 補完情報 {localMetadata.length} 件 / 仮登録駒{" "}
          {localPieces.length} 件 / マスターバージョン: {masterVersion || "未インポート"}
        </p>
      </div>

      <div className="card">
        <h2>復元</h2>
        <p className="muted">
          JSONバックアップファイルから復元します。内容を検証し、件数を表示します。復元に失敗した場合、既存のデータは変更されません。現在のデータは上書き・マージされます。
        </p>
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
        <p className="muted">端末内のすべてのデータ（所持駒・認識履歴・学習済み特徴量・マスタ・補完データ）を削除します。元に戻せません。</p>
        <button className="btn btn-danger btn-block" onClick={handleDeleteAll}>
          🗑 全データを削除する
        </button>
      </div>
    </div>
  );
}
