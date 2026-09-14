import { useEffect, useState } from "react";

/** オフライン時にも主要機能（取込・認識・一覧・バックアップ）が使えることを示す */
export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      style={{
        background: "var(--warning)",
        color: "#1a1a2e",
        textAlign: "center",
        fontSize: 12,
        padding: "4px 8px",
      }}
    >
      オフラインです。所持駒の取込・認識・編集・バックアップは端末内で引き続き利用できます。
    </div>
  );
}
