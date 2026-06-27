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
  await renderInteractiveTui(args);
}
