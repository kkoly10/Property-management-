/**
 * Which command pair drives an import job.
 *
 * A lookup rather than a ternary: each import type has its OWN validate/commit pair, and every command
 * rejects a job of the wrong type with IMPORT_TYPE_MISMATCH. Routing an unrecognized type to the
 * portfolio pair by default would surface that mismatch as an opaque 422, so an unknown type resolves
 * to null and the caller answers explicitly.
 */
export const importCommandsByType = {
  portfolio: { validate: "validate_portfolio_import", commit: "commit_portfolio_import" },
  leases: { validate: "validate_occupied_import", commit: "commit_occupied_import" },
  combined: { validate: "validate_combined_import", commit: "commit_combined_import" },
} as const;

export type ImportCommandType = keyof typeof importCommandsByType;

export function importCommandsFor(importType: string | null | undefined) {
  if (!importType || !Object.hasOwn(importCommandsByType, importType)) return null;
  return importCommandsByType[importType as ImportCommandType];
}
