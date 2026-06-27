import fs from "node:fs";
import { getProjectStorageSnapshot } from "../../common/project-storage";
import type { SessionEntry, SessionsIndex } from "../../session/types";

// Global in-memory cache shared across instances for the same project root
const sessionCache = new Map<string, SessionEntry[]>();

export class SessionStore {
  constructor(private projectRoot: string) {}

  static setCachedSessions(projectRoot: string, entries: SessionEntry[]) {
    sessionCache.set(projectRoot, entries);
  }

  static clearCache() {
    sessionCache.clear();
  }

  listSessions(): SessionEntry[] {
    const cached = sessionCache.get(this.projectRoot);
    if (cached) {
      return cached;
    }
    const snap = getProjectStorageSnapshot(this.projectRoot);
    if (!fs.existsSync(snap.sessionsIndexPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(snap.sessionsIndexPath, "utf8")) as SessionsIndex;
      return parsed.entries || [];
    } catch {
      return [];
    }
  }
}
