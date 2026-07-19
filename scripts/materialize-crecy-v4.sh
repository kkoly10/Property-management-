#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PART_DIR=".crecy-bootstrap/parts"
OUT_B64="$(mktemp)"
OUT_TGZ="$(mktemp)"
trap 'rm -f "$OUT_B64" "$OUT_TGZ"' EXIT

if [[ ! -d "$PART_DIR" ]]; then
  echo "Missing bootstrap directory: $PART_DIR" >&2
  exit 1
fi

# Bash expands this glob in lexical order. The split file names are designed
# so their concatenation exactly reconstructs the original base64 archive.
cat "$PART_DIR"/part-* > "$OUT_B64"
base64 --decode "$OUT_B64" > "$OUT_TGZ"
tar -xzf "$OUT_TGZ" -C "$ROOT"

mkdir -p docs/archive/v3 docs/crecy-v4/design-references/legacy

for file in \
  09_PRIVACY_SECURITY_COMPLIANCE_AND_LEGAL_DOCUMENT_SPEC.md \
  11_COUNSEL_AND_COMPLIANCE_LAUNCH_CHECKLIST.md \
  Apartment_Rental_Platform_Senior_Engineering_Edition_v3_Compliance_Integrated.zip
do
  if [[ -e "$file" ]]; then
    mv "$file" docs/archive/v3/
  fi
done

for file in \
  205D871B-561B-41AB-BAA4-98811A344D93.png \
  35DED69C-527B-428E-9B6D-C5DF329B2FF4.png \
  8987B6F9-7204-40D3-99F5-23AB1BC9E635.png \
  8C2586A4-0E0E-472D-81CA-8A3BAA8FB112.png \
  CE238543-5372-45F3-ABA9-9E353868ACCD.png \
  D8C2CBF4-32AF-41E9-86FE-A385F14C718A.png \
  E320CE0D-8D7C-4370-A94C-02B4DD17AFF5.png \
  F8224D26-9484-4B24-AD52-E06C9E72C1C5.png
do
  if [[ -e "$file" ]]; then
    mv "$file" docs/crecy-v4/design-references/legacy/
  fi
done

# Verify all authoritative files except the self-referential checksum manifest.
(
  cd docs/crecy-v4
  grep -v '  ./SHA256SUMS.txt$' SHA256SUMS.txt | sha256sum -c -
)

rm -rf .crecy-bootstrap

echo "Crecy v4 Gate 0 package materialized and verified."
