/**
 * The mime types a bulk import can be read from.
 *
 * Kept in one place because this list is enforced at six separate points — the zod upload allowlist,
 * create_document_upload_grant, the storage bucket's allowed_mime_types, this source picker, the
 * import route's version query, and create_import_job. A type added to some but not all of them
 * produces a file the operator can upload but never import, or vice versa.
 */
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const ZIP_MIME_TYPE = "application/zip";

/** Tabular sources for the row-oriented import legs. */
export const importSourceMimeTypes = ["text/csv", "application/vnd.ms-excel", XLSX_MIME_TYPE] as const;

/** Archive sources for the document/manifest leg. */
export const documentArchiveMimeTypes = [ZIP_MIME_TYPE] as const;
