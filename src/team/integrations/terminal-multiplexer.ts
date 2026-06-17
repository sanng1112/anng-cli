export interface TerminalMultiplexer {
  // Session lifecycle
  createSession(name: string, cwd: string): Promise<void>;
  killSession(sessionName: string): Promise<void>;
  isAvailable(): Promise<boolean>;
  attachSession?(sessionName: string): Promise<void>;

  // Pane management
  createPane(sessionName: string, command: string, cwd: string): Promise<string>;
  sendCommand(paneId: string, command: string): Promise<void>;
  capturePane(paneId: string): Promise<string>;

  // Layout & pane inspection
  selectLayout(sessionName: string, layout: string): Promise<void>;
  splitPaneVertically(sessionName: string, targetPane?: string): Promise<string>;
  setPaneTitle(paneId: string, title: string): Promise<void>;
  listPanes(sessionName: string): Promise<string[]>;
}
