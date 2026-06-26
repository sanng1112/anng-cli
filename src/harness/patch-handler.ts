export interface SimplePatch {
  targetFile: string;
  targetContent: string;
  replacementContent: string;
}

/**
 * Applies a patch to fileContent with strict boundary and occurrence checks.
 *
 * Rules:
 * 1. patch.targetFile must equal filePath (no cross-file patching)
 * 2. filePath must be in allowedWrites (bounded worker)
 * 3. targetContent must exist exactly ONCE in fileContent
 */
export function applyPatch(fileContent: string, patch: SimplePatch, allowedWrites: string[], filePath: string): string {
  if (patch.targetFile !== filePath) {
    throw new Error(`Target file mismatch: patch specifies "${patch.targetFile}" but running on "${filePath}".`);
  }
  if (!allowedWrites.includes(patch.targetFile)) {
    throw new Error(`Permission denied: file "${patch.targetFile}" is outside filesToWrite boundaries.`);
  }

  // Count occurrences — must be exactly 1
  const parts = fileContent.split(patch.targetContent);
  const occurrences = parts.length - 1;

  if (occurrences === 0) {
    throw new Error(`Target content not found in "${filePath}".`);
  }
  if (occurrences > 1) {
    throw new Error(
      `Target content matched multiple times (${occurrences}) in "${filePath}". Patch must match exactly once.`
    );
  }

  return parts[0] + patch.replacementContent + parts[1];
}
