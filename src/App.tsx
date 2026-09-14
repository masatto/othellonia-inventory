import type { ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppDataProvider, useAppData } from "./state/AppDataContext";
import { PendingScanProvider } from "./state/PendingScanContext";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ConsultPage } from "./pages/ConsultPage";
import { BackupPage } from "./pages/BackupPage";
import { EnrichmentPage } from "./pages/EnrichmentPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UpdateNotifier } from "./components/UpdateNotifier";

/** IndexedDBからの初期読み込みが終わるまで画面を出さない（データ0件でも起動できる） */
function AppReadyGate({ children }: { children: ReactNode }) {
  const { loading } = useAppData();
  if (loading) {
    return (
      <div className="screen">
        <p className="muted">読み込み中…</p>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AppDataProvider>
      <PendingScanProvider>
        <HashRouter>
          <UpdateNotifier />
          <AppReadyGate>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/enrichment" element={<EnrichmentPage />} />
                <Route path="/consult" element={<ConsultPage />} />
                <Route path="/backup" element={<BackupPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </AppReadyGate>
        </HashRouter>
      </PendingScanProvider>
    </AppDataProvider>
  );
}
