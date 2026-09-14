import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Service Workerの更新を検知したらユーザーに通知し、
 * ユーザー操作を経てから新しいキャッシュへ切り替える（無断でリロードしない）。
 */
export function UpdateNotifier() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // 古いキャッシュの安全な削除はService Worker側(自動生成)のprecacheが担う
      registration?.update();
    },
  });

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: 12,
        right: 12,
        zIndex: 50,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      }}
    >
      {needRefresh ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>新しいバージョンがあります</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              updateServiceWorker(true);
              setNeedRefresh(false);
            }}
          >
            更新する
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>オフラインで利用できる準備ができました</span>
          <button className="btn" onClick={() => setOfflineReady(false)}>
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
