import type { PayloadDiff } from "./types.js";

/**
 * Set a value at a dot-notation path (e.g. "messages.0.role").
 */
function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/**
 * Delete a value at a dot-notation path.
 */
function deleteNested(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== "object" || current[key] === null) return;
    current = current[key] as Record<string, unknown>;
  }
  delete current[parts[parts.length - 1]!];
}

/**
 * Apply a PayloadDiff to a payload object, returning a corrected deep clone.
 *
 * Supports dot-notation keys for nested fields (e.g. "messages.0.role").
 *
 * - Removes fields listed in `remove`
 * - Adds fields listed in `add` with their exact values
 * - Overwrites fields listed in `modify` with their exact values
 */
export function applyDiff(
  payload: Record<string, unknown>,
  diff: PayloadDiff,
): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

  for (const key of diff.remove) {
    deleteNested(result, key);
  }

  for (const [key, value] of Object.entries(diff.add)) {
    setNested(result, key, value);
  }

  for (const [key, value] of Object.entries(diff.modify)) {
    setNested(result, key, value);
  }

  return result;
}
