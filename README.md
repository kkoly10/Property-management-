# Crecy Property Management Platform

Crecy is a global rental operating system for property operators, residents, owners, and invited vendors.

## Authoritative specification

Read [`AGENTS.md`](./AGENTS.md), then [`docs/crecy-v4/00_READ_ME_FIRST.md`](./docs/crecy-v4/00_READ_ME_FIRST.md).

The `docs/crecy-v4` package supersedes all earlier v1, v2, and v3 specifications, ZIP archives, questionnaires, and generated-image text.

## Connector materialization

The connected GitHub API cannot directly upload a local folder or run shell commands. If the build-critical files are not yet visible under `docs/crecy-v4`, run:

```bash
bash scripts/materialize-crecy-v4.sh
```

This reconstructs and verifies the complete v4 text package, archives the v3 files, and relocates the eight existing visual references.
