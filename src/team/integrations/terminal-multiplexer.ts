export interface TerminalMultiplexer {
  createSession(name: string, cwd: string): Promise<void>;
  createPane(sessionName: string, command: string, cwd: string): Promise<string>;
  sendCommand(paneId: string, command: string): Promise<void>;
  capturePane(paneId: string): Promise<string>;
  killSession(sessionName: string): Promise<void>;
  attachSession?(sessionName: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}
