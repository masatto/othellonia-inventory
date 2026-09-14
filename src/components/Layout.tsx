import { NavLink, Outlet } from "react-router-dom";
import { OfflineBanner } from "./OfflineBanner";

const NAV_ITEMS = [
  { to: "/", label: "ホーム", icon: "🏠" },
  { to: "/import", label: "取り込み", icon: "📷" },
  { to: "/inventory", label: "所持駒", icon: "🗂" },
  { to: "/consult", label: "AI相談", icon: "💬" },
  { to: "/backup", label: "バックアップ", icon: "💾" },
  { to: "/settings", label: "設定", icon: "⚙️" },
];

export function Layout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}>
            <span className="icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
