import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePendingScan } from "../state/PendingScanContext";
import { useAppData } from "../state/AppDataContext";
import { searchPiecesByName } from "../master/masterLoader";
import { addLearnedFeature, getAllLearnedFeatures, putScanHistory } from "../db/database";
import type { OwnedPiece, ReviewStatus, ScanHistoryRecord } from "../domain/types";
import { getLatestScanHistory } from "../db/database";
import { generateLocalPieceId } from "../domain/localPieceId";

const MAX_LEARNED_SAMPLES_PER_PIECE = 5;
/** この類似度以上の画像候補がある場合、新規仮登録の前に警告を表示する */
const SIMILAR_IMAGE_WARNING_THRESHOLD = 0.6;

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
  const { masterPieces, masterById, mergedInfoById, localPieces, upsertOwnedPiece, upsertLocalPiece, ownedById, refreshLatestScan } =
    useAppData();
  const [searchOpenFor, setSearchOpenFor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [provisionalName, setProvisionalName] = useState("");
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

  /** 画像特徴量が既存の学習済み駒と似ている場合、仮登録前に警告して確認を取る */
  function confirmDespiteSimilarImage(cellIndex: number): boolean {
    const result = visibleResults.find((r) => r.cell.cellIndex === cellIndex);
    const top = result?.candidates[0];
    if (!top || top.score < SIMILAR_IMAGE_WARNING_THRESHOLD) return true;
    const candidateName = mergedInfoById.get(top.pieceId)?.fullName ?? masterById.get(top.pieceId)?.fullName ?? top.pieceId;
    return confirm(
      `画像が「${candidateName}」と類似しています（類似度${Math.round(top.score * 100)}%）。同じ駒の可能性があります。\n` +
        "それでも新しい駒として仮登録しますか？",
    );
  }

  async function learnCellFeature(cellIndex: number, pieceId: string): Promise<void> {
    const result = visibleResults.find((r) => r.cell.cellIndex === cellIndex);
    if (!result) return;
    await addLearnedFeature({
      id: `${pieceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      pieceId,
      pHash: result.cell.pHash,
      dHash: result.cell.dHash,
      aHash: result.cell.aHash,
      colorHistogram: result.cell.colorHistogram,
      createdAt: new Date().toISOString(),
      thumbnailDataUrl: result.cell.thumbnailDataUrl,
    });
  }

  /** マスタに無い駒を、ユーザー入力の仮称付きで新しい内部pieceIdとして仮登録する */
  async function registerProvisionalPiece(cellIndex: number) {
    const name = provisionalName.trim();
    if (!name) {
      alert("仮の名称を入力してください。名称が分からない場合は「不明駒として保存」を使ってください。");
      return;
    }
    if (!confirmDespiteSimilarImage(cellIndex)) return;

    const pieceId = generateLocalPieceId();
    const now = new Date().toISOString();
    await upsertLocalPiece({ pieceId, provisionalName: name, nameStatus: "provisional", createdAt: now, updatedAt: now });
    await learnCellFeature(cellIndex, pieceId);
    assignPiece(cellIndex, pieceId);
    setProvisionalName("");
  }

  /** 名称が分からない駒を、名称未確認のまま新しい内部pieceIdとして保存する */
  async function registerUnknownNamePiece(cellIndex: number) {
    if (!confirmDespiteSimilarImage(cellIndex)) return;

    const pieceId = generateLocalPieceId();
    const now = new Date().toISOString();
    await upsertLocalPiece({ pieceId, provisionalName: null, nameStatus: "unknown", createdAt: now, updatedAt: now });
    await learnCellFeature(cellIndex, pieceId);
    assignPiece(cellIndex, pieceId);
    setProvisionalName("");
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

  // 仮登録前の重複防止: 検索キーワードに近い名称の駒（マスタ・仮登録済みの両方）を警告表示する
  const similarLocalPieces =
    searchOpenFor !== null && provisionalName.trim()
      ? localPieces
          .filter((p) => p.provisionalName?.toLowerCase().includes(provisionalName.trim().toLowerCase()))
          .slice(0, 5)
      : [];
  const similarMasterPieces =
    searchOpenFor !== null && provisionalName.trim()
      ? searchPiecesByName(masterPieces, provisionalName).slice(0, 5)
      : [];

  function pieceDisplayName(pieceId: string): string {
    return mergedInfoById.get(pieceId)?.fullName ?? masterById.get(pieceId)?.fullName ?? pieceId;
  }

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
                {r.cell.partial && <span className="tag tag-warning">画面端で一部のみ表示</span>}
                <span className="muted">信頼度 {(r.confidence * 100).toFixed(0)}%</span>
              </div>
              {r.cell.partial && (
                <p className="muted" style={{ color: "var(--warning)" }}>
                  この駒はスクリーンショットの下端で一部しか写っていません。別の画像で全体が写っている場合はそちらを優先してください。
                </p>
              )}
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {r.assignedPieceId ? pieceDisplayName(r.assignedPieceId) : "未確定"}
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
                      {pieceDisplayName(c.pieceId)} ({(c.score * 100).toFixed(0)}%)
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

                  <div className="card" style={{ marginTop: 8, borderColor: "var(--warning)" }}>
                    <p className="muted">見つからない場合は、新しい駒として仮登録できます。</p>
                    <input
                      type="text"
                      placeholder="仮の名称を入力（後でAI調査により正式名称に更新できます）"
                      value={provisionalName}
                      onChange={(e) => setProvisionalName(e.target.value)}
                    />
                    {(similarMasterPieces.length > 0 || similarLocalPieces.length > 0) && (
                      <div style={{ marginTop: 6 }}>
                        <p style={{ color: "var(--warning)" }}>
                          類似の名称の駒が見つかりました。同じ駒でないか確認してください：
                        </p>
                        {similarMasterPieces.map((p) => (
                          <button
                            key={p.pieceId}
                            className="btn btn-block"
                            style={{ justifyContent: "flex-start", marginBottom: 4 }}
                            onClick={() => assignPiece(r.cell.cellIndex, p.pieceId)}
                          >
                            {p.fullName}（マスタ登録駒）
                          </button>
                        ))}
                        {similarLocalPieces.map((p) => (
                          <button
                            key={p.pieceId}
                            className="btn btn-block"
                            style={{ justifyContent: "flex-start", marginBottom: 4 }}
                            onClick={() => assignPiece(r.cell.cellIndex, p.pieceId)}
                          >
                            {p.provisionalName}（仮登録済み）
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      className="btn btn-block"
                      style={{ marginTop: 6 }}
                      onClick={() => registerProvisionalPiece(r.cell.cellIndex)}
                    >
                      ＋ 新しい駒として仮登録
                    </button>
                    <button
                      className="btn btn-block"
                      style={{ marginTop: 6 }}
                      onClick={() => registerUnknownNamePiece(r.cell.cellIndex)}
                    >
                      名称不明のまま「不明駒」として保存
                    </button>
                  </div>

                  <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => setSearchOpenFor(null)}>
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
