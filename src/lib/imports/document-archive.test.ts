import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  DocumentArchiveError,
  mimeTypeForFile,
  normalizeArchivePath,
  readDocumentArchive,
  validateManifestRow,
} from "./document-archive";

const MANIFEST_HEADER = "File,Document Type,Title,Target Type,Property Name,Address Line 1,City,Country Code,Unit Code";

function archive(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, body]) => [name, typeof body === "string" ? strToU8(body) : body])),
  );
}

describe("normalizeArchivePath", () => {
  it("accepts ordinary relative paths and normalizes separators", () => {
    expect(normalizeArchivePath("leases/unit-101.pdf")).toBe("leases/unit-101.pdf");
    expect(normalizeArchivePath("leases\\unit-101.pdf")).toBe("leases/unit-101.pdf");
    expect(normalizeArchivePath("./leases/./unit-101.pdf")).toBe("leases/unit-101.pdf");
  });

  it("rejects traversal, absolute, drive-letter, and NUL paths", () => {
    expect(normalizeArchivePath("../escape.pdf")).toBeNull();
    expect(normalizeArchivePath("leases/../../escape.pdf")).toBeNull();
    expect(normalizeArchivePath("/etc/passwd")).toBeNull();
    expect(normalizeArchivePath("C:\\Windows\\system.ini")).toBeNull();
    expect(normalizeArchivePath("a\0b.pdf")).toBeNull();
    expect(normalizeArchivePath("")).toBeNull();
    expect(normalizeArchivePath("directory/")).toBeNull();
  });
});

describe("mimeTypeForFile", () => {
  it("maps supported extensions and refuses everything else", () => {
    expect(mimeTypeForFile("lease.pdf")).toBe("application/pdf");
    expect(mimeTypeForFile("photo.JPEG")).toBe("image/jpeg");
    expect(mimeTypeForFile("payload.exe")).toBeNull();
    expect(mimeTypeForFile("script.sh")).toBeNull();
    expect(mimeTypeForFile("noextension")).toBeNull();
  });
});

describe("readDocumentArchive", () => {
  it("reads the manifest and indexes supported files", () => {
    const file = archive({
      "manifest.csv": `${MANIFEST_HEADER}\nleases/101.pdf,signed_lease,Unit 101 lease,unit,Maple Court,100 Main Street,Richmond,US,101\n`,
      "leases/101.pdf": "%PDF-1.4 lease",
    });
    const { manifest, files } = readDocumentArchive(file);
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ filePath: "leases/101.pdf", documentType: "signed_lease", targetType: "unit", unitCode: "101", countryCode: "US" });
    expect(files.get("leases/101.pdf")?.mimeType).toBe("application/pdf");
  });

  it("drops traversing entries and unsupported file types", () => {
    const file = archive({
      "manifest.csv": `${MANIFEST_HEADER}\nleases/101.pdf,signed_lease,Lease,unit,Maple Court,100 Main Street,Richmond,US,101\n`,
      "leases/101.pdf": "%PDF-1.4",
      "../escape.pdf": "%PDF-1.4",
      "payload.exe": "MZ",
    });
    const { files } = readDocumentArchive(file);
    expect([...files.keys()]).toEqual(["leases/101.pdf"]);
  });

  it("requires a manifest at the archive root", () => {
    expect(() => readDocumentArchive(archive({ "leases/101.pdf": "%PDF-1.4" }))).toThrow(/manifest\.csv/);
  });

  it("rejects a non-zip payload", () => {
    expect(() => readDocumentArchive(strToU8("just text"))).toThrow(DocumentArchiveError);
  });
});

describe("validateManifestRow", () => {
  const base = {
    rowNumber: 1,
    filePath: "leases/101.pdf",
    documentType: "signed_lease",
    title: "Unit 101 lease",
    targetType: "unit" as const,
    propertyName: "Maple Court",
    addressLine1: "100 Main Street",
    locality: "Richmond",
    countryCode: "US",
    unitCode: "101",
  };
  const files = new Map([
    ["leases/101.pdf", { path: "leases/101.pdf", bytes: strToU8("%PDF"), mimeType: "application/pdf", sizeBytes: 4 }],
    ["leases/empty.pdf", { path: "leases/empty.pdf", bytes: new Uint8Array(), mimeType: "application/pdf", sizeBytes: 0 }],
  ]);

  it("accepts a complete row", () => {
    expect(validateManifestRow(base, files)).toEqual([]);
  });

  it("flags a file the archive does not contain", () => {
    const issues = validateManifestRow({ ...base, filePath: "leases/missing.pdf" }, files);
    expect(issues.map((i) => i.code)).toContain("FILE_NOT_IN_ARCHIVE");
  });

  it("flags a traversing path without treating it as missing", () => {
    const issues = validateManifestRow({ ...base, filePath: "../../etc/passwd" }, files);
    expect(issues.map((i) => i.code)).toContain("INVALID_PATH");
  });

  it("flags an empty file", () => {
    expect(validateManifestRow({ ...base, filePath: "leases/empty.pdf" }, files).map((i) => i.code)).toContain("EMPTY_FILE");
  });

  it("requires a document type and title", () => {
    const issues = validateManifestRow({ ...base, documentType: "", title: "" }, files);
    expect(issues.filter((i) => i.code === "REQUIRED").map((i) => i.field).sort()).toEqual(["documentType", "title"]);
  });

  it("requires property identity for scoped targets but not for organization", () => {
    const scoped = validateManifestRow({ ...base, propertyName: "", addressLine1: "", countryCode: "" }, files);
    expect(scoped.map((i) => i.field)).toEqual(expect.arrayContaining(["propertyName", "addressLine1", "countryCode"]));
    const orgWide = validateManifestRow({ ...base, targetType: "organization", propertyName: "", addressLine1: "", countryCode: "", unitCode: "" }, files);
    expect(orgWide).toEqual([]);
  });

  it("requires a unit code for unit and tenancy targets only", () => {
    expect(validateManifestRow({ ...base, unitCode: "" }, files).map((i) => i.field)).toContain("unitCode");
    expect(validateManifestRow({ ...base, targetType: "tenancy", unitCode: "" }, files).map((i) => i.field)).toContain("unitCode");
    expect(validateManifestRow({ ...base, targetType: "property", unitCode: "" }, files)).toEqual([]);
  });

  it("rejects an unknown target type", () => {
    const issues = validateManifestRow({ ...base, targetType: "vendor" as never }, files);
    expect(issues.map((i) => i.code)).toContain("INVALID_TARGET_TYPE");
  });
});
