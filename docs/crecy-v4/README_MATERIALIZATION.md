# Complete Package Materialization

The complete Crecy v4 text package is committed losslessly in `.crecy-bootstrap/parts/`. The parts concatenate into a base64-encoded `tar.gz` archive.

The GitHub connector can create/edit UTF-8 files but cannot execute code or directly ingest the local package directory. Therefore run:

```bash
bash scripts/materialize-crecy-v4.sh
```

The script:

1. concatenates lexically ordered bootstrap parts;
2. decodes/extracts authoritative Markdown and SQL;
3. validates checksums;
4. archives superseded v3 root documents under `docs/archive/v3/`;
5. moves the eight existing PNG references under `docs/crecy-v4/design-references/legacy/`;
6. removes `.crecy-bootstrap` after verification.

After running it, commit the resulting files before implementation. Expected build-critical files include:

- `12_P0_EXECUTABLE_SCHEMA.sql`
- `13_P0_RLS_POLICIES_AND_TEST_MATRIX.md`
- `14_P0_COMMAND_API_EVENT_CONTRACTS.md`
- `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md`
- target architecture files 01–05, 08–09, and 16

Do not implement from incomplete files or edit bootstrap parts manually.
