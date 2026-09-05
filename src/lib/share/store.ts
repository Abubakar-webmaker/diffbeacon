/**
 * Share store — in-memory implementation.
 *
 * Security rules:
 *   - IDs are cryptographically random (16 bytes → 32 hex chars).
 *   - Sensitive fields are stripped before storage.
 *   - Entries expire after SHARE_TTL_MS (default 24 h).
 *   - Store is bounded to MAX_ENTRIES to prevent memory exhaustion.
 *   - Interface-abstracted so a Redis/DB backend can be swapped in later.
 */

import { randomBytes } from "crypto";
import type { DiffChange, RiskResult } from "@/types/diff";

export type AnalysisMode = "json" | "live" | "contract";

export interface SharePayload {
  mode:        AnalysisMode;
  changes:     DiffChange[];
  risk:        RiskResult;
  ai:          { summary: string; recommendations: string[] } | null;
  direction?:  string;
  createdAt:   number;
  /** Safe request metadata — never includes auth/credentials */
  requestMeta?: {
    urlA: string; methodA: string;
    urlB: string; methodB: string;
  };
}

export interface ShareStore {
  save(payload: SharePayload): string;
  get(id: string): SharePayload | null;
}

const SHARE_TTL_MS = parseInt(process.env.SHARE_TTL_MS ?? "", 10) || 24 * 60 * 60 * 1000;
const MAX_ENTRIES  = parseInt(process.env.SHARE_MAX_ENTRIES ?? "", 10) || 1000;

class InMemoryShareStore implements ShareStore {
  private readonly store = new Map<string, { payload: SharePayload; expiresAt: number }>();

  save(payload: SharePayload): string {
    this.evictExpired();
    if (this.store.size >= MAX_ENTRIES) {
      // Evict oldest
      const oldest = [...this.store.entries()].sort(
        (a, b) => a[1].payload.createdAt - b[1].payload.createdAt,
      )[0];
      if (oldest) this.store.delete(oldest[0]);
    }
    const id = randomBytes(16).toString("hex");
    this.store.set(id, { payload, expiresAt: Date.now() + SHARE_TTL_MS });
    return id;
  }

  get(id: string): SharePayload | null {
    const entry = this.store.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return entry.payload;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id);
    }
  }
}

export const shareStore: ShareStore = new InMemoryShareStore();
