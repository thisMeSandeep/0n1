import { CURRENT_SCHEMA_VERSION, type SystemDocument, systemDocumentSchema } from "./document.ts";

/**
 * Upgrades a raw document from version N to N + 1. Users' data lives only in
 * their own browser, so every shape change must ship a migration here; we can
 * never fix stored data on a server.
 */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version a migration upgrades *from*. Empty while we are on v1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class MigrationError extends Error {
  override name = "MigrationError";
}

/** Apply migrations one version at a time until `targetVersion`. Does not validate. */
export function runMigrations(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>>,
  targetVersion: number,
): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MigrationError("Not a 0n1 system");
  }
  let doc = raw as Record<string, unknown>;
  const version = doc.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new MigrationError("Not a 0n1 system: missing schema version");
  }
  if (version > targetVersion) {
    throw new MigrationError(
      `This system was made with a newer version of 0n1 (schema ${version}). Update 0n1 to open it.`,
    );
  }
  for (let from = version; from < targetVersion; from++) {
    const step = migrations[from];
    if (!step) throw new MigrationError(`No migration from schema ${from} to ${from + 1}`);
    doc = { ...step(doc), schemaVersion: from + 1 };
  }
  return doc;
}

/**
 * Bring any stored or uploaded document up to the current schema and
 * validate it. Throws MigrationError for documents we can't read.
 */
export function migrate(raw: unknown): SystemDocument {
  const doc = runMigrations(raw, MIGRATIONS, CURRENT_SCHEMA_VERSION);
  const result = systemDocumentSchema.safeParse(doc);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new MigrationError(`Invalid system${where}: ${issue?.message ?? "unknown error"}`);
  }
  return result.data;
}
