#!/usr/bin/env bash
# Runs scripts/readiness-review-database-tests.mjs against the authorised temporary project (mk-review-store-temp,
# zuqegvsfhzgcydyivnqv) with a short-lived secret key kept in a private folder outside the repository.
#
#   scripts/readiness-review-hosted-tests.sh [results.json]
#
# The key folder (MK_REVIEW_KEY_DIR, default ~/.config/mk-review) holds:
#   temp-secret-key   a secret key created for this run only, chmod 600; delete it in the dashboard after the run
#   publishable-key   the project's publishable (public) key
# Neither value is printed, passed on the command line or written to the results. The harness itself refuses a key
# file inside the repository, owned by another user or readable by others, a long-lived legacy service_role key, and
# any project other than the authorised one.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
dir="${MK_REVIEW_KEY_DIR:-$HOME/.config/mk-review}"
results="${1:-$dir/results/database-tests-hosted-$(date -u +%Y%m%dT%H%M%SZ).json}"

[ -d "$dir" ] || { echo "No key folder at $dir. See the steps printed by a hosted run without a key." >&2; exit 2; }
case "$(cd "$dir" && pwd -P)/" in "$repo"/*) echo "The key folder is inside the repository. Keep it outside." >&2; exit 2 ;; esac
[ -f "$dir/temp-secret-key" ] || { echo "Missing $dir/temp-secret-key." >&2; exit 2; }
[ -f "$dir/publishable-key" ] || [ -n "${MK_REVIEW_TEST_PUBLIC_KEY:-}" ] || { echo "Missing $dir/publishable-key." >&2; exit 2; }
chmod 700 "$dir"
mkdir -p "$(dirname "$results")"

unset MK_READINESS_REVIEW_DB_SERVICE_KEY
export MK_REVIEW_TEST_BACKEND=hosted
export MK_READINESS_REVIEW_DB_URL=https://zuqegvsfhzgcydyivnqv.supabase.co
export MK_READINESS_REVIEW_DB_PROJECT_REF=zuqegvsfhzgcydyivnqv
export MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE="$dir/temp-secret-key"
export MK_REVIEW_TEST_PUBLIC_KEY="${MK_REVIEW_TEST_PUBLIC_KEY:-$(tr -d '[:space:]' < "$dir/publishable-key")}"
export MK_REVIEW_DB_RESULTS="$results"

cd "$repo"
echo "Results: $results"
exec node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-database-tests.mjs
