/**
 * Active Runtime Registry
 *
 * A lightweight global registry that tracks the currently-active agent runtime
 * so that process signal handlers (SIGINT, SIGTERM) can abort the running
 * session cleanly.
 *
 * Inspired by Cline's runtime/active-runtime.ts
 */

// =============================================================================
// Types
// =============================================================================

type AbortFn = () => boolean;
type CleanupFn = () => void | Promise<void>;

// =============================================================================
// State
// =============================================================================

let activeAbort: AbortFn | undefined;
let activeCleanup: CleanupFn | undefined;
let _abortInProgress = false;

// =============================================================================
// Registry
// =============================================================================

export function setActiveAbort(fn: AbortFn | undefined): void {
  activeAbort = fn;
}

export function setActiveCleanup(fn: CleanupFn | undefined): void {
  activeCleanup = fn;
}

export function abortActiveRuntime(): boolean {
  try {
    return activeAbort?.() ?? false;
  } catch {
    return false;
  }
}

export function cleanupActiveRuntime(): Promise<void> {
  const fn = activeCleanup;
  if (!fn) return Promise.resolve();
  try {
    const result = fn();
    return result instanceof Promise ? result : Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

// =============================================================================
// Abort-in-progress guards
// =============================================================================

export function markAbortInProgress(): void {
  _abortInProgress = true;
}

export function clearAbortInProgress(): void {
  _abortInProgress = false;
}

export function isAbortInProgress(): boolean {
  return _abortInProgress;
}

// =============================================================================
// Convenience: install signal handlers that abort the active runtime
// =============================================================================

export interface SignalHandlerDisposer {
  (): void;
}

export function installSignalHandlers(): SignalHandlerDisposer {
  const onSigint = () => {
    if (abortActiveRuntime()) return;
    void cleanupActiveRuntime().finally(() => process.exit(0));
  };
  const onSigterm = () => {
    abortActiveRuntime();
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  return () => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
}
