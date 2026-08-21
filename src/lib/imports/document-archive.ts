import { unzipSync } from "fflate";
import { CsvImportError, parseCsv } from "./csv";
import { documentMimeTypes, maximumDocumentSizeBytes } from "@/lib/validation/documents";

/**
 * Reads a document archive: one ZIP holding a manifest plus the files it describes.
 *
 * The manifest is a CSV at the archive root (manifest.csv) whose rows name a file inside the archive
 * and the entity it belongs to. Everything here is untrusted operator input, so the reader is strict:
 * bounded decompression, no absolute or traversing paths, and a per-file mime/size check against the
 * same allowlist the single-file upload path enforces.
 */
export class DocumentArchiveError extends Error {}

export const manifestFileName = "manifest.csv";
export const maximumArchiveEntries = 2_000;
export const maximumArchiveBytes = 256 * 1024 * 1024;
export const maximumManifestRows = 1_000;

export const documentArchiveTargetTypes = ["organization", "property", "unit", "tenancy"] as const;
export type DocumentArchiveTargetType = (typeof documentArchiveTargetTypes)[number];

export type ManifestRow = {
  rowNumber: number;
  filePath: string;
  documentType: string;
  title: string;
  targetType: DocumentArchiveTargetType;
  propertyName: string;
  addressLine1: string;
  locality: string;
  countryCode: string;
  unitCode: string;
};

export type ArchiveFile = { path: string; bytes: Uint8Array; mimeType: string; sizeBytes: number };

const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * A ZIP entry name is attacker-controlled. Reject anything that could escape the archive root or
 * address a device/absolute path, and normalize the rest to a plain relative path.
 */
export function normalizeArchivePath(rawPath: string): string | null {
  const path = rawPath.replace(/\\/g, "/").trim();
  if (!path || path.endsWith("/")) return null;
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return null;
  if (path.includes("\0")) return null;
  const segments = path.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === "..")) return null;
  return segments.join("/");
}

export function mimeTypeForFile(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = Object.hasOwn(EXTENSION_MIME, extension) ? EXTENSION_MIME[extension] : null;
  if (!mimeType) return null;
  return (documentMimeTypes as readonly string[]).includes(mimeType) ? mimeType : null;
}

export function readDocumentArchive(source: ArrayBuffer | Uint8Array): {
  manifest: ManifestRow[];
  files: Map<string, ArchiveFile>;
} {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new DocumentArchiveError("That file is not a valid ZIP archive.");
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    let entries = 0;
    let totalBytes = 0;
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        entries += 1;
        totalBytes += file.originalSize ?? 0;
        if (entries > maximumArchiveEntries) throw new DocumentArchiveError(`Archives can contain at most ${maximumArchiveEntries.toLocaleString()} files.`);
        if (totalBytes > maximumArchiveBytes) throw new DocumentArchiveError("That archive is too large to import.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DocumentArchiveError) throw error;
    throw new DocumentArchiveError("That archive could not be opened.");
  }

  // Index by normalized path, dropping anything that tried to escape the root.
  const files = new Map<string, ArchiveFile>();
  let manifestBytes: Uint8Array | null = null;
  for (const [rawName, entryBytes] of Object.entries(unzipped)) {
    const path = normalizeArchivePath(rawName);
    if (!path) continue;
    if (path.toLowerCase() === manifestFileName) {
      manifestBytes = entryBytes;
      continue;
    }
    const mimeType = mimeTypeForFile(path);
    if (!mimeType) continue;
    files.set(path.toLowerCase(), { path, bytes: entryBytes, mimeType, sizeBytes: entryBytes.length });
  }

  if (!manifestBytes) throw new DocumentArchiveError(`The archive needs a ${manifestFileName} at its root.`);

  let table: ReturnType<typeof parseCsv>;
  try {
    table = parseCsv(new TextDecoder("utf-8").decode(manifestBytes));
  } catch (error) {
    throw new DocumentArchiveError(error instanceof CsvImportError ? `The manifest could not be read: ${error.message}` : "The manifest could not be read.");
  }
  if (table.rows.length > maximumManifestRows) {
    throw new DocumentArchiveError(`Manifests can describe at most ${maximumManifestRows.toLocaleString()} documents.`);
  }

  const header = (row: Record<string, string>, ...names: string[]) => {
    for (const name of names) {
      const match = Object.keys(row).find((key) => key.trim().toLowerCase() === name);
      if (match) return (row[match] ?? "").trim();
    }
    return "";
  };

  const manifest = table.rows.map((row, index) => ({
    rowNumber: index + 1,
    filePath: header(row, "file", "file path", "filename", "path"),
    documentType: header(row, "document type", "type", "documenttype"),
    title: header(row, "title", "name"),
    targetType: header(row, "target type", "target", "targettype").toLowerCase() as DocumentArchiveTargetType,
    propertyName: header(row, "property name", "property"),
    addressLine1: header(row, "address line 1", "address"),
    locality: header(row, "city", "locality"),
    countryCode: header(row, "country code", "country").toUpperCase(),
    unitCode: header(row, "unit code", "unit"),
  }));

  return { manifest, files };
}

export type ManifestIssue = { row: number; field: string; code: string; message: string };

/** Structural validation of one manifest row against the archive it came from. */
export function validateManifestRow(row: ManifestRow, files: Map<string, ArchiveFile>): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const normalized = row.filePath ? normalizeArchivePath(row.filePath) : null;

  if (!row.filePath) {
    issues.push({ row: row.rowNumber, field: "file", code: "REQUIRED", message: "A file path is required." });
  } else if (!normalized) {
    issues.push({ row: row.rowNumber, field: "file", code: "INVALID_PATH", message: "That file path is not allowed." });
  } else if (!files.has(normalized.toLowerCase())) {
    issues.push({ row: row.rowNumber, field: "file", code: "FILE_NOT_IN_ARCHIVE", message: "The archive does not contain this file, or its type is not supported." });
  } else {
    const file = files.get(normalized.toLowerCase())!;
    if (file.sizeBytes === 0) issues.push({ row: row.rowNumber, field: "file", code: "EMPTY_FILE", message: "That file is empty." });
    if (file.sizeBytes > maximumDocumentSizeBytes) {
      issues.push({ row: row.rowNumber, field: "file", code: "FILE_TOO_LARGE", message: "That file is larger than the 25 MB document limit." });
    }
  }

  if (!row.documentType) issues.push({ row: row.rowNumber, field: "documentType", code: "REQUIRED", message: "A document type is required." });
  else if (row.documentType.length > 80) issues.push({ row: row.rowNumber, field: "documentType", code: "TOO_LONG", message: "Document type must be 80 characters or shorter." });
  if (!row.title) issues.push({ row: row.rowNumber, field: "title", code: "REQUIRED", message: "A title is required." });
  else if (row.title.length > 200) issues.push({ row: row.rowNumber, field: "title", code: "TOO_LONG", message: "Title must be 200 characters or shorter." });

  if (!documentArchiveTargetTypes.includes(row.targetType)) {
    issues.push({ row: row.rowNumber, field: "targetType", code: "INVALID_TARGET_TYPE", message: "Target must be organization, property, unit, or tenancy." });
  } else if (row.targetType !== "organization") {
    if (!row.propertyName) issues.push({ row: row.rowNumber, field: "propertyName", code: "REQUIRED", message: "A property name is required for this target." });
    if (!row.addressLine1) issues.push({ row: row.rowNumber, field: "addressLine1", code: "REQUIRED", message: "An address is required for this target." });
    if (!["US", "CA", "MX"].includes(row.countryCode)) issues.push({ row: row.rowNumber, field: "countryCode", code: "INVALID_COUNTRY", message: "Country must be US, CA, or MX." });
    if (row.targetType !== "property" && !row.unitCode) {
      issues.push({ row: row.rowNumber, field: "unitCode", code: "REQUIRED", message: "A unit code is required for this target." });
    }
  }

  return issues;
}
