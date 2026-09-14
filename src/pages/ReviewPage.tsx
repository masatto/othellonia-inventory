import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePendingScan } from "../state/PendingScanContext";
import { useAppData } from "../state/AppDataContext";
import { searchPiecesByName } from "../master/masterLoader";
import { addLearnedFeature, getAllLearnedFeatures, putScanHistory } from "../db/database";
import type { OwnedPiece, ReviewStatus, ScanHistoryRecord } from "../domain/types";
import { getLatestScanHistory } from "../db/database";

const MAX_LEARNED_SAMPLES_PER_PIECE = 5;

function statusTag(status: ReviewStatus) {
  switch (status) {
    case "auto_confirmed":
      return <span className="tag tag-success">自動確定</span>;
    case "user_confirmed":
      return <span className="tag tag-success">確定済み</span>;
    case "needs_review":
      return <span className="tag tag-warning">要確認</span>;
    case "unmatched":
      return <span className="tag tag-warning">不明</span>;
    case "excluded":
      return <span className="tag">対象外</span>;
  }
}

export function ReviewPage() {
  const navigate = useNavigate();
  const { pendingScan, setPendingScan, updateResult } = usePendingScan();
  const { masterPieces, masterById, upsertOwnedPiece, ownedById, refreshLatestScan } = useAppData();
  const [searchOpenFor, setSearchOpenFor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pendingScan) return;
    (async () => {
      const latest = await getLatestScanHistory();
      if (latest && latest.reviewStatus === "pending") {
        setPendingScan({
          scanId: latest.scanId,
          createdAt: latest.scannedAt,
          results: latest.results,
          overlapDuplicateCount: latest.overlapInformation.totalOverlapCells,
          imageHashes: latest.images.map((i) => i.imageHash),
        });
      }
    })();
  }, [pendingScan, setPendingScan]);

  const visibleResults = useMemo(
    () => (pendingScan?.results ?? []).filter((r) => !r.isOverlapDuplicate),
    [pendingScan],
  );

  const summary = useMemo(() => {
    let autoConfirmed = 0;
    let needsReview = 0;
    let unresolved = 0;
    for (const r of visibleResults) {
      if (r.reviewStatus === "auto_confirmed" || r.reviewStatus === "user_confirmed") autoConfirmed++;
      else if (r.assignedPieceId) needsReview++;
      else unresolved++;
    }
    return { autoConfirmed, needsReview, unresolved };
  }, [visibleResults]);

  if (!pendingScan) {
    return (
      <div className="screen">
        <h1>認識結果</h1>
        <p className="muted">確認中のスキャンはありません。画像取り込みから開始してください。</p>
        <button className="btn btn-primary btn-block" onClick={() => navigate("/import")}>
          画像取り込みへ
        </button>
      </div>
    );
  }

  function assignPiece(cellIndex: number, pieceId: string) {
    updateResult(cellIndex, { assignedPieceId: pieceId, reviewStatus: "user_confirmed" });
    setSearchOpenFor(null);
    setSearchQuery("");
  }

  function excludeCell(cellIndex: number) {
    updateResult(cellIndex, { reviewStatus: "excluded", assignedPieceId: null });
  }

  function markUnknown(cellIndex: number) {
    updateResult(cellIndex, { reviewStatus: "unmatched", assignedPieceId: null });
  }

  function changeQuantity(cellIndex: number, quantity: number) {
    updateResult(cellIndex, { quantity: Math.max(1, quantity) });
  }

  async function saveAll() {
    if (!pendingScan) return;
    setSaving(true);
    try {
      const resolved = visibleResults.filter(
        (r) => r.assignedPieceId && (r.reviewStatus === "auto_confirmed" || r.reviewStatus === "user_confirmed"),
      );

      const quantityByPiece = new Map<string, number>();
      for (const r of resolved) {
        quantityByPiece.set(r.assignedPieceId!, (quantityByPiece.get(r.assignedPieceId!) ?? 0) + r.quantity);
      }

      const now = new Date().toISOString();
      for (const [pieceId, quantity] of quantityByPiece) {
        const existing = ownedById.get(pieceId);
        const piece: OwnedPiece = {
          pieceId,
          quantity,
          skillLevel: existing?.skillLevel ?? null,
          ownedStatus: "confirmed",
          recognitionConfidence: resolved.find((r) => r.assignedPieceId === pieceId)?.confidence ?? null,
          confirmedByUser: true,
          firstDetectedAt: existing?.firstDetectedAt ?? now,
          lastDetectedAt: now,
          updatedAt: now,
          memo: existing?.memo ?? "",
        };
        await upsertOwnedPiece(piece);
      }

      // ユーザーが確定した駒については、端末内学習用の特徴量として蓄積する
      // （攻略サイトの画像は一切使わず、ユーザー自身が確認したアイコンのみを学習する）
      const learned = await getAllLearnedFeatures();
      const countByPiece = new Map<string, number>();
      for (const f of learned) countByPiece.set(f.pieceId, (countByPiece.get(f.pieceId) ?? 0) + 1);

      for (const r of resolved) {
        const pieceId = r.assignedPieceId!;
        const count = countByPiece.get(pieceId) ?? 0;
        if (count >= MAX_LEARNED_SAMPLES_PER_PIECE) continue;
        await addLearnedFeature({
          id: `${pieceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          pieceId,
          pHash: r.cell.pHash,
          dHash: r.cell.dHash,
          aHash: r.cell.aHash,
          colorHistogram: r.cell.colorHistogram,
          createdAt: now,
          thumbnailDataUrl: r.cell.thumbnailDataUrl,
        });
        countByPiece.set(pieceId, count + 1);
      }

      const stillPending = visibleResults.some(
        (r) => !(r.assignedPieceId && (r.reviewStatus === "auto_confirmed" || r.reviewStatus === "user_confirmed")) &&
          r.reviewStatus !== "excluded",
      );

      const record: ScanHistoryRecord = {
        scanId: pendingScan.scanId,
        images: pendingScan.imageHashes.map((h, idx) => ({
          imageIndex: idx,
          imageHash: h,
          width: 0,
          height: 0,
          capturedAt: null,
        })),
        scannedAt: pendingScan.createdAt,
        detectedCellCount: pendingScan.results.length,
        results: pendingScan.results,
        overlapInformation: { totalOverlapCells: pendingScan.overlapDuplicateCount },
        reviewStatus: stillPending ? "pending" : "completed",
      };
      await putScanHistory(record);
      await refreshLatestScan();

      if (!stillPending) {
        setPendingScan(null);
        navigate("/inventory");
      } else {
        alert("未対応の項目が残っています。続けて確認するか、後でホーム画面から再開してください。");
      }
    } finally {
      setSaving(false);
    }
  }

  const searchResults =
    searchOpenFor !== null ? searchPiecesByName(masterPieces, searchQuery).slice(0, 20) : [];

  return (
    <div className="screen">
      <h1>認識結果</h1>
      <div className="card">
        <div className="muted">
          自動確定 {summary.autoConfirmed} / 要確認 {summary.needsReview} / 未対応 {summary.unresolved}
          {pendingScan.overlapDuplicateCount > 0 && (
            <> / スクロール重複除外 {pendingScan.overlapDuplicateCount}</>
          )}
        </div>
      </div>

      {visibleResults.map((r) => (
        <div key={r.cell.cellIndex} className="card">
          <div style={{ display: "flex", gap: 12 }}>
            <img src={r.cell.thumbnailDataUrl} alt="" className="piece-thumb" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {statusTag(r.reviewStatus)}
                <span className="muted">信頼度 {(r.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {r.assignedPieceId ? masterById.get(r.assignedPieceId)?.fullName ?? r.assignedPieceId : "未確定"}
              </div>

              {r.reviewStatus !== "auto_confirmed" && r.reviewStatus !== "user_confirmed" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {r.candidates.slice(0, 5).map((c) => (
                    <button
                      key={c.pieceId}
                      className="btn"
                      style={{ minHeight: 36, padding: "6px 10px", fontSize: 13 }}
                      onClick={() => assignPiece(r.cell.cellIndex, c.pieceId)}
                    >
                      {masterById.get(c.pieceId)?.fullName ?? c.pieceId} ({(c.score * 100).toFixed(0)}%)
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <label className="muted">
                  所持数
                  <input
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) => changeQuantity(r.cell.cellIndex, Number(e.target.value))}
                    style={{ width: 60, marginLeft: 6, display: "inline-block" }}
                  />
                </label>
                <button className="btn" onClick={() => setSearchOpenFor(r.cell.cellIndex)}>
                  名前で検索
                </button>
                <button className="btn" onClick={() => markUnknown(r.cell.cellIndex)}>
                  不明のまま保留
                </button>
                <button className="btn" onClick={() => excludeCell(r.cell.cellIndex)}>
                  登録対象から外す
                </button>
              </div>

              {searchOpenFor === r.cell.cellIndex && (
                <div className="card" style={{ marginTop: 8 }}>
                  <input
                    type="search"
                    placeholder="駒名を入力"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
                    {searchResults.map((p) => (
                      <button
                        key={p.pieceId}
                        className="btn btn-block"
                        style={{ justifyContent: "flex-start", marginBottom: 4 }}
                        onClick={() => assignPiece(r.cell.cellIndex, p.pieceId)}
                      >
                        {p.fullName}
                      </button>
                    ))}
                    {searchQuery && searchResults.length === 0 && <p className="muted">該当する駒がありません</p>}
                  </div>
                  <button className="btn btn-block" onClick={() => setSearchOpenFor(null)}>
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <button className="btn btn-primary btn-block" onClick={saveAll} disabled={saving}>
        {saving ? "保存中..." : "所持駒として保存"}
      </button>
    </div>
  );
}
