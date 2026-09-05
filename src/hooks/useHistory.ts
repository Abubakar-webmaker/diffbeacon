"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalysisMode } from "@/lib/share/store";

export interface HistoryEntry {
  id:          string;
  timestamp:   number;
  mode:        AnalysisMode;
  riskScore:   number;
  riskLabel:   string;
  changeCount: number;
  breakingCount: number;
  direction?:  string;
  /** Safe label only — never stores credentials or response bodies */
  label:       string;
}

const STORAGE_KEY  = "diffbeacon_history";
const MAX_ENTRIES  = 50;

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const add = useCallback((entry: Omit<HistoryEntry, "id" | "timestamp">) => {
    setEntries((prev) => {
      const next: HistoryEntry = {
        ...entry,
        id:        crypto.randomUUID(),
        timestamp: Date.now(),
      };
      const updated = [next, ...prev].slice(0, MAX_ENTRIES);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    saveHistory([]);
  }, []);

  return { entries, add, remove, clear };
}
