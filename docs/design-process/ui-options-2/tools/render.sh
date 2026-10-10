#!/bin/sh
# Render concept pages to PNG: tools/render.sh 1 2 3 … (from the project root or anywhere)
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
D="$ROOT/docs/design-process/ui-options-2"
for n in "$@"; do
  W=852; [ -f "$D/concept-$n.html" ] && grep -q 'id="p3"' "$D/concept-$n.html" && W=1266
  (cd "$ROOT" && node scripts/shot.mjs "file://$D/concept-$n.html" "$D/concept-$n.png" "$W,968" 1800 2)
done
