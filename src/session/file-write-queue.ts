class FileWriteQueue {
  private queue: Promise<void> = Promise.resolve();
  enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((err) => console.error("[FileWriteQueue Error]", err));
  }
  async awaitIdle(): Promise<void> {
    await this.queue;
  }
}
export const globalFileWriteQueue = new FileWriteQueue();
export default FileWriteQueue;
export { FileWriteQueue };
