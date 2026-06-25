import * as fs from "fs";
import * as path from "path";

export type QueueTask = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export type QueueInfo = {
  name: string;
  label: string;
  taskCount: number;
  pendingCount: number;
};

const QUEUES_DIR = path.join(".anng", "memory", "queues");
const DEFAULT_QUEUES = ["main", "refactor", "bugs", "ideas"];

function getQueueFilePath(projectRoot: string, queueName: string): string {
  return path.join(projectRoot, QUEUES_DIR, `${queueName}.md`);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function listQueues(projectRoot: string): QueueInfo[] {
  const dir = path.join(projectRoot, QUEUES_DIR);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      for (const name of DEFAULT_QUEUES) {
        const fp = path.join(dir, `${name}.md`);
        if (!fs.existsSync(fp)) fs.writeFileSync(fp, "", "utf8");
      }
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    const queues: QueueInfo[] = [];
    for (const file of files) {
      const name = file.replace(/\.md$/, "");
      const tasks = loadQueue(projectRoot, name);
      queues.push({
        name,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        taskCount: tasks.length,
        pendingCount: tasks.filter((t) => !t.done).length,
      });
    }
    return queues.length > 0
      ? queues
      : DEFAULT_QUEUES.map((n) => ({ name: n, label: n.charAt(0).toUpperCase() + n.slice(1), taskCount: 0, pendingCount: 0 }));
  } catch {
    return DEFAULT_QUEUES.map((n) => ({ name: n, label: n.charAt(0).toUpperCase() + n.slice(1), taskCount: 0, pendingCount: 0 }));
  }
}

export function loadQueue(projectRoot: string, queueName: string): QueueTask[] {
  const filePath = getQueueFilePath(projectRoot, queueName);
  try {
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, "", "utf8");
      return [];
    }
    const content = fs.readFileSync(filePath, "utf8");
    const tasks: QueueTask[] = [];
    for (const line of content.split("\n")) {
      const match = line.match(/^- \[([ x])\]\s*`([^`]+)`\s*(.+)$/);
      if (match) {
        tasks.push({
          id: match[2],
          text: match[3].trim(),
          done: match[1] === "x",
          createdAt: new Date().toISOString(),
        });
      }
    }
    return tasks;
  } catch {
    return [];
  }
}

export function saveQueue(projectRoot: string, queueName: string, tasks: QueueTask[]): boolean {
  const filePath = getQueueFilePath(projectRoot, queueName);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = tasks
      .map((t) => `- [${t.done ? "x" : " "}] \`${t.id}\` ${t.text}`)
      .join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  } catch { /* ignore */
    return false;
  }
}

export function addTask(projectRoot: string, queueName: string, text: string): QueueTask | null {
  const tasks = loadQueue(projectRoot, queueName);
  const task: QueueTask = {
    id: generateId(),
    text: text.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return saveQueue(projectRoot, queueName, tasks) ? task : null;
}

export function updateTask(projectRoot: string, queueName: string, index: number, newText: string): boolean {
  const tasks = loadQueue(projectRoot, queueName);
  if (index < 0 || index >= tasks.length) return false;
  tasks[index].text = newText.trim();
  return saveQueue(projectRoot, queueName, tasks);
}

export function removeTask(projectRoot: string, queueName: string, index: number): boolean {
  const tasks = loadQueue(projectRoot, queueName);
  if (index < 0 || index >= tasks.length) return false;
  tasks.splice(index, 1);
  return saveQueue(projectRoot, queueName, tasks);
}

export function toggleTask(projectRoot: string, queueName: string, index: number): boolean {
  const tasks = loadQueue(projectRoot, queueName);
  if (index < 0 || index >= tasks.length) return false;
  tasks[index].done = !tasks[index].done;
  return saveQueue(projectRoot, queueName, tasks);
}

export function moveTask(projectRoot: string, queueName: string, fromIndex: number, toIndex: number): boolean {
  const tasks = loadQueue(projectRoot, queueName);
  if (fromIndex < 0 || fromIndex >= tasks.length || toIndex < 0 || toIndex >= tasks.length) return false;
  const [moved] = tasks.splice(fromIndex, 1);
  tasks.splice(toIndex, 0, moved);
  return saveQueue(projectRoot, queueName, tasks);
}

export function clearQueue(projectRoot: string, queueName: string): boolean {
  return saveQueue(projectRoot, queueName, []);
}

export function getNextPendingTask(projectRoot: string, queueName: string): QueueTask | null {
  const tasks = loadQueue(projectRoot, queueName);
  return tasks.find((t) => !t.done) ?? null;
}

export function addNamedQueue(projectRoot: string, queueName: string): boolean {
  const dir = path.join(projectRoot, QUEUES_DIR);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `${queueName}.md`);
    if (fs.existsSync(fp)) return false;
    fs.writeFileSync(fp, "", "utf8");
    return true;
  } catch { /* ignore */
    return false;
  }
}

export function deleteNamedQueue(projectRoot: string, queueName: string): boolean {
  const fp = getQueueFilePath(projectRoot, queueName);
  try {
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); return true; }
    return false;
  } catch { /* ignore */
    return false;
  }
}
