#!/usr/bin/env bash
# Regenerate lib/database.types.ts from the linked Supabase project.
# Requires: SUPABASE_ACCESS_TOKEN and project ref (or `supabase link`).
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=... npm run gen:db-types
#   # or
#   npx supabase login && npx supabase link --project-ref ubhqsdpldimxircxcrgl
#   npm run gen:db-types

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_FILE="$ROOT_DIR/lib/database.types.ts"
PROJECT_ID="${SUPABASE_PROJECT_ID:-ubhqsdpldimxircxcrgl}"

echo "Generating Database types for project: $PROJECT_ID"
npx supabase gen types typescript --project-id "$PROJECT_ID" --schema public > "$OUT_FILE"
echo "Wrote $OUT_FILE"
