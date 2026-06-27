import {
  findDaemonManifest,
  listDaemonManifests,
  readDaemonLog,
  cancelTask,
  type DaemonManifest,
} from "../core/team/daemon-state";

export async function runDaemonCommand(
  input: {
    cwd: string;
    action?: "list" | "show" | "logs" | "cancel";
    taskId?: string;
    outputMode?: "text" | "json";
  },
  deps: {
    readDir?: (dirPath: string) => string[];
    readFile?: (filePath: string) => string;
    writeStdout?: (text: string) => void;
    cancelTask?: (cwd: string, taskId: string) => boolean;
  } = {}
): Promise<void> {
  const action = input.action ?? "list";
  const writeStdout = deps.writeStdout ?? ((text: string) => process.stdout.write(text));
  const manifests = listDaemonManifests(input.cwd, deps);

  if (action === "cancel") {
    const cancelFn = deps.cancelTask ?? cancelTask;
    const ok = cancelFn(input.cwd, input.taskId ?? "");
    if (input.outputMode === "json") {
      writeStdout(`${JSON.stringify({ action, taskId: input.taskId, ok })}\n`);
      return;
    }
    writeStdout(ok ? `Cancelled daemon task: ${input.taskId}\n` : `Daemon task not found: ${input.taskId}\n`);
    return;
  }

  if (action === "show") {
    const manifest = input.taskId ? findDaemonManifest(input.cwd, input.taskId, deps) : null;
    if (input.outputMode === "json") {
      writeStdout(`${JSON.stringify({ action, task: manifest })}\n`);
      return;
    }
    if (!manifest) {
      writeStdout(`Daemon task not found: ${input.taskId ?? "(missing id)"}\n`);
      return;
    }
    writeStdout(`ANNG daemon task\n${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  if (action === "logs") {
    const manifest = input.taskId ? findDaemonManifest(input.cwd, input.taskId, deps) : null;
    const logs = manifest ? readDaemonLog(input.cwd, manifest, deps) : null;
    if (input.outputMode === "json") {
      writeStdout(`${JSON.stringify({ action, taskId: input.taskId, logs })}\n`);
      return;
    }
    if (!manifest) {
      writeStdout(`Daemon task not found: ${input.taskId ?? "(missing id)"}\n`);
      return;
    }
    writeStdout(`ANNG daemon logs\n${logs ?? ""}\n`);
    return;
  }

  if (input.outputMode === "json") {
    writeStdout(`${JSON.stringify({ action, tasks: manifests })}\n`);
    return;
  }

  const lines = [
    "ANNG daemon tasks",
    ...(manifests.length > 0
      ? manifests.map((manifest) =>
          [
            manifest.id,
            manifest.status,
            manifest.pid ? `pid=${manifest.pid}` : "",
            manifest.finishedAt ? `finished=${manifest.finishedAt}` : "",
            manifest.failureReason ? `error=${manifest.failureReason}` : "",
            manifest.prompt,
          ]
            .filter(Boolean)
            .join("\t")
        )
      : ["No daemon tasks recorded."]),
  ];
  writeStdout(`${lines.join("\n")}\n`);
}

export { findDaemonManifest, listDaemonManifests, readDaemonLog };
