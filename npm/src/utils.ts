import type { PayloadDiff } from "./types.js";

/**
 * Apply a PayloadDiff to a payload object, returning the corrected version.
 *
 * - Removes fields listed in `remove`
 * - Overwrites fields listed in `modify`
 * - Adds fields listed in `add` (only if not already present)
 */
export function applyDiff(
  payload: Record<string, unknown>,
  diff: PayloadDiff,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!diff.remove.includes(key)) {
      result[key] = value;
    }
  }

  for (const [key, value] of Object.entries(diff.modify)) {
    result[key] = value;
  }

  for (const [key, typeHint] of Object.entries(diff.add)) {
    if (!(key in result)) {
      result[key] = `<${typeHint}>`;
    }
  }

  return result;
}
