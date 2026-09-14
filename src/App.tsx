import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppDataProvider } from "./state/AppDataContext";
import { PendingScanProvider } from "./state/PendingScanContext";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ConsultPage } from "./pages/ConsultPage";
import { BackupPage } from "./pages/BackupPage";
import { UpdateNotifier } from "./components/UpdateNotifier";

export default function App() {
  return (
    <AppDataProvider>
      <PendingScanProvider>
        <HashRouter>
          <UpdateNotifier />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/consult" element={<ConsultPage />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </PendingScanProvider>
    </AppDataProvider>
  );
}
