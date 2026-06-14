import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { SessionEntry } from "../session";

export type Session = {
  id: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  entries: SessionEntry[];
};

export type SessionStoreOptions = {
  homeDir: string;
  projectCode: string;
  maxEntries?: number;
};

export class SessionStore {
  private readonly sessionsDir: string;
  private readonly indexPath: string;
  private readonly maxEntries: number;

  constructor(private readonly options: SessionStoreOptions) {
    this.sessionsDir = path.join(options.homeDir, "projects", options.projectCode);
    this.indexPath = path.join(this.sessionsDir, "sessions-index.json");
    this.maxEntries = options.maxEntries ?? 50;
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  createSession(name?: string): Session {
    const id = crypto.randomUUID();
    const session: Session = {
      id,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      entries: [],
    };
    this.saveSession(session);
    this.updateIndex(session);
    return session;
  }

  getSession(sessionId: string): Session | null {
    const filePath = this.getSessionFilePath(sessionId);
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      const entries: SessionEntry[] = raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
      const index = this.readIndex();
      const meta = index.find((e) => e.id === sessionId);
      return {
        id: sessionId,
        name: meta?.name,
        createdAt: meta ? new Date(meta.createdAt) : new Date(),
        updatedAt: meta ? new Date(meta.updatedAt) : new Date(),
        entries,
      };
    } catch {
      return null;
    }
  }

  saveSession(session: Session): void {
    const filePath = this.getSessionFilePath(session.id);
    const lines = session.entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines, "utf8");
  }

  updateSession(sessionId: string, name?: string): void {
    const index = this.readIndex();
    const entry = index.find((e) => e.id === sessionId);
    if (entry) {
      if (name !== undefined) entry.name = name;
      entry.updatedAt = new Date().toISOString();
      this.writeIndex(index);
    }
  }

  listSessions(): Array<{ id: string; name?: string; createdAt: string; updatedAt: string }> {
    return this.readIndex();
  }

  deleteSession(sessionId: string): void {
    const filePath = this.getSessionFilePath(sessionId);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
    const index = this.readIndex().filter((e) => e.id !== sessionId);
    this.writeIndex(index);
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  private readIndex(): Array<{ id: string; name?: string; createdAt: string; updatedAt: string }> {
    try {
      if (!fs.existsSync(this.indexPath)) return [];
      return JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
    } catch {
      return [];
    }
  }

  private writeIndex(entries: Array<{ id: string; name?: string; createdAt: string; updatedAt: string }>): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(entries, null, 2), "utf8");
  }

  private updateIndex(session: Session): void {
    let index = this.readIndex();
    index = index.filter((e) => e.id !== session.id);
    index.push({
      id: session.id,
      name: session.name,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
    if (index.length > this.maxEntries) {
      const sorted = [...index].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      const removed = sorted.splice(0, sorted.length - this.maxEntries);
      for (const entry of removed) {
        try {
          fs.unlinkSync(this.getSessionFilePath(entry.id));
        } catch {
          /* ignore */
        }
      }
      index = sorted;
    }
    this.writeIndex(index);
  }
}
