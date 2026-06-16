import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import type { ExecutionContext } from "./execution-context";

export type AuditEventType =
  | "STATE_TRANSITION"
  | "POLICY_DECISION"
  | "CAPABILITY_ACTIVATION"
  | "TOOL_EXECUTION"
  | "LOCK_ACQUISITION"
  | "LOCK_RELEASE"
  | "WORKER_ASSIGNMENT"
  | "TASK_RETRY"
  | "TASK_FAILURE";

export interface SystemAuditEvent {
  eventId: string;
  correlationId: string;
  timestamp: string;
  eventType: AuditEventType;
  actorId: string;
  resource: string;
  action: string;
  decision?: "ALLOW" | "DENY";
  reason?: string;
  contextSnapshot?: ExecutionContext;
}

export class AuditEventLogger {
  private logDir: string;
  private logStream: fs.WriteStream | null = null;
  private currentLogDate: string = "";

  constructor() {
    this.logDir = path.join(os.homedir(), ".anng", "audit");
    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch {
        // ignore
      }
    }
  }

  private getLogFileStream(): fs.WriteStream | null {
    const today = new Date().toISOString().split("T")[0];
    if (!this.logStream || this.currentLogDate !== today) {
      if (this.logStream) {
        this.logStream.end();
      }
      this.currentLogDate = today;
      const filePath = path.join(this.logDir, `${today}.log`);
      try {
        this.logStream = fs.createWriteStream(filePath, { flags: "a" });
      } catch {
        return null;
      }
    }
    return this.logStream;
  }

  log(event: Omit<SystemAuditEvent, "eventId" | "timestamp">): void {
    const fullEvent: SystemAuditEvent = {
      ...event,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    const stream = this.getLogFileStream();
    if (stream) {
      const payload = JSON.stringify(fullEvent) + "\n";
      stream.write(payload);
    }
  }
}

export const globalAuditLogger = new AuditEventLogger();
