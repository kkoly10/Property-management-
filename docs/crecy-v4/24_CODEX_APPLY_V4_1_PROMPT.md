# Codex Apply Prompt — Crecy v4.1

Use the v4.1 files as authoritative replacements for their same-numbered v4 files.

1. Materialize the existing v4 package locally if files 12–17 are not normal files.
2. Replace files 00, 12, 13, 14, 15, 16 and AGENTS.md with the v4.1 copies.
3. Add files 17 and 23.
4. Remove `.crecy-bootstrap` and the materialization workflow only after all normal files exist and checksum/repository review succeeds.
5. Commit and push the documentation correction before implementation.
6. Perform a SQL dependency-order and syntax review; decompose file 12 into forward-only migrations without changing its contracts.
7. Scaffold the RLS adversarial tests before storing real resident or payment data.
8. Do not implement payment, owner, messaging, billing or privacy routes until their traceability row, persistence, authorization, audit and event contract are all represented.

Report any conflict. Do not silently weaken composite foreign keys, property scope, idempotency, append-only finance, or sanitized owner/vendor projections.
