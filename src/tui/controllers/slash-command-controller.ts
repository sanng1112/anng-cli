export function dispatchSlashCommand(
  input: string,
  actions: {
    newSession: () => void;
    continueSession: () => void;
    toggleRaw: () => void;
    openSessions: () => void;
  }
): boolean {
  const command = input.trim().split(/\s+/)[0];
  if (command === "/new") {
    actions.newSession();
    return true;
  }
  if (command === "/continue") {
    actions.continueSession();
    return true;
  }
  if (command === "/raw") {
    actions.toggleRaw();
    return true;
  }
  if (command === "/resume") {
    actions.openSessions();
    return true;
  }
  return false;
}
