export type CliMode = "act" | "plan" | "yolo";

export type LegacyCliWarning = {
  message: string;
};

export type ParsedCliArgs = {
  command?: "doctor" | "config" | "mcp" | "daemon" | "sessions" | "context";
  mcpAction?: "status" | "tools";
  daemonAction?: "list" | "show" | "logs";
  daemonTaskId?: string;
  sessionsAction?: "list" | "show";
  sessionId?: string;
  prompt?: string;
  mode: CliMode;
  interactive: boolean;
  outputMode: "text" | "json";
  stay: boolean;
  daemon: boolean;
  daemonWorker: boolean;
  daemonManifestPath?: string;
  doctorKeys: boolean;
  anngTeam: boolean;
  anngTmux: boolean;
  cwd?: string;
  configDir?: string;
  provider?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  timeoutSeconds?: number;
  help: boolean;
  version: boolean;
  unknownFlags: string[];
  rawArgs: string[];
};

export function normalizeLegacyArgs(argv: string[]): string[] {
  const next: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-p") {
      next.push("--prompt");
      continue;
    }

    if (arg === "--team") {
      next.push("--anng-team");
      continue;
    }

    if (arg === "--tmux") {
      next.push("--anng-tmux");
      continue;
    }

    next.push(arg);
  }

  return next;
}

export function collectLegacyCliWarnings(argv: string[]): LegacyCliWarning[] {
  const warnings: LegacyCliWarning[] = [];

  if (argv.includes("-p")) {
    warnings.push({
      message: "[!] Warning: Flag '-p' is deprecated. ANNG v2 translated it to '--prompt'.",
    });
  }

  if (argv.includes("--team")) {
    warnings.push({
      message: "[!] Warning: Flag '--team' is deprecated. ANNG v2 translated it to '--anng-team'.",
    });
  }

  if (argv.includes("--tmux")) {
    warnings.push({
      message: "[!] Warning: Flag '--tmux' is deprecated. ANNG v2 translated it to '--anng-tmux'.",
    });
  }

  return warnings;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const normalized = normalizeLegacyArgs(argv);
  let prompt: string | undefined;
  let interactive = false;
  let stay = false;
  let daemon = false;
  let daemonWorker = false;
  let daemonManifestPath: string | undefined;
  let doctorKeys = false;
  let mode: CliMode = "act";
  let outputMode: "text" | "json" = "text";
  let anngTeam = false;
  let anngTmux = false;
  let cwd: string | undefined;
  let configDir: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let key: string | undefined;
  let baseUrl: string | undefined;
  let timeoutSeconds: number | undefined;
  let help = false;
  let version = false;
  const unknownFlags: string[] = [];
  const positional: string[] = [];
  let command: ParsedCliArgs["command"];

  if (
    normalized[0] === "help" ||
    normalized[0] === "doctor" ||
    normalized[0] === "config" ||
    normalized[0] === "mcp" ||
    normalized[0] === "daemon" ||
    normalized[0] === "sessions" ||
    normalized[0] === "context"
  ) {
    if (normalized[0] === "help") {
      help = true;
    } else {
      command = normalized[0];
    }
    normalized.shift();
  }

  let mcpAction: ParsedCliArgs["mcpAction"];
  if (command === "mcp" && (normalized[0] === "status" || normalized[0] === "tools")) {
    mcpAction = normalized[0];
    normalized.shift();
  }

  let daemonAction: ParsedCliArgs["daemonAction"];
  let daemonTaskId: string | undefined;
  if (command === "daemon" && (normalized[0] === "list" || normalized[0] === "show" || normalized[0] === "logs")) {
    daemonAction = normalized[0];
    normalized.shift();
    if ((daemonAction === "show" || daemonAction === "logs") && normalized[0] && !normalized[0].startsWith("-")) {
      daemonTaskId = normalized[0];
      normalized.shift();
    }
  }

  let sessionsAction: ParsedCliArgs["sessionsAction"];
  let sessionId: string | undefined;
  if (command === "sessions" && (normalized[0] === "list" || normalized[0] === "show")) {
    sessionsAction = normalized[0];
    normalized.shift();
    if (sessionsAction === "show" && normalized[0] && !normalized[0].startsWith("-")) {
      sessionId = normalized[0];
      normalized.shift();
    }
  }

  for (let i = 0; i < normalized.length; i += 1) {
    const arg = normalized[i];

    if (!arg) {
      continue;
    }

    if (arg === "--prompt") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        prompt = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "-c" || arg === "--cwd") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        cwd = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "--config") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        configDir = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "-P" || arg === "--provider") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        provider = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "-m" || arg === "--model") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        model = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "-k" || arg === "--key") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        key = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "--base-url" || arg === "--baseurl") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        baseUrl = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "-t" || arg === "--timeout") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        const parsed = Number.parseInt(nextValue, 10);
        if (Number.isInteger(parsed) && parsed >= 1) {
          timeoutSeconds = parsed;
        } else {
          unknownFlags.push(`${arg}=${nextValue}`);
        }
        i += 1;
      }
      continue;
    }

    if (arg === "-i" || arg === "--tui") {
      interactive = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }

    if (arg === "-v" || arg === "--version") {
      version = true;
      continue;
    }

    if (arg === "--stay") {
      stay = true;
      interactive = true;
      continue;
    }

    if (arg === "--plan") {
      mode = "plan";
      continue;
    }

    if (arg === "--daemon") {
      daemon = true;
      continue;
    }

    if (arg === "--daemon-worker") {
      daemonWorker = true;
      continue;
    }

    if (arg === "--daemon-manifest") {
      const nextValue = normalized[i + 1];
      if (nextValue && !nextValue.startsWith("-")) {
        daemonManifestPath = nextValue;
        i += 1;
      }
      continue;
    }

    if (arg === "--yolo" || arg === "-y") {
      mode = "yolo";
      continue;
    }

    if (arg === "--json") {
      outputMode = "json";
      continue;
    }

    if (arg === "--keys") {
      doctorKeys = true;
      continue;
    }

    if (arg === "--anng-team") {
      anngTeam = true;
      continue;
    }

    if (arg === "--anng-tmux") {
      anngTmux = true;
      continue;
    }

    if (arg.startsWith("-")) {
      unknownFlags.push(arg);
      continue;
    }

    positional.push(arg);
  }

  if (!prompt && positional.length > 0) {
    prompt = positional.join(" ");
  }

  return {
    prompt,
    command,
    mcpAction,
    daemonAction,
    daemonTaskId,
    sessionsAction,
    sessionId,
    mode,
    interactive,
    outputMode,
    stay,
    daemon,
    daemonWorker,
    daemonManifestPath,
    doctorKeys,
    anngTeam,
    anngTmux,
    cwd,
    configDir,
    provider,
    model,
    key,
    baseUrl,
    timeoutSeconds,
    help,
    version,
    unknownFlags,
    rawArgs: normalized,
  };
}
