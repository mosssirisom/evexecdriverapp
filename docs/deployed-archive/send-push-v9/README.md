# send-push v9 (deployed before P3 Stage B) — rollback copy

Copied verbatim with Supabase `get_edge_function` on 15/10/2026, just before
Stage B. Version 9, `verify_jwt: false`, ezbr_sha256
`6cb8881a23825a09d9bfd104c662e2a516590f3645eb549aa9e4b55591746902`.
This code was never in the repo; it is kept here only so it can be redeployed.

Rollback: deploy function `send-push` with these two files (names
`source/index.ts` and `_shared/notify.ts`), entrypoint `source/index.ts`,
`verify_jwt: false`. It works with or without the Stage A migration.
