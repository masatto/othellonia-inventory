import { createContext, useContext, useState, type ReactNode } from "react";
import type { RecognitionResult } from "../domain/types";

export interface PendingScan {
  scanId: string;
  createdAt: string;
  results: RecognitionResult[];
  overlapDuplicateCount: number;
  imageHashes: string[];
}

interface PendingScanContextValue {
  pendingScan: PendingScan | null;
  setPendingScan: (scan: PendingScan | null) => void;
  updateResult: (cellIndex: number, patch: Partial<RecognitionResult>) => void;
}

const PendingScanContext = createContext<PendingScanContextValue | null>(null);

export function PendingScanProvider({ children }: { children: ReactNode }) {
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);

  const updateResult = (cellIndex: number, patch: Partial<RecognitionResult>) => {
    setPendingScan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: prev.results.map((r) => (r.cell.cellIndex === cellIndex ? { ...r, ...patch } : r)),
      };
    });
  };

  return (
    <PendingScanContext.Provider value={{ pendingScan, setPendingScan, updateResult }}>
      {children}
    </PendingScanContext.Provider>
  );
}

export function usePendingScan(): PendingScanContextValue {
  const ctx = useContext(PendingScanContext);
  if (!ctx) throw new Error("usePendingScan must be used within PendingScanProvider");
  return ctx;
}
