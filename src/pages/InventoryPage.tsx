import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { searchPiecesByName } from "../master/masterLoader";
import { getMissingFields } from "../enrichment/mergePieceInfo";
import type {
  EnrichmentAttribute,
  EnrichmentEvolutionType,
  OwnedPiece,
  OwnedStatus,
} from "../domain/types";

const ATTRIBUTES: EnrichmentAttribute[] = ["神", "魔", "竜"];
const EVOLUTIONS: EnrichmentEvolutionType[] = ["初期", "進化", "闘化", "神化", "真化", "覚醒"];

export function InventoryPage() {
  const navigate = useNavigate();
  const { masterPieces, mergedInfoById, ownedPieces, upsertOwnedPiece, deleteOwnedPiece } = useAppData();
  const [query, setQuery] = useState("");
  const [attrFilter, setAttrFilter] = useState<string>("");
  const [rarityFilter, setRarityFilter] = useState<string>("");
  const [evoFilter, setEvoFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");

  const rarityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const info of mergedInfoById.values()) {
      if (info.rarity) set.add(info.rarity);
    }
    return [...set].sort();
  }, [mergedInfoById]);

  const rows = useMemo(() => {
    return ownedPieces
      .map((owned) => ({ owned, info: mergedInfoById.get(owned.pieceId) }))
      .filter((r) => r.info)
      .filter((r) => {
        const info = r.info!;
        if (query && !info.fullName.toLowerCase().includes(query.toLowerCase())) return false;
        if (attrFilter && info.attribute !== attrFilter) return false;
        if (rarityFilter && info.rarity !== rarityFilter) return false;
        if (evoFilter && info.evolutionType !== evoFilter) return false;
        if (statusFilter && r.owned.ownedStatus !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (a.owned.updatedAt < b.owned.updatedAt ? 1 : -1));
  }, [ownedPieces, mergedInfoById, query, attrFilter, rarityFilter, evoFilter, statusFilter]);

  const addCandidates = useMemo(() => {
    if (!addOpen) return [];
    const owned = new Set(ownedPieces.map((o) => o.pieceId));
    return searchPiecesByName(masterPieces, addQuery)
      .filter((p) => !owned.has(p.pieceId))
      .slice(0, 20);
  }, [addOpen, addQuery, masterPieces, ownedPieces]);

  async function addManualPiece(pieceId: string) {
    const now = new Date().toISOString();
    await upsertOwnedPiece({
      pieceId,
      quantity: 1,
      skillLevel: null,
      ownedStatus: "confirmed",
      recognitionConfidence: null,
      confirmedByUser: true,
      firstDetectedAt: now,
      lastDetectedAt: now,
      updatedAt: now,
      memo: "手動追加",
    });
    setAddOpen(false);
    setAddQuery("");
  }

  async function save(patch: Partial<OwnedPiece>, base: OwnedPiece) {
    await upsertOwnedPiece({ ...base, ...patch, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="screen">
      <h1>所持駒一覧</h1>

      <div className="card">
        <input
          type="search"
          placeholder="名称で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={attrFilter} onChange={(e) => setAttrFilter(e.target.value)}>
            <option value="">属性: すべて</option>
            {ATTRIBUTES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
            <option value="">ランク: すべて</option>
            {rarityOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={evoFilter} onChange={(e) => setEvoFilter(e.target.value)}>
            <option value="">形態: すべて</option>
            {EVOLUTIONS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">状態: すべて</option>
            <option value="confirmed">確認済み</option>
            <option value="needs_review">要確認</option>
            <option value="unknown">不明</option>
            <option value="declared_only">過去申告のみ</option>
          </select>
        </div>
      </div>

      <button className="btn btn-block" onClick={() => navigate("/enrichment")} style={{ marginBottom: 8 }}>
        🔎 駒情報を補完（属性・ランク・スキル）
      </button>
      <button className="btn btn-block" onClick={() => setAddOpen((v) => !v)}>
        ＋ 駒を手動追加
      </button>
      {addOpen && (
        <div className="card">
          <input
            type="search"
            placeholder="追加する駒名を検索"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 8 }}>
            {addCandidates.map((p) => (
              <button
                key={p.pieceId}
                className="btn btn-block"
                style={{ justifyContent: "flex-start", marginBottom: 4 }}
                onClick={() => addManualPiece(p.pieceId)}
              >
                {p.fullName}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="muted">{rows.length} 件</p>

      {rows.map(({ owned, info }) => (
        <div key={owned.pieceId} className="card">
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === owned.pieceId ? null : owned.pieceId)}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{info!.fullName}</div>
              <div className="muted">
                {info!.attribute ?? "不明"} / {info!.rarity ?? "不明"} / {info!.evolutionType ?? "不明"} / 所持数{" "}
                {owned.quantity}
              </div>
              {getMissingFields(info!).length > 0 && <span className="tag tag-warning">情報未補完</span>}
            </div>
            <StatusTag status={owned.ownedStatus} />
          </div>

          {expanded === owned.pieceId && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <label>
                所持数
                <input
                  type="number"
                  min={0}
                  value={owned.quantity}
                  onChange={(e) => save({ quantity: Number(e.target.value) }, owned)}
                />
              </label>
              <label>
                スキルレベル
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={owned.skillLevel ?? ""}
                  onChange={(e) => save({ skillLevel: e.target.value ? Number(e.target.value) : null }, owned)}
                />
              </label>
              <label>
                確認状態
                <select value={owned.ownedStatus} onChange={(e) => save({ ownedStatus: e.target.value as OwnedStatus }, owned)}>
                  <option value="confirmed">確認済み</option>
                  <option value="needs_review">要確認</option>
                  <option value="unknown">不明</option>
                  <option value="declared_only">過去申告のみ</option>
                </select>
              </label>
              <label>
                メモ
                <textarea value={owned.memo} onChange={(e) => save({ memo: e.target.value }, owned)} rows={2} />
              </label>
              <div className="muted">最終更新: {new Date(owned.updatedAt).toLocaleString("ja-JP")}</div>
              <div className="muted">情報確認日: {info!.checkedAt ?? "未確認"}</div>
              {info!.sourceUrls.length > 0 && (
                <a href={info!.sourceUrls[0].url} target="_blank" rel="noreferrer">
                  出典ページを見る
                </a>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() => navigate(`/consult?pieceId=${encodeURIComponent(owned.pieceId)}`)}
                >
                  この駒でAI相談
                </button>
                <button className="btn" onClick={() => navigate(`/enrichment?pieceId=${encodeURIComponent(owned.pieceId)}`)}>
                  情報を補完
                </button>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (confirm(`${info!.fullName} を所持駒一覧から削除しますか？`)) {
                      await deleteOwnedPiece(owned.pieceId);
                    }
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusTag({ status }: { status: OwnedStatus }) {
  switch (status) {
    case "confirmed":
      return <span className="tag tag-success">確認済み</span>;
    case "needs_review":
      return <span className="tag tag-warning">要確認</span>;
    case "unknown":
      return <span className="tag tag-warning">不明</span>;
    case "declared_only":
      return <span className="tag">過去申告</span>;
  }
}
