import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useAppData } from "../state/AppDataContext";
import { getMissingFields } from "../enrichment/mergePieceInfo";

export function HomePage() {
  const { loading, error, ownedPieces, needsReviewCount, latestScan, masterVersion, mergedInfoById } = useAppData();

  const totalOwned = ownedPieces.reduce((sum, p) => sum + p.quantity, 0);
  const distinctOwned = ownedPieces.filter((p) => p.ownedStatus !== "unknown").length;
  const missingInfoCount = useMemo(
    () =>
      ownedPieces.filter((p) => {
        const info = mergedInfoById.get(p.pieceId);
        return info && getMissingFields(info).length > 0;
      }).length,
    [ownedPieces, mergedInfoById],
  );

  return (
    <div className="screen">
      <h1>オセロニア所持駒管理</h1>
      <p className="muted">
        すべてのデータはこの端末（Safari）の中だけに保存されます。スクリーンショットや所持駒データは
        GitHubや外部サーバーへ送信されません。
      </p>

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <strong>読み込みエラー:</strong> {error}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="muted">所持駒（種類）</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? "…" : distinctOwned}</div>
        </div>
        <div className="card">
          <div className="muted">所持駒（総数）</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? "…" : totalOwned}</div>
        </div>
      </div>

      <div className="card">
        <div className="muted">要確認件数</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: needsReviewCount > 0 ? "var(--warning)" : undefined }}>
          {needsReviewCount} 件
        </div>
        {needsReviewCount > 0 && (
          <Link className="btn btn-primary btn-block" to="/review" style={{ marginTop: 8 }}>
            要確認の駒を確認する
          </Link>
        )}
      </div>

      <div className="card">
        <div className="muted">属性・スキル等が未補完の駒</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: missingInfoCount > 0 ? "var(--warning)" : undefined }}>
          {missingInfoCount} 件
        </div>
        <Link className="btn btn-block" to="/enrichment" style={{ marginTop: 8 }}>
          🔎 駒情報を補完する
        </Link>
      </div>

      <div className="card">
        <h2>前回の認識結果</h2>
        {latestScan ? (
          <div className="muted">
            {new Date(latestScan.scannedAt).toLocaleString("ja-JP")} / 検出セル数: {latestScan.detectedCellCount} /
            重複除外: {latestScan.overlapInformation.totalOverlapCells}
          </div>
        ) : (
          <div className="muted">まだ認識を実行していません</div>
        )}
      </div>

      <Link className="btn btn-primary btn-block" to="/import" style={{ marginBottom: 12 }}>
        📷 スクリーンショットを追加
      </Link>
      <Link className="btn btn-block" to="/inventory" style={{ marginBottom: 12 }}>
        🗂 所持駒一覧を見る
      </Link>
      <Link className="btn btn-block" to="/consult" style={{ marginBottom: 12 }}>
        💬 AIに相談する
      </Link>
      <Link className="btn btn-block" to="/backup" style={{ marginBottom: 12 }}>
        💾 データのバックアップ・復元
      </Link>

      <div className="card">
        <div className="muted">駒マスターバージョン: {masterVersion || "-"}</div>
      </div>
    </div>
  );
}
