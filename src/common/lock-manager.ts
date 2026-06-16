export class ConcurrencyViolationError extends Error {
  constructor(filePath: string) {
    super(`Concurrency Violation: Cannot write to ${filePath} without acquiring lock.`);
    this.name = "ConcurrencyViolationError";
  }
}

export class LockManager {
  private fileLocks: Map<string, string> = new Map(); // Map filePath -> lockOwnerId

  acquireLock(filePath: string, ownerId: string): boolean {
    const existing = this.fileLocks.get(filePath);
    if (existing && existing !== ownerId) {
      return false;
    }
    this.fileLocks.set(filePath, ownerId);
    return true;
  }

  releaseLock(filePath: string, ownerId: string): void {
    if (this.fileLocks.get(filePath) === ownerId) {
      this.fileLocks.delete(filePath);
    }
  }

  hasLock(filePath: string, ownerId: string): boolean {
    return this.fileLocks.get(filePath) === ownerId;
  }

  assertLockOwnershipBeforeWrite(filePath: string, ownerId: string): void {
    if (!this.hasLock(filePath, ownerId)) {
      throw new ConcurrencyViolationError(filePath);
    }
  }
}

export const globalLockManager = new LockManager();
