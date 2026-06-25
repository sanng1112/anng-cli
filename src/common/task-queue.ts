import * as fs from "fs";
import * as path from "path";

export type QueueTask = {
  index: number;
  text: string;
  done: boolean;
};

export type QueueData = {
  tasks: QueueTask[];
  filePath: string;
};

const QUEUE_FILE = path.join(".anng", "memory", "task-queue.md");

export function getQueuePath(projectRoot: string): string {
  return path.join(projectRoot, QUEUE_FILE);
}

export function loadQueue(projectRoot: string): QueueData {
  const filePath = getQueuePath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "", "utf8");
      return { tasks: [], filePath };
    }
    const content = fs.readFileSync(filePath, "utf8");
    const tasks: QueueTask[] = [];
    let index = 0;
    for (const line of content.split("\n")) {
      const match = line.match(/^- \[([ x])\]\s*(.+)$/);
      if (match) {
        tasks.push({
          index: index++,
          text: match[2].trim(),
          done: match[1] === "x",
        });
      }
    }
    return { tasks, filePath };
  } catch {
    return { tasks: [], filePath };
  }
}

export function saveQueue(projectRoot: string, tasks: QueueTask[]): boolean {
  const filePath = getQueuePath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = tasks
      .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
      .join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function addTask(projectRoot: string, text: string): QueueTask | null {
  const data = loadQueue(projectRoot);
  const task: QueueTask = {
    index: data.tasks.length,
    text: text.trim(),
    done: false,
  };
  data.tasks.push(task);
  if (saveQueue(projectRoot, data.tasks)) {
    return task;
  }
  return null;
}

export function removeTask(projectRoot: string, index: number): boolean {
  const data = loadQueue(projectRoot);
  if (index < 0 || index >= data.tasks.length) return false;
  data.tasks.splice(index, 1);
  // Re-index
  data.tasks.forEach((t, i) => (t.index = i));
  return saveQueue(projectRoot, data.tasks);
}

export function toggleTask(projectRoot: string, index: number): boolean {
  const data = loadQueue(projectRoot);
  if (index < 0 || index >= data.tasks.length) return false;
  data.tasks[index].done = !data.tasks[index].done;
  return saveQueue(projectRoot, data.tasks);
}

export function clearQueue(projectRoot: string): boolean {
  return saveQueue(projectRoot, []);
}

export function getNextPendingTask(projectRoot: string): QueueTask | null {
  const data = loadQueue(projectRoot);
  return data.tasks.find((t) => !t.done) ?? null;
}
