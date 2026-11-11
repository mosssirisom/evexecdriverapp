#!/usr/bin/env bash
# Type-check every Supabase edge function with Deno (needs `deno` on the PATH).
# Catches mistakes the Node tests cannot, such as calling a shared helper with
# the wrong arguments. Nothing is deployed or contacted.
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"
CFG="$(mktemp)"; trap 'rm -f "$CFG"' EXIT
echo '{"nodeModulesDir":"auto"}' > "$CFG"
files=$(ls */index.ts)
deno check --config "$CFG" $files
