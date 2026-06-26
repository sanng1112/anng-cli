import * as fs from "fs";
import { promises as fsPromises } from "fs";
import * as os from "os";
import * as path from "path";

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await writeTextFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeJsonFileAtomicSync(filePath: string, value: unknown): void {
  writeTextFileAtomicSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = buildTempPath(filePath);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(tempPath, content, "utf8");
  await fsPromises.rename(tempPath, filePath);
}

export function writeTextFileAtomicSync(filePath: string, content: string): void {
  const tempPath = buildTempPath(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function buildTempPath(filePath: string): string {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`
  );
}
