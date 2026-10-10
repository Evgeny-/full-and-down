#!/bin/sh
# Render the polished HUD for each state, plain and Polished+ (from anywhere).
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
D="$ROOT/docs/design-process/ui-options-3"
cd "$ROOT"
for s in L12-mid L12-ready L2; do
  node scripts/shot.mjs "file://$D/polished.html?s=$s" "$D/polished-$s.png" 390,844 1500 2
  node scripts/shot.mjs "file://$D/polished.html?s=$s&v=plus" "$D/polished-plus-$s.png" 390,844 1500 2
done
