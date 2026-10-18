import { z } from "zod";
import type { SystemDocument } from "../model/document.ts";
import { MigrationError, migrate } from "../model/migrate.ts";

/*
 * The backup file: a small envelope around system documents. Restoring
 * runs every system through migrate(), so old backups keep working and
 * anything unreadable is reported instead of silently dropped.
 */

export const BACKUP_FORMAT = "0n1-backup";
export const BACKUP_VERSION = 1;
/** Far above any real library; protects against opening the wrong file. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  systems: SystemDocument[];
};

export function buildBackup(systems: readonly SystemDocument[], now = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    systems: [...systems],
  };
}

export function serializeBackup(backup: BackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** A system's name as a file name part: "URL shortener" → "url-shortener". */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "system"
  );
}

/** `0n1-backup-2026-10-17.json`, or `0n1-checkout-2026-10-17.json` for one system. */
export function backupFileName(systemName: string | null, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `0n1-${systemName === null ? "backup" : slug(systemName)}-${date}.json`;
}

export class BackupError extends Error {
  override name = "BackupError";
}

export type ParsedBackup = {
  systems: SystemDocument[];
  /** Systems in the file that couldn't be read, with why. */
  skipped: { name: string; reason: string }[];
};

const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  systems: z.array(z.unknown()),
});

/**
 * Read a backup file's text. Throws BackupError with a plain message when
 * the file as a whole can't be used.
 */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new BackupError("This file is too large to be a 0n1 backup.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't valid JSON, so it can't be a 0n1 backup.");
  }

  // A single system exported on its own (or an older bare document) is fine too.
  const isBareSystem = typeof data === "object" && data !== null && "schemaVersion" in data;
  let entries: unknown[];
  if (isBareSystem) {
    entries = [data];
  } else {
    const envelope = envelopeSchema.safeParse(data);
    if (!envelope.success) throw new BackupError("This file isn't a 0n1 backup.");
    if (envelope.data.version > BACKUP_VERSION) {
      throw new BackupError(
        "This backup was made with a newer version of 0n1. Update 0n1 to restore it.",
      );
    }
    entries = envelope.data.systems;
  }

  const systems: SystemDocument[] = [];
  const skipped: ParsedBackup["skipped"] = [];
  entries.forEach((entry, index) => {
    try {
      systems.push(migrate(entry));
    } catch (error) {
      const name =
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string"
          ? (entry as { name: string }).name
          : `System ${index + 1}`;
      skipped.push({
        name,
        reason: error instanceof MigrationError ? error.message : String(error),
      });
    }
  });

  if (systems.length === 0) {
    throw new BackupError(
      skipped.length > 0
        ? "None of the systems in this backup could be read."
        : "This backup doesn't contain any systems.",
    );
  }
  return { systems, skipped };
}
