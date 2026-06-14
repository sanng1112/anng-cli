export class KeyRotator {
  private keys: string[];
  private currentIndex = 0;

  constructor(envString: string) {
    if (!envString || !envString.trim()) {
      this.keys = [""];
      return;
    }
    this.keys = envString
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (this.keys.length === 0) this.keys = [""];
  }

  getCurrentKey(): string {
    return this.keys[this.currentIndex];
  }

  rotate(): void {
    if (this.keys.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    }
  }

  getKeyCount(): number {
    return this.keys.length;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}
