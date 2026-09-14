import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { getMissingFields, MISSING_FIELD_LABELS } from "../enrichment/mergePieceInfo";
import { buildInvestigationPrompt, splitIntoBatches, estimatePromptLength, type PromptTargetPiece } from "../enrichment/promptGeneration";
import { parseExtractedJson } from "../enrichment/jsonExtraction";
import { validateAiResponseSchema } from "../enrichment/aiResponseSchema";
import { buildAllPieceDiffs, buildLocalMetadataFromAiPiece, type PieceDiff } from "../enrichment/diff";
import { copyToClipboard, downloadTextFile } from "../backup/shareUtils";
import type { OwnedStatus } from "../domain/types";

type FilterMode = "missing" | "complete" | "needs_review" | "declared_only" | "all";
type Step = "list" | "prompt" | "import" | "diff";

export function EnrichmentPage() {
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get("pieceId");
  const { ownedPieces, mergedInfoById, upsertLocalMetadata } = useAppData();

  const [step, setStep] = useState<Step>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("missing");
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected ? [preselected] : []));
  const [promptBatches, setPromptBatches] = useState<string[]>([]);
  const [copiedBatch, setCopiedBatch] = useState<number | null>(null);

  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string[] | null>(null);
  const [diffs, setDiffs] = useState<PieceDiff[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>("");
  const [approved, setApproved] = useState<Set<string>>(new Set());
  /** 名称候補の採用は他フィールドの承認と独立して、必ず個別に確認・選択する */
  const [nameAccepted, setNameAccepted] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      ownedPieces
        .map((owned) => ({ owned, info: mergedInfoById.get(owned.pieceId) }))
        .filter((r): r is { owned: (typeof ownedPieces)[number]; info: NonNullable<typeof r.info> } => !!r.info),
    [ownedPieces, mergedInfoById],
  );

  const counts = useMemo(() => {
    let missing = 0;
    let complete = 0;
    let needsReview = 0;
    for (const r of rows) {
      if (getMissingFields(r.info).length > 0) missing++;
      else if (r.info.hasLocalMetadata) complete++;
      if (r.owned.ownedStatus === "needs_review") needsReview++;
    }
    return { missing, complete, needsReview };
  }, [rows]);

  const filteredRows = useMemo(() => {
    switch (filterMode) {
      case "missing":
        return rows.filter((r) => getMissingFields(r.info).length > 0);
      case "complete":
        return rows.filter((r) => r.info.hasLocalMetadata && getMissingFields(r.info).length === 0);
      case "needs_review":
        return rows.filter((r) => r.owned.ownedStatus === "needs_review");
      case "declared_only":
        return rows.filter((r) => r.owned.ownedStatus === "declared_only");
      case "all":
        return rows;
    }
  }, [rows, filterMode]);

  function toggle(pieceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) next.delete(pieceId);
      else next.add(pieceId);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filteredRows.map((r) => r.owned.pieceId)));
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function selectOnlyMissing() {
    setSelected(new Set(rows.filter((r) => getMissingFields(r.info).length > 0).map((r) => r.owned.pieceId)));
  }
  function excludeDeclaredOnly() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (r.owned.ownedStatus === "declared_only") next.delete(r.owned.pieceId);
      }
      return next;
    });
  }

  function generatePrompt() {
    const targets: PromptTargetPiece[] = rows
      .filter((r) => selected.has(r.owned.pieceId))
      .map((r) => ({ pieceId: r.owned.pieceId, fullName: r.info.fullName, existing: r.info }));
    const batches = splitIntoBatches(targets).map((batch) => buildInvestigationPrompt(batch));
    setPromptBatches(batches);
    setStep("prompt");
  }

  async function copyBatch(index: number) {
    await copyToClipboard(promptBatches[index]);
    setCopiedBatch(index);
    setTimeout(() => setCopiedBatch(null), 2000);
  }

  function runValidation(text: string) {
    setImportError(null);
    const parsed = parseExtractedJson(text);
    if (!parsed.ok) {
      setImportError([parsed.error ?? "JSONの解析に失敗しました"]);
      return;
    }
    const validated = validateAiResponseSchema(parsed.data);
    if (!validated.ok) {
      setImportError(validated.errors);
      return;
    }
    // 駒の同一性はpieceIdでのみ判定する（マスタ登録駒・仮登録駒の両方を対象に含める）
    const knownPieces = new Map(Array.from(mergedInfoById.entries()).map(([id, info]) => [id, info.fullName]));
    const nextDiffs = buildAllPieceDiffs(validated.data.pieces, mergedInfoById, knownPieces);
    setDiffs(nextDiffs);
    setCheckedAt(validated.data.checkedAt);
    // 出典なし等が無く、かつ変更のある駒だけを初期選択する（名称候補の採用は含めない）
    setApproved(new Set(nextDiffs.filter((d) => d.bulkEligible && d.hasAnyChange).map((d) => d.pieceId)));
    setNameAccepted(new Set());
    setStep("diff");
  }

  async function handleFileSelect(file: File) {
    const text = await file.text();
    runValidation(text);
  }

  function toggleApproved(pieceId: string) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) next.delete(pieceId);
      else next.add(pieceId);
      return next;
    });
  }

  /** 正式名称・バージョンの採用は、他フィールドの承認とは別に必ず個別に選択する */
  function toggleNameAccepted(pieceId: string) {
    setNameAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) next.delete(pieceId);
      else next.add(pieceId);
      return next;
    });
  }

  function bulkApplyEligible() {
    setApproved(new Set(diffs.filter((d) => d.bulkEligible && d.hasAnyChange).map((d) => d.pieceId)));
    // 名称候補の一括採用は行わない（正式名称の確定は必ず個別確認を経る）
  }

  async function saveApproved() {
    let count = 0;
    for (const diff of diffs) {
      if (!approved.has(diff.pieceId)) continue;
      const metadata = buildLocalMetadataFromAiPiece(
        diff,
        checkedAt || new Date().toISOString().slice(0, 10),
        nameAccepted.has(diff.pieceId),
      );
      await upsertLocalMetadata(metadata);
      count++;
    }
    setSaveMessage(`${count}件の補完情報を保存しました。`);
    setDiffs([]);
    setApproved(new Set());
    setNameAccepted(new Set());
    setImportText("");
    setStep("list");
  }

  if (step === "prompt") {
    return (
      <div className="screen">
        <h1>AI調査用プロンプト</h1>
        <p className="muted">選択した{selected.size}件の駒だけを対象にしています。画像・所持数などは含まれません。</p>
        {promptBatches.map((batch, i) => (
          <div className="card" key={i}>
            <h2>
              バッチ {i + 1} / {promptBatches.length}（約{estimatePromptLength(batch)}文字）
            </h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                maxHeight: 260,
                overflowY: "auto",
                background: "var(--bg)",
                padding: 8,
                borderRadius: 8,
              }}
            >
              {batch}
            </pre>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => copyBatch(i)}>
                {copiedBatch === i ? "コピーしました" : "📋 コピー"}
              </button>
              <button className="btn" onClick={() => downloadTextFile(`othellonia-investigate-${i + 1}.txt`, batch, "text/plain")}>
                💾 テキスト保存
              </button>
            </div>
          </div>
        ))}
        <button className="btn btn-block" onClick={() => setStep("list")} style={{ marginBottom: 8 }}>
          一覧へ戻る
        </button>
        <button className="btn btn-primary btn-block" onClick={() => setStep("import")}>
          ChatGPTの回答（JSON）を取り込む
        </button>
      </div>
    );
  }

  if (step === "import") {
    return (
      <div className="screen">
        <h1>JSON取込</h1>
        <p className="muted">
          ChatGPTの回答をそのまま貼り付けてください。```json コードブロックがあれば自動で抽出します。
        </p>
        <div className="card">
          <textarea
            rows={10}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="ChatGPTの回答をここに貼り付け"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => runValidation(importText)}>
              検証する
            </button>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
              📂 JSONファイルを選択
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = "";
            }}
          />
        </div>
        {importError && (
          <div className="card" style={{ borderColor: "var(--danger)" }}>
            <h2>検証エラー</h2>
            <ul>
              {importError.map((e, i) => (
                <li key={i} className="muted">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn btn-block" onClick={() => setStep("list")}>
          一覧へ戻る
        </button>
      </div>
    );
  }

  if (step === "diff") {
    return (
      <div className="screen">
        <h1>差分確認</h1>
        <p className="muted">
          内容を確認し、反映する駒だけチェックしてから保存してください。保存するまで何も変更されません。
          駒の同一性はpieceIdで管理しており、名称の一致は要求しません。正式名称・バージョンの採用は
          フィールドの承認とは別に、それぞれ個別に選んでください。
        </p>
        <div className="card">
          <button className="btn" onClick={bulkApplyEligible}>
            出典ありの駒を一括選択
          </button>
        </div>
        {diffs.map((diff) => (
          <div key={diff.pieceId} className="card">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={approved.has(diff.pieceId)} onChange={() => toggleApproved(diff.pieceId)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{diff.registeredFullName}</div>
                {diff.identityStatus !== "ok" && (
                  <div className="card" style={{ borderColor: "var(--warning)", marginTop: 6 }}>
                    <p style={{ color: "var(--warning)" }}>端末内に存在しないpieceIdのため要確認</p>
                  </div>
                )}
                {diff.reasonsExcludedFromBulk.length > 0 && (
                  <p className="muted" style={{ color: "var(--warning)" }}>
                    一括反映対象外: {diff.reasonsExcludedFromBulk.join(" / ")}
                  </p>
                )}

                <div className="card" style={{ marginTop: 6 }}>
                  <p className="muted" style={{ marginBottom: 4 }}>
                    名称候補（現在の名称は検索用の仮称の場合があります）
                  </p>
                  <p className="muted">現在の名称: {diff.nameCandidate.currentFullName}</p>
                  <p>AI提案の正式名称: {diff.nameCandidate.proposedFullName}</p>
                  <p className="muted">二つ名: {diff.nameCandidate.proposedEpithet ?? "なし"}</p>
                  <p className="muted">バージョン: {diff.nameCandidate.proposedVersion ?? "情報なし"}</p>
                  <p className="muted">進化形態: {diff.nameCandidate.proposedEvolutionType ?? "不明"}</p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={nameAccepted.has(diff.pieceId)}
                      onChange={() => toggleNameAccepted(diff.pieceId)}
                    />
                    この正式名称・バージョンを採用する（現在の名称を上書きします）
                  </label>
                </div>

                <table style={{ width: "100%", marginTop: 8, fontSize: 13 }}>
                  <tbody>
                    {diff.fields.map((f) => (
                      <tr key={f.field}>
                        <td className="muted" style={{ paddingRight: 8 }}>
                          {f.label}
                        </td>
                        <td style={{ color: f.changed ? "var(--text)" : "var(--text-muted)" }}>
                          {f.before} {f.changed ? "→" : ""} {f.changed ? f.after : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </label>
          </div>
        ))}
        <button className="btn btn-primary btn-block" onClick={saveApproved} style={{ marginBottom: 8 }}>
          選択した{approved.size}件を保存する
        </button>
        <button className="btn btn-block" onClick={() => setStep("list")}>
          キャンセルして一覧へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>駒情報補完</h1>
      <p className="muted">
        ここで生成するプロンプトをChatGPTに貼り付けて調査し、返ってきたJSONをこの画面に取り込みます。画像・アイコン・特徴量は一切扱いません。
      </p>

      {saveMessage && (
        <div className="card" role="status">
          {saveMessage}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="muted">情報不足の駒</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.missing}件</div>
        </div>
        <div className="card">
          <div className="muted">補完済み</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.complete}件</div>
        </div>
        <div className="card">
          <div className="muted">要確認</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.needsReview}件</div>
        </div>
      </div>

      <div className="card">
        <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as FilterMode)}>
          <option value="missing">情報不足のみ</option>
          <option value="complete">補完済み</option>
          <option value="needs_review">要確認</option>
          <option value="declared_only">過去申告のみ</option>
          <option value="all">全件</option>
        </select>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button className="btn" onClick={selectAllFiltered}>
            全選択
          </button>
          <button className="btn" onClick={clearSelection}>
            全解除
          </button>
          <button className="btn" onClick={selectOnlyMissing}>
            情報不足だけ選択
          </button>
          <button className="btn" onClick={excludeDeclaredOnly}>
            過去申告のみの駒を除外
          </button>
        </div>
      </div>

      <p className="muted">選択中: {selected.size}件 / 表示中: {filteredRows.length}件</p>

      {filteredRows.map(({ owned, info }) => {
        const missing = getMissingFields(info);
        return (
          <div key={owned.pieceId} className="card">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={selected.has(owned.pieceId)} onChange={() => toggle(owned.pieceId)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{info.fullName}</div>
                <div className="muted">
                  所持数 {owned.quantity} / <StatusLabel status={owned.ownedStatus} />
                </div>
                <div className="muted">
                  属性 {info.attribute ?? "不明"} / ランク {info.rarity ?? "不明"} / 形態 {info.evolutionType ?? "不明"}
                </div>
                <div className="muted">
                  スキル {info.skill ? info.skill.type ?? "確認済み" : "不明"} / コンボスキル{" "}
                  {info.comboSkillStatus === "none" ? "なし" : info.comboSkillStatus === "exists" ? info.comboSkill?.type ?? "確認済み" : "不明"}
                </div>
                <div className="muted">情報確認日: {info.checkedAt ?? "未確認"}</div>
                {missing.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {missing.map((m) => (
                      <span key={m} className="tag tag-warning" style={{ marginRight: 4 }}>
                        {MISSING_FIELD_LABELS[m]}未登録
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>
        );
      })}

      <button className="btn btn-primary btn-block" disabled={selected.size === 0} onClick={generatePrompt}>
        AI調査用プロンプトを生成（{selected.size}件）
      </button>
      <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => setStep("import")}>
        JSONを貼り付ける／選択する
      </button>
    </div>
  );
}

function StatusLabel({ status }: { status: OwnedStatus }) {
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
