import process from "node:process";
import { renderInteractiveTui } from "../tui";

export async function runInteractive(args: {
  cwd: string;
  prompt?: string;
  provider?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  teamMode?: boolean;
  teamTmux?: boolean;
}): Promise<void> {
  // Enter alternative screen buffer to prevent terminal scrolling/flickering issues
  process.stdout.write("\u001B[?1049h");
  try {
    await renderInteractiveTui(args);
  } finally {
    // Exit alternative screen buffer and restore terminal state
    process.stdout.write("\u001B[?1049l");
  }
}
