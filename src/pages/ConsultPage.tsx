import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import {
  buildConsultDocument,
  buildConsultEntries,
  consultDocumentToJson,
  consultDocumentToMarkdown,
  type ConsultGoal,
} from "../backup/aiExport";
import { canUseWebShare, copyToClipboard, downloadTextFile, makeFile, shareFile } from "../backup/shareUtils";

const GOALS: ConsultGoal[] = [
  "手持ちでデッキを組みたい",
  "神単を改善したい",
  "魔デッキを改善したい",
  "速竜を組みたい",
  "育成優先順位を知りたい",
  "交換すべき駒を知りたい",
  "ガチャを引くべきか相談したい",
  "特定イベント用デッキを組みたい",
  "新しく入手した駒を評価してほしい",
  "自由入力",
];

export function ConsultPage() {
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get("pieceId");
  const { ownedPieces, masterById } = useAppData();
  const [goal, setGoal] = useState<ConsultGoal>("手持ちでデッキを組みたい");
  const [freeText, setFreeText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(
    preselected ? new Set([preselected]) : null,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const eligiblePieces = useMemo(
    () => ownedPieces.filter((p) => p.ownedStatus !== "unknown"),
    [ownedPieces],
  );

  const targetIds = selectedIds ? [...selectedIds] : null;

  const entries = useMemo(
    () => buildConsultEntries(ownedPieces, masterById, targetIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownedPieces, masterById, selectedIds],
  );

  const doc = useMemo(
    () => buildConsultDocument({ goal, freeText, targetPieceIds: targetIds }, entries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goal, freeText, entries],
  );

  const markdown = useMemo(() => consultDocumentToMarkdown(doc), [doc]);
  const json = useMemo(() => consultDocumentToJson(doc), [doc]);

  function toggleSelection(pieceId: string) {
    setSelectedIds((prev) => {
      const base = prev ?? new Set(eligiblePieces.map((p) => p.pieceId));
      const next = new Set(base);
      if (next.has(pieceId)) next.delete(pieceId);
      else next.add(pieceId);
      return next;
    });
  }

  const isSelected = (pieceId: string) => (selectedIds ? selectedIds.has(pieceId) : true);

  async function handleShare() {
    const file = makeFile("othellonia-consult.md", markdown, "text/markdown");
    if (canUseWebShare(file)) {
      try {
        await shareFile(file, "オセロニア相談データ");
        return;
      } catch {
        // ユーザーがキャンセルした場合など。コピー/保存にフォールバックする。
      }
    }
    alert("この端末は共有機能に対応していません。コピーまたはファイル保存をご利用ください。");
  }

  async function handleCopy() {
    await copyToClipboard(markdown);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="screen">
      <h1>AIに相談</h1>
      <p className="muted">
        ここで生成される内容は所持駒の名称・属性・所持数などの事実情報のみです。画像やマスター全件、
        アプリの内部ログは含みません。共有ボタンを押すまで外部へは送信されません。
      </p>

      <div className="card">
        <h2>相談したいこと</h2>
        {GOALS.map((g) => (
          <label key={g} style={{ display: "block", marginBottom: 6 }}>
            <input type="radio" name="goal" checked={goal === g} onChange={() => setGoal(g)} /> {g}
          </label>
        ))}
        {goal === "自由入力" && (
          <textarea
            placeholder="相談したい内容を入力してください"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
          />
        )}
      </div>

      <div className="card">
        <h2>相談対象の所持駒（{entries.length}件）</h2>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {eligiblePieces.map((p) => {
            const master = masterById.get(p.pieceId);
            if (!master) return null;
            return (
              <label key={p.pieceId} style={{ display: "block", marginBottom: 4 }}>
                <input type="checkbox" checked={isSelected(p.pieceId)} onChange={() => toggleSelection(p.pieceId)} />{" "}
                {master.fullName}（所持数 {p.quantity}）
              </label>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>プレビュー（Markdown）</h2>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            maxHeight: 300,
            overflowY: "auto",
            background: "var(--bg)",
            padding: 8,
            borderRadius: 8,
          }}
        >
          {markdown}
        </pre>
      </div>

      <button className="btn btn-primary btn-block" onClick={handleShare} style={{ marginBottom: 8 }}>
        📤 共有する（Web Share）
      </button>
      <button className="btn btn-block" onClick={handleCopy} style={{ marginBottom: 8 }}>
        {copyState === "copied" ? "コピーしました" : "📋 Markdownをコピー"}
      </button>
      <button
        className="btn btn-block"
        onClick={() => downloadTextFile("othellonia-consult.md", markdown, "text/markdown")}
        style={{ marginBottom: 8 }}
      >
        💾 Markdownファイルを保存
      </button>
      <button
        className="btn btn-block"
        onClick={() => downloadTextFile("othellonia-consult.json", json, "application/json")}
      >
        💾 JSONファイルを保存
      </button>
    </div>
  );
}
