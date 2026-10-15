# notify-job-update v9 (deployed before P3 Stage C) — rollback copy

Live before Stage C: version 9, `verify_jwt: false`, ezbr_sha256
`2cc1205ea63bd0606aad8a33af31c08fdc6c40d9ec02a0442f2887f38ff83843`
(checked with `get_edge_function` on 15/10/2026). Its code is the repo state
at commit `3e0cadb` (03/10/2026); these files are `git show 3e0cadb:...`,
checked against the live code (distinctive lines present, later code absent).

Rollback: deploy function `notify-job-update` with these four files (names
`source/index.ts`, `_shared/notify.ts`, `_shared/email.ts`,
`_shared/emailLayout.ts`), entrypoint `source/index.ts`, `verify_jwt: false`.
It works with or without the Stage A migration. Note: v9 emails directly via
Resend, which has no key in Supabase, so its fallback emails fail.
